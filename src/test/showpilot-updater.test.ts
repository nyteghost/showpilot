import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";

const requireNode=createRequire(new URL("../../desktop/app-updates.cjs",import.meta.url));
const code=readFileSync(fileURLToPath(new URL("../../desktop/app-updates.cjs",import.meta.url)),"utf8");
const moduleObj={exports:{} as {
 readyPlatformArtifact:(run:unknown,jobs:unknown[],artifacts:unknown[],platform:string)=>{name:string}|null;
 updateArtifacts:(platform:string)=>string[];
}};
runInNewContext(code,{
 module:moduleObj,exports:moduleObj.exports,
 require:(name:string)=>name==="electron"?{ipcMain:{handle:()=>{}},shell:{openExternal:async()=>{}},app:{getPath:()=>""}}:requireNode(name),
 Buffer,process,URL,
},{filename:"desktop/app-updates.cjs"});
const {readyPlatformArtifact,updateArtifacts}=moduleObj.exports;
const run=(status="in_progress",conclusion:null|string=null)=>({run_number:267,status,conclusion});
const job=(name:string,conclusion:string|null="success")=>({name,status:conclusion?"completed":"in_progress",conclusion});
const artifact=(name:string,expired=false,bytes=100000)=>({name,expired,size_in_bytes:bytes});

describe("ShowPilot update checks use finished platform artifacts, not entire workflow status",()=>{
 it("recognizes Windows beta #267 despite another Linux job running",()=>{
  const jobs=[job("check"),job("windows-portable"),job("linux-portable",null),job("linux-appimage")];
  const files=[artifact("showpilot-windows-portable"),artifact("showpilot-linux-appimage"),artifact("showpilot-browser-beta")];
  expect(readyPlatformArtifact(run(),jobs,files,"win32")?.name).toBe("showpilot-windows-portable");
 });
 it("does not offer an unfinished Windows package or a package before checks pass",()=>{
  const files=[artifact("showpilot-windows-portable")];
  expect(readyPlatformArtifact(run(),[job("check"),job("windows-portable",null)],files,"win32")).toBeNull();
  expect(readyPlatformArtifact(run(),[job("check","failure"),job("windows-portable")],files,"win32")).toBeNull();
  expect(readyPlatformArtifact(run(),[job("windows-portable")],files,"win32")).toBeNull();
 });
 it("does not offer missing, empty or expired artifacts",()=>{
  const jobs=[job("check"),job("windows-portable")];
  expect(readyPlatformArtifact(run(),jobs,[],"win32")).toBeNull();
  expect(readyPlatformArtifact(run(),jobs,[artifact("showpilot-windows-portable",true)],"win32")).toBeNull();
  expect(readyPlatformArtifact(run(),jobs,[artifact("showpilot-windows-portable",false,0)],"win32")).toBeNull();
 });
 it("allows a verified finished Windows artifact when later multi-platform work was cancelled",()=>{
  expect(readyPlatformArtifact(run("completed","cancelled"),[job("check"),job("windows-portable")],
   [artifact("showpilot-windows-portable")],"win32")?.name).toBe("showpilot-windows-portable");
 });
 it("prefers a successful Linux AppImage but falls back to a finished portable archive",()=>{
  const arts=[artifact("showpilot-linux-appimage"),artifact("showpilot-linux-portable")];
  expect(readyPlatformArtifact(run(),[job("check"),job("linux-appimage"),job("linux-portable")],arts,"linux")?.name)
   .toBe("showpilot-linux-appimage");
  expect(readyPlatformArtifact(run(),[job("check"),job("linux-appimage",null),job("linux-portable")],arts,"linux")?.name)
   .toBe("showpilot-linux-portable");
 });
 it("does not confuse Windows and Linux jobs or accept unsupported platforms",()=>{
  expect(readyPlatformArtifact(run(),[job("check"),job("linux-portable")],[artifact("showpilot-windows-portable")],"win32")).toBeNull();
  expect(updateArtifacts("darwin")).toEqual([]);
  expect(readyPlatformArtifact(run(),[job("check"),job("windows-portable")],[artifact("showpilot-windows-portable")],"darwin")).toBeNull();
 });
});
