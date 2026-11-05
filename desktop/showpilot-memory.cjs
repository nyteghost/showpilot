"use strict";
/* ShowPilot Native Memory: private, offline SQLite. sql.js bundles SQLite as
 * WebAssembly, so Windows/Linux portable packages need no native addon/server.
 * Existing Markdown vaults are imported once and never modified/deleted.
 */
const {app,dialog,ipcMain,shell}=require("electron");
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const initSqlJs=require("sql.js/dist/sql-wasm-inline.js");

const CATEGORIES=["Stage Setups","Ballroom Configurations","Recurring Events","Engineering Procedures","Approved Tasks","Lessons Learned"];
const MAX_NOTE=24000, MAX_FILE=32*1024*1024, MAX_ENTRIES=25000, MAX_NOTES=10000, MAX_POSTCONS=5000, MAX_SHOW_CATALOG=5000;
const WEEK_MS=7*24*60*60*1000, BACKUP_CHECK_MS=6*60*60*1000, BACKUP_KEEP=12;
const BACKUP_NAME=/^ShowPilot-Memory-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z?-[a-f0-9]{8}\.json$/;
let backupTimer=null,backupError="";
let engine=null,SQL=null,initializePromise=null;
const dataDir=()=>app.getPath("userData");
const databaseFile=()=>path.join(dataDir(),"showpilot-memory.sqlite");
const legacyConfig=()=>path.join(dataDir(),"showpilot-memory-config.json");
const defaultBackupDir=()=>path.join(dataDir(),"ShowPilot Memory Backups");
const backupEnabled=()=>meta("weeklyBackupEnabled","true")==="true";
const backupPath=()=>meta("weeklyBackupFolder","")||defaultBackupDir();
const now=()=>new Date().toISOString();
const digest=s=>crypto.createHash("sha256").update(s).digest("hex");
const safe=(v,max=500)=>typeof v==="string"?v.trim().slice(0,max):"";
const count=(query,args=[])=>Number(queryRows(query,args)[0]?.n||0);
function queryRows(sql,args=[]){
 const stmt=engine.prepare(sql);try{stmt.bind(args);const out=[];while(stmt.step())out.push(stmt.getAsObject());return out;}finally{stmt.free();}
}
function sqlRun(sql,args=[]){engine.run(sql,args);}
function meta(key,fallback=""){
 const rows=queryRows("SELECT value FROM meta WHERE key=?",[key]);return rows.length?rows[0].value:fallback;
}
function metaSet(key,value){sqlRun("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)",[key,String(value)]);}
function persist(){
 const folder=dataDir();fs.mkdirSync(folder,{recursive:true,mode:0o700});
 const file=databaseFile(),temporary=file+"."+crypto.randomBytes(5).toString("hex")+".tmp";
 try{fs.writeFileSync(temporary,Buffer.from(engine.export()),{mode:0o600,flag:"wx"});fs.renameSync(temporary,file);}
 catch(e){try{fs.unlinkSync(temporary);}catch{}throw e;}
}
function transaction(fn){
 const original=engine.export();
 try{
  engine.run("BEGIN TRANSACTION");
  const result=fn();
  engine.run("COMMIT");
  persist();
  return result;
 }catch(e){
  try{engine.run("ROLLBACK");}catch{}
  engine.close();engine=new SQL.Database(original);
  throw e;
 }
}
function insertNote(note,ignoreDuplicate=true){
 const id=safe(note.id,160)||digest(note.category+"\n"+note.title+"\n"+note.content);
 if(ignoreDuplicate){
  const existing=queryRows("SELECT id FROM notes WHERE category=? AND title=? AND content=? LIMIT 1",
   [note.category,note.title,note.content])[0];
  if(existing)return existing.id;
 }
 const stamp=now();
 sqlRun("INSERT "+(ignoreDuplicate?"OR IGNORE ":"")+"INTO notes(id,category,title,content,created,modified,origin,archived) VALUES(?,?,?,?,?,?,?,?)",
  [id,note.category,note.title,note.content,safe(note.created,50)||stamp,safe(note.modified,50)||stamp,safe(note.origin,120)||"local",note.archived===1?1:0]);
 return id;
}
function validateNote(note){
 if(!note||typeof note!=="object"||!CATEGORIES.includes(note.category)||
 typeof note.title!=="string"||!note.title.trim()||note.title.length>140||
 typeof note.content!=="string"||!note.content.trim()||Buffer.byteLength(note.content,"utf8")>MAX_NOTE)
 throw Error("Invalid memory note; category, title and content (max 24 KB) are required.");
 return {id:safe(note.id,160),category:note.category,title:note.title.trim(),content:note.content,
 created:safe(note.created,50),modified:safe(note.modified,50),origin:safe(note.origin,120)};
}
function insertEntry(entry){
 if(!entry||typeof entry!=="object"||!["CGC-room-or-task","historical-shift","reviewed-event","reviewed-task"].includes(entry.kind))
 throw Error("Unknown historical memory entry kind.");
 const date=safe(entry.date,20),room=safe(entry.room,120),message=safe(entry.text,700);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!message)throw Error("Historical entry is missing a valid date or description.");
 if(entry.kind!=="historical-shift"&&/\b(?:cepac|cobb energy|performing arts)\b/i.test(room+" "+message))
  throw Error("Only CGC room and event history may be imported.");
 const source=safe(entry.original_source||entry.source,350);
 const id=safe(entry.id,160)||digest([entry.kind,date,room,message,source].join("|"));
 sqlRun("INSERT OR IGNORE INTO historical_entries(id,kind,date,room,area,description,source,week,approval) VALUES(?,?,?,?,?,?,?,?,?)",
 [id,entry.kind,date,room,safe(entry.area,70),message,source,safe(entry.week,20),safe(entry.approval,65)||"archived-unverified"]);
}
function legacyVault(){
 try{
  const raw=JSON.parse(fs.readFileSync(legacyConfig(),"utf8"));
  return typeof raw.vault==="string"?raw.vault:"";
 }catch{return "";}
}
function migrateLegacy(){
 if(meta("legacy_migrated")==="1")return;
 const roots=[legacyVault(),path.join(dataDir(),"ShowPilot Memory")].filter(Boolean);
 const found=[];
 for(const root of [...new Set(roots.map(v=>path.resolve(v)))]){
  if(!fs.existsSync(root))continue;
  try{if(!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())continue;}catch{continue;}
  for(const category of CATEGORIES){
   const dir=path.join(root,"ShowPilot",category);
   try{if(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink())continue;}catch{continue;}
   for(const filename of fs.readdirSync(dir)){
    if(!/^[a-z0-9][a-z0-9-]{0,115}\.md$/.test(filename))continue;
    const file=path.join(dir,filename);
    try{
     const stat=fs.lstatSync(file);
     if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>MAX_NOTE)continue;
     const content=fs.readFileSync(file,"utf8");
     const title=(/^# (.{1,140})$/m.exec(content)||[])[1]||filename.slice(0,-3);
     found.push(validateNote({id:digest("legacy:"+file),title,content,category,origin:"migrated-markdown",modified:stat.mtime.toISOString(),created:stat.birthtime.toISOString()}));
    }catch{}
   }
  }
 }
 const oldConfig=(()=>{try{return JSON.parse(fs.readFileSync(legacyConfig(),"utf8"))}catch{return {}}})();
 transaction(()=>{
  for(const note of found)insertNote(note);
  if(typeof oldConfig.rememberStages==="boolean")metaSet("rememberStages",String(oldConfig.rememberStages));
  if(typeof oldConfig.rememberTasks==="boolean")metaSet("rememberTasks",String(oldConfig.rememberTasks));
  metaSet("legacy_migrated","1");
  metaSet("legacy_migrated_count",String(found.length));
 });
}
async function ready(){
 if(!initializePromise)initializePromise=(async()=>{
  SQL=await initSqlJs();
  const file=databaseFile();
  if(fs.existsSync(file)){
   const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>100*1024*1024)throw Error("Invalid memory database path or size.");
   engine=new SQL.Database(fs.readFileSync(file));
  }else engine=new SQL.Database();
  engine.exec("PRAGMA foreign_keys=ON");
  engine.exec("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);"+
   "CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,category TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,created TEXT NOT NULL,modified TEXT NOT NULL,origin TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0);"+
   "CREATE INDEX IF NOT EXISTS notes_category ON notes(category,archived);"+
   "CREATE TABLE IF NOT EXISTS historical_entries(id TEXT PRIMARY KEY,kind TEXT NOT NULL,date TEXT NOT NULL,room TEXT NOT NULL,area TEXT NOT NULL,description TEXT NOT NULL,source TEXT NOT NULL,week TEXT NOT NULL,approval TEXT NOT NULL);"+
   "CREATE INDEX IF NOT EXISTS historical_date ON historical_entries(date,room);"+
   "CREATE TABLE IF NOT EXISTS postcon_reports(id TEXT PRIMARY KEY,event_id TEXT NOT NULL,show_name TEXT NOT NULL,show_date TEXT NOT NULL,rooms TEXT NOT NULL,rating INTEGER NOT NULL,went_well TEXT NOT NULL,issues TEXT NOT NULL,staffing TEXT NOT NULL,stage TEXT NOT NULL,floor TEXT NOT NULL,follow_up TEXT NOT NULL,created TEXT NOT NULL,modified TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0);"+
   "CREATE INDEX IF NOT EXISTS postcon_date ON postcon_reports(show_date,archived);"+
   "CREATE TABLE IF NOT EXISTS show_catalog(key TEXT PRIMARY KEY,event_id TEXT NOT NULL,show_name TEXT NOT NULL,start_date TEXT NOT NULL,show_date TEXT NOT NULL,rooms TEXT NOT NULL,modified TEXT NOT NULL);"+
   "CREATE INDEX IF NOT EXISTS show_catalog_dates ON show_catalog(start_date,show_date);");
  if(!fs.existsSync(file))persist();
  migrateLegacy();
  return true;
 })().catch(e=>{initializePromise=null;throw e;});
 return initializePromise;
}
async function status(){
 await ready();
 return {configured:true,available:true,storage:"sqlite",databasePath:databaseFile(),vault:"",
  rememberTasks:meta("rememberTasks","true")==="true",
  rememberStages:meta("rememberStages","true")==="true",
  rememberExports:meta("rememberExports","false")==="true",
  noteCount:count("SELECT COUNT(*) n FROM notes WHERE archived=0"),
  historicalCount:count("SELECT COUNT(*) n FROM historical_entries"),
  postConCount:count("SELECT COUNT(*) n FROM postcon_reports WHERE archived=0"),
   showCatalogCount:count("SELECT COUNT(*) n FROM show_catalog"),
  migratedCount:Number(meta("legacy_migrated_count","0")),
  archivedCount:count("SELECT COUNT(*) n FROM notes WHERE archived=1"),
  weeklyBackupEnabled:backupEnabled(),backupFolder:backupPath(),
  lastBackupAt:meta("lastWeeklyBackup",""),backupError};
}
async function preferences(next){
 await ready();
 if(!next||typeof next.rememberTasks!=="boolean"||typeof next.rememberStages!=="boolean"||typeof next.rememberExports!=="boolean")throw Error("Invalid memory switches");
 transaction(()=>{for(const k of ["rememberTasks","rememberStages","rememberExports"])metaSet(k,String(next[k]));});
 return status();
}
async function list(query=""){
 await ready();
 if(typeof query!=="string"||query.length>160)throw Error("Memory search is too long");
 const words=query.toLowerCase().split(/\s+/).filter(w=>w.length>1);
 const all=queryRows("SELECT id,category,title,content,modified FROM notes WHERE archived=0 ORDER BY modified DESC LIMIT 12000");
 return all.map(n=>({...n,score:words.reduce((sum,w)=>sum+(n.title.toLowerCase().includes(w)?6:0)+(n.content.toLowerCase().includes(w)?1:0),0)}))
 .filter(n=>!words.length||n.score>0).sort((a,b)=>b.score-a.score||b.modified.localeCompare(a.modified)).slice(0,100)
 .map(n=>({id:n.id,category:n.category,title:n.title,modified:n.modified,excerpt:n.content.replace(/[#*_\r\n]+/g," ").slice(0,240)}));
}
async function search(query){
 await ready();
 if(typeof query!=="string"||query.length>160)throw Error("Memory search is too long");
 const words=[...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g)||[])].filter(w=>!["the","and","for","with","room","stage","date","show","event","setup"].includes(w));
 if(!words.length)return [];
 const notes=queryRows("SELECT id,category,title,content FROM notes WHERE archived=0 LIMIT 12000").map(n=>({
   id:n.id,category:n.category,title:n.title,excerpt:n.content.slice(0,550),
   score:words.reduce((sum,w)=>sum+(n.title.toLowerCase().includes(w)?5:0)+(n.content.toLowerCase().includes(w)?1:0),0)
 })).filter(n=>n.score>0).sort((a,b)=>b.score-a.score);
 const postcons=queryRows("SELECT * FROM postcon_reports WHERE archived=0 ORDER BY show_date DESC LIMIT 3000").map(n=>({
  id:n.id,category:"Lessons Learned",title:"Post-Con: "+n.show_name+" ("+n.show_date+")",
  excerpt:["Post-con review: "+n.show_name+" "+n.show_date+" "+n.rooms,
   "Worked: "+n.went_well,"Issues: "+n.issues,"Staffing: "+n.staffing,
   "Stage: "+n.stage,"Floor: "+n.floor,"Follow-up: "+n.follow_up].join("; ").slice(0,650),
  score:words.reduce((sum,w)=>sum+(n.show_name.toLowerCase().includes(w)?6:0)+
   ([n.rooms,n.went_well,n.issues,n.staffing,n.stage,n.floor,n.follow_up].some(v=>v.toLowerCase().includes(w))?3:0),0)
 })).filter(n=>n.score>0).sort((a,b)=>b.score-a.score);
 const history=queryRows("SELECT id,kind,date,room,description,source,approval FROM historical_entries ORDER BY date DESC LIMIT 12000").map(n=>({
  id:n.id,category:"Recurring Events",title:n.date+" "+n.room,
  excerpt:"Archived historical example ("+n.approval+"): "+n.description+"; source "+n.source+". Verify current event and staffing.",
  score:words.reduce((sum,w)=>sum+(n.description.toLowerCase().includes(w)?3:0)+(n.room.toLowerCase().includes(w)?2:0),0)
 })).filter(n=>n.score>0).sort((a,b)=>b.score-a.score);
 const picks=[...(postcons.length?[postcons[0]]:[]),...notes.slice(0,2),
  ...(history.length?[history[0]]:[]),...postcons.slice(1,2),...history.slice(1,3)].slice(0,3);
 return picks.map(({score,...note})=>note);
}
async function read(id){
 await ready();const n=queryRows("SELECT content FROM notes WHERE id=? AND archived=0",[id])[0];
 if(!n)throw Error("Memory note not found");return {id,content:n.content};
}
async function save(input){
 await ready();const note=validateNote(input);
 const id=crypto.randomBytes(16).toString("hex");
 transaction(()=>insertNote({...note,id,origin:"local-approved"},false));
 return {id,title:note.title,category:note.category};
}
async function edit(id,content){
 await ready();if(typeof content!=="string"||!content.trim()||Buffer.byteLength(content,"utf8")>MAX_NOTE)throw Error("Memory note must be 1-24 KB");
 transaction(()=>{sqlRun("UPDATE notes SET content=?,modified=? WHERE id=? AND archived=0",[content,now(),id]);if(engine.getRowsModified()!==1)throw Error("Memory not found");});
 return read(id);
}
async function archive(id){
 await ready();
 transaction(()=>{sqlRun("UPDATE notes SET archived=1,modified=? WHERE id=? AND archived=0",[now(),id]);if(engine.getRowsModified()!==1)throw Error("Memory not found");});
 return {archived:true};
}
function validatePack(pack){
 if(!pack||pack.format!=="showpilot-memory"||pack.version!==1||!Array.isArray(pack.notes)||!Array.isArray(pack.historicalEntries))throw Error("Not a ShowPilot Memory JSON v1 file.");
 if(pack.notes.length>MAX_NOTES||pack.historicalEntries.length>MAX_ENTRIES)throw Error("Import exceeds the supported memory size");
 const archived=Array.isArray(pack.archivedNotes)?pack.archivedNotes:[];
 const postcons=Array.isArray(pack.postConReports)?pack.postConReports:[];
 if(postcons.length>MAX_POSTCONS)throw Error("Too many post-con reports in import");
 if(archived.length+pack.notes.length>MAX_NOTES)throw Error("Import exceeds maximum note count");
 return {notes:pack.notes.map(validateNote),archivedNotes:archived.map(n=>({...validateNote(n),archived:1})),
  entries:pack.historicalEntries,postcons:postcons.map(validatePostCon)};
}
async function importPack(pack){
 await ready();
 const validated=validatePack(pack),beforeNotes=count("SELECT COUNT(*) n FROM notes"),
  beforeEvents=count("SELECT COUNT(*) n FROM historical_entries"),beforePostcons=count("SELECT COUNT(*) n FROM postcon_reports");
 transaction(()=>{
  for(const note of validated.notes)insertNote({...note,origin:note.origin||"json-import"});
  for(const note of validated.archivedNotes)insertNote({...note,origin:note.origin||"json-import"});
  for(const entry of validated.entries)insertEntry(entry);
  for(const report of validated.postcons)insertPostCon(report,true);
 });
 const result={notesAdded:count("SELECT COUNT(*) n FROM notes")-beforeNotes,
  historyAdded:count("SELECT COUNT(*) n FROM historical_entries")-beforeEvents,
  notesSeen:validated.notes.length+validated.archivedNotes.length,historySeen:validated.entries.length,
  postConsAdded:count("SELECT COUNT(*) n FROM postcon_reports")-beforePostcons};
 if(backupEnabled()&&(result.notesAdded||result.historyAdded||result.postConsAdded)){
  try{await backupNow(true);}catch(e){backupError=(e instanceof Error?e.message:String(e)).slice(0,250);}
 }
 return result;
}
async function importJson(){
 await ready();
 const result=await dialog.showOpenDialog({title:"Import ShowPilot Memory JSON",properties:["openFile"],filters:[{name:"ShowPilot JSON memory",extensions:["json"]}]});
 if(result.canceled||!result.filePaths?.length)return {cancelled:true};
 const file=result.filePaths[0],st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_FILE)throw Error("Choose a normal ShowPilot JSON file under 32 MB.");
 return importPack(JSON.parse(fs.readFileSync(file,"utf8")));
}
async function exportPack(){
 await ready();
 return {format:"showpilot-memory",version:1,exportedAt:now(),
  source:"ShowPilot Native Memory",
  notes:queryRows("SELECT id,category,title,content,created,modified,origin FROM notes WHERE archived=0 ORDER BY created"),
  archivedNotes:queryRows("SELECT id,category,title,content,created,modified,origin FROM notes WHERE archived=1 ORDER BY created"),
  historicalEntries:queryRows("SELECT id,kind,date,room,area,description AS text,source AS original_source,week,approval FROM historical_entries ORDER BY date"),
  postConReports:queryRows("SELECT id,event_id AS eventId,show_name AS showName,show_date AS showDate,rooms,rating,went_well AS wentWell,issues,staffing,stage,floor,follow_up AS followUp,created,modified,archived FROM postcon_reports ORDER BY show_date")};
}
async function exportJson(){
 const out=await exportPack();
 const selection=await dialog.showSaveDialog({title:"Export ShowPilot Memory JSON",defaultPath:"ShowPilot-Memory-Backup.json",filters:[{name:"JSON",extensions:["json"]}]});
 if(selection.canceled||!selection.filePath)return {cancelled:true};
 const target=selection.filePath,temporary=target+".tmp";
 try{fs.writeFileSync(temporary,JSON.stringify(out,null,2),{mode:0o600});fs.renameSync(temporary,target);}
 catch(e){try{fs.unlinkSync(temporary)}catch{}throw e}
 return {saved:true,notes:out.notes.length,history:out.historicalEntries.length};
}

function safeBackupDirectory(){
 const selected=backupPath();
 if(typeof selected!=="string"||!path.isAbsolute(selected))throw Error("Backup folder must be an absolute local directory.");
 const root=path.resolve(selected);
 if(root===path.parse(root).root)throw Error("Choose a folder, not the drive root.");
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(root);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error("Backup folder must be a normal directory.");
 return root;
}
function availableBackups(folder){
 return fs.readdirSync(folder).filter(name=>BACKUP_NAME.test(name)).sort();
}
async function backupNow(force=false){
 await ready();
 if(!backupEnabled()&&!force)return {created:false,reason:"disabled"};
 if(count("SELECT COUNT(*) n FROM notes")+count("SELECT COUNT(*) n FROM historical_entries")+count("SELECT COUNT(*) n FROM postcon_reports")===0)return {created:false,reason:"empty"};
 const since=Date.parse(meta("lastWeeklyBackup",""));
 if(!force&&Number.isFinite(since)&&Date.now()-since<WEEK_MS)return {created:false,reason:"not-due"};
 const folder=safeBackupDirectory();
 const pack=await exportPack();
 const serialized=JSON.stringify(pack,null,2);
 if(Buffer.byteLength(serialized,"utf8")>MAX_FILE)throw Error("Memory JSON exceeds the supported backup size.");
 const date=now(),filename="ShowPilot-Memory-"+date.replace(/[:.]/g,"-")+"-"+crypto.randomBytes(4).toString("hex")+".json";
 const target=path.join(folder,filename),temp=target+"."+crypto.randomBytes(6).toString("hex")+".tmp";
 try{
  fs.writeFileSync(temp,serialized,{flag:"wx",mode:0o600,encoding:"utf8"});
  const bytes=fs.readFileSync(temp,"utf8");
  if(digest(bytes)!==digest(serialized)||JSON.parse(bytes).format!=="showpilot-memory")
   throw Error("Backup verification failed.");
  fs.renameSync(temp,target);
 }catch(e){try{fs.unlinkSync(temp)}catch{}throw e}
 backupError="";
 transaction(()=>metaSet("lastWeeklyBackup",date));
 // Only remove matching automatic snapshot names, and only after a verified new backup.
 const old=availableBackups(folder);
 for(const name of old.slice(0,Math.max(0,old.length-BACKUP_KEEP))){
  const file=path.join(folder,name);
  try{if(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink())fs.unlinkSync(file);}catch{}
 }
 return {created:true,path:target,lastBackupAt:date,notes:pack.notes.length,archived:pack.archivedNotes.length,history:pack.historicalEntries.length,postCons:pack.postConReports.length};
}
async function automaticBackupCheck(){
 try{const result=await backupNow(false);if(result.created)backupError="";return result;}
 catch(e){backupError=(e instanceof Error?e.message:String(e)).slice(0,250);return {created:false,reason:"error",error:backupError};}
}
async function setBackupEnabled(enabled){
 await ready();if(typeof enabled!=="boolean")throw Error("Invalid weekly backup setting");
 transaction(()=>metaSet("weeklyBackupEnabled",String(enabled)));
 if(enabled)await automaticBackupCheck();
 return status();
}
async function chooseBackupFolder(){
 await ready();
 const result=await dialog.showOpenDialog({title:"Choose an approved weekly memory backup folder (prefer a second drive)",properties:["openDirectory","createDirectory"]});
 if(result.canceled||!result.filePaths?.length)return status();
 const selected=result.filePaths[0];
 if(typeof selected!=="string"||!path.isAbsolute(selected))throw Error("Invalid backup folder");
 const root=path.resolve(selected);
 if(root===path.parse(root).root||!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())throw Error("Choose a normal backup folder, not the drive root.");
 transaction(()=>{metaSet("weeklyBackupFolder",root);metaSet("lastWeeklyBackup","");});
 if(backupEnabled())await automaticBackupCheck();
 return status();
}
async function openBackupFolder(){
 await ready();
 const folder=safeBackupDirectory();
 const error=await shell.openPath(folder);
 if(error)throw Error(error);
 return {opened:true};
}
function startWeeklyBackups(){
 if(backupTimer)return;
 // Backup on launch, and every six hours while ShowPilot remains open.
 // If it was closed on its due date, the next launch catches up.
 void automaticBackupCheck();
 backupTimer=setInterval(()=>{void automaticBackupCheck();},BACKUP_CHECK_MS);
 backupTimer.unref?.();
}


/** Persistent offline catalog. Stores actual CGC shows, not their functions.
 * Validated writes commit immediately to the existing SQLite database.
 */
const showDay=/^\d{4}-\d{2}-\d{2}$/;
const cgcRoom=/^(?:Hall [A-D]|BallRoom [A-G])$/i;
const otherVenue=/\b(?:cepac|cobb energy|performing arts)\b/i;
const functionTitle=/^(?:(?:client|exhibitor|vendor|decorator|sponsor|av|a\/v)\s+)?(?:move[ -]?in|move[ -]?out|load[ -]?in|load[ -]?out|program|general session|breakout session|tables?\s*(?:&|and)\s*chairs|decorator day)(?:$|\s*[-/:]\s*.*$)/i;
function validateShowCatalogItem(item){
 if(!item||typeof item!=="object")throw Error("Invalid show catalog item.");
 const eventId=safe(item.eventId,100),showName=safe(item.showName,140);
 const startDate=safe(item.startDate||item.showDate,10),showDate=safe(item.showDate,10);
 const key=safe(item.key,180)||(eventId?"id:"+eventId:"name:"+showName.toLowerCase());
 const rooms=safe(item.rooms,300).split(",").map(room=>room.trim()).filter(Boolean);
 if(!key||!showName||functionTitle.test(showName)||
    !showDay.test(startDate)||!showDay.test(showDate)||
    Number.isNaN(Date.parse(startDate+"T12:00:00Z"))||
    Number.isNaN(Date.parse(showDate+"T12:00:00Z"))||
    startDate>showDate||!rooms.length||rooms.some(r=>!cgcRoom.test(r))||
    otherVenue.test(showName+" "+rooms.join(" ")))
  throw Error("Only named CGC shows, valid dates and existing CGC rooms can be saved.");
 return {key,eventId,showName,startDate,showDate,rooms:[...new Set(rooms)].sort().join(", ")};
}
function readShowCatalogRows(){
 return queryRows("SELECT key,event_id AS eventId,show_name AS showName,start_date AS startDate,show_date AS showDate,rooms FROM show_catalog ORDER BY show_date DESC,show_name LIMIT 5000");
}
async function showCatalogList(){await ready();return readShowCatalogRows();}
function insertShowCatalog(item){
 const prior=queryRows("SELECT key,event_id AS eventId,show_name AS showName,start_date AS startDate,show_date AS showDate,rooms FROM show_catalog WHERE key=?",[item.key])[0];
 const startDate=prior&&prior.startDate<item.startDate?prior.startDate:item.startDate;
 const showDate=prior&&prior.showDate>item.showDate?prior.showDate:item.showDate;
 const names=[prior?.showName,item.showName].filter(Boolean);
 const showName=names.sort((a,b)=>b.length-a.length)[0]||item.showName;
 const rooms=[...new Set([prior?.rooms,item.rooms].filter(Boolean).join(", ").split(",").map(r=>r.trim()).filter(Boolean))].sort().join(", ");
 sqlRun("INSERT INTO show_catalog(key,event_id,show_name,start_date,show_date,rooms,modified) VALUES(?,?,?,?,?,?,?) "+
   "ON CONFLICT(key) DO UPDATE SET event_id=excluded.event_id,show_name=excluded.show_name,start_date=excluded.start_date,show_date=excluded.show_date,rooms=excluded.rooms,modified=excluded.modified",
   [item.key,item.eventId||prior?.eventId||"",showName,startDate,showDate,rooms,now()]);
}
async function showCatalogSave(items){
 await ready();
 if(!Array.isArray(items)||items.length>MAX_SHOW_CATALOG)throw Error("Invalid or oversized show catalog.");
 const valid=items.map(validateShowCatalogItem);
 const before=count("SELECT COUNT(*) n FROM show_catalog");
 transaction(()=>{
  for(const item of valid)insertShowCatalog(item);
  if(count("SELECT COUNT(*) n FROM show_catalog")>MAX_SHOW_CATALOG)
   throw Error("The local show catalog is full; no changes were saved.");
 });
 return {saved:true,added:count("SELECT COUNT(*) n FROM show_catalog")-before,total:count("SELECT COUNT(*) n FROM show_catalog")};
}

function validatePostCon(input){
 if(!input||typeof input!=="object")throw Error("Post-con report is missing.");
 const report={
  id:safe(input.id,160),eventId:safe(input.eventId,100),showName:safe(input.showName,140),
  showDate:safe(input.showDate,20),rooms:safe(input.rooms,300),
  rating:Number(input.rating)||0,
  wentWell:safe(input.wentWell,4000),issues:safe(input.issues,4000),
  staffing:safe(input.staffing,4000),stage:safe(input.stage,4000),
  floor:safe(input.floor,4000),followUp:safe(input.followUp,4000),
  created:safe(input.created,50),modified:safe(input.modified,50),
  archived:input.archived===1?1:0
 };
 if(!report.showName||!/^\d{4}-\d{2}-\d{2}$/.test(report.showDate)||
   !Number.isFinite(Date.parse(report.showDate+"T12:00:00Z"))||
   !Number.isInteger(report.rating)||report.rating<0||report.rating>5)
  throw Error("Post-con needs a show name, valid show date and rating 0–5.");
 if(report.showDate>new Date().toISOString().slice(0,10))throw Error("Post-con reports are for completed shows, not future events.");
 if(/\b(?:cepac|cobb energy|performing arts)\b/i.test(report.showName+" "+report.rooms))
  throw Error("Post-con records must be for Cobb Galleria Centre only.");
 if(![report.wentWell,report.issues,report.staffing,report.stage,report.floor,report.followUp].some(Boolean))
  throw Error("Enter at least one observation or follow-up before saving a Post-Con.");
 return report;
}
function insertPostCon(report,ignore=false){
 const id=report.id||digest("postcon|"+report.showDate+"|"+(report.eventId||report.showName.toLowerCase()));
 const t=now();
 const args=[id,report.eventId,report.showName,report.showDate,report.rooms,report.rating,
  report.wentWell,report.issues,report.staffing,report.stage,report.floor,report.followUp,
  report.created||t,report.modified||t,report.archived===1?1:0];
 sqlRun("INSERT "+(ignore?"OR IGNORE ":"")+"INTO postcon_reports(id,event_id,show_name,show_date,rooms,rating,went_well,issues,staffing,stage,floor,follow_up,created,modified,archived) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",args);
 return id;
}
async function postConList(){
 await ready();return queryRows("SELECT id,event_id AS eventId,show_name AS showName,show_date AS showDate,rooms,rating,went_well AS wentWell,issues,staffing,stage,floor,follow_up AS followUp,created,modified FROM postcon_reports WHERE archived=0 ORDER BY show_date DESC,modified DESC LIMIT 5000");
}
async function postConSave(input){
 await ready();const report=validatePostCon(input);
 const id=report.id||digest("postcon|"+report.showDate+"|"+(report.eventId||report.showName.toLowerCase()));
 const existing=queryRows("SELECT created FROM postcon_reports WHERE id=?",[id])[0];
 transaction(()=>{
  sqlRun("INSERT INTO postcon_reports(id,event_id,show_name,show_date,rooms,rating,went_well,issues,staffing,stage,floor,follow_up,created,modified,archived) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0) "+
   "ON CONFLICT(id) DO UPDATE SET event_id=excluded.event_id,show_name=excluded.show_name,show_date=excluded.show_date,rooms=excluded.rooms,rating=excluded.rating,went_well=excluded.went_well,issues=excluded.issues,staffing=excluded.staffing,stage=excluded.stage,floor=excluded.floor,follow_up=excluded.follow_up,modified=excluded.modified,archived=0",
   [id,report.eventId,report.showName,report.showDate,report.rooms,report.rating,
    report.wentWell,report.issues,report.staffing,report.stage,report.floor,report.followUp,existing?.created||now(),now()]);
 });
 return {id,saved:true};
}
async function postConArchive(id){
 await ready();if(typeof id!=="string"||!id||id.length>160)throw Error("Invalid Post-Con id");
 transaction(()=>{
  sqlRun("UPDATE postcon_reports SET archived=1,modified=? WHERE id=? AND archived=0",[now(),id]);
  if(engine.getRowsModified()!==1)throw Error("Post-Con report not found.");
 });
 return {archived:true};
}
async function rememberSchedule(payload){
 await ready();
 if(meta("rememberExports","false")!=="true")return {saved:false,reason:"disabled"};
 if(!payload||!Array.isArray(payload.entries)||payload.entries.length>8000)throw Error("Invalid reviewed schedule");
 const tasks=Array.isArray(payload.tasks)?payload.tasks.slice(0,1000):[];
 let added=0;
 transaction(()=>{
  for(const e of payload.entries){
   const date=safe(e.date,20),room=safe(e.space,120),name=safe(e.title,250);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!name||!room||/\b(?:cepac|cobb energy|performing arts)\b/i.test(room))continue;
   const text=name+" ["+safe(e.code,16)+"] "+safe(String(e.start??""),10)+"-"+safe(String(e.end??""),10);
   const before=engine.getRowsModified();
   insertEntry({kind:"reviewed-event",date,room,area:"CGC",text,source:"user-reviewed ShowPilot export",approval:"reviewed-export"});
   added+=engine.getRowsModified()>0?1:0;
  }
  for(const t of tasks){
   const date=safe(t.date,20),room=safe(t.section,120),text=safe(t.text,700);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!room||!text)continue;
   insertEntry({kind:"reviewed-task",date,room,area:"CGC",text,source:"user-reviewed ShowPilot export",approval:"reviewed-export"});
  }
 });
 return {saved:true,eventsAdded:added};
}
async function openFolder(){
 await ready();const message=await shell.openPath(dataDir());if(message)throw Error(message);return {opened:true};
}

