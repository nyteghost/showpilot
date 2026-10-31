"use strict";
/* Local, Obsidian-compatible memory vault. No Obsidian process or service is
 * required. Electron main is the only process with filesystem access.
 * Only the dedicated ShowPilot folder inside a user-chosen vault is touched.
 */
const {app,dialog,ipcMain,shell}=require("electron");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");

const CATEGORIES=["Stage Setups","Ballroom Configurations","Recurring Events","Engineering Procedures","Approved Tasks","Lessons Learned"];
const MAX_NOTE=24_000;
const MAX_LIST=600;
const MAX_QUERY=160;
function configPath(){return path.join(app.getPath("userData"),"showpilot-memory-config.json")}
function defaults(){return {vault:"",rememberTasks:true,rememberStages:true}}
function settings(){
  try{
    const raw=JSON.parse(fs.readFileSync(configPath(),"utf8"));
    return {vault:typeof raw.vault==="string"?raw.vault:"",
      rememberTasks:raw.rememberTasks!==false,rememberStages:raw.rememberStages!==false};
  }catch{return defaults()}
}
function writeSettings(next){
  fs.mkdirSync(path.dirname(configPath()),{recursive:true,mode:0o700});
  const file=configPath()+".tmp";
  fs.writeFileSync(file,JSON.stringify(next,null,2),{mode:0o600,encoding:"utf8"});
  fs.renameSync(file,configPath());
}
function rootPath(){
  const vault=settings().vault;
  if(!vault)return null;
  const abs=path.resolve(vault);
  if(!path.isAbsolute(vault)||abs===path.parse(abs).root||abs===path.resolve(app.getPath("userData"))){
    throw new Error("Choose a specific, writable notebook folder.");
  }
  const st=fs.lstatSync(abs);
  if(!st.isDirectory()||st.isSymbolicLink())throw new Error("Notebook folder is not a normal directory.");
  return abs;
}
function folder(root){
  const dir=path.join(root,"ShowPilot");
  if(fs.existsSync(dir)){
    const st=fs.lstatSync(dir);
    if(!st.isDirectory()||st.isSymbolicLink())throw new Error("ShowPilot notes folder cannot be a symbolic link.");
  }else fs.mkdirSync(dir,{mode:0o700});
  return dir;
}
function categoryDir(root,cat,create){
  if(!CATEGORIES.includes(cat))throw new Error("Unknown memory category.");
  const dir=path.join(folder(root),cat);
  if(fs.existsSync(dir)){
    const st=fs.lstatSync(dir);
    if(!st.isDirectory()||st.isSymbolicLink())throw new Error("Memory category cannot be a symbolic link.");
  }else if(create)fs.mkdirSync(dir,{mode:0o700});
  return dir;
}
function validId(id){
  if(typeof id!=="string"||id.length>180)throw new Error("Invalid memory note ID.");
  const p=id.split("/");
  if(p.length!==2||!CATEGORIES.includes(p[0])||!/^[a-z0-9][a-z0-9-]{0,115}\.md$/.test(p[1]))throw new Error("Invalid memory note ID.");
  return p;
}
function notePath(root,id){
  const [cat,name]=validId(id);
  const dir=categoryDir(root,cat,false);
  const file=path.join(dir,name);
  if(fs.existsSync(file)){
    const st=fs.lstatSync(file);
    if(st.isSymbolicLink()||!st.isFile())throw new Error("Memory notes must be regular files.");
  }
  return file;
}
function status(){
  const s=settings();
  try{
    const root=rootPath();
    return {configured:!!root,available:true,vault:root??"",rememberTasks:s.rememberTasks,rememberStages:s.rememberStages};
  }catch(e){
    return {configured:false,available:true,vault:s.vault,rememberTasks:s.rememberTasks,rememberStages:s.rememberStages,error:e.message};
  }
}
function connectDefault(){
  const dest=path.join(app.getPath("userData"),"ShowPilot Memory");
  fs.mkdirSync(dest,{recursive:true,mode:0o700});
  folder(dest);
  writeSettings({...settings(),vault:dest});
  return status();
}
async function choose(){
  const selection=await dialog.showOpenDialog({title:"Select an Obsidian vault or notebook folder",properties:["openDirectory","createDirectory"]});
  if(selection.canceled||!selection.filePaths?.length)return status();
  const dest=selection.filePaths[0];
  const st=fs.lstatSync(dest);
  if(!st.isDirectory()||st.isSymbolicLink())throw new Error("Choose a real, writable folder.");
  const root=path.resolve(dest);
  if(root===path.parse(root).root)throw new Error("Choose a folder rather than the entire drive.");
  folder(root);
  writeSettings({...settings(),vault:root});
  return status();
}
function preferences(next){
  if(!next||typeof next!=="object"||typeof next.rememberTasks!=="boolean"||typeof next.rememberStages!=="boolean")throw new Error("Invalid memory preferences.");
  const s=settings();writeSettings({...s,rememberTasks:next.rememberTasks,rememberStages:next.rememberStages});
  return status();
}
function noteTitle(markdown,filename){
  const found=/^# (.{1,200})$/m.exec(markdown);
  return found?found[1].trim():filename.replace(/\.md$/,"").replaceAll("-"," ");
}
function scan(){
  const root=rootPath();
  if(!root)return [];
  const found=[];
  for(const cat of CATEGORIES){
    const dir=categoryDir(root,cat,false);
    if(!fs.existsSync(dir))continue;
    for(const name of fs.readdirSync(dir)){
      if(found.length>=MAX_LIST)break;
      if(!/^[a-z0-9][a-z0-9-]{0,115}\.md$/.test(name))continue;
      const id=cat+"/"+name;
      const file=notePath(root,id);
      try{
        const st=fs.lstatSync(file);
        if(st.size>MAX_NOTE||st.size<1)continue;
        const content=fs.readFileSync(file,"utf8");
        found.push({id,category:cat,title:noteTitle(content,name),content,
          modified:st.mtime.toISOString()});
      }catch{/* skip unreadable or malformed files without crashing */}
    }
  }
  return found;
}
function list(query=""){
  if(typeof query!=="string"||query.length>MAX_QUERY)throw new Error("Memory search is too long.");
  const words=query.toLowerCase().trim().split(/\s+/).filter(x=>x.length>1);
  return scan().map(n=>{
    const title=n.title.toLowerCase(),text=n.content.toLowerCase();
    const score=words.reduce((total,w)=>total+(title.includes(w)?5:0)+(text.includes(w)?1:0),0);
    return {...n,score};
  }).filter(n=>!words.length||n.score>0).sort((a,b)=>b.score-a.score||b.modified.localeCompare(a.modified)).slice(0,100)
    .map(({content,score,...n})=>({...n,excerpt:content.replace(/^---[\s\S]*?---\s*/,"").replace(/^# .*\n?/,"").replace(/[#*_\r\n]+/g," ").slice(0,240)}));
}
function search(query){
  if(typeof query!=="string"||query.length>MAX_QUERY)throw new Error("Memory search is too long.");
  const words=[...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g)||[])].filter(w=>!["the","and","for","with","room","stage","date","show","event","setup"].includes(w));
  if(!words.length)return [];
  return scan().map(n=>{
    const t=n.title.toLowerCase(),c=n.content.toLowerCase();
    const score=words.reduce((a,w)=>a+(t.includes(w)?5:0)+(c.includes(w)?1:0),0);
    return {...n,score};
  }).filter(n=>n.score>0).sort((a,b)=>b.score-a.score).slice(0,3)
    .map(n=>({id:n.id,title:n.title,category:n.category,excerpt:n.content.replace(/^---[\s\S]*?---\s*/,"").slice(0,550)}));
}
function read(id){
  const root=rootPath();if(!root)throw new Error("Choose a memory notebook first.");
  const file=notePath(root,id);
  const st=fs.statSync(file);
  if(st.size>MAX_NOTE)throw new Error("Memory note is too large to edit here.");
  return {id,content:fs.readFileSync(file,"utf8")};
}
function slug(s){
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,55)||"memory";
}
function save(data){
  if(!data||typeof data!=="object"||!CATEGORIES.includes(data.category)||
    typeof data.title!=="string"||!data.title.trim()||data.title.length>140||
    typeof data.content!=="string"||!data.content.trim()||data.content.length>MAX_NOTE)
    throw new Error("Enter a short title and a note under 24 KB.");
  const root=rootPath();if(!root)throw new Error("Choose a memory notebook first.");
  const dir=categoryDir(root,data.category,true);
  const unique=crypto.randomBytes(7).toString("hex");
  const name=slug(data.title)+"-"+unique+".md";
  const id=data.category+"/"+name;
  const timestamp=new Date().toISOString();
  // Header content is plain Markdown. No AI instruction has special privileges.
  const content="# "+data.title.trim().replace(/[\r\n]+/g," ")+"\n\n"+
    "_Saved by ShowPilot: "+timestamp+". Review against current show requirements._\n\n"+data.content.trim()+"\n";
  fs.writeFileSync(path.join(dir,name),content,{encoding:"utf8",flag:"wx",mode:0o600});
  return {id,title:data.title.trim(),category:data.category};
}
function edit(id,content){
  if(typeof content!=="string"||!content.trim()||content.length>MAX_NOTE)throw new Error("Memory note must be 1–24 KB.");
  const root=rootPath();if(!root)throw new Error("Choose a memory notebook first.");
  const file=notePath(root,id);
  if(!fs.existsSync(file))throw new Error("Memory note no longer exists.");
  const tmp=file+"."+crypto.randomBytes(6).toString("hex")+".tmp";
  fs.writeFileSync(tmp,content,{mode:0o600,encoding:"utf8",flag:"wx"});
  fs.renameSync(tmp,file);
  return read(id);
}
function archive(id){
  const root=rootPath();if(!root)throw new Error("Choose a memory notebook first.");
  const file=notePath(root,id);
  if(!fs.existsSync(file))throw new Error("Memory note no longer exists.");
  const trash=path.join(folder(root),"Trash");
  if(fs.existsSync(trash)){
    const st=fs.lstatSync(trash);
    if(!st.isDirectory()||st.isSymbolicLink())throw new Error("Trash cannot be a symbolic link.");
  }else fs.mkdirSync(trash,{mode:0o700});
  const name=path.basename(file,".md")+"-"+crypto.randomBytes(6).toString("hex")+".md";
  fs.renameSync(file,path.join(trash,name));
  return {archived:true};
}
async function openFolder(){
  const root=rootPath();if(!root)throw new Error("Choose a notebook first.");
  const message=await shell.openPath(root);
  if(message)throw new Error(message);
  return {opened:true};
}
function setupMemoryIpc(){
  ipcMain.handle("showpilot-memory:status",()=>status());
  ipcMain.handle("showpilot-memory:create-default",()=>connectDefault());
  ipcMain.handle("showpilot-memory:choose",()=>choose());
  ipcMain.handle("showpilot-memory:preferences",(_,v)=>preferences(v));
  ipcMain.handle("showpilot-memory:list",(_,q)=>list(q));
  ipcMain.handle("showpilot-memory:search",(_,q)=>search(q));
  ipcMain.handle("showpilot-memory:read",(_,id)=>read(id));
  ipcMain.handle("showpilot-memory:save",(_,v)=>save(v));
  ipcMain.handle("showpilot-memory:edit",(_,id,markdown)=>edit(id,markdown));
  ipcMain.handle("showpilot-memory:archive",(_,id)=>archive(id));
  ipcMain.handle("showpilot-memory:open-folder",()=>openFolder());
}
module.exports={setupMemoryIpc,status,connectDefault,choose,preferences,list,search,read,save,edit,archive};
