"use strict";
/** Offline, bounded ZIP parser for ShowPilot event bundles. Do not extract zip
 * paths into the filesystem: callers save validated bytes through eventFileSave.
 * This rejects zip-slip paths, symlinks, encrypted/ZIP64/multidisk archives,
 * oversized files, duplicate paths, bad CRCs and excessive compression ratios.
 */
const zlib=require("node:zlib");
const MAX_ZIP=150*1024*1024;
const MAX_UNPACKED=220*1024*1024;
const MAX_ENTRIES=120;
const MAX_DOCUMENT=25*1024*1024;
const ALLOWED=new Set(["pdf","png","jpg","jpeg","webp","docx","xlsx","xls","csv","txt","dwg","dxf"]);
const ZIP_SIG=0x06054b50, CENTRAL_SIG=0x02014b50, LOCAL_SIG=0x04034b50;

function asBytes(input){
 if(input instanceof ArrayBuffer)return Buffer.from(input);
 if(ArrayBuffer.isView(input))return Buffer.from(input.buffer,input.byteOffset,input.byteLength);
 if(Buffer.isBuffer(input))return input;
 throw Error("Select a ZIP file to import.");
}
function safePath(value){
 if(!value||value.length>512||value.includes("\0")||value.includes("\\")||
  value.startsWith("/")||/^[a-zA-Z]:/.test(value)||value.split("/").some(x=>!x||x==="."||x===".."||x.includes(":")))
  throw Error("Unsafe path in event ZIP: "+String(value).slice(0,90));
 return value;
}
function crc32(bytes){
 let c=0xffffffff;
 for(const b of bytes){c^=b;for(let n=0;n<8;n++)c=(c&1)?(c>>>1)^0xedb88320:c>>>1;}
 return (c^0xffffffff)>>>0;
}
function decodeEntry(bytes,entry,max=MAX_DOCUMENT){
 if(entry.uncompressed>max)throw Error("ZIP entry exceeds the allowed size: "+entry.path);
 if(entry.method!==0&&entry.method!==8)throw Error("Unsupported compression in event ZIP: "+entry.path);
 const off=entry.localOffset;
 if(off+30>bytes.length||bytes.readUInt32LE(off)!==LOCAL_SIG)throw Error("Damaged ZIP local file header.");
 const flags=bytes.readUInt16LE(off+6),method=bytes.readUInt16LE(off+8);
 if(flags&1||method!==entry.method)throw Error("ZIP entry header does not match.");
 const start=off+30+bytes.readUInt16LE(off+26)+bytes.readUInt16LE(off+28);
 const end=start+entry.compressed;
 if(end>bytes.length||start<0||start>entry.centralStart)throw Error("ZIP compressed data is out of range.");
 const payload=bytes.subarray(start,end);
 const out=entry.method===0?Buffer.from(payload):zlib.inflateRawSync(payload,{maxOutputLength:max+1});
 if(out.length!==entry.uncompressed||crc32(out)!==entry.crc)throw Error("ZIP entry integrity check failed: "+entry.path);
 return out;
}
function readZip(input){
 const bytes=asBytes(input);
 if(bytes.length<22||bytes.length>MAX_ZIP)throw Error("Event ZIP must be between 22 bytes and 150 MB.");
 let eocd=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-22-65535);p--){
  if(bytes.readUInt32LE(p)===ZIP_SIG&&p+22+bytes.readUInt16LE(p+20)===bytes.length){eocd=p;break;}
 }
 if(eocd<0)throw Error("No valid ZIP directory found.");
 if(bytes.readUInt16LE(eocd+4)!==0||bytes.readUInt16LE(eocd+6)!==0||
  bytes.readUInt16LE(eocd+8)!==bytes.readUInt16LE(eocd+10))
  throw Error("Multidisk ZIP archives are not supported.");
 const count=bytes.readUInt16LE(eocd+10),size=bytes.readUInt32LE(eocd+12),offset=bytes.readUInt32LE(eocd+16);
 if(count===0xffff||offset===0xffffffff||size===0xffffffff)throw Error("ZIP64 archives are not supported.");
 if(count>MAX_ENTRIES||offset+size>eocd)throw Error("Event ZIP has too many entries or a damaged directory.");
 let pos=offset,unpacked=0;
 const entries=[],paths=new Set();
 for(let n=0;n<count;n++){
  if(pos+46>offset+size||bytes.readUInt32LE(pos)!==CENTRAL_SIG)throw Error("Damaged ZIP directory entry.");
  const flags=bytes.readUInt16LE(pos+8),method=bytes.readUInt16LE(pos+10);
  const crc=bytes.readUInt32LE(pos+16),compressed=bytes.readUInt32LE(pos+20),uncompressed=bytes.readUInt32LE(pos+24);
  const nameLen=bytes.readUInt16LE(pos+28),extraLen=bytes.readUInt16LE(pos+30),commentLen=bytes.readUInt16LE(pos+32);
  const disk=bytes.readUInt16LE(pos+34),external=bytes.readUInt32LE(pos+38),localOffset=bytes.readUInt32LE(pos+42);
  if(disk!==0||flags&1||method!==0&&method!==8)throw Error("Encrypted or unsupported ZIP entries are not accepted.");
  if(pos+46+nameLen+extraLen+commentLen>offset+size)throw Error("Damaged ZIP entry name.");
  const raw=bytes.subarray(pos+46,pos+46+nameLen).toString("utf8");
  pos+=46+nameLen+extraLen+commentLen;
  if(raw.endsWith("/")){safePath(raw.slice(0,-1));continue;}
  const path=safePath(raw);
  const normalized=path.toLowerCase();
  if(paths.has(normalized))throw Error("Duplicate document paths in event ZIP.");
  paths.add(normalized);
  if((external>>>16&0o170000)===0o120000)throw Error("ZIP symlinks are not allowed.");
  if(uncompressed>MAX_DOCUMENT&&!(normalized==="event.json"||normalized.endsWith("/event.json")))
   throw Error("A ZIP document is larger than 25 MB: "+path);
  if(compressed===0&&uncompressed>0||compressed>0&&uncompressed/compressed>300)
   throw Error("ZIP compression ratio is unsafe: "+path);
  unpacked+=uncompressed;
  if(unpacked>MAX_UNPACKED)throw Error("Event ZIP expands beyond 220 MB.");
  entries.push({path,crc,method,compressed,uncompressed,localOffset,centralStart:offset});
 }
 if(pos!==offset+size)throw Error("ZIP directory size mismatch.");
 return {bytes,entries};
}
function classify(path){
 const s=path.toLowerCase();
 if(/\beoc\b|event[\s_-]*order[\s_-]*confirmation/.test(s))return "eoc";
 if(/\bwo\b|work[\s_-]*order|utility[\s_-]*order/.test(s))return "work-order";
 if(/diagram|layout|floor[\s_-]*plan|floor[\s_-]*map|drawing|seating|room[\s_-]*plan/.test(s)||/\.(?:dwg|dxf)$/.test(s))return "diagram";
 return "other";
}
function inspect(input){
 const parsed=readZip(input);
 const files=[],ignored=[];
 let manifest=null;
 for(const entry of parsed.entries){
  const ext=entry.path.split(".").pop().toLowerCase();
  const base=entry.path.split("/").pop();
  if(/^(?:showpilot-event|event)\.json$/i.test(base)){
   if(entry.uncompressed>32*1024)throw Error("Event manifest is too large.");
   if(manifest!==null)throw Error("Event ZIP includes multiple event manifests.");
   try{
    const data=JSON.parse(decodeEntry(parsed.bytes,entry,32*1024).toString("utf8"));
    if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Invalid event manifest");
    const str=(key,length)=>typeof data[key]==="string"?data[key].trim().slice(0,length):"";
    manifest={
     showName:str("showName",140)||str("eventName",140),
     eventId:str("eventId",100),startDate:str("startDate",10),showDate:str("showDate",10),
     rooms:str("rooms",300)
    };
   }catch{throw Error("The event manifest JSON could not be read.");}
   continue;
  }
  if(!ALLOWED.has(ext)){ignored.push(entry.path);continue;}
  if(entry.uncompressed===0){ignored.push(entry.path);continue;}
  // A nested directory must remain visible to prevent ambiguous names.
  files.push({path:entry.path,name:base,bytes:entry.uncompressed,kind:classify(entry.path)});
 }
 if(!files.length)throw Error("This ZIP has no supported work orders, EOCs, diagrams or other documents.");
 return {files,ignored,manifest,totalBytes:files.reduce((n,f)=>n+f.bytes,0)};
}
function contents(input){
 const parsed=readZip(input),preview=inspect(parsed.bytes);
 const files=preview.files.map(f=>{
  const entry=parsed.entries.find(e=>e.path===f.path);
  return {...f,bytes:decodeEntry(parsed.bytes,entry)};
 });
 return {files,ignored:preview.ignored,manifest:preview.manifest};
}
module.exports={inspect,contents,readZip,crc32,MAX_ZIP,MAX_DOCUMENT,MAX_ENTRIES};
