"use strict";
/** Safe Windows portable updater (no administrator privileges or PAT).
 * Official, public GitHub Release assets are downloaded over HTTPS and checked
 * against the separately published SHA-256. Nothing is replaced until verified
 * staging succeeds and the user explicitly approves a restart.
 */
const {app,dialog}=require("electron");
const fs=require("node:fs");
const path=require("node:path");
const https=require("node:https");
const crypto=require("node:crypto");
const {spawn,execFile}=require("node:child_process");
const {Transform}=require("node:stream");
const {pipeline}=require("node:stream/promises");
const MAX_PACKAGE_BYTES=1024*1024*1024;
const ALLOWED_DOWNLOAD_HOSTS=new Set([
 "github.com","release-assets.githubusercontent.com","objects.githubusercontent.com"
]);
const ROOT="https://github.com/nyteghost/showpilot/releases/download/";

function semverCompare(a,b){
 const parse=x=>{const m=/^(\d+)\.(\d+)\.(\d+)(?:-(beta))?$/.exec(String(x));
  return m?[+m[1],+m[2],+m[3],m[4]?-1:0]:null;};
 const left=parse(a),right=parse(b);
 if(!left||!right)return null;
 for(let i=0;i<4;i++)if(left[i]!==right[i])return left[i]>right[i]?1:-1;
 return 0;
}
function officialReleaseAssetUrl(url,tag,name){
 if(typeof url!=="string"||typeof tag!=="string"||typeof name!=="string")return false;
 try{
  const u=new URL(url);
  return u.protocol==="https:"&&u.hostname==="github.com"&&!u.search&&!u.hash&&
   u.pathname==="/nyteghost/showpilot/releases/download/"+encodeURIComponent(tag)+"/"+encodeURIComponent(name);
 }catch{return false}
}
function releaseAssetsForRun(release,run,version){
 if(!release||release.draft!==false||release.prerelease!==true||!Array.isArray(release.assets)||
    typeof version!=="string"||run?.head_branch!=="beta")return null;
 const tag="showpilot-beta-v"+version;
 const zipName="ShowPilot-v"+version+"-Portable-Windows.zip";
 const hashName=zipName+".sha256";
 if(release.tag_name!==tag||typeof release.body!=="string"||
   !release.body.includes("Actions run ID: "+run.id+".")||
   !release.body.includes("Source commit: "+run.head_sha+"."))
  return null;
 const zip=release.assets.find(a=>a.name===zipName&&a.state==="uploaded"&&a.size>100_000&&a.size<=MAX_PACKAGE_BYTES);
 const checksum=release.assets.find(a=>a.name===hashName&&a.state==="uploaded"&&a.size>0&&a.size<512);
 if(!zip||!checksum||
  !officialReleaseAssetUrl(zip.browser_download_url,tag,zipName)||
  !officialReleaseAssetUrl(checksum.browser_download_url,tag,hashName))return null;
 return {tag,archiveUrl:zip.browser_download_url,archiveName:zipName,
  archiveBytes:zip.size,checksumUrl:checksum.browser_download_url};
}
function assertDownloadUrl(url){
 const u=new URL(url);
 if(u.protocol!=="https:"||!ALLOWED_DOWNLOAD_HOSTS.has(u.hostname)||u.username||u.password)
  throw new Error("Update download redirected outside trusted GitHub hosts.");
 return u;
}
function responseFromGitHub(url,depth=0){
 return new Promise((resolve,reject)=>{
  if(depth>7){reject(new Error("Too many GitHub download redirects."));return}
  let address;
  try{address=assertDownloadUrl(url)}catch(e){reject(e);return}
  const request=https.get(address,{headers:{"User-Agent":"ShowPilot-Portable-Updater","Accept":"application/octet-stream"},timeout:30000},response=>{
   if([301,302,303,307,308].includes(response.statusCode)){
    const location=response.headers.location;
    response.resume();
    if(!location){reject(new Error("Missing GitHub asset redirect."));return}
    responseFromGitHub(new URL(location,address).href,depth+1).then(resolve,reject);return;
   }
   if(response.statusCode!==200){
    response.resume();
    reject(new Error("GitHub download returned HTTP "+response.statusCode+". Use the GitHub release link if your IT network blocks downloads."));return;
   }
   resolve(response);
  });
  request.on("error",reject);
  request.on("timeout",()=>request.destroy(new Error("GitHub download timed out.")));
 });
}
async function checksumFromRelease(url){
 const response=await responseFromGitHub(url);
 let contents="",size=0;
 for await(const chunk of response){
  size+=chunk.length;
  if(size>512){response.destroy();throw new Error("Release checksum file is unexpectedly large.");}
  contents+=chunk.toString("utf8");
 }
 const value=contents.trim();
 if(!/^[0-9a-fA-F]{64}$/.test(value))throw new Error("GitHub release checksum format is invalid.");
 return value.toLowerCase();
}
async function downloadVerified(url,filepath,expectedBytes,expectedHash,onProgress=()=>{}){
 if(!Number.isSafeInteger(expectedBytes)||expectedBytes<1||expectedBytes>MAX_PACKAGE_BYTES)
  throw new Error("Unacceptable update download size.");
 const response=await responseFromGitHub(url);
 const hash=crypto.createHash("sha256");
 let received=0,lastPct=-1;
 const observe=new Transform({
  transform(chunk,encoding,done){
   received+=chunk.length;
   if(received>MAX_PACKAGE_BYTES||received>expectedBytes){
    done(new Error("Update download exceeded its advertised size."));return;
   }
   hash.update(chunk);
   const pct=Math.floor(received/expectedBytes*100);
   if(pct!==lastPct){lastPct=pct;onProgress(Math.min(pct,100),received,expectedBytes);}
   done(null,chunk);
  }
 });
 try{
  await pipeline(response,observe,fs.createWriteStream(filepath,{flags:"wx",mode:0o600}));
  if(received!==expectedBytes||hash.digest("hex")!==expectedHash)
   throw new Error("Update checksum or size did not match the official release. Current ShowPilot was not changed.");
  return {bytes:received,verified:true};
 }catch(e){try{fs.unlinkSync(filepath)}catch{}throw e}
}
function withinDirectory(child,parent){
 const c=path.resolve(child).toLowerCase(),p=path.resolve(parent).toLowerCase();
 return c===p||c.startsWith(p+path.sep);
}
const RESULT_NAME="last-update-result.json";
function updateResultPath(userData){
 return path.join(userData,"ShowPilot Updates",RESULT_NAME);
}
function updateResult(userData,status,message,version=""){
 const file=updateResultPath(userData);
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const result={status,message:String(message).slice(0,900),version,updated:new Date().toISOString()};
 fs.writeFileSync(file,JSON.stringify(result),{mode:0o600});
 return result;
}
function readUpdateResult(userData,installedVersion=""){
 const file=updateResultPath(userData);
 try{
  const data=JSON.parse(fs.readFileSync(file,"utf8").replace(/^\uFEFF/,""));
  if(!["pending","success","failed"].includes(data.status))return null;
  if(typeof data.message!=="string"||typeof data.updated!=="string")return null;
  // A helper that reports "started" is not proof that Windows actually
  // launched the replacement. Do not display a false success if the same
  // old version remains installed after a restart.
  if(data.status==="success"&&installedVersion&&data.version&&
     semverCompare(data.version,installedVersion)!==0){
   return {...data,status:"failed",message:
    "The installer reported a restart, but ShowPilot is still version "+installedVersion+
    " (expected "+data.version+"). Check the installation log; the app was not confirmed updated."};
  }
  if(data.status==="pending"&&Date.now()-Date.parse(data.updated)>4*60*1000)
   return {...data,status:"failed",message:"The previous installer did not confirm completion. Check the installation log. Your saved data has not been deleted."};
  return {status:data.status,message:data.message.slice(0,900),version:data.version||"",updated:data.updated};
 }catch{return null}
}
function updateLogPath(userData){
 return path.join(userData,"ShowPilot Updates","last-update.log");
}

