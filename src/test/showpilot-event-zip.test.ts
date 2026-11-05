import {describe,expect,it} from "vitest";
import {createRequire} from "node:module";
import {deflateRawSync} from "node:zlib";

const req=createRequire(import.meta.url);
const zip=req("../../desktop/event-zip.cjs") as {
 inspect:(data:Uint8Array)=>{files:{path:string;name:string;bytes:number;kind:string}[];ignored:string[];manifest:any;totalBytes:number};
 contents:(data:Uint8Array)=>{files:{path:string;kind:string;bytes:Buffer}[]};
 crc32:(b:Buffer)=>number;
};
function createZip(entries:{name:string;data:Uint8Array;method?:number}[]):Buffer{
 const locals:Buffer[]=[],central:Buffer[]=[];
 let offset=0;
 for(const entry of entries){
  const name=Buffer.from(entry.name,"utf8"),original=Buffer.from(entry.data);
  const method=entry.method??8,compressed=method===0?original:deflateRawSync(original);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(method,8);
  local.writeUInt32LE(zip.crc32(original),14);
  local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(original.length,22);
  local.writeUInt16LE(name.length,26);
  locals.push(local,name,compressed);
  const cd=Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);
  cd.writeUInt16LE(method,10);cd.writeUInt32LE(zip.crc32(original),16);
  cd.writeUInt32LE(compressed.length,20);cd.writeUInt32LE(original.length,24);
  cd.writeUInt16LE(name.length,28);cd.writeUInt32LE(offset,42);
  central.push(cd,name);
  offset+=local.length+name.length+compressed.length;
 }
 const cd=Buffer.concat(central),eocd=Buffer.alloc(22);
 eocd.writeUInt32LE(0x06054b50,0);
 eocd.writeUInt16LE(entries.length,8);eocd.writeUInt16LE(entries.length,10);
 eocd.writeUInt32LE(cd.length,12);eocd.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,cd,eocd]);
}
const pdf=Buffer.from("%PDF-1.7\nSynthetic EOC","utf8");
describe("Secure event ZIP import",()=>{
 it("previews EOCs, work orders and diagrams with optional show manifest",()=>{
  const bundle=createZip([
   {name:"event.json",data:Buffer.from(JSON.stringify({showName:"Front Row Card Show",eventId:"123",startDate:"2026-11-12",showDate:"2026-11-13",rooms:"Hall A, Hall B"}))},
   {name:"Work Orders/work-order-42.pdf",data:pdf},
   {name:"EOC/event-order-confirmation.pdf",data:pdf,method:0},
   {name:"Event Layouts/Hall AB diagram.png",data:Buffer.from("diagram")},
   {name:"unrelated.exe",data:Buffer.from("blocked")}
  ]);
  const preview=zip.inspect(bundle);
  expect(preview.manifest).toMatchObject({showName:"Front Row Card Show",rooms:"Hall A, Hall B"});
  expect(preview.files.map(f=>f.kind).sort()).toEqual(["diagram","eoc","work-order"]);
  expect(preview.ignored).toEqual(["unrelated.exe"]);
  const extracted=zip.contents(bundle);
  expect(extracted.files.map(f=>f.path)).toEqual(preview.files.map(f=>f.path));
  expect(extracted.files[0]!.bytes.equals(pdf)).toBe(true);
 });
 it("rejects zip-slip and absolute paths without touching the filesystem",()=>{
  for(const bad of ["../secrets.pdf","/home/user/diagram.pdf","C:/folder/EOC.pdf","folder\\evil.pdf","folder/../../evil.pdf"]){
   const archive=createZip([{name:bad,data:pdf}]);
   expect(()=>zip.inspect(archive)).toThrow(/Unsafe path/);
  }
 });
 it("rejects duplicate entries, corrupt contents and unsupported compression",()=>{
  const duplicate=createZip([{name:"EOC.PDF",data:pdf},{name:"eoc.pdf",data:pdf}]);
  expect(()=>zip.inspect(duplicate)).toThrow(/Duplicate/);
  const damaged=createZip([{name:"EOC.pdf",data:pdf}]);
  const changed=Buffer.from(damaged);changed[35]=0;
  expect(()=>zip.contents(changed)).toThrow(/integrity|invalid|distance|incorrect|corrupt|data/i);
  expect(()=>zip.inspect(Buffer.from("not a zip"))).toThrow(/Event ZIP/);
  const unsupported=createZip([{name:"EOC.pdf",data:pdf,method:9}]);
  expect(()=>zip.inspect(unsupported)).toThrow(/unsupported/i);
 });
 it("caps file size and compression expansion to prevent ZIP bombs",()=>{
  const big=createZip([{name:"massive.txt",data:Buffer.alloc(26*1024*1024,65)}]);
  expect(()=>zip.inspect(big)).toThrow(/25 MB|ratio/i);
 });
 it("does not accept a ZIP containing only executable or unsupported files",()=>{
  expect(()=>zip.inspect(createZip([{name:"install.exe",data:Buffer.from("bad")}]))).toThrow(/no supported/);
 });
});
