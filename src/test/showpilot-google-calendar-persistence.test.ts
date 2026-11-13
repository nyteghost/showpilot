import {describe,it,expect} from "vitest";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";

const nativeRequire=createRequire(import.meta.url);
const code=readFileSync(resolve(process.cwd(),"desktop/google-calendar.cjs"),"utf8");

/** This uses a reversible TEST-ONLY cipher to inspect persistence behavior.
 * Real ShowPilot uses Electron safeStorage backed by the user's OS keychain. */
describe("Google OAuth configuration survives ShowPilot portable upgrades",()=>{
 it("reads the same encrypted client and refresh token after an app-version change",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"showpilot-google-persist-"));
  let version="0.1.765-claude";
  const cryptoStub={
   isEncryptionAvailable:()=>true,
   getSelectedStorageBackend:()=>"kwallet",
   encryptString:(value:string)=>Buffer.from([...Buffer.from(value,"utf8")].map(v=>v^0xa5)),
   decryptString:(value:Buffer)=>Buffer.from([...value].map(v=>v^0xa5)).toString("utf8"),
  };
  const launch=()=>{
   const handlers=new Map<string, (...args:any[])=>any>();
   const module={exports:{} as Record<string, (...args:any[])=>any>};
   const electron={
    app:{getPath:()=>dir,getVersion:()=>version},
    safeStorage:cryptoStub,
    ipcMain:{handle:(name:string,cb:(...args:any[])=>any)=>{handlers.set(name,cb)}},
    shell:{openExternal:async()=>{}}
   };
   const sandbox={
    module,exports:module.exports,URL,URLSearchParams,AbortSignal,
    Buffer,setTimeout,clearTimeout,console,
    fetch:async()=>({ok:false,status:400,json:async()=>({error:"invalid_grant"})}),
    require:(name:string)=>name==="electron"?electron:nativeRequire(
      name==="./secure-storage.cjs"?resolve(process.cwd(),"desktop/secure-storage.cjs"):name)
   };
   runInNewContext(code,sandbox,{filename:"google-calendar.cjs"});
   module.exports.setupGoogleCalendarIpc();
   return {handlers,api:module.exports};
  };
  const action=(session:{handlers:Map<string,(...args:any[])=>any>},suffix:string)=>
   session.handlers.get("showpilot-calendar:"+suffix)!;
  try{
   const first=launch(),client="1234-test.apps.googleusercontent.com";
   expect(action(first,"status")()).toMatchObject({configured:false,connected:false});
   // Native file chooser uses setClient inside Electron, not an IPC call
   // carrying raw OAuth credentials through the renderer.
   first.api.setClient(JSON.stringify({installed:{client_id:client,client_secret:"test-only"}}));
   expect(action(first,"status")()).toMatchObject({configured:true,connected:false});
   const file=join(dir,"showpilot-calendar-credentials.v1.json");
   expect(readFileSync(file,"utf8")).not.toContain(client);
   // Simulate a refresh token obtained through Google OAuth, using the same
   // protected on-disk format. No real credentials or external API are used.
   const secret="fake-refresh-token-do-not-use";
   const saved=JSON.stringify({client_id:client,client_secret:"test-only",refresh_token:secret});
   writeFileSync(file,JSON.stringify({version:1,encrypted:cryptoStub.encryptString(saved).toString("base64")}));
   version="0.1.766-claude";
   const next=launch();
   expect(action(next,"status")()).toMatchObject({available:true,configured:true,connected:true});
   const encryptedText=readFileSync(file,"utf8");
   expect(encryptedText).not.toContain(client);
   expect(encryptedText).not.toContain(secret);
   // When Google revokes or times out the saved refresh token, ShowPilot must
   // instruct a reconnect without silently erasing the user's configuration.
   const shift={id:"ppshift20261116s540",date:"2026-11-16",start:540,end:1080,raw:"9a-6p"};
   await expect(action(next,"update-all")(null,{title:"Work",shifts:[shift]}))
    .rejects.toThrow(/authorization expired or was revoked.*Reconnect Google Calendar/i);
   expect(action(next,"status")()).toMatchObject({configured:true,connected:true});
  } finally {
   rmSync(dir,{recursive:true,force:true});
  }
 });
});