/** Read-only support inspection. Never return stored text, employee names,
 * local paths, post-con entries, or other sensitive content to the report. */
async function diagnosticsSummary(){
 await ready();
 const integrity=queryRows("PRAGMA quick_check");
 const integrityOK=integrity.length===1&&integrity[0].quick_check==="ok";
 const expected=["meta","notes","historical_entries","postcon_reports"];
 const tablesOK=expected.every(name=>queryRows("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?",[name])[0]?.n===1);
 const exported=await exportPack();
 const roundtrip=JSON.parse(JSON.stringify(exported));
 const exportOK=roundtrip.format==="showpilot-memory"&&roundtrip.version===1&&
  roundtrip.notes.length===exported.notes.length&&
  roundtrip.archivedNotes.length===exported.archivedNotes.length&&
  roundtrip.historicalEntries.length===exported.historicalEntries.length&&
  roundtrip.postConReports.length===exported.postConReports.length;
 const folder=backupPath();
 let folderAccessible=false,snapshotCount=0,latestValid=false,latestDays=-1;
 try{
  const stat=fs.lstatSync(folder);
  if(stat.isDirectory()&&!stat.isSymbolicLink()){
   folderAccessible=true;
   const candidates=availableBackups(folder);
   snapshotCount=candidates.length;
   if(candidates.length){
    const last=candidates[candidates.length-1];
    const filename=path.join(folder,last);
    const file=fs.lstatSync(filename);
    if(file.isFile()&&!file.isSymbolicLink()&&file.size>0&&file.size<=MAX_FILE){
     const backup=JSON.parse(fs.readFileSync(filename,"utf8"));
     latestValid=backup?.format==="showpilot-memory"&&backup.version===1&&
      Array.isArray(backup.notes)&&Array.isArray(backup.archivedNotes)&&
      Array.isArray(backup.historicalEntries)&&Array.isArray(backup.postConReports);
     if(latestValid)latestDays=Math.max(0,Math.floor((Date.now()-file.mtimeMs)/(24*60*60*1000)));
    }
   }
  }
 }catch{/* Backups are optional and must not stop read-only diagnostics. */}
 return {
  sqliteIntegrityOK:integrityOK,schemaOK:tablesOK,exportRoundtripOK:exportOK,
  activeNoteCount:exported.notes.length,archivedNoteCount:exported.archivedNotes.length,
  historicalCount:exported.historicalEntries.length,postConCount:exported.postConReports.length,
  weeklyBackupEnabled:backupEnabled(),backupFolderAccessible:folderAccessible,
  backupCount:snapshotCount,latestBackupValid:latestValid,latestBackupAgeDays:latestDays,
  // Settings paths, actual memory records and backup bytes are never returned.
 };
}

function setupMemoryIpc(){
 const wrap=(name,fn)=>ipcMain.handle("showpilot-memory:"+name,(_,...args)=>fn(...args));
 wrap("status",status);wrap("create-default",status);wrap("preferences",preferences);
 wrap("list",list);wrap("search",search);wrap("read",read);wrap("save",save);wrap("edit",edit);wrap("archive",archive);
 wrap("import-json",importJson);wrap("export-json",exportJson);wrap("remember-schedule",rememberSchedule);
 wrap("backup-now",()=>backupNow(true));wrap("backup-enable",setBackupEnabled);
 wrap("backup-choose-folder",chooseBackupFolder);wrap("backup-open-folder",openBackupFolder);
 wrap("postcon-list",postConList);wrap("postcon-save",postConSave);wrap("postcon-archive",postConArchive);
 wrap("open-folder",openFolder);
 startWeeklyBackups();
}
module.exports={setupMemoryIpc,status,preferences,list,search,read,save,edit,archive,importPack,exportPack,rememberSchedule,openFolder,ready,backupNow,automaticBackupCheck,setBackupEnabled,chooseBackupFolder,postConList,postConSave,postConArchive,diagnosticsSummary};
