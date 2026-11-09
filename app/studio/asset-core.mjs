/** Deterministic, dependency-free, uncompressed ZIP packing for browser and Node. */
export function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function binaryData(dataUrl) {
  const data = dataUrl.split(",")[1];
  if (!data) throw new Error("Expected base64 data URL");
  const raw = atob(data);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
export function zip(files) {
  const chunks = [], central = [];
  let offset = 0;
  const encoder = new TextEncoder();
  const u16 = (view,pos,n)=>view.setUint16(pos,n,true);
  const u32 = (view,pos,n)=>view.setUint32(pos,n>>>0,true);
  for(const f of files) {
    if (!f.name || f.name.startsWith("/") || f.name.includes("..")) throw new Error("Unsafe ZIP path");
    const name=encoder.encode(f.name),crc=crc32(f.bytes);
    const local=new Uint8Array(30+name.length), v=new DataView(local.buffer);
    u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x800);u16(v,8,0);u32(v,14,crc);
    u32(v,18,f.bytes.length);u32(v,22,f.bytes.length);u16(v,26,name.length);local.set(name,30);
    chunks.push(local,f.bytes);
    const entry=new Uint8Array(46+name.length),d=new DataView(entry.buffer);
    u32(d,0,0x02014b50);u16(d,4,20);u16(d,6,20);u16(d,8,0x800);
    u32(d,16,crc);u32(d,20,f.bytes.length);u32(d,24,f.bytes.length);u16(d,28,name.length);
    u32(d,42,offset);entry.set(name,46);central.push(entry);
    offset+=local.length+f.bytes.length;
  }
  const centralLength=central.reduce((n,a)=>n+a.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);
  u32(v,0,0x06054b50);u16(v,8,files.length);u16(v,10,files.length);u32(v,12,centralLength);u32(v,16,offset);
  return new Blob([...chunks,...central,end],{type:"application/zip"});
}
export function atlasPositions(count,width,height,maxColumns=8){
  if(!Number.isInteger(count)||count<1||!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1)throw new Error("Invalid atlas dimensions");
  const columns=Math.min(maxColumns,count),rows=Math.ceil(count/columns);
  return {columns,rows,width:columns*width,height:rows*height,frames:Array.from({length:count},(_,i)=>({x:(i%columns)*width,y:Math.floor(i/columns)*height,w:width,h:height}))};
}
