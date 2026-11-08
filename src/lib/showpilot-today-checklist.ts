import type {PostConShow} from "./showpilot-postcon";
import type {AirwallAssessment} from "./showpilot-today";
import type {TaskNote} from "./work-tools";
import type {WorkbookWallTask} from "./showpilot-today-sources";
import {wallTaskLabel} from "./showpilot-today";

/** Checkboxes are human acknowledgements, never automated EOC decisions. */
export type ChecklistTask={
 id:string;text:string;detail?:string;
 source:"standard"|"eoc"|"schedule"|"manual";
};
export type ManualChecklistTask={
 id:string;scope:string;text:string;createdAt:string;
};
export type TodayChecklistState={
 date:string;done:Record<string,string>;custom:ManualChecklistTask[];
};
export type TodayChecklistApi={
 load:(day:string)=>Promise<TodayChecklistState>;
 change:(day:string,scope:string,id:string,done:boolean)=>Promise<TodayChecklistState>;
 add:(day:string,scope:string,text:string)=>Promise<TodayChecklistState>;
 remove:(day:string,scope:string,id:string)=>Promise<TodayChecklistState>;
};
declare global{interface Window{showpilotTodayChecklist?:TodayChecklistApi}}

/** Don't change builtin IDs when refining their descriptions; a checkoff is
 * tied to the event plus calendar date and must survive renames/reimports. */
export const STANDARD_SHOW_TASKS:readonly ChecklistTask[]=[
 {id:"review-eoc",text:"Review today's EOC, room setup and change notes",source:"standard",
  detail:"Verify the actual setup date and latest approved instructions."},
 {id:"airwalls",text:"Set / verify airwalls for the approved room configuration",source:"standard",
  detail:"Confirm partition positions and secure the walls before lighting checks."},
 {id:"lighting",text:"Set / verify lighting zones for the final airwall layout",source:"standard",
  detail:"After airwalls are positioned, check the correct lighting controls, scenes and areas."},
 {id:"utilities",text:"Verify requested power and utility connections",source:"standard",
  detail:"Confirm requirements against the event's EOC; do not assume unspecified drops."},
 {id:"room-walk",text:"Walk the rooms and confirm the setup is ready",source:"standard",
  detail:"Resolve any outstanding issues and coordinate the room handoff."}
];
/** Building-wide airwall/lighting tasks are deliberately NOT permanent
 * checkboxes. They appear only when today's engineering workbook or reviewed
 * Event Schedule contains a dated change for that area. */
export const STANDARD_BUILDING_TASKS:readonly ChecklistTask[]=[
 {id:"review-requests",text:"Review today's engineering tasks and room changes",source:"standard"},
 {id:"handoff",text:"Record outstanding issues for the next shift",source:"standard"}
];

export const checklistKey=(scope:string,id:string)=>scope+"::"+id;
export const doneCount=(tasks:readonly ChecklistTask[],done:Record<string,string>,scope:string)=>
 tasks.filter(t=>!!done[checklistKey(scope,t.id)]).length;
function hash(value:string){
 let n=2166136261;
 for(const c of value){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}
 return (n>>>0).toString(36);
}
export function tasksForShow(show:PostConShow,airwalls:AirwallAssessment):ChecklistTask[]{
 const basic=[...STANDARD_SHOW_TASKS];
 if(airwalls.state==="action"||airwalls.state==="review"){
  basic.splice(1,0,{id:"eoc-airwall-review",text:"Review the EOC airwall instructions for this setup",
   source:"eoc",detail:"Airwall notes were found for this event but may refer to another day. Check the source EOC before moving anything."});
 }
 return basic;
}
/** A scheduled change needs a clear action. A mere EOC reference to an
 * airwall does not establish that it needs moving on this particular date. */
export function scheduledAirwallInstruction(section:"HALLS"|"BALLROOM",raw:string):string|null{
 const text=raw.replace(/\s+/g," ").trim().slice(0,150);
 if(!text)return null;
 if(/^[A-G]{1,7}$/i.test(text))return "Make "+(section==="HALLS"?"Hall ":"")+text.toUpperCase();
 if(/^make\s+(?:hall\s+)?(?:full\s+ballroom|[A-G]{1,7})(?:\/(?:full\s+ballroom|[A-G]{1,7}))*$/i.test(text))
  return text;
 // Explicit dated work directives; do not create an action for a vague mention.
 if(/\b(?:air[\s-]?walls?|partitions?)\b/i.test(text)&&
   /\b(?:move|moving|moved|change|changing|changed|reconfigure|reconfiguring|reset|set|setup|open|close|remove|install|shift|relocate)\b/i.test(text))
  return text;
 if(/^(?:make|move|reset|change|open|close|reconfigure)\s+(?:full\s+)?(?:ballroom|hall)\b/i.test(text))
  return text;
 return null;
}
/** Equivalent "ABE" and "Make ABE" schedule instructions refer to the same
 * target partition arrangement. Keep IDs stable after workbook reimport. */
