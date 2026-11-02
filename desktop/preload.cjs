const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("showpilotUpdates",Object.freeze({status:()=>ipcRenderer.invoke("showpilot-update:status"),setChannel:(channel)=>ipcRenderer.invoke("showpilot-update:channel",channel),check:()=>ipcRenderer.invoke("showpilot-update:check"),open:()=>ipcRenderer.invoke("showpilot-update:open")}));
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
 createDefault:()=>ipcRenderer.invoke("showpilot-memory:create-default"),
 choose:()=>ipcRenderer.invoke("showpilot-memory:choose"),
 preferences:(next)=>ipcRenderer.invoke("showpilot-memory:preferences",next),
 list:(query)=>ipcRenderer.invoke("showpilot-memory:list",query),
 search:(query)=>ipcRenderer.invoke("showpilot-memory:search",query),
 read:(id)=>ipcRenderer.invoke("showpilot-memory:read",id),
 save:(note)=>ipcRenderer.invoke("showpilot-memory:save",note),
 edit:(id,content)=>ipcRenderer.invoke("showpilot-memory:edit",id,content),
 archive:(id)=>ipcRenderer.invoke("showpilot-memory:archive",id),
 openFolder:()=>ipcRenderer.invoke("showpilot-memory:open-folder"),
}));

contextBridge.exposeInMainWorld("showpilotLocal",Object.freeze({status:()=>ipcRenderer.invoke("showpilot-local:status"),configure:(next)=>ipcRenderer.invoke("showpilot-local:configure",next),chooseTemplate:()=>ipcRenderer.invoke("showpilot-local:template"),readTemplate:()=>ipcRenderer.invoke("showpilot-local:read-template")}));
