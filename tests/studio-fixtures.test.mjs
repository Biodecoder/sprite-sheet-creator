import test from "node:test";
import assert from "node:assert/strict";
import { atlasPositions, binaryData, crc32, zip } from "../app/studio/asset-core.mjs";

const imageFixture = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=";
test("local fixture decodes reproducibly without services",()=>{
  const image=binaryData(imageFixture);
  assert.deepEqual([...image.slice(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(image.length>60,true);
});
test("CRC32 matches standard known vector",()=>{
  assert.equal(crc32(new TextEncoder().encode("123456789")),0xcbf43926);
});
test("atlas preserves exact dimensions without overlap",()=>{
  const a=atlasPositions(11,96,128);
  assert.deepEqual([a.columns,a.rows,a.width,a.height],[8,2,768,256]);
  assert.deepEqual(a.frames[0],{x:0,y:0,w:96,h:128});
  assert.deepEqual(a.frames[8],{x:0,y:128,w:96,h:128});
  assert.equal(new Set(a.frames.map(f=>f.x+","+f.y)).size,11);
  assert.throws(()=>atlasPositions(0,96,96));
});
test("ZIP exports valid local and central file headers",async()=>{
  const files=[
    {name:"atlas.png",bytes:binaryData(imageFixture)},
    {name:"manifest.json",bytes:new TextEncoder().encode('{"animations":{"walk":{"frames":["walk_000"],"durations":[125]}}}')},
  ];
  const data=new DataView(await zip(files).arrayBuffer());
  assert.equal(data.getUint32(0,true),0x04034b50);
  let offset=0;
  for(const file of files){
    assert.equal(data.getUint32(offset,true),0x04034b50);
    assert.equal(data.getUint32(offset+14,true),crc32(file.bytes));
    assert.equal(data.getUint32(offset+18,true),file.bytes.length);
    offset+=30+new TextEncoder().encode(file.name).length+file.bytes.length;
  }
  assert.equal(data.getUint32(offset,true),0x02014b50);
  const end=data.byteLength-22;
  assert.equal(data.getUint32(end,true),0x06054b50);
  assert.equal(data.getUint16(end+10,true),2);
  assert.equal(data.getUint32(end+16,true),offset);
});
test("ZIP blocks path traversal",()=>assert.throws(()=>zip([{name:"../oops",bytes:new Uint8Array()}])));
