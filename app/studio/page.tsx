"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Animation = "idle" | "walk" | "jump" | "attack" | "custom";
type Source = { filename: string; kind: "video" | "sheet" | "image"; importedAt: string };
type Frame = { id: string; png: string; animation: Animation; duration: number; rejected: boolean; note: string; sourceTime: number | null };
type Note = { date: string; text: string };
const animations: Animation[] = ["idle", "walk", "jump", "attack", "custom"];
const W = 96;
const H = 96;
const css: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#10131c", color: "#e9edf7", padding: "28px clamp(16px,3vw,46px)", fontFamily: "system-ui, sans-serif" },
  panel: { background: "#1a2030", border: "1px solid #30394e", borderRadius: 15, padding: 20 },
  button: { background: "#5478e9", color: "white", border: "none", borderRadius: 8, padding: "10px 14px", cursor: "pointer", fontWeight: 600 },
  input: { background: "#101726", color: "#e9edf7", border: "1px solid #3b4660", borderRadius: 8, padding: "9px", maxWidth: "100%" },
  muted: { color: "#a8b3cd" },
};
function canvas(w: number, h: number) { const c = document.createElement("canvas"); c.width=w; c.height=h; return c; }
function image(src: string): Promise<HTMLImageElement> { return new Promise((resolve,reject)=> { const im = new Image(); im.onload=()=>resolve(im); im.onerror=()=>reject(new Error("Image could not be decoded")); im.src=src; }); }
function readFile(file: File): Promise<string> { return new Promise((resolve,reject)=> {const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("File read failed"));reader.readAsDataURL(file);}); }
function normalize(source: HTMLCanvasElement, w: number, h: number, keyBackground: boolean, tolerance: number) {
  const ctx=source.getContext("2d",{willReadFrequently:true})!;
  if(keyBackground) {
    const pixels=ctx.getImageData(0,0,source.width,source.height);
    const p=pixels.data;
    const sample=[p[0],p[1],p[2]];
    for(let i=0;i<p.length;i+=4) {
      const d=Math.max(Math.abs(p[i]-sample[0]),Math.abs(p[i+1]-sample[1]),Math.abs(p[i+2]-sample[2]));
      if(d<=tolerance) p[i+3]=0;
    }
    ctx.putImageData(pixels,0,0);
  }
  const pixels=ctx.getImageData(0,0,source.width,source.height).data;
  let left=source.width, top=source.height, right=-1, bottom=-1;
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
    if(pixels[(y*source.width+x)*4+3]>10){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  }
  const out=canvas(w,h),c=out.getContext("2d")!; c.imageSmoothingEnabled=false;
  if(right<left) return out.toDataURL("image/png");
  const bw=right-left+1,bh=bottom-top+1, scale=Math.min((w-8)/bw,(h-8)/bh,1);
  const dw=Math.max(1,Math.round(bw*scale)),dh=Math.max(1,Math.round(bh*scale));
  c.drawImage(source,left,top,bw,bh,Math.round((w-dw)/2),h-4-dh,dw,dh);
  return out.toDataURL("image/png");
}
function binaryData(url:string): Uint8Array {const raw=atob(url.split(",")[1]);return Uint8Array.from(raw,c=>c.charCodeAt(0));}
function crc32(data:Uint8Array) {let c=0xffffffff;for(const byte of data){c^=byte;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function zip(files:{name:string;bytes:Uint8Array}[]):Blob {
  const chunks:Uint8Array[]=[];const central:Uint8Array[]=[];let offset=0;
  const e=new TextEncoder();
  const u16=(v:DataView,p:number,n:number)=>v.setUint16(p,n,true);
  const u32=(v:DataView,p:number,n:number)=>v.setUint32(p,n>>>0,true);
  for(const f of files) {
    const name=e.encode(f.name),crc=crc32(f.bytes),local=new Uint8Array(30+name.length),v=new DataView(local.buffer);
    u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x800);u16(v,8,0);u32(v,14,crc);u32(v,18,f.bytes.length);u32(v,22,f.bytes.length);u16(v,26,name.length);local.set(name,30);
    chunks.push(local,f.bytes);
    const entry=new Uint8Array(46+name.length),d=new DataView(entry.buffer);
    u32(d,0,0x02014b50);u16(d,4,20);u16(d,6,20);u16(d,8,0x800);u32(d,16,crc);u32(d,20,f.bytes.length);u32(d,24,f.bytes.length);u16(d,28,name.length);u32(d,42,offset);entry.set(name,46);central.push(entry);
    offset+=local.length+f.bytes.length;
  }
  const centralLength=central.reduce((n,a)=>n+a.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);
  u32(v,0,0x06054b50);u16(v,8,files.length);u16(v,10,files.length);u32(v,12,centralLength);u32(v,16,offset);
  return new Blob([...chunks,...central,end],{type:"application/zip"});
}
function download(blob:Blob,name:string){const href=URL.createObjectURL(blob);const a=document.createElement("a");a.href=href;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(href),15000);}
function natural(n:number){return Number.isFinite(n)?Math.max(1,Math.floor(n)):1;}
export default function Studio() {
 const [frames,setFrames]=useState<Frame[]>([]);
 const [source,setSource]=useState<Source|null>(null);
 const [videoUrl,setVideoUrl]=useState("");
 const video=useRef<HTMLVideoElement>(null);
 const [step,setStep]=useState(0.125);
 const [limit,setLimit]=useState(24);
 const [gridCols,setGridCols]=useState(4);
 const [gridRows,setGridRows]=useState(1);
 const [width,setWidth]=useState(W);const [height,setHeight]=useState(H);
 const [key,setKey]=useState(false);const [tolerance,setTolerance]=useState(20);
 const [animation,setAnimation]=useState<Animation>("walk");
 const [fps,setFps]=useState(8);
 const [selected,setSelected]=useState<string|null>(null);
 const [notes,setNotes]=useState<Note[]>([]);
 const [note,setNote]=useState("");
 const [revision,setRevision]=useState(1);
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const [tick,setTick]=useState(0);
 const [playing,setPlaying]=useState(true);
 const [sandbox,setSandbox]=useState({x:40,y:0,action:"idle" as Animation});
 const inputVideo=useRef<HTMLInputElement>(null);const inputSheet=useRef<HTMLInputElement>(null);
 const active=useMemo(()=>frames.filter(f=>!f.rejected&&f.animation===animation),[frames,animation]);
 const focused=frames.find(f=>f.id===selected);
 const preview=active.length?active[tick%active.length]:null;
 const update=(id:string,patch:Partial<Frame>)=>setFrames(fs=>fs.map(f=>f.id===id?{...f,...patch}:f));
 useEffect(()=>{if("serviceWorker" in navigator)navigator.serviceWorker.register("/studio-sw.js").catch(()=>{});},[]);
 useEffect(()=>{const stored=localStorage.getItem("asset-studio-notes-v1");if(stored){try{setNotes(JSON.parse(stored));}catch{}}},[]);
 useEffect(()=>{localStorage.setItem("asset-studio-notes-v1",JSON.stringify(notes));},[notes]);
 useEffect(()=>{if(!playing||!active.length)return;let t=0;let timer:number;const run=()=>{setTick(i=>(i+1)%active.length);t=(t+1)%active.length;timer=window.setTimeout(run,active[t].duration);};timer=window.setTimeout(run,active[0].duration);return()=>window.clearTimeout(timer);},[playing,active]);
 useEffect(()=>()=>{if(videoUrl)URL.revokeObjectURL(videoUrl);},[videoUrl]);
 const add=useCallback((pngs:{png:string;time:number|null}[],kind:Source["kind"],filename:string)=>{
   const stamp=Date.now();setFrames(prev=>[...prev,...pngs.map((p,i)=>({id:stamp+"-"+i,png:p.png,animation,duration:Math.round(1000/fps),rejected:false,note:"",sourceTime:p.time}))]);
   setSource({filename,kind,importedAt:new Date().toISOString()});setRevision(v=>v+1);setTick(0);
 },[animation,fps]);
 async function importSheet(file:File){
  setBusy(true);setError("");
  try{
   const im=await image(await readFile(file)),cols=natural(gridCols),rows=natural(gridRows);
   const sw=Math.floor(im.width/cols),sh=Math.floor(im.height/rows);
   if(!sw||!sh)throw new Error("Grid exceeds image dimensions");
   const result:{png:string;time:null}[]=[];
   for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const raw=canvas(sw,sh);raw.getContext("2d")!.drawImage(im,x*sw,y*sh,sw,sh,0,0,sw,sh);
    result.push({png:normalize(raw,width,height,key,tolerance),time:null});
   }
   add(result,"sheet",file.name);
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }
 async function importVideo(file:File){
  if(videoUrl)URL.revokeObjectURL(videoUrl);
  const url=URL.createObjectURL(file);setVideoUrl(url);setSource({filename:file.name,kind:"video",importedAt:new Date().toISOString()});setError("");
 }
 function seek(v:HTMLVideoElement,time:number):Promise<void>{
  return new Promise((resolve,reject)=>{
   const timeout=window.setTimeout(()=>{cleanup();reject(new Error("Video seek timed out"));},8000);
   function cleanup(){window.clearTimeout(timeout);v.removeEventListener("seeked",done);v.removeEventListener("error",fail);}
   function done(){cleanup();resolve();}function fail(){cleanup();reject(new Error("Video decode failed"));}
   v.addEventListener("seeked",done,{once:true});v.addEventListener("error",fail,{once:true});v.currentTime=time;
  });
 }
 async function extract(){
  const v=video.current;if(!v||!Number.isFinite(v.duration)||v.duration<=0){setError("Load a supported video first.");return;}
  setBusy(true);setError("");
  try{
   v.pause();const count=Math.min(natural(limit),Math.ceil(v.duration/Math.max(0.02,step)),240);
   const raw=canvas(v.videoWidth,v.videoHeight);if(!raw.width||!raw.height)throw new Error("Video dimensions unavailable");
   const result:{png:string;time:number}[]=[];
   for(let i=0;i<count;i++){
    const time=Math.min(v.duration-0.001,i*Math.max(0.02,step));
    await seek(v,time);raw.getContext("2d")!.drawImage(v,0,0);
    result.push({png:normalize(raw,width,height,key,tolerance),time});
   }
   add(result,"video",source?.filename||"video");
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }
 async function exportPack(){
  setBusy(true);setError("");
  try{
   const accepted=frames.filter(f=>!f.rejected);if(!accepted.length)throw new Error("No accepted frames to export");
   const counts:Record<string,number>={};for(const f of accepted)counts[f.animation]=(counts[f.animation]||0)+1;
   const columns=Math.min(8,accepted.length),rows=Math.ceil(accepted.length/columns),atlas=canvas(columns*width,rows*height);
   const ctx=atlas.getContext("2d")!;ctx.imageSmoothingEnabled=false;
   const groups:Record<string,{frames:string[];durations:number[];loop:boolean}>={};
   const entries=[] as any[];const files:{name:string;bytes:Uint8Array}[]=[];
   for(let i=0;i<accepted.length;i++){
    const f=accepted[i],col=i%columns,row=Math.floor(i/columns);
    ctx.drawImage(await image(f.png),col*width,row*height,width,height);
    const index=(groups[f.animation]?.frames.length||0);
    const name=f.animation+"_"+String(index).padStart(3,"0");
    if(!groups[f.animation])groups[f.animation]={frames:[],durations:[],loop:true};
    groups[f.animation].frames.push(name);groups[f.animation].durations.push(f.duration);
    entries.push({name,animation:f.animation,x:col*width,y:row*height,w:width,h:height,durationMs:f.duration,anchor:{x:0.5,y:1},sourceTimeSeconds:f.sourceTime,note:f.note});
    files.push({name:"frames/"+name+".png",bytes:binaryData(f.png)});
   }
   const atlasPng=atlas.toDataURL("image/png");
   const manifest={
    schemaVersion:"1.0",revision,generatedAt:new Date().toISOString(),
    provenance:source,frameSize:{width,height},atlas:{image:"atlas.png",width:atlas.width,height:atlas.height,columns,rows},
    runtimeBasePath:"./",naming:"<animation>_<zero-padded index>.png",origin:"top-left",anchorConvention:"normalized",
    frames:entries,animations:groups,review:{accepted:accepted.length,rejected:frames.length-accepted.length,notes}
   };
   files.unshift({name:"atlas.png",bytes:binaryData(atlasPng)});
   files.push({name:"manifest.json",bytes:new TextEncoder().encode(JSON.stringify(manifest,null,2))});
   files.push({name:"example.html",bytes:new TextEncoder().encode(gameExample)});
   files.push({name:"README.txt",bytes:new TextEncoder().encode("Asset Studio export\nOpen example.html from a local web server alongside atlas.png and manifest.json. Example: python3 -m http.server 8000\nUse a relative URL for deployment. The game uses the exported atlas and JSON.\n")});
   download(zip(files),"game-assets-v"+revision+".zip");
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }
 const button=(text:string,click:()=>void,disabled=false)=><button style={{...css.button,opacity:disabled?.5:1}} disabled={disabled} onClick={click}>{text}</button>;
 return <main style={css.page}>
  <header style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap",marginBottom:26}}>
   <div><div style={{color:"#92a7ff",fontWeight:700,letterSpacing:2,fontSize:12}}>SPRITE SHEET CREATOR / LOCAL ASSET PIPELINE</div><h1 style={{fontSize:"clamp(26px,3vw,40px)",margin:"8px 0"}}>Video → Game Asset Studio</h1><div style={css.muted}>Import. Extract. Align. Review. Package. Play. Processing stays in your browser.</div></div>
   <a href="/" style={{color:"#a8bcff"}}>← Original AI sprite generator</a>
  </header>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))",gap:16,marginBottom:16}}>
   <section style={css.panel}><h2>01 / Import source</h2>
    <input ref={inputVideo} type="file" accept="video/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f)importVideo(f);e.target.value="";}}/>
    <input ref={inputSheet} type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={e=>{const f=e.target.files?.[0];if(f)importSheet(f);e.target.value="";}}/>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{button("Import video",()=>inputVideo.current?.click())}{button("Import sprite sheet",()=>inputSheet.current?.click())}</div>
    <p style={css.muted}>{source?source.filename:"No imported source yet"}</p>
    <video ref={video} src={videoUrl||undefined} controls playsInline preload="auto" style={{width:"100%",maxHeight:170,borderRadius:8,background:"#0c1020",display:videoUrl?"block":"none"}}/>
    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
     <label>Interval (s)<br/><input aria-label="Video frame interval" style={{...css.input,width:90}} type="number" min=".02" step=".025" value={step} onChange={e=>setStep(Math.max(.02,Number(e.target.value)||.02))}/></label>
     <label>Max frames<br/><input aria-label="Maximum extracted frames" style={{...css.input,width:90}} type="number" min="1" max="240" value={limit} onChange={e=>setLimit(Math.min(240,natural(Number(e.target.value))))}/></label>
    </div><p>{button(busy?"Processing…":"Extract video frames",extract,busy||!videoUrl)}</p>
    <div style={{display:"flex",gap:12}}><label>Sheet columns<br/><input aria-label="Sheet columns" style={{...css.input,width:80}} type="number" min="1" value={gridCols} onChange={e=>setGridCols(natural(+e.target.value))}/></label><label>Rows<br/><input aria-label="Sheet rows" style={{...css.input,width:80}} type="number" min="1" value={gridRows} onChange={e=>setGridRows(natural(+e.target.value))}/></label></div>
   </section>
   <section style={css.panel}><h2>02 / Processing settings</h2>
    <p style={css.muted}>Sprites fit inside a fixed canvas with bottom-center alignment and pixel-preserving scaling.</p>
    <div style={{display:"flex",gap:12}}><label>Width (px)<br/><input aria-label="Sprite width" style={{...css.input,width:90}} type="number" min="8" max="1024" value={width} onChange={e=>setWidth(Math.min(1024,Math.max(8,natural(+e.target.value))))}/></label><label>Height (px)<br/><input aria-label="Sprite height" style={{...css.input,width:90}} type="number" min="8" max="1024" value={height} onChange={e=>setHeight(Math.min(1024,Math.max(8,natural(+e.target.value))))}/></label></div>
    <p><label><input type="checkbox" checked={key} onChange={e=>setKey(e.target.checked)}/> Remove solid corner-color background (approximate)</label></p>
    <label>Color tolerance: {tolerance}<br/><input aria-label="Background tolerance" type="range" min="0" max="100" value={tolerance} onChange={e=>setTolerance(+e.target.value)}/></label>
    <p style={css.muted}>Complex video backgrounds need manual masking or external segmentation. Native alpha from transparent PNGs is preserved.</p>
    <label>Assign imported frames to<br/><select aria-label="Imported animation" style={css.input} value={animation} onChange={e=>{setAnimation(e.target.value as Animation);setTick(0);}}>{animations.map(a=><option key={a}>{a}</option>)}</select></label>
    <p><label>Preview FPS / import default<br/><input aria-label="Animation fps" style={{...css.input,width:100}} type="number" min="1" max="60" value={fps} onChange={e=>setFps(Math.min(60,natural(+e.target.value)))}/></label></p>
   </section>
   <section style={css.panel}><h2>03 / Live animation</h2>
    <div style={{height:178,display:"grid",placeItems:"center",background:"repeating-conic-gradient(#283147 0% 25%,#20283b 0% 50%) 50% / 24px 24px",borderRadius:10}}>
     {preview?<img src={preview.png} alt="Animation preview" style={{width:Math.min(width,160),height:Math.min(height,160),objectFit:"contain",imageRendering:"pixelated"}}/>:<span style={css.muted}>Import frames to preview</span>}
    </div>
    <p style={{display:"flex",alignItems:"center",gap:12}}>{button(playing?"Pause":"Play",()=>setPlaying(!playing))}<span>{active.length} accepted {animation} frames</span></p>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{animations.map(a=><button key={a} style={{...css.button,background:animation===a?"#5478e9":"#303b56"}} onClick={()=>{setAnimation(a);setTick(0)}}>{a}</button>)}</div>
   </section>
  </div>
  <section style={{...css.panel,marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:12,alignItems:"center"}}><h2>04 / Frame review <span style={{...css.muted,fontSize:14}}>({frames.filter(f=>!f.rejected).length} accepted / {frames.filter(f=>f.rejected).length} rejected)</span></h2>{button("Clear imported frames",()=>{if(window.confirm("Clear frames from this workspace?")){setFrames([]);setSelected(null);setRevision(v=>v+1);}},!frames.length)}</div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(112px,1fr))",gap:9}}>
    {frames.map((f,i)=><button key={f.id} onClick={()=>setSelected(f.id)} style={{padding:8,border:"2px solid "+(f.id===selected?"#91a8ff":f.rejected?"#a05262":"#35415e"),borderRadius:10,background:"#111827",color:"white",cursor:"pointer",opacity:f.rejected?.5:1,textAlign:"left"}}>
     <img src={f.png} alt={"Frame "+i} style={{width:"100%",aspectRatio:"1",objectFit:"contain",imageRendering:"pixelated",background:"repeating-conic-gradient(#2b354c 0% 25%,#222b3e 0% 50%) 50% / 16px 16px"}}/>
     <small>{i+1} · {f.animation}{f.rejected?" · REJECT":""}</small>
    </button>)}
   </div>
   {!frames.length&&<p style={css.muted}>Extract frames from a video or import a grid-based sprite sheet to begin.</p>}
   {focused&&<div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:20,alignItems:"start"}}>
     <img src={focused.png} alt="Selected frame full size" style={{width:170,height:170,objectFit:"contain",imageRendering:"pixelated",background:"#101726"}}/>
     <div style={{display:"grid",gap:10,flex:"1 1 260px"}}>
      <strong>Selected frame · {focused.sourceTime===null?"sprite sheet":focused.sourceTime.toFixed(3)+"s"}</strong>
      <label>Animation <select aria-label="Selected frame animation" style={css.input} value={focused.animation} onChange={e=>update(focused.id,{animation:e.target.value as Animation})}>{animations.map(a=><option key={a}>{a}</option>)}</select></label>
      <label>Duration (ms) <input aria-label="Selected frame duration" style={{...css.input,width:100}} type="number" min="1" value={focused.duration} onChange={e=>update(focused.id,{duration:natural(+e.target.value)})}/></label>
      <label><input type="checkbox" checked={focused.rejected} onChange={e=>update(focused.id,{rejected:e.target.checked})}/> Reject frame from exports</label>
      <label>Frame note <input aria-label="Frame note" style={{...css.input,width:"100%"}} value={focused.note} onChange={e=>update(focused.id,{note:e.target.value})}/></label>
     </div>
   </div>}
  </section>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16}}>
   <section style={css.panel}><h2>05 / Playable sandbox</h2><p style={css.muted}>Move with A/D or arrows. W jumps; J attacks. Uses reviewed frames.</p>
    <div tabIndex={0} aria-label="Playable sandbox" onKeyDown={e=>{if(["ArrowRight","d","D"].includes(e.key))setSandbox(s=>({x:Math.min(85,s.x+7),y:0,action:"walk"}));if(["ArrowLeft","a","A"].includes(e.key))setSandbox(s=>({x:Math.max(0,s.x-7),y:0,action:"walk"}));if(["w","W","ArrowUp"].includes(e.key))setSandbox(s=>({...s,action:"jump",y:24}));if(["j","J"].includes(e.key))setSandbox(s=>({...s,action:"attack",y:0}));}} style={{height:210,position:"relative",borderRadius:9,background:"linear-gradient(#263951,#2d4b5e 70%,#426b53 70%)",outline:"2px solid #384f78"}}>
     {(()=>{const candidates=frames.filter(f=>!f.rejected&&f.animation===sandbox.action);const p=candidates.length?candidates[tick%candidates.length]:preview;return p?<img alt="Game character" src={p.png} style={{position:"absolute",bottom:36+sandbox.y,left:sandbox.x+"%",height:120,imageRendering:"pixelated"}}/>:null;})()}
    </div><p style={{display:"flex",gap:8,flexWrap:"wrap"}}>{button("←",()=>setSandbox(s=>({x:Math.max(0,s.x-7),y:0,action:"walk"})))}{button("→",()=>setSandbox(s=>({x:Math.min(85,s.x+7),y:0,action:"walk"})))}{button("Jump",()=>setSandbox(s=>({...s,y:24,action:"jump"})))}{button("Attack",()=>setSandbox(s=>({...s,y:0,action:"attack"})))}{button("Idle",()=>setSandbox(s=>({...s,y:0,action:"idle"})))}</p>
   </section>
   <section style={css.panel}><h2>06 / Provenance & versions</h2><p style={css.muted}>Revision {revision} · {source?.filename||"No source"} · {source?.importedAt||"No import date"}</p>
    <label>Version note<br/><textarea aria-label="Version note" style={{...css.input,width:"100%",minHeight:65}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Record what changed and why"/></label>
    <p>{button("Save version note",()=>{if(note.trim()){setNotes(n=>[...n,{date:new Date().toISOString(),text:"v"+revision+": "+note.trim()}]);setNote("");setRevision(v=>v+1);}},!note.trim())}</p>
    <div style={{maxHeight:140,overflowY:"auto"}}>{notes.slice().reverse().map((n,i)=><p key={i} style={{...css.muted,fontSize:13}}>{n.date.slice(0,16)} · {n.text}</p>)}</div>
   </section>
   <section style={css.panel}><h2>07 / Export & integration</h2><p style={css.muted}>ZIP package includes atlas.png, transparent per-frame PNGs, manifest.json, and example.html. Atlas cells retain the exact configured width and height.</p>
    <p>{button(busy?"Preparing archive…":"Download asset ZIP",exportPack,busy||!frames.some(f=>!f.rejected))}</p>
    <p style={css.muted}>Metadata records coordinates, timing, names, dimensions, anchors, source timestamps, relative paths, rejections, and version notes. The example runs from a local web server.</p>
    <p style={{color:"#9dd1b6"}}>Free local processing · No API calls</p>
   </section>
  </div>
  {error&&<p role="alert" style={{color:"#ff9ea7"}}>{error}</p>}
  <footer style={{marginTop:24,...css.muted,fontSize:13}}>Offline after the app shell is cached; video codecs must be supported by your browser. Files are processed locally and exported on demand.</footer>
 </main>;
}
const gameExample = String.raw`<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Exported Sprite Demo</title>
<style>body{background:#10131c;color:white;font:16px system-ui;text-align:center}canvas{width:min(90vw,700px);image-rendering:pixelated;background:linear-gradient(#26415b 75%,#395e42 75%)}</style>
<h1>Exported Sprite Demo</h1><p>A/D move · W jump · J attack · Space idle</p><canvas width="700" height="320"></canvas>
<script>
(async()=>{
 const data=await (await fetch('./manifest.json')).json();const atlas=new Image();atlas.src=data.atlas.image;await atlas.decode();
 const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
 let x=300,action='idle',start=performance.now(),dir=1;
 const keys={};addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if([' ','arrowup','arrowleft','arrowright'].includes(e.key.toLowerCase()))e.preventDefault()});
 addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false});
 function draw(now){
  const prev=action;if(keys.j)action='attack';else if(keys.w||keys.arrowup)action='jump';else if(keys.a||keys.arrowleft||keys.d||keys.arrowright)action='walk';else action='idle';
  if(prev!==action)start=now;
  if(keys.d||keys.arrowright){x=Math.min(650,x+3);dir=1}
  if(keys.a||keys.arrowleft){x=Math.max(0,x-3);dir=-1}
  const group=data.animations[action]||data.animations.walk||Object.values(data.animations)[0];
  if(group){const total=group.durations.reduce((a,b)=>a+b,0);let phase=(now-start)%total;let idx=0;while(idx<group.durations.length-1&&phase>=group.durations[idx])phase-=group.durations[idx++];
   const frame=data.frames.find(f=>f.name===group.frames[idx]);if(frame){ctx.clearRect(0,0,700,320);ctx.save();ctx.translate(x,260);ctx.scale(dir,1);ctx.drawImage(atlas,frame.x,frame.y,frame.w,frame.h,-frame.w/2,-frame.h,frame.w,frame.h);ctx.restore();}
  }requestAnimationFrame(draw);
 }requestAnimationFrame(draw);
})().catch(e=>document.body.insertAdjacentText('beforeend','Unable to load assets: '+e.message));
</script></html>`;
