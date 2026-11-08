import {describe,it,expect} from "vitest";
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {runInNewContext} from "node:vm";
const req=createRequire(new URL("../../desktop/portable-updates.cjs",import.meta.url));
const code=readFileSync(fileURLToPath(new URL("../../desktop/portable-updates.cjs",import.meta.url)),"utf8");
const moduleObj={exports:{} as {
 semverCompare:(a:string,b:string)=>number|null;
 releaseAssetsForRun:(release:unknown,run:unknown,version:string)=>{archiveUrl:string;checksumUrl:string;archiveBytes:number}|null;
 officialReleaseAssetUrl:(url:string,tag:string,name:string)=>boolean;
 assertDownloadUrl:(url:string)=>URL;
 prepareInstallPaths:(v:string)=>unknown;
 updateResult:(dir:string,status:string,message:string,version?:string)=>{status:string;message:string;version:string};
 readUpdateResult:(dir:string,installedVersion?:string)=>{status:string;message:string;version:string}|null;
 downloadWindowsReleaseToDownloads:(sender:unknown,release:unknown,installedVersion:string)=>Promise<unknown>;
 updateLogPath:(dir:string)=>string;
}};
runInNewContext(code,{
 module:moduleObj,exports:moduleObj.exports,
 require:(name:string)=>name==="electron"?{app:{isPackaged:false,getPath:()=>"/tmp"},dialog:{}}:req(name),
 Buffer,process,URL,setTimeout,
},{filename:"desktop/portable-updates.cjs"});
const updater=moduleObj.exports;
const run={id:123456789,head_branch:"beta",head_sha:"a".repeat(40)};
const version="0.1.310-beta";
const tag="showpilot-beta-v"+version;
const zip="ShowPilot-v"+version+"-Portable-Windows.zip";
const base="https://github.com/nyteghost/showpilot/releases/download/"+tag+"/";
const asset=(name:string,size:number)=>({
 name,size,state:"uploaded",browser_download_url:base+name
});
const release=()=>({
 tag_name:tag,draft:false,prerelease:true,
 body:"ShowPilot beta Windows portable release. Actions run ID: "+run.id+". Source commit: "+run.head_sha+".",
 assets:[asset(zip,15_000_000),asset(zip+".sha256",65)]
});
describe("ShowPilot Windows portable one-click updater",()=>{
 it("only installs newer versions (never downgrades)",()=>{
  expect(updater.semverCompare("0.1.310-beta","0.1.291-beta")).toBe(1);
  expect(updater.semverCompare("0.1.291-beta","0.1.291-beta")).toBe(0);
  expect(updater.semverCompare("0.1.270-beta","0.1.291-beta")).toBe(-1);
  expect(updater.semverCompare("0.1.310","0.1.310-beta")).toBe(1);
  expect(updater.semverCompare("legacy","0.1.310-beta")).toBeNull();
 });
 it("accepts only an exact public, versioned beta release matching Actions run and commit",()=>{
  const parsed=updater.releaseAssetsForRun(release(),run,version);
  expect(parsed).not.toBeNull();
  expect(parsed!.archiveBytes).toBe(15_000_000);
  expect(parsed!.archiveUrl).toBe(base+zip);
  expect(parsed!.checksumUrl).toBe(base+zip+".sha256");
  expect(updater.releaseAssetsForRun({...release(),tag_name:"showpilot-beta-v0.1.309-beta"},run,version)).toBeNull();
  expect(updater.releaseAssetsForRun({...release(),body:"not associated with this run"},run,version)).toBeNull();
  expect(updater.releaseAssetsForRun({...release(),draft:true},run,version)).toBeNull();
  expect(updater.releaseAssetsForRun({...release(),prerelease:false},run,version)).toBeNull();
  expect(updater.releaseAssetsForRun(release(),{...run,head_branch:"main"},version)).toBeNull();
 });
 it("rejects unexpected download hosts, missing checksum assets and expired links",()=>{
  const differentHost={...release(),assets:[{...asset(zip,15_000_000),
   browser_download_url:"https://example.org/untrusted.zip"},asset(zip+".sha256",65)]};
  expect(updater.releaseAssetsForRun(differentHost,run,version)).toBeNull();
  expect(updater.releaseAssetsForRun({...release(),assets:[asset(zip,15_000_000)]},run,version)).toBeNull();
  expect(updater.releaseAssetsForRun({...release(),assets:[asset(zip,15_000_000),asset(zip+".sha256",3000)]},run,version)).toBeNull();
  expect(()=>updater.assertDownloadUrl("https://evil.example.com/update.zip")).toThrow(/trusted GitHub/);
  expect(()=>updater.assertDownloadUrl("http://github.com/nyteghost/showpilot/releases/download/a/b")).toThrow(/trusted GitHub/);
  expect(updater.officialReleaseAssetUrl(base+zip,tag,zip)).toBe(true);
  expect(updater.officialReleaseAssetUrl(base+zip+"?tampered=1",tag,zip)).toBe(false);
 });
 it("never downloads to Downloads outside the packaged Windows app",async()=>{
  const releaseInfo=updater.releaseAssetsForRun(release(),run,version);
  await expect(updater.downloadWindowsReleaseToDownloads(null,
   {...releaseInfo,version},"0.1.309-beta")).rejects.toThrow(/packaged Windows/);
 });
 it("wires an independent download-only action without invoking automatic install",()=>{
  const src=readFileSync(fileURLToPath(new URL("../../desktop/app-updates.cjs",import.meta.url)),"utf8");
  const preload=readFileSync(fileURLToPath(new URL("../../desktop/preload.cjs",import.meta.url)),"utf8");
  const screen=readFileSync(fileURLToPath(new URL("../components/showpilot-updates.tsx",import.meta.url)),"utf8");
  expect(src).toContain('showpilot-update:download');
  expect(preload).toContain('download:()=>ipcRenderer.invoke("showpilot-update:download")');
  expect(screen).toContain("Download ZIP to Downloads");
  expect(screen).toContain("Automatic install (optional)");
  expect(code).toContain("COPYFILE_EXCL");
  expect(code).toContain('app.getPath("downloads")');
 });
 it("does not attempt to replace apps during development or on Linux",()=>{
  expect(()=>updater.prepareInstallPaths("0.1.310-beta")).toThrow(/Windows portable/);
 });
 it("includes an independent Windows extraction helper with rollback and ZIP-slip checks",()=>{
  const ps=readFileSync(fileURLToPath(new URL("../../desktop/portable-update-helper.ps1",import.meta.url)),"utf8");
  expect(ps).toContain("Install-Zip");
  expect(ps).toContain("Stage-Zip");
  expect(ps).toContain("Wait"); // This is intentionally checked more precisely below.
  expect(ps).toContain("Get-Process -Id $AppProcessId");
  expect(ps).toContain("ZIP entry escapes its staging directory");
  expect(ps).toContain("[System.IO.Directory]::Move($BackupDir,$InstallDir)");
  expect(ps).toContain("Wait-For-Old-App");
  expect(ps).toContain("Running-ShowPilotProcesses");
  expect(ps).toContain("Write-UpdateResult 'failed'");
  expect(ps).toContain("Restarted previous ShowPilot version");
  expect(ps).toContain("SmokeTestNoRelaunch");
  expect(ps).toContain("[string]$ExpectedVersion");
  expect(ps).toContain("version=$ExpectedVersion");
  expect(ps).toContain("Launcher handed off");
  expect(ps).toContain("Original app retained for rollback");
 });
 it("persists a readable install failure report for the next app launch",()=>{
  const dir=mkdtempSync(join(tmpdir(),"showpilot-update-status-"));
  try{
   const saved=updater.updateResult(dir,"failed","Directory was locked by an Electron child process.","0.1.331-beta");
   expect(saved.status).toBe("failed");
   expect(updater.readUpdateResult(dir)).toMatchObject({
    status:"failed",version:"0.1.331-beta",message:"Directory was locked by an Electron child process."
   });
   expect(updater.updateLogPath(dir)).toMatch(/last-update\.log$/);
   updater.updateResult(dir,"success","Relaunched replacement.","0.1.378-beta");
   expect(updater.readUpdateResult(dir,"0.1.378-beta")?.status).toBe("success");
   expect(updater.readUpdateResult(dir,"0.1.368-beta")).toMatchObject({
    status:"failed",version:"0.1.378-beta"
   });
   expect(updater.readUpdateResult(dir,"0.1.368-beta")?.message).toContain("still version 0.1.368-beta");
   const file=join(dir,"ShowPilot Updates","last-update-result.json");
   writeFileSync(file,JSON.stringify({status:"pending",message:"Close and restart",version:"0.1.331-beta",
    updated:new Date(Date.now()-10*60*1000).toISOString()}));
   expect(updater.readUpdateResult(dir)?.status).toBe("failed");
  }finally{rmSync(dir,{recursive:true,force:true});}
 });

});
