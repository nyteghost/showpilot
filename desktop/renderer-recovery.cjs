"use strict";
/** Sanitized, bounded diagnostic events for a failed ShowPilot renderer.
 * NEVER write URLs, browser console text, file names, OAuth JSON, tokens,
 * passwords, user documents, or filesystem paths into this diagnostic log. */
const fs=require("node:fs");
const path=require("node:path");
const REASONS=new Set([
 "crashed","killed","oom","launch-failed","integrity-failure","abnormal-exit",
 "clean-exit","unknown"
]);
function safeRendererIncident(kind,details={},when=new Date()){
 const incident=kind==="main-frame-load-failed"?"main-frame-load-failed":"renderer-process-gone";
 const reason=typeof details.reason==="string"&&REASONS.has(details.reason)?
  details.reason:"unknown";
 const code=Number.isInteger(details.exitCode) && Math.abs(details.exitCode)<=65535?
  details.exitCode:null;
 const loadCode=Number.isInteger(details.errorCode) && Math.abs(details.errorCode)<=65535?
  details.errorCode:null;
 return {at:when.toISOString(),incident,reason,code,loadCode};
}
function writeRendererIncident(userData,kind,details){
 try{
  const directory=path.resolve(userData);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const filepath=path.join(directory,"showpilot-renderer-recovery.log");
  // Keep local diagnostics bounded even across repeated crashes.
  try{if(fs.statSync(filepath).size>96*1024)fs.unlinkSync(filepath)}catch{}
  fs.appendFileSync(filepath,JSON.stringify(safeRendererIncident(kind,details))+"\n",
   {encoding:"utf8",mode:0o600});
  return true;
 }catch{return false}
}
module.exports={safeRendererIncident,writeRendererIncident};
