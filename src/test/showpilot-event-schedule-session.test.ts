import {describe,expect,it} from "vitest";
import {readFileSync,mkdtempSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {runInNewContext} from "node:vm";
import {emptyReviewDraft,parseReviewProject,type ReviewProject} from "@/lib/showpilot-review";
const req=createRequire(new URL("../../desktop/event-schedule-session.cjs",import.meta.url));
const code=readFileSync(fileURLToPath(new URL("../../desktop/event-schedule-session.cjs",import.meta.url)),"utf8");
type Native={
 validProject:(p:unknown)=>unknown;
 saveProject:(p:ReviewProject)=>{saved:boolean;savedAt:string};
 saveTemplate:(bytes:ArrayBuffer)=>{saved:boolean;bytes:number};
 load:()=>{project:ReviewProject;savedAt:string;templateBytes:Uint8Array|null;templateMissing:boolean}|null;
};
function workspace(){
 const tmp=mkdtempSync(join(tmpdir(),"showpilot-schedule-autosave-"));
 const m={exports:{} as Native};
 runInNewContext(code,{
  module:m,exports:m.exports,require:(name:string)=>name==="electron"?
   {app:{getPath:()=>tmp},ipcMain:{handle:()=>{}}}:req(name),
  Buffer,process,Date,ArrayBuffer,Uint8Array,
 },{filename:"desktop/event-schedule-session.cjs"});
 return {native:m.exports,tmp,close:()=>rmSync(tmp,{recursive:true,force:true})};
}
const project=():ReviewProject=>({
 kind:"showpilot-review-project",version:1,
 originalRows:[{level:2,usage:"",start:"8:00 AM",end:"5:00 PM",description:"Setup",space:"Hall A",
  event:"Annual Show",eventId:"45678",date:"2026-11-09"}],
 draft:emptyReviewDraft(),approvedSpaces:["Hall A"],includePending:false,note:"Offline autosave",
 templateSaved:false,scope:{view:"week",value:"2026-11-09"}
});
describe("ShowPilot recoverable Event Schedule workspace",()=>{
 it("restores uploaded report, reviewer edits, date selection and event IDs after restart",()=>{
  const {native,tmp,close}=workspace();
  try{
   const original=project();
   original.draft.addedEntries.push({id:"manual-1",value:{
    date:"2026-11-14",space:"Hall B",code:"S",start:480,end:900,title:"Additional show",eventId:"78901"
   }});
   native.saveProject(original);
   expect(existsSync(join(tmp,"Event Schedule","current-review.json"))).toBe(true);
   const restored=native.load()!;
   expect(restored.project).toEqual(original);
   expect(parseReviewProject(JSON.stringify(restored.project)).scope).toEqual({view:"week",value:"2026-11-09"});
   expect(restored.project.originalRows[0]!.eventId).toBe("45678");
  }finally{close();}
 });
 it("recovers the original uploaded XLSX privately, without embedding bytes in the JSON snapshot",()=>{
  const {native,tmp,close}=workspace();
  try{
   const bytes=new Uint8Array([0x50,0x4b,...Array.from({length:200},(_,i)=>i%256)]);
   const saved=native.saveTemplate(bytes.buffer);
   expect(saved.bytes).toBe(bytes.length);
   native.saveProject({...project(),templateSaved:true});
   const restored=native.load()!;
   expect(restored.templateMissing).toBe(false);
   expect(Array.from(restored.templateBytes??[])).toEqual(Array.from(bytes));
   expect(readFileSync(join(tmp,"Event Schedule","current-review.json"),"utf8")).not.toContain("uploaded-template.xlsx");
  }finally{close();}
 });
 it("does not overwrite the latest good snapshot when invalid data is submitted",()=>{
  const {native,close}=workspace();
  try{
   native.saveProject(project());
   expect(()=>native.saveProject({...project(),originalRows:[{description:"bad"}] as never})).toThrow();
   expect(native.load()?.project.originalRows[0]?.event).toBe("Annual Show");
  }finally{close();}
 });
});
