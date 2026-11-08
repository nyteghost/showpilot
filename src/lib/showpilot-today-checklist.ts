import type {PostConShow} from "./showpilot-postcon";
import type {AirwallAssessment} from "./showpilot-today";
import type {TaskNote} from "./work-tools";
import type {WorkbookWallTask} from "./showpilot-today-sources";
import {wallTaskLabel} from "./showpilot-today";
import type {BallroomTransition} from "./showpilot-ballroom-inference";

/** Checkboxes are human acknowledgements, never automated EOC decisions. */
export type ChecklistTask={
 id:string;text:string;detail?:string;
 /** Transition checkoffs are anchored to the previous layout date, so marking
  * them complete on Friday still counts on Saturday. */
 storageDay?:string;
 source:"standard"|"eoc"|"schedule"|"inferred"|"manual";
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
 // Explicit no-change/negative instructions must never create movement work.
 if(/^(?:no|none|not|without|do not|don't|never)\b/i.test(text)||
   /\b(?:air[\s-]?walls?|partitions?)\b.{0,65}\b(?:stay|remain|unchanged|as[\s-]?is|no\s+change|not\s+required)\b/i.test(text)||
   /\bno\s+(?:air[\s-]?wall\s+)?(?:movements?|changes?)\s+(?:required|needed|scheduled)\b/i.test(text))
  return null;
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
export type AirwallReviewItem={
 id:string;
 kind:"upcoming"|"conflict";
 target:string;
 reason:string;
 sources:string[];
};
export type AirwallDayPlan={
 /** Confirmed dated task, or a single earliest-deadline inferred setup.
  * Any conflicting ballroom arrangements remain review-only. */
 tasks:ChecklistTask[];
 review:AirwallReviewItem[];
};
type ExplicitWork={
 section:"HALLS"|"BALLROOM";
 key:string;instruction:string;
 sources:Set<"workbook"|"event-schedule">;
};
function configurationKey(section:"HALLS"|"BALLROOM",instruction:string):string{
 const raw=wallInstructionKey(instruction).replace(/^ballrooms?\s+/i,"").trim();
 if(section==="BALLROOM"&&/^(?:full\s+ballroom|full|abcdefg)$/.test(raw))
  return "ABCDEFG";
 const pieces=raw.replace(/^hall\s+/,"").split("/");
 const letters=pieces.map(s=>s.replace(/[^a-g]/g,"").toUpperCase());
 if(letters.length>0&&letters.every((x,i)=>x.length>0&&x.length<=7&&
  x.length===new Set(x).size&&/^[A-G]+$/.test(x)&&
  /^[a-g\s]+$/i.test(pieces[i]!.trim())))
  return letters.map(x=>[...x].sort().join("")).sort().join("/");
 // Keep an explicit but unparseable move distinctive, never guess its target.
 return "?"+raw;
}
function transitionKey(t:BallroomTransition):string{
 return [...t.toGroups].map(g=>[...g].sort().join("")).sort().join("/");
}
function reviewFromTransition(t:BallroomTransition,kind:"upcoming"|"conflict",reason:string):AirwallReviewItem{
 return {id:"infer:"+t.id,kind,target:t.target,reason,
  sources:[
   "Prior configuration ("+t.afterDate+"): "+t.fromGroups.join(" + ")+" — "+t.fromEvents.join(", "),
   "Next event ("+t.needByDate+"): "+t.toGroups.join(" + ")+" — "+t.toEvents.join(", "),
   t.explanation
  ]};
}
/** One actionable ballroom configuration at a time. The earlier code appended
 * ALL inferred windows and ALL separately worded workbook suggestions, so
 * Today could show three incompatible setups for the same partition walls.
 * Do not suppress genuinely distinct work: later changes and disagreements
 * stay visible as evidence-backed, non-checkable review items. */
export function reconcileAirwallDay(
 day:string,excel:readonly WorkbookWallTask[],suggestions:readonly TaskNote[],
 inferred:readonly BallroomTransition[]=[]
):AirwallDayPlan{
 const tasks:ChecklistTask[]=[];
 const review:AirwallReviewItem[]=[];
 const explicit=new Map<string,ExplicitWork>();
 const collect=(section:"HALLS"|"BALLROOM",raw:string,source:"workbook"|"event-schedule")=>{
  const instruction=scheduledAirwallInstruction(section,raw);
  if(!instruction)return;
  const key=section+"|"+configurationKey(section,instruction);
  let item=explicit.get(key);
  if(!item){item={section,key,instruction,sources:new Set()};explicit.set(key,item);}
  item.sources.add(source);
  // Prefer the original workbook wording if both sources describe the same move.
  if(source==="workbook")item.instruction=instruction;
 };
 for(const t of excel)if(t.date===day)collect(t.section,t.text,"workbook");
 for(const t of suggestions)if(t.date===day)collect(t.section,t.text,"event-schedule");
 const windows=inferred.filter(t=>day>=t.afterDate&&day<=t.needByDate)
  .sort((a,b)=>a.needByDate.localeCompare(b.needByDate)||
    a.afterDate.localeCompare(b.afterDate)||a.id.localeCompare(b.id));
 const datedBallroom=[...explicit.values()].filter(t=>t.section==="BALLROOM");
 const datedHalls=[...explicit.values()].filter(t=>t.section==="HALLS");
 const listedSource=(t:ExplicitWork)=>
  [...t.sources].map(x=>x==="workbook"?"Dated engineering workbook task":"Reviewed Event Schedule recommendation").join(" + ");
 const addExplicit=(t:ExplicitWork,detailSuffix="")=>{
  // Keep original stable IDs when no inferred layout matches. This preserves
  // existing checkoffs made on previous versions of ShowPilot.
  const legacy= t.section+"|"+wallInstructionKey(t.instruction);
  const id="wall-"+hash(legacy);
  const target=(t.section==="HALLS"?"Halls":"Ballrooms")+" — "+t.instruction;
  const source=listedSource(t);
  tasks.push({id,source:"schedule",
   text:"Set / verify airwalls: "+target,
   detail:source+". "+detailSuffix+"Verify approved EOC, actual occupancy and room layout before moving partitions."});
  tasks.push({id:id+"-lighting",source:"schedule",
   text:"Verify lighting settings after airwall setup: "+target,
   detail:"After completing the wall change, verify the lighting zones and scenes. "+source+". "+detailSuffix});
 };
 const addTransition=(t:BallroomTransition,matched?:ExplicitWork)=>{
  const base="wall-infer-"+hash(t.id);
  const source=matched?" Also confirmed by "+listedSource(matched)+".":"";
  tasks.push({id:base,storageDay:t.afterDate,source:"inferred",
   text:"Make "+t.target+" — after "+t.afterDate+", before "+t.needByDate,
   detail:"Inferred from bookings. "+t.explanation+source+
    " Check EOC and exact occupancy hours before moving a wall."});
  tasks.push({id:base+"-lighting",storageDay:t.afterDate,source:"inferred",
   text:"Verify lighting zones for "+t.target+" after the airwall change",
   detail:"After the airwalls are set, verify the lighting zones and controls. "+t.explanation+source});
 };
 // Separate hall changes do not imply a mutually exclusive ballroom layout.
 for(const task of datedHalls)addExplicit(task);
 const candidatesByTarget=new Map<string,BallroomTransition[]>();
 for(const t of windows){
  const target=transitionKey(t);
  (candidatesByTarget.get(target)??candidatesByTarget.set(target,[]).get(target)!).push(t);
 }
 const firstDue=windows[0]?.needByDate;
 const urgent=windows.filter(t=>t.needByDate===firstDue);
 const urgentTargets=new Set(urgent.map(transitionKey));
 const activeExplicit=datedBallroom.length===1?datedBallroom[0]:undefined;
 const explicitTargets=new Set(datedBallroom.map(t=>t.key.slice("BALLROOM|".length)));
 const conflict=
  datedBallroom.length>1||
  (!datedBallroom.length&&urgentTargets.size>1)||
  (!!activeExplicit&&urgent.length>0&&
   urgentTargets.size>0&&!urgentTargets.has(activeExplicit.key.slice("BALLROOM|".length))&&
   (firstDue??"")<=day);
 if(conflict){
  const reason=datedBallroom.length>1?
   "Different ballroom setups were specified for the same day. They might be consecutive moves, but the source rows do not establish their order or handoff times.":
   urgentTargets.size>1?
   "Multiple future bookings have different ballroom configurations due on the same date. The schedule does not establish which goes first.":
   "Today's dated ballroom instruction disagrees with a different inferred layout that is needed by today. Do not choose a physical wall arrangement automatically.";
  for(const e of datedBallroom)review.push({
   id:"dated:"+e.key,kind:"conflict",target:e.instruction,reason,
   sources:[listedSource(e), "Dated task: "+day+" · "+e.instruction]
  });
  for(const t of windows)review.push(reviewFromTransition(t,"conflict",reason));
  return {tasks,review};
 }
 let chosen:BallroomTransition|undefined;
 if(activeExplicit){
  const target=activeExplicit.key.slice("BALLROOM|".length);
  chosen=windows.find(t=>transitionKey(t)===target);
  if(chosen)addTransition(chosen,activeExplicit);
  else addExplicit(activeExplicit);
 }else if(windows.length){
  chosen=windows[0];
  addTransition(chosen);
 }
 // A different later setup is not a second task for TODAY. Keep its dates
 // and original event names visible for planning; never silently discard it.
 for(const t of windows){
  if(t===chosen)continue;
  const target=transitionKey(t);
  if(chosen&&target===transitionKey(chosen)){
   // Same physical target from separate evidence: do not add a duplicate
   // checkbox, but retain the additional source in the review details.
   review.push(reviewFromTransition(t,"upcoming",
    "Another booking supports the same setup. It is not a second wall move; review the dates."));
  }else review.push(reviewFromTransition(t,"upcoming",
   chosen?"A different ballroom configuration is needed later. Verify when the current setup ends before scheduling this move.":
   "A future setup is inferred, but today's explicit engineering task takes precedence. Confirm the next handoff."));
 }
 // If a single explicit target matches a DIFFERENT later inferred setup,
 // show both sources; do not create competing checkboxes for the later move.
 return {tasks,review};
}
export function buildingChecklistTasks(
 day:string,excel:readonly WorkbookWallTask[],suggestions:readonly TaskNote[],
 inferred:readonly BallroomTransition[]=[]
):ChecklistTask[]{
 return [...STANDARD_BUILDING_TASKS,...reconcileAirwallDay(day,excel,suggestions,inferred).tasks];
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
