"use strict";
/** Offline CGC operations checklists, isolated from replaceable app folders.
 * Per-day, per-event checkoff records. Originals and backup stay in userData.
 * No remote sync, admin rights, or background AI service required. */
const {app,ipcMain}=require("electron");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const LIMIT=2*1024*1024;
const dir=()=>path.join(app.getPath("userData"),"Today Checklists");
const file=()=>path.join(dir(),"checklists.json");
const iso=/^\d{4}-\d{2}-\d{2}$/;
function checkDate(day){
 if(typeof day!=="string"||!iso.test(day)||Number.isNaN(Date.parse(day+"T12:00:00Z")))
  throw Error("Invalid Today checklist date.");
 return day;
}
function checkScope(scope){
 if(typeof scope!=="string"||scope.length>180||
    !(scope==="building"||/^(?:id|name|schedule):[^\x00-\x1f]{1,160}$/.test(scope)))
  throw Error("Invalid checklist event.");
 return scope;
}
function checkTaskId(id){
 if(typeof id!=="string"||id.length>130||!/^[a-z0-9._:-]{1,130}$/i.test(id))
  throw Error("Invalid checklist task.");
 return id;
}
function validate(doc){
 if(!doc||doc.version!==1||typeof doc.days!=="object"||Array.isArray(doc.days)||!doc.days)
  throw Error("Invalid saved Today checklist file.");
 if(Object.keys(doc.days).length>1500)throw Error("Too many saved checklist dates.");
 for(const [day,value] of Object.entries(doc.days)){
  checkDate(day);
  if(!value||typeof value!=="object"||!value.done||typeof value.done!=="object"||
    !Array.isArray(value.custom))throw Error("Invalid saved checklist day.");
  if(Object.keys(value.done).length>1000||value.custom.length>500)throw Error("Saved checklist day is too large.");
  for(const [key,timestamp] of Object.entries(value.done)){
   if(key.length>350||typeof timestamp!=="string"||Number.isNaN(Date.parse(timestamp)))
    throw Error("Invalid saved completion record.");
  }
  for(const task of value.custom){
   if(!task||typeof task!=="object"||typeof task.text!=="string"||
     task.text.length<1||task.text.length>160||typeof task.createdAt!=="string"||
     Number.isNaN(Date.parse(task.createdAt)))throw Error("Invalid saved custom task.");
   checkScope(task.scope);checkTaskId(task.id);
  }
 }
 return doc;
}
function readDoc(){
 const f=file();
 if(!fs.existsSync(f))return {version:1,days:{}};
 const stat=fs.lstatSync(f);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>LIMIT)
  throw Error("Saved Today checklist is not a regular, appropriately sized JSON file.");
 return validate(JSON.parse(fs.readFileSync(f,"utf8").replace(/^\uFEFF/,"")));
}
function writeDoc(doc){
 validate(doc);
 const data=Buffer.from(JSON.stringify(doc),"utf8");
 if(data.length>LIMIT)throw Error("Today checklist storage is full; no existing data was changed.");
 fs.mkdirSync(dir(),{recursive:true,mode:0o700});
 const temporary=path.join(dir(),".checklist-"+crypto.randomBytes(8).toString("hex")+".tmp");
 try{
  fs.writeFileSync(temporary,data,{flag:"wx",mode:0o600});
  if(fs.existsSync(file()))fs.copyFileSync(file(),file()+".bak");
  fs.renameSync(temporary,file());
 }catch(e){try{fs.unlinkSync(temporary)}catch{}throw e;}
}
function forDate(doc,date){
 return doc.days[date]??{done:{},custom:[]};
}
function load(date){
 checkDate(date);
 const state=forDate(readDoc(),date);
 return {date,done:state.done,custom:state.custom};
}
function change(date,scope,id,done){
 checkDate(date);checkScope(scope);checkTaskId(id);
 if(typeof done!=="boolean")throw Error("Invalid checklist checkbox state.");
 const doc=readDoc();
 const state=forDate(doc,date);
 const key=scope+"::"+id;
 if(done)state.done[key]=new Date().toISOString();
 else delete state.done[key];
 doc.days[date]=state;
 writeDoc(doc);
 return {date,done:state.done,custom:state.custom};
}
function add(date,scope,text){
 checkDate(date);checkScope(scope);
 if(typeof text!=="string"||!text.trim()||text.trim().length>160)
  throw Error("Checklist task must be between 1 and 160 characters.");
 const doc=readDoc();
 const state=forDate(doc,date);
 if(state.custom.length>=500)throw Error("Too many manual tasks for this date.");
 state.custom.push({id:"custom:"+crypto.randomBytes(12).toString("hex"),
  scope,text:text.trim(),createdAt:new Date().toISOString()});
 doc.days[date]=state;
 writeDoc(doc);
 return {date,done:state.done,custom:state.custom};
}
function remove(date,scope,id){
 checkDate(date);checkScope(scope);checkTaskId(id);
 if(!id.startsWith("custom:"))throw Error("Only manually added tasks can be deleted.");
 const doc=readDoc(),state=forDate(doc,date);
 const before=state.custom.length;
 state.custom=state.custom.filter(t=>!(t.id===id&&t.scope===scope));
 if(before===state.custom.length)throw Error("Custom checklist task not found.");
 delete state.done[scope+"::"+id];
 doc.days[date]=state;
 writeDoc(doc);
 return {date,done:state.done,custom:state.custom};
}
function setupTodayChecklistIpc(){
 ipcMain.handle("showpilot-today-checklist:load",(_,day)=>load(day));
 ipcMain.handle("showpilot-today-checklist:change",(_,day,scope,id,done)=>change(day,scope,id,done));
 ipcMain.handle("showpilot-today-checklist:add",(_,day,scope,text)=>add(day,scope,text));
 ipcMain.handle("showpilot-today-checklist:remove",(_,day,scope,id)=>remove(day,scope,id));
}
module.exports={setupTodayChecklistIpc,load,change,add,remove,checkDate,checkScope,validate};
