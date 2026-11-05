"use strict";
/** Recoverable, offline Event Schedule workspace snapshots.
 * Kept in Electron userData, OUTSIDE the replaceable portable application.
 * User-uploaded workbooks are private to this PC; no network or GitHub upload.
 */
const {app,ipcMain}=require("electron");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const MAX_PROJECT_BYTES=16_000_000,MAX_WORKBOOK_BYTES=30*1024*1024;
const folder=()=>path.join(app.getPath("userData"),"Event Schedule");
const session=()=>path.join(folder(),"current-review.json");
const workbook=()=>path.join(folder(),"uploaded-template.xlsx");
function atomic(file,content){
 fs.mkdirSync(folder(),{recursive:true,mode:0o700});
 const tmp=path.join(folder(),".showpilot-session-"+crypto.randomBytes(8).toString("hex")+".tmp");
 try{
  fs.writeFileSync(tmp,content,{mode:0o600,flag:"wx"});
  fs.renameSync(tmp,file);
 }catch(error){try{fs.unlinkSync(tmp)}catch{}throw error;}
}
function validProject(p){
 if(!p||typeof p!=="object"||p.kind!=="showpilot-review-project"||p.version!==1||
    !Array.isArray(p.originalRows)||p.originalRows.length>100000||
    !p.draft||typeof p.draft!=="object"||!Array.isArray(p.approvedSpaces)||
    typeof p.includePending!=="boolean"||typeof p.templateSaved!=="boolean")
  throw Error("Invalid Event Schedule project snapshot.");
 if(p.originalRows.some(r=>!r||typeof r.date!=="string"||typeof r.description!=="string"||
     typeof r.space!=="string"))throw Error("Invalid original report in Event Schedule project.");
 if(p.scope!==undefined&&(!p.scope||!["month","week","day","all"].includes(p.scope.view)||
     typeof p.scope.value!=="string"||p.scope.value.length>20))
  throw Error("Invalid Event Schedule selected period.");
 return p;
}
function saveProject(project){
 validProject(project);
 const data=JSON.stringify({project,savedAt:new Date().toISOString()});
 if(Buffer.byteLength(data,"utf8")>MAX_PROJECT_BYTES)throw Error("Schedule exceeds 16 MB; export a review project to save it.");
 atomic(session(),Buffer.from(data,"utf8"));
 return {saved:true,savedAt:JSON.parse(data).savedAt};
}
function saveTemplate(bytes){
 if(!(bytes instanceof ArrayBuffer)&&!ArrayBuffer.isView(bytes))throw Error("Missing uploaded Excel template.");
 const value=Buffer.from(bytes instanceof ArrayBuffer?new Uint8Array(bytes):new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength));
 if(value.length<100||value.length>MAX_WORKBOOK_BYTES||value[0]!==0x50||value[1]!==0x4b)
  throw Error("Original engineering template must be an XLSX under 30 MB.");
 atomic(workbook(),value);
 return {saved:true,bytes:value.length};
}
function load(){
 if(!fs.existsSync(session()))return null;
 const file=fs.lstatSync(session());
 if(!file.isFile()||file.isSymbolicLink()||file.size>MAX_PROJECT_BYTES)throw Error("Saved schedule snapshot is not a regular JSON file.");
 const raw=JSON.parse(fs.readFileSync(session(),"utf8"));
 const project=validProject(raw.project);
 let templateBytes=null,templateMissing=false;
 if(project.templateSaved){
  try{
   const stat=fs.lstatSync(workbook());
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_WORKBOOK_BYTES)throw Error("Invalid saved template");
   const data=fs.readFileSync(workbook());
   templateBytes=new Uint8Array(data);
  }catch{templateMissing=true;}
 }
 return {project,savedAt:raw.savedAt,templateBytes,templateMissing};
}
function setupEventScheduleSessionIpc(){
 ipcMain.handle("showpilot-schedule-session:load",()=>load());
 ipcMain.handle("showpilot-schedule-session:save",(_,project)=>saveProject(project));
 ipcMain.handle("showpilot-schedule-session:save-template",(_,bytes)=>saveTemplate(bytes));
}
module.exports={setupEventScheduleSessionIpc,validProject,saveProject,saveTemplate,load};
