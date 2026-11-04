"use strict";
/** Secure, read-only diagnostic facade.
 * Only version, platform, GPU capability flags and aggregate database health
 * leave the Electron main process. NEVER return memory text, paths, secrets,
 * filenames, machine/account names, or work documents.
 */
const {app,ipcMain}=require("electron");
const {diagnosticsSummary}=require("./showpilot-memory.cjs");
function safeGpuFeatures(input){
 if(!input||typeof input!=="object")return {};
 const names=["gpu_compositing","webgl","webgl2","webgpu","vulkan","video_decode","video_encode"];
 return Object.fromEntries(names.map(k=>[k,String(input[k]??"unknown").slice(0,42)]));
}
async function inspect(){
 const result={
  desktop:true,platform:process.platform==="win32"?"Windows":process.platform==="linux"?"Linux":process.platform==="darwin"?"macOS":"Other",
  architecture:process.arch==="x64"?"x64":process.arch==="arm64"?"arm64":"Other",
  appVersion:String(app.getVersion()).slice(0,70),
  electronMajor:Number.parseInt(process.versions.electron?.split(".")[0]||"0",10)||0,
  gpuFeatures:{},memory:null,memoryError:false
 };
 try{result.gpuFeatures=safeGpuFeatures(app.getGPUFeatureStatus?.());}catch{}
 try{result.memory=await diagnosticsSummary();}
 catch{result.memoryError=true;}
 return result;
}
function setupDiagnosticsIpc(){ipcMain.handle("showpilot-diagnostics:inspect",inspect);}
module.exports={safeGpuFeatures,inspect,setupDiagnosticsIpc};
