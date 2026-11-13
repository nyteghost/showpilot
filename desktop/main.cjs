const {app,BrowserWindow,shell,dialog} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { setupAiIpc } = require("./ai-vault.cjs");
const { setupGoogleCalendarIpc } = require("./google-calendar.cjs");
const { setupUpdates } = require("./app-updates.cjs");
const { setupMemoryIpc } = require("./showpilot-memory.cjs");
const {setupLocalIntelligenceIpc}=require("./local-intelligence.cjs");
const {setupDiagnosticsIpc}=require("./showpilot-diagnostics.cjs");
const {setupEventScheduleSessionIpc}=require("./event-schedule-session.cjs");
const {writeRendererIncident}=require("./renderer-recovery.cjs");
// The experimental branch must not open or overwrite beta/main appdata.
// A portable ZIP alone does not isolate Electron's per-user SQLite state.
if(/-claude(?:\+.*)?$/.test(app.getVersion())){
 const parent=path.dirname(app.getPath("userData"));
 const isolated=path.join(parent,"ShowPilot-Claude-Test");
 fs.mkdirSync(isolated,{recursive:true});
 app.setPath("userData",isolated);
}
const {setupTodayChecklistIpc}=require("./today-checklist.cjs");
let win;
function openApp(){
 win=new BrowserWindow({
  title:"ShowPilot - Cobb Convention Center-Atlanta",
  width:1360,height:860,minWidth:820,minHeight:580,
  backgroundColor:"#142338",
  icon:path.join(__dirname,"showpilot.png"),
  show:false,
  webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,preload:path.join(__dirname,"preload.cjs")}
 });
 win.once("ready-to-show",()=>win.show());
 // Native recovery remains available if Chromium crashes while importing a
 // Google OAuth JSON file (React cannot display an error after renderer loss).
 // Keep original app data and encrypted Google authorization untouched.
 let recovering=false;
 const recoveryDialog=async(kind,details)=>{
  writeRendererIncident(app.getPath("userData"),kind,details);
  if(recovering||!win||win.isDestroyed())return;
  recovering=true;
  try{
   const answer=await dialog.showMessageBox(win,{
    type:"error",title:"ShowPilot display problem",
    message:"The ShowPilot interface stopped responding.",
    detail:"Your saved schedules and Google settings have not been reset. You can reopen the interface without deleting application data. If it happens again, use View → Toggle Developer Tools and send the red Console error (remove any personal data).",
    buttons:["Reload ShowPilot","Close window"],defaultId:0,cancelId:1,noLink:true
   });
   if(!win||win.isDestroyed())return;
   if(answer.response===0)await win.loadFile(path.join(__dirname,"..","dist","index.html"));
   else win.close();
  }catch{
   // Never let recovery handling crash the main process.
  }finally{recovering=false}
 };
 win.webContents.on("render-process-gone",(_,details)=>{
  if(details.reason==="clean-exit")return;
  void recoveryDialog("renderer-process-gone",details);
 });
 win.webContents.on("did-fail-load",(_,errorCode,_description,_url,isMainFrame)=>{
  if(isMainFrame!==true||errorCode===-3)return;
  void recoveryDialog("main-frame-load-failed",{errorCode});
 });
 const file=path.join(__dirname,"..","dist","index.html");
 if(!fs.existsSync(file))throw new Error("Missing bundled ShowPilot app files");
 win.loadFile(file);
 // External calendar/vendor links open in the default browser, never inside the privileged app.
 win.webContents.setWindowOpenHandler(({url})=>{
  try{const u=new URL(url);if(u.protocol==="https:"||u.protocol==="http:")void shell.openExternal(url)}
  catch{}
  return {action:"deny"};
 });
 win.webContents.on("will-navigate",(event,url)=>{
  if(!url.startsWith("file://")){event.preventDefault();try{const u=new URL(url);if(u.protocol==="https:"||u.protocol==="http:")void shell.openExternal(url)}catch{}}
 });
 win.on("closed",()=>{win=null});
}
app.whenReady().then(()=>{setupAiIpc();setupGoogleCalendarIpc();setupUpdates();setupMemoryIpc();setupLocalIntelligenceIpc();setupDiagnosticsIpc();setupEventScheduleSessionIpc();setupTodayChecklistIpc();openApp();app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)openApp()})});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit()});
