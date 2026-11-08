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
export const STANDARD_BUILDING_TASKS:readonly ChecklistTask[]=[
 {id:"review-requests",text:"Review today's engineering tasks and room changes",source:"standard"},
 {id:"building-airwalls",text:"Verify shared-space airwall changes and secure partitions",source:"standard",
  detail:"Check the dated engineering schedule and source EOCs before moving walls."},
 {id:"building-lights",text:"Verify lighting after any airwall or room-configuration changes",source:"standard"},
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
export function buildingChecklistTasks(
 day:string,excel:readonly WorkbookWallTask[],suggestions:readonly TaskNote[]
):ChecklistTask[]{
 const result=[...STANDARD_BUILDING_TASKS];
 const existing=new Set<string>();
 for(const task of excel.filter(t=>t.date===day)){
  const text=task.text.trim().slice(0,150);
  if(!text)continue;
  const id="sheet-"+hash([day,task.section,text].join("|"));
  if(existing.has(id))continue;existing.add(id);
  result.push({id,text:"Review and complete: "+text,source:"schedule",
   detail:"Dated engineering workbook, "+task.section+". Confirm the room layout before acting."});
 }
 for(const task of suggestions.filter(t=>t.date===day)){
  const text=wallTaskLabel(task);
  const id="suggest-"+hash([day,task.section,task.text].join("|"));
  if(existing.has(id))continue;existing.add(id);
  result.push({id,text:"Verify suggested airwall setup: "+text,source:"schedule",
   detail:"Event Schedule suggestion. Confirm against the EOC and current room setup."});
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
