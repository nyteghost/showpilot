import {planStage,type Stock} from "./deck-solver";
import {planWeeks} from "./staffing";
import type {EventEntry} from "./work-tools";

export type PlanningKind="stage"|"floor"|"staffing";
export type StageCandidate={widthFt:number;lengthFt:number;heightIn:number;mostlyThree:boolean;allowTwo:boolean};
export type PlanningSuggestion={
 id:string;title:string;reason:string;evidence:string[];
 stage?:StageCandidate;targetId?:string;staffName?:string;date?:string;
};
export type PlanningContext=Record<string,unknown>;
const prohibited=/\b(?:cepac|cobb energy|performing arts)\b/i;
const iso=/^\d{4}-\d{2}-\d{2}$/;
const text=(v:unknown,max:number)=>typeof v==="string"?v.replace(/[\u0000-\u001f]+/g," ").trim().slice(0,max):"";
const finite=(v:unknown)=>typeof v==="number"&&Number.isFinite(v);
export const PLANNING_JSON_SCHEMA=JSON.stringify({
 type:"object",properties:{recommendations:{type:"array",items:{type:"object",
  properties:{
   title:{type:"string"},reason:{type:"string"},evidence:{type:"array",items:{type:"string"}},
   stage:{type:"object",properties:{widthFt:{type:"number"},lengthFt:{type:"number"},heightIn:{type:"number"},mostlyThree:{type:"boolean"},allowTwo:{type:"boolean"}}},
   targetId:{type:"string"},staffName:{type:"string"},date:{type:"string"}
  },required:["title","reason","evidence"]
 }}},required:["recommendations"]
});
export function validatePlanningResponse(raw:unknown,kind:PlanningKind,context:PlanningContext):PlanningSuggestion[]{
 if(!raw||typeof raw!=="object"||!Array.isArray((raw as {recommendations?:unknown}).recommendations))
  throw Error("Local AI returned no valid recommendations. No changes were made.");
 const candidates=(raw as {recommendations:unknown[]}).recommendations;
 if(candidates.length>8)throw Error("AI returned too many recommendations.");
 const result:PlanningSuggestion[]=[];
 for(const rawCandidate of candidates){
  if(!rawCandidate||typeof rawCandidate!=="object")continue;
  const c=rawCandidate as Record<string,unknown>;
  const title=text(c.title,150),reason=text(c.reason,500);
  if(title.length<3||reason.length<5||prohibited.test(title+" "+reason))continue;
  const evidence=Array.isArray(c.evidence)?c.evidence.filter(x=>typeof x==="string").slice(0,4).map(x=>text(x,180)).filter(Boolean):[];
  const suggestion:PlanningSuggestion={id:kind+"-"+result.length+"-"+title.slice(0,24),title,reason,evidence};
  if(kind==="stage"){
   const stage=c.stage as Record<string,unknown>|undefined;
   const stock=context.stock as Stock|undefined;
   if(!stage||!stock||!finite(stage.widthFt)||!finite(stage.lengthFt)||!finite(stage.heightIn))continue;
   const widthFt=Number(stage.widthFt),lengthFt=Number(stage.lengthFt),heightIn=Number(stage.heightIn);
   if(!Number.isInteger(widthFt)||!Number.isInteger(lengthFt)||widthFt<=0||lengthFt<=0||
      widthFt>200||lengthFt>200||heightIn<32||heightIn>44||!Number.isInteger(heightIn)||heightIn%2)continue;
   const mostlyThree=stage.mostlyThree===true,allowTwo=stage.allowTwo!==false;
   const solved=planStage(widthFt,lengthFt,stock,{mostlyThree,allowTwo});
   if(!solved.ok)continue;
   suggestion.stage={widthFt,lengthFt,heightIn,mostlyThree,allowTwo};
  }else if(kind==="floor"){
   const targetId=text(c.targetId,180);
   const questions=Array.isArray(context.unresolved)?context.unresolved:[];
   if(!questions.some(q=>q&&typeof q==="object"&&(q as {id?:unknown}).id===targetId))continue;
   suggestion.targetId=targetId;
  }else if(kind==="staffing"){
   const staffName=text(c.staffName,100),date=text(c.date,15);
   const options=Array.isArray(context.assignments)?context.assignments:[];
   if(!iso.test(date)||!staffName||!options.some(a=>a&&typeof a==="object"&&
     (a as {date?:unknown}).date===date&&(a as {name?:unknown}).name===staffName))continue;
   suggestion.staffName=staffName;suggestion.date=date;
  }
  if(!result.some(r=>r.title===suggestion.title))result.push(suggestion);
  if(result.length>=4)break;
 }
 return result;
}

/** The existing deterministic staffing engine proposes shifts. AI may explain
 * the proposed coverage using history, but may not create an unvalidated
 * employee assignment or change the Excel workbook. */
export function staffingPlanningContext(entries:readonly EventEntry[],selectedDates:readonly string[]):PlanningContext{
 const dates=[...new Set(selectedDates.filter(d=>iso.test(d)))].sort().slice(0,7);
 const safeEntries=entries.filter(e=>!prohibited.test(e.space) && e.date && iso.test(e.date));
 if(!dates.length)return {days:[],events:[],assignments:[],gaps:[]};
 const plans=planWeeks(dates,[...safeEntries]);
 return {
  days:dates,
  events:safeEntries.filter(e=>dates.includes(e.date)).slice(0,42).map(e=>({date:e.date,room:e.space,
   title:e.title.slice(0,110),phase:e.code,start:e.start,end:e.end})),
  assignments:plans.filter(p=>dates.includes(p.date)).flatMap(p=>p.assignments.map(a=>({
   date:p.date,name:a.name,start:a.start,end:a.end,fixed:a.fixed,ruleReason:a.reason.slice(0,190)}))).slice(0,55),
  gaps:plans.filter(p=>dates.includes(p.date)).flatMap(p=>p.gaps.map(g=>({date:p.date,start:g.start,end:g.end,short:g.short}))).slice(0,30),
  notice:"These are rule-based draft assignments only, without live employee availability or current master-workbook shifts. Never invent or auto-write staffing shifts; a manager must review the actual workbook.",
 };
}
