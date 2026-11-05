"use strict";
// ShowPilot update channel discovery. GitHub Actions artifacts require a signed-in
// GitHub session; the application never stores a GitHub token or silently runs downloads.
const {ipcMain,shell,app}=require("electron");
const fs=require("node:fs");
const path=require("node:path");
const https=require("node:https");
// Both channels now live in the independent ShowPilot repository.
const SOURCES=[{repository:"nyteghost/showpilot",branches:{main:"main",beta:"beta"}}];
const MAX_JSON=1_500_000;
function updateArtifacts(platform=process.platform){
 if(platform==="win32")return ["showpilot-windows-portable"];
 if(platform==="linux")return ["showpilot-linux-appimage","showpilot-linux-portable"];
 return [];
}

function readJson(url,depth=0){
 return new Promise((resolve,reject)=>{
  if(depth>3)return reject(new Error("Too many GitHub redirects"));
  const u=new URL(url);
  if(u.protocol!=="https:"||u.hostname!=="api.github.com")return reject(new Error("Unexpected update endpoint"));
  const req=https.get(u,{headers:{"User-Agent":"ShowPilot-Updater","Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},timeout:12000},res=>{
   if([301,302,307,308].includes(res.statusCode)){
     const loc=res.headers.location;res.resume();if(!loc){reject(new Error("Invalid GitHub redirect"));return}
     readJson(new URL(loc,u).href,depth+1).then(resolve,reject);return;
   }
   if(res.statusCode===404){res.resume();resolve(null);return}
   const chunks=[];let n=0;
   res.on("data",c=>{n+=c.length;if(n>MAX_JSON)req.destroy(new Error("GitHub response too large"));else chunks.push(c)});
   res.on("end",()=>{
     if(res.statusCode<200||res.statusCode>=300)return reject(new Error("GitHub HTTP "+res.statusCode+"; check your internet connection or GitHub API access."));
     try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))}catch{reject(new Error("Invalid GitHub response"))}
   });
  });
  req.on("error",reject);
  req.on("timeout",()=>req.destroy(new Error("GitHub request timed out")));
 });
}
function stateFile(){return path.join(app.getPath("userData"),"showpilot-updates.json")}
function channel(){try{const v=JSON.parse(fs.readFileSync(stateFile(),"utf8")).channel;return v==="main"||v==="beta"?v:"beta"}catch{return "beta"}}
function setChannel(value){
 if(value!=="main"&&value!=="beta")throw new Error("Invalid channel");
 fs.mkdirSync(path.dirname(stateFile()),{recursive:true,mode:0o700});
 fs.writeFileSync(stateFile(),JSON.stringify({channel:value}),{mode:0o600});
 return value;
}
/** Only new, version-stamped runs have the build-number workflow title.
 * Older runs retain their commit-only label rather than inventing a version.
 */
async function versionOfRun(base,run,ch){
 const n=run.run_number;
 if(!Number.isSafeInteger(n)||n<1||run.display_title!== "ShowPilot "+ch+" build #"+n)return null;
 try{
  const obj=await readJson(base+"/contents/package.json?ref="+encodeURIComponent(run.head_sha));
  if(!obj||obj.encoding!=="base64"||typeof obj.content!=="string")return null;
  const pkg=JSON.parse(Buffer.from(obj.content.replace(/\s/g,""),"base64").toString("utf8"));
  const m=/^(\d+)\.(\d+)\.\d+(?:[-+].*)?$/.exec(pkg.version??"");
  return m ? m[1]+"."+m[2]+"."+n+(ch==="beta"?"-beta":"") : null;
 }catch{return null}
}
/** Match a downloadable artifact to a successfully completed platform job.
 * The workflow itself can remain in_progress while Linux packages are built;
 * that does not invalidate a finished Windows portable ZIP.
 */
function readyPlatformArtifact(run,jobs,artifacts,platform=process.platform){
 if(!run||!Number.isSafeInteger(run.run_number)||run.run_number<1)return null;
 if(!["in_progress","completed"].includes(run.status))return null;
 if(!Array.isArray(jobs)||!Array.isArray(artifacts))return null;
 const successful=name=>jobs.some(job=>job.name===name&&job.status==="completed"&&job.conclusion==="success");
 if(!successful("check"))return null;
 const jobNames={
  "showpilot-windows-portable":"windows-portable",
  "showpilot-linux-appimage":"linux-appimage",
  "showpilot-linux-portable":"linux-portable",
 };
 for(const name of updateArtifacts(platform)){
  if(!successful(jobNames[name]))continue;
  const file=artifacts.find(a=>a.name===name&&a.expired===false&&a.size_in_bytes>0);
  if(file)return file;
 }
 return null;
}
async function latest(ch){
 for(const source of SOURCES){
  const ref=source.branches[ch];if(!ref)continue;
  const base="https://api.github.com/repos/"+source.repository;
  const q=new URL(base+"/actions/workflows/showpilot.yml/runs");
  q.searchParams.set("branch",ref);
  // Do not require status=success: the Windows build may already be complete
  // while Linux packaging keeps the overall workflow 'in_progress'.
  // Newer runs can also cancel older workflows after their Windows job passes.
  q.searchParams.set("per_page","20");
  const response=await readJson(q.href);
  if(!response)continue;
  for(const run of (response.workflow_runs||[])){
   if(run.head_branch!==ref||!["completed","in_progress"].includes(run.status))continue;
   const arts=await readJson(base+"/actions/runs/"+run.id+"/artifacts");
   if(!(arts?.artifacts||[]).some(a=>updateArtifacts().includes(a.name)&&a.expired===false&&a.size_in_bytes>0))continue;
   const jobs=await readJson(base+"/actions/runs/"+run.id+"/jobs?per_page=100");
   const art=readyPlatformArtifact(run,jobs?.jobs,arts.artifacts);
   if(art)return {
    runId:run.id,buildNumber:run.run_number,sha:run.head_sha,channel:ch,
    created:run.created_at,url:run.html_url,repository:source.repository,
    artifact:art.name,platform:process.platform,
    version:await versionOfRun(base,run,ch),
    workflowComplete:run.status==="completed"&&run.conclusion==="success",
   };
  }
 }
 return null;
}
function setupUpdates(){
 ipcMain.handle("showpilot-update:status",()=>({channel:channel(),installedVersion:app.getVersion(),repository:"nyteghost/showpilot",platform:process.platform,artifactFormats:updateArtifacts()}));
 ipcMain.handle("showpilot-update:channel",(_,value)=>({channel:setChannel(value)}));
 ipcMain.handle("showpilot-update:check",async()=>{
   const ch=channel(),found=await latest(ch);
   const upToDate=!!found?.version&&found.version===app.getVersion();
   return {channel:ch,platform:process.platform,latest:found,upToDate,message:found
    ? upToDate?"You are running the latest "+ch+" build.":"Latest successful "+ch+" build found."
    : "No successful ShowPilot "+ch+" build for "+(process.platform==="linux"?"Linux":process.platform==="win32"?"Windows":"this platform")+" is available yet."};
 });
 ipcMain.handle("showpilot-update:open",async()=>{
   const found=await latest(channel());
   if(!found)throw new Error("No accessible build is available in this channel.");
   await shell.openExternal(found.url);
   return {opened:true,runId:found.runId,repository:found.repository};
 });
}
module.exports={setupUpdates,readyPlatformArtifact,updateArtifacts};
