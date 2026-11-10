import {describe,it,expect,afterEach} from "vitest";
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
const nativeRequire=createRequire(import.meta.url);
const tmpdirs:string[]=[];
function vaultEnvironment(){
 const directory=mkdtempSync(join(tmpdir(),"showpilot-vault-test-"));
 tmpdirs.push(directory);
 const file=join(directory,"showpilot-ai-keys.v1.json");
 const module={exports:{} as {status:()=>{available:boolean;providers:string[];needsReset:boolean;message?:string};
  resetCorruptVault:(code:string)=>unknown}};
 const electron={app:{getPath:()=>directory},ipcMain:{handle:()=>{}},safeStorage:{
   isEncryptionAvailable:()=>true,
   getSelectedStorageBackend:()=>"kwallet",
 }};
 const script=readFileSync(resolve(process.cwd(),"desktop/ai-vault.cjs"),"utf8");
 runInNewContext(script,{
  module,exports:module.exports,
  require:(id:string)=>id==="electron"?electron
   :id==="./secure-storage.cjs"?nativeRequire(resolve(process.cwd(),"desktop/secure-storage.cjs"))
   :nativeRequire(id),
  Buffer,fetch:()=>{throw Error("Network should not be used by settings tests");},
  AbortSignal,console,URL,Date,Object
 },{filename:"ai-vault.cjs"});
 return {file,directory,api:module.exports};
}
afterEach(()=>{for(const d of tmpdirs.splice(0))rmSync(d,{recursive:true,force:true})});
describe("Claude AI vault recoverability",()=>{
 it("keeps settings usable when credential JSON is corrupt",()=>{
  const x=vaultEnvironment();writeFileSync(x.file,"{not-json");
  const status=x.api.status();
  expect(status).toMatchObject({available:false,providers:[],needsReset:true});
  expect(status.message).toMatch(/unreadable/);
  expect(()=>x.api.resetCorruptVault("yes")).toThrow(/Type RESET/);
  expect(readFileSync(x.file,"utf8")).toBe("{not-json");
 });
 it("archives broken encrypted file only after explicit RESET",()=>{
  const x=vaultEnvironment();writeFileSync(x.file,"{not-json");
  const result=x.api.resetCorruptVault("RESET") as {needsReset:boolean};
  expect(result.needsReset).toBe(false);
  const copies=readdirSync(x.directory).filter(n=>n.includes(".corrupt-"));
  expect(copies).toHaveLength(1);
  expect(readFileSync(join(x.directory,copies[0]!),"utf8")).toBe("{not-json");
 });
 it("never resets readable stored credentials",()=>{
  const x=vaultEnvironment();
  const original=JSON.stringify({openai:"encrypted-opaque-data",untrusted:"should-be-filtered"});
  writeFileSync(x.file,original);
  expect(x.api.status()).toMatchObject({needsReset:false,providers:["openai"]});
  expect(()=>x.api.resetCorruptVault("RESET")).toThrow(/unnecessary/);
  expect(readFileSync(x.file,"utf8")).toBe(original);
 });
});