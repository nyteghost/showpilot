const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("showpilotUpdates",Object.freeze({
 status:()=>ipcRenderer.invoke("showpilot-update:status"),
 setChannel:(channel)=>ipcRenderer.invoke("showpilot-update:channel",channel),
 check:()=>ipcRenderer.invoke("showpilot-update:check"),
 open:()=>ipcRenderer.invoke("showpilot-update:open"),
 install:()=>ipcRenderer.invoke("showpilot-update:install"),
 onProgress:(callback)=>{
  if(typeof callback!=="function")return ()=>{};
  const listener=(_,info)=>{
   if(!info||typeof info!=="object")return;
   callback({phase:String(info.phase||""),message:String(info.message||"").slice(0,600),
    percent:Number.isFinite(info.percent)?Math.max(0,Math.min(100,info.percent)):0});
  };
  ipcRenderer.on("showpilot-update:progress",listener);
  return ()=>ipcRenderer.removeListener("showpilot-update:progress",listener);
 }
}));
contextBridge.exposeInMainWorld("showpilotAI", Object.freeze({
  status: () => ipcRenderer.invoke("showpilot-ai:status"),
  saveKey: (provider, key) => ipcRenderer.invoke("showpilot-ai:save",provider,key),
  removeKey: (provider) => ipcRenderer.invoke("showpilot-ai:remove",provider),
  suggestTasks: (provider, context) => ipcRenderer.invoke("showpilot-ai:suggest",provider,context),
}));

contextBridge.exposeInMainWorld("showpilotCalendar", Object.freeze({
  status: () => ipcRenderer.invoke("showpilot-calendar:status"),
  saveClient: (json) => ipcRenderer.invoke("showpilot-calendar:save-client",json),
  connect: () => ipcRenderer.invoke("showpilot-calendar:connect"),
  disconnect: () => ipcRenderer.invoke("showpilot-calendar:disconnect"),
  forget: () => ipcRenderer.invoke("showpilot-calendar:forget"),
  updateAll: (payload) => ipcRenderer.invoke("showpilot-calendar:update-all",payload),
}));

contextBridge.exposeInMainWorld("showpilotMemory",Object.freeze({
 status:()=>ipcRenderer.invoke("showpilot-memory:status"),
 preferences:(next)=>ipcRenderer.invoke("showpilot-memory:preferences",next),
 list:(query)=>ipcRenderer.invoke("showpilot-memory:list",query),
 search:(query)=>ipcRenderer.invoke("showpilot-memory:search",query),
 read:(id)=>ipcRenderer.invoke("showpilot-memory:read",id),
 save:(note)=>ipcRenderer.invoke("showpilot-memory:save",note),
 edit:(id,content)=>ipcRenderer.invoke("showpilot-memory:edit",id,content),
 archive:(id)=>ipcRenderer.invoke("showpilot-memory:archive",id),
 importJson:()=>ipcRenderer.invoke("showpilot-memory:import-json"),
 exportJson:()=>ipcRenderer.invoke("showpilot-memory:export-json"),
 backupNow:()=>ipcRenderer.invoke("showpilot-memory:backup-now"),
 setWeeklyBackup:(enabled)=>ipcRenderer.invoke("showpilot-memory:backup-enable",enabled),
 chooseBackupFolder:()=>ipcRenderer.invoke("showpilot-memory:backup-choose-folder"),
 openBackupFolder:()=>ipcRenderer.invoke("showpilot-memory:backup-open-folder"),
 rememberSchedule:(payload)=>ipcRenderer.invoke("showpilot-memory:remember-schedule",payload),
 postConList:()=>ipcRenderer.invoke("showpilot-memory:postcon-list"),
 postConSave:(report)=>ipcRenderer.invoke("showpilot-memory:postcon-save",report),
 postConArchive:(id)=>ipcRenderer.invoke("showpilot-memory:postcon-archive",id),
 showCatalogList:()=>ipcRenderer.invoke("showpilot-memory:show-catalog-list"),
 showCatalogSave:(shows)=>ipcRenderer.invoke("showpilot-memory:show-catalog-save",shows),
 eventFileList:(eventKey,includeArchived)=>ipcRenderer.invoke("showpilot-memory:event-file-list",eventKey,includeArchived),
 eventFileSave:(input)=>ipcRenderer.invoke("showpilot-memory:event-file-save",input),
 eventFileOpen:(id)=>ipcRenderer.invoke("showpilot-memory:event-file-open",id),
 eventFileRead:(id)=>ipcRenderer.invoke("showpilot-memory:event-file-read",id),
 eventFileArchive:(id,archived)=>ipcRenderer.invoke("showpilot-memory:event-file-archive",id,archived),
 eventZipInspect:(bytes)=>ipcRenderer.invoke("showpilot-memory:event-zip-inspect",bytes),
 eventZipScan:(bytes)=>ipcRenderer.invoke("showpilot-memory:event-zip-scan",bytes),
 eventZipImport:(payload)=>ipcRenderer.invoke("showpilot-memory:event-zip-import",payload),
 eventFileSetEocExcerpts:(id,excerpts)=>ipcRenderer.invoke("showpilot-memory:event-file-set-eoc",id,excerpts),
 openFolder:()=>ipcRenderer.invoke("showpilot-memory:open-folder"),
}));

contextBridge.exposeInMainWorld("showpilotLocal",Object.freeze({status:()=>ipcRenderer.invoke("showpilot-local:status"),configure:(next)=>ipcRenderer.invoke("showpilot-local:configure",next),chooseTemplate:()=>ipcRenderer.invoke("showpilot-local:template"),readTemplate:()=>ipcRenderer.invoke("showpilot-local:read-template")}));

contextBridge.exposeInMainWorld("showpilotDiagnostics",Object.freeze({inspect:()=>ipcRenderer.invoke("showpilot-diagnostics:inspect")}));
