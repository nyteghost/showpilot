"use strict";
// Phase 1: local-only preferences and approved Excel reference preservation.
// No model execution or network calls happen in this module.
const {app,dialog,ipcMain}=require("electron");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
function home(){return path.join(app.getPath("userData"),"local-intelligence");}
function settingsFile(){return path.join(home(),"settings.json");}
function defaults(){return {enabled:false,backend:"auto",background:false};}
function read(){
 try{const d=JSON.parse(fs.readFileSync(settingsFile(),"utf8"));return {enabled:d.enabled===true,backend:["auto","cuda","cpu"].includes(d.backend)?d.backend:"auto",background:d.background===true};}
 catch{return defaults();}
}
function write(next){
 fs.mkdirSync(home(),{recursive:true});
 const temp=settingsFile()+".tmp";fs.writeFileSync(temp,JSON.stringify(next,null,2),{mode:0o600});
 fs.renameSync(temp,settingsFile());return next;
}
function masterPath(){return path.join(home(),"approved-schedule-template.xlsx");}
function status(){
 const pref=read();const target=masterPath();const exists=fs.existsSync(target);
 const modelPath=path.join(home(),"models");
 return {...pref,engine:"not-installed",engineReady:false,modelDirectory:modelPath,
  message:"Local llama.cpp engine is not bundled yet. Existing WebGPU AI remains available separately.",
  template:exists?{stored:true,bytes:fs.statSync(target).size,sha256:crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex")}: {stored:false}};
}
function update(next){
 if(!next||typeof next!=="object"||typeof next.enabled!=="boolean"||typeof next.background!=="boolean"||!["auto","cuda","cpu"].includes(next.backend))throw Error("Invalid intelligence settings");
 write({enabled:next.enabled,backend:next.backend,background:next.background});return status();
}
async function chooseTemplate(){
 const result=await dialog.showOpenDialog({title:"Choose approved engineering Excel template",properties:["openFile"],filters:[{name:"Excel workbook",extensions:["xlsx"]}]});
 if(result.canceled||!result.filePaths?.length)return status();
 const src=result.filePaths[0],st=fs.statSync(src);
 if(!st.isFile()||st.size<100||st.size>30*1024*1024)throw Error("Choose an XLSX workbook under 30 MB.");
 const bytes=fs.readFileSync(src);
 if(bytes[0]!==0x50||bytes[1]!==0x4b)throw Error("File does not appear to be an XLSX workbook.");
 fs.mkdirSync(home(),{recursive:true});
 const target=masterPath(),temp=target+".tmp";
 fs.writeFileSync(temp,bytes,{mode:0o600});fs.renameSync(temp,target);
 return status();
}
function readTemplate(){
 const target=masterPath();
 if(!fs.existsSync(target))return null;
 const stat=fs.statSync(target);
 if(!stat.isFile()||stat.size>30*1024*1024)throw new Error("Saved template is unavailable or too large.");
 return fs.readFileSync(target);
}
function setupLocalIntelligenceIpc(){
 ipcMain.handle("showpilot-local:status",()=>status());
 ipcMain.handle("showpilot-local:configure",(_,next)=>update(next));
 ipcMain.handle("showpilot-local:template",()=>chooseTemplate());
 ipcMain.handle("showpilot-local:read-template",()=>readTemplate());
}
module.exports={setupLocalIntelligenceIpc};