function wallInstructionKey(instruction:string):string{
 return instruction.toLowerCase().replace(/^make\s+(?:hall\s+)?/,"")
  .replace(/\s+/g," ").trim();
}
export function buildingChecklistTasks(
 day:string,excel:readonly WorkbookWallTask[],suggestions:readonly TaskNote[]
):ChecklistTask[]{
 const result=[...STANDARD_BUILDING_TASKS];
 const changes=new Map<string,{section:"HALLS"|"BALLROOM";instruction:string;source:"workbook"|"event-schedule"}>();
 const collect=(section:"HALLS"|"BALLROOM",raw:string,source:"workbook"|"event-schedule")=>{
  const instruction=scheduledAirwallInstruction(section,raw);
  if(!instruction)return;
  const key=section+"|"+wallInstructionKey(instruction);
  // The original engineering workbook instruction takes priority over a
  // generated recommendation for the same configuration.
  if(!changes.has(key))changes.set(key,{section,instruction,source});
 };
 for(const task of excel)if(task.date===day)collect(task.section,task.text,"workbook");
 for(const task of suggestions)if(task.date===day)collect(task.section,task.text,"event-schedule");
 for(const [key,task] of changes){
  const target=(task.section==="HALLS"?"Halls":"Ballrooms")+" — "+task.instruction;
  const id="wall-"+hash(key);
  const sourceDetail=task.source==="workbook"?
   "Dated engineering workbook task":"Reviewed Event Schedule recommendation";
  result.push({
   id,text:"Set / verify airwalls: "+target,source:"schedule",
   detail:sourceDetail+". Confirm room availability and the approved EOC before moving partitions."
  });
  result.push({
   id:id+"-lighting",
   text:"Verify lighting settings after airwall setup: "+target,
   source:"schedule",
   detail:"After the wall move, check lighting zones, scenes and controls match the final layout. "+sourceDetail+"."
  });
 }
 return result;
}

// Browser-only fallback remains offline; Electron uses private userData.
// Do not silently replace corrupted saved checklists.
const CACHE="showpilot:today-checklists:v1";
type StorageDoc={version:1;days:Record<string,{done:Record<string,string>;custom:ManualChecklistTask[]}>};
function loadBrowserDoc():StorageDoc{
 const raw=localStorage.getItem(CACHE);
 if(!raw)return {version:1,days:{}};
 const doc:unknown=JSON.parse(raw);
 if(!doc||typeof doc!=="object"||!("version" in doc)||
    doc.version!==1||!("days" in doc)||!doc.days||typeof doc.days!=="object"||
    Array.isArray(doc.days))throw Error("Saved browser checklist data is invalid. Nothing was overwritten.");
 return doc as StorageDoc;
}
function checkDate(day:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day+"T12:00:00Z")))
  throw Error("Invalid checklist day.");
}
function browserChange(date:string,fn:(state:{done:Record<string,string>;custom:ManualChecklistTask[]})=>void){
 checkDate(date);
 const doc=loadBrowserDoc();
 const day=doc.days[date]??{done:{},custom:[]};
 if(!day.done||!Array.isArray(day.custom))throw Error("Invalid saved browser checklist.");
 fn(day);
 doc.days[date]=day;
 localStorage.setItem(CACHE,JSON.stringify(doc));
 return {date,...day};
}
export async function loadTodayChecklist(date:string):Promise<TodayChecklistState>{
 checkDate(date);
 if(window.showpilotTodayChecklist)return window.showpilotTodayChecklist.load(date);
 const doc=loadBrowserDoc();
 const state=doc.days[date]??{done:{},custom:[]};
 return {date,done:state.done,custom:state.custom};
}
export async function checkTodayTask(date:string,scope:string,id:string,completed:boolean){
 if(window.showpilotTodayChecklist)return window.showpilotTodayChecklist.change(date,scope,id,completed);
 return browserChange(date,state=>{
  if(completed)state.done[checklistKey(scope,id)]=new Date().toISOString();
  else delete state.done[checklistKey(scope,id)];
 });
}
export async function addTodayTask(date:string,scope:string,title:string){
 const text=title.trim();
 if(!text||text.length>160)throw Error("Enter a task of 1–160 characters.");
 if(window.showpilotTodayChecklist)return window.showpilotTodayChecklist.add(date,scope,text);
 return browserChange(date,state=>{
  if(state.custom.length>=500)throw Error("Too many tasks for this day.");
  state.custom.push({scope,id:"custom:"+crypto.randomUUID().replace(/-/g,""),
   text,createdAt:new Date().toISOString()});
 });
}
export async function removeTodayTask(date:string,scope:string,id:string){
 if(!id.startsWith("custom:"))throw Error("Only custom tasks can be deleted.");
 if(window.showpilotTodayChecklist)return window.showpilotTodayChecklist.remove(date,scope,id);
 return browserChange(date,state=>{
  state.custom=state.custom.filter(x=>!(x.scope===scope&&x.id===id));
  delete state.done[checklistKey(scope,id)];
 });
}