function prepareInstallPaths(version){
 if(process.platform!=="win32"||app.isPackaged!==true)
  throw new Error("One-click installation currently supports the packaged Windows portable application only.");
 const executable=fs.realpathSync.native(process.execPath);
 if(path.basename(executable).toLowerCase()!=="showpilot.exe")
  throw new Error("Only the official ShowPilot.exe portable application can replace itself.");
 const installDir=path.dirname(executable),parent=path.dirname(installDir);
 const stat=fs.lstatSync(installDir);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error("Updater cannot replace a symlinked application folder.");
 const userData=fs.realpathSync.native(app.getPath("userData"));
 if(withinDirectory(userData,installDir))
  throw new Error("Your ShowPilot work data is inside the application folder. Move or back up that data before updating manually.");
 const stageDir=fs.mkdtempSync(path.join(parent,".showpilot-next-"));
 const backupDir=path.join(parent,".showpilot-previous-"+version.replace(/[^a-z0-9.-]/gi,"_")+"-"+crypto.randomBytes(4).toString("hex"));
 const cacheDir=path.join(userData,"ShowPilot Updates");
 fs.mkdirSync(cacheDir,{recursive:true,mode:0o700});
 const zipFile=path.join(cacheDir,"download-"+crypto.randomBytes(8).toString("hex")+".zip");
 const scriptPath=path.join(cacheDir,"helper-"+crypto.randomBytes(8).toString("hex")+".ps1");
 const logPath=path.join(cacheDir,"last-update.log");
 return {installDir,stageDir,backupDir,zipFile,scriptPath,logPath,userData};
}
function helperArgs(mode,paths,extra=[]){
 return ["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass",
  "-File",paths.scriptPath,"-Mode",mode,"-InstallDir",paths.installDir,
  "-StageDir",paths.stageDir,"-LogPath",paths.logPath,...extra];
}
function stagePackage(paths){
 return new Promise((resolve,reject)=>{
  execFile("powershell.exe",helperArgs("Stage",paths,["-ArchivePath",paths.zipFile]),
   {cwd:paths.userData,windowsHide:true,timeout:240000,maxBuffer:12000},
   (error,stdout,stderr)=>{
    if(error)reject(new Error("Windows could not stage the update: "+(String(stderr||error.message)).slice(0,1200)));
    else resolve({staged:true});
   });
 });
}
function spawnInstall(paths,expectedVersion){
 return new Promise((resolve,reject)=>{
  const child=spawn("powershell.exe",helperArgs("Install",paths,[
   "-BackupDir",paths.backupDir,"-AppProcessId",String(process.pid),
   "-ExpectedVersion",expectedVersion]),
   {cwd:paths.userData,windowsHide:true,detached:true,stdio:"ignore",shell:false});
  child.once("error",reject);
  child.once("spawn",()=>{child.unref();resolve({started:true});});
 });
}
let updateRunning=false;
function notify(sender,progress){
 try{if(sender&&!sender.isDestroyed())sender.send("showpilot-update:progress",progress)}catch{}
}
async function installWindowsRelease(sender,release,installedVersion){
 if(updateRunning)throw new Error("An update is already downloading.");
 if(!release||!release.archiveUrl||!release.checksumUrl)
  throw new Error("No public, verified beta release is ready for automatic installation.");
 if(semverCompare(release.version,installedVersion)!==1)
  throw new Error("This version is not newer than the one installed.");
 updateRunning=true;
 let paths=null;
 try{
  const decision=await dialog.showMessageBox({
   type:"question",title:"Update ShowPilot portable?",
   message:"Download and install ShowPilot "+release.version+"?",
   detail:"Save any unsaved Event Schedule or floor-map work first. After verifying the download, ShowPilot will close, replace its program folder and restart. Your private SQLite notes and event files are kept separately. The previous app folder is retained for rollback. No administrator rights are required, but the application folder must be writable.",
   buttons:["Download and restart","Cancel"],defaultId:1,cancelId:1,noLink:true
  });
  if(decision.response!==0)return {cancelled:true};
  paths=prepareInstallPaths(installedVersion);
  const helper=fs.readFileSync(path.join(__dirname,"portable-update-helper.ps1"),"utf8");
  fs.writeFileSync(paths.scriptPath,helper,{mode:0o600,flag:"wx"});
  notify(sender,{phase:"verifying",message:"Checking official release checksum…",percent:0});
  const expectedHash=await checksumFromRelease(release.checksumUrl);
  notify(sender,{phase:"downloading",message:"Downloading the official Windows portable ZIP…",percent:0});
  await downloadVerified(release.archiveUrl,paths.zipFile,release.archiveBytes,expectedHash,pct=>
   notify(sender,{phase:"downloading",message:"Downloading ShowPilot update…",percent:pct}));
  notify(sender,{phase:"staging",message:"Download verified. Preparing the replacement app…",percent:100});
  await stagePackage(paths);
  try{fs.unlinkSync(paths.zipFile)}catch{}
  // Persist intent before exit: the next launch can show the helper's result,
  // even when the main Electron process is no longer available to report it.
  updateResult(paths.userData,"pending","Download verified; preparing to close ShowPilot and install "+release.version+".",release.version);
  notify(sender,{phase:"restarting",message:"Starting the update helper and restarting ShowPilot…",percent:100});
  await spawnInstall(paths,release.version);
  // The installer lives outside this application folder and waits for every
  // Electron process to exit. Keep the shutdown timers referenced: otherwise
  // a main-process event-loop change can drop the quit request while leaving
  // the detached installer waiting forever. Graceful quit comes first, with
  // a bounded forced exit if Windows still has our executable open.
  const forceQuit=setTimeout(()=>app.exit(0),10000);
  setTimeout(()=>app.quit(),350);
  return {started:true,version:release.version};
 }catch(e){
  if(paths){
   try{fs.unlinkSync(paths.zipFile)}catch{}
   try{fs.rmSync(paths.stageDir,{recursive:true,force:true})}catch{}
  }
  if(paths)try{updateResult(paths.userData,"failed",e instanceof Error?e.message:String(e),release.version)}catch{}
  notify(sender,{phase:"error",message:e instanceof Error?e.message:String(e),percent:0});
  throw e;
 }finally{updateRunning=false;}
}
module.exports={semverCompare,officialReleaseAssetUrl,releaseAssetsForRun,
 assertDownloadUrl,checksumFromRelease,downloadVerified,prepareInstallPaths,installWindowsRelease,
 readUpdateResult,updateResult,updateLogPath};
