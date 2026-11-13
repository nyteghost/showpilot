import {describe,it,expect} from "vitest";
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";

const requireNative=createRequire(import.meta.url);
const source=readFileSync(resolve(process.cwd(),"desktop/google-calendar.cjs"),"utf8");

function runtime(dir:string,selection:()=>Promise<{canceled:boolean;filePaths:string[]}>){
 const handlers=new Map<string,(...args:any[])=>any>();
 const crypto={
  isEncryptionAvailable:()=>true,
  getSelectedStorageBackend:()=>"kwallet",
  encryptString:(txt:string)=>Buffer.from([...Buffer.from(txt)].map(b=>b^0xb7)),
  decryptString:(buf:Buffer)=>Buffer.from([...buf].map(b=>b^0xb7)).toString("utf8")
 };
 const electron={
  app:{getPath:()=>dir},
  ipcMain:{handle:(name:string,cb:(...args:any[])=>any)=>handlers.set(name,cb)},
  safeStorage:crypto,shell:{openExternal:async()=>{}},
  BrowserWindow:{getFocusedWindow:()=>null},
  dialog:{showOpenDialog:selection},
 };
 const module={exports:{} as Record<string,(...args:any[])=>any>};
 const sandbox={
  module,exports:module.exports,URL,URLSearchParams,AbortSignal,
  Buffer,setTimeout,clearTimeout,console,
  require:(name:string)=>name==="electron"?electron:requireNative(
   name==="./secure-storage.cjs"?resolve(process.cwd(),"desktop/secure-storage.cjs"):name),
  fetch:()=>{throw new Error("Network forbidden in test");}
 };
 runInNewContext(source,sandbox,{filename:"desktop/google-calendar.cjs"});
 module.exports.setupGoogleCalendarIpc();
 return {handlers,api:module.exports,crypto};
}

describe("Google OAuth JSON: trusted native file picker",()=>{
 it("imports a valid Desktop JSON without exposing its contents to renderer IPC",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"showpilot-google-json-"));
  try{
   const file=join(dir,"google-desktop.json");
   const client="client123.apps.googleusercontent.com";
   writeFileSync(file,JSON.stringify({installed:{client_id:client,client_secret:"fake-secret"}}));
   const app=runtime(dir,async()=>({canceled:false,filePaths:[file]}));
   const choose=app.handlers.get("showpilot-calendar:choose-client")!;
   const result=await choose(null);
   expect(result).toMatchObject({cancelled:false,status:{configured:true,connected:false}});
   expect(app.handlers.has("showpilot-calendar:save-client")).toBe(false);
   const onDisk=readFileSync(join(dir,"showpilot-calendar-credentials.v1.json"),"utf8");
   expect(onDisk).not.toContain(client);
   expect(onDisk).not.toContain("fake-secret");
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it("canceling selection never overwrites previously saved authorization",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"showpilot-google-cancel-"));
  try{
   const app=runtime(dir,async()=>({canceled:true,filePaths:[]}));
   const client="client123.apps.googleusercontent.com";
   app.api.setClient(JSON.stringify({installed:{client_id:client}}));
   const before=readFileSync(join(dir,"showpilot-calendar-credentials.v1.json"),"utf8");
   const result=await app.handlers.get("showpilot-calendar:choose-client")!(null);
   expect(result).toMatchObject({cancelled:true,status:{configured:true}});
   expect(readFileSync(join(dir,"showpilot-calendar-credentials.v1.json"),"utf8")).toBe(before);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it("rejects oversized or invalid JSON and retains previous credentials",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"showpilot-google-invalid-"));
  try{
   const client="client123.apps.googleusercontent.com",tooBig=join(dir,"wrong.json");
   writeFileSync(tooBig,"x".repeat(12001));
   const app=runtime(dir,async()=>({canceled:false,filePaths:[tooBig]}));
   app.api.setClient(JSON.stringify({installed:{client_id:client}}));
   const before=readFileSync(join(dir,"showpilot-calendar-credentials.v1.json"),"utf8");
   await expect(app.handlers.get("showpilot-calendar:choose-client")!(null))
    .rejects.toThrow(/smaller than 12 KB/);
   expect(readFileSync(join(dir,"showpilot-calendar-credentials.v1.json"),"utf8")).toBe(before);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it("keeps refresh authorization when the same Desktop client JSON is replaced",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"showpilot-google-same-client-"));
  try{
   const client="client123.apps.googleusercontent.com",file=join(dir,"client.json");
   const app=runtime(dir,async()=>({canceled:false,filePaths:[file]}));
   const json=JSON.stringify({installed:{client_id:client,client_secret:"mock"}});
   writeFileSync(file,json);
   app.api.setClient(json);
   const secretFile=join(dir,"showpilot-calendar-credentials.v1.json");
   const token="test-only-fake-refresh-token";
   writeFileSync(secretFile,JSON.stringify({version:1,encrypted:app.crypto.encryptString(
    JSON.stringify({client_id:client,client_secret:"mock",refresh_token:token})
   ).toString("base64")}));
   const result=await app.handlers.get("showpilot-calendar:choose-client")!(null);
   expect(result).toMatchObject({cancelled:false,status:{configured:true,connected:true}});
   expect(readFileSync(secretFile,"utf8")).not.toContain(token);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});
