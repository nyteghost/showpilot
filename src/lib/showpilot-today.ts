import type {PostConShow} from "./showpilot-postcon";
import type {EocExcerpt} from "./showpilot-event-assets";
import type {ZipScheduleHint} from "./showpilot-zip-schedule";
import type {TaskNote} from "./work-tools";

/** A date-only, local-clock CGC operational overview. No dates are inferred
 * from the client's clock for a particular show; the saved catalog is source. */
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const nonCgc=/\b(?:CEPAC|cobb energy|performing arts)\b/i;
export function todayIso(now=new Date()):string{
 return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
}
export function addIsoDays(day:string,delta:number):string{
 if(!ISO.test(day))throw Error("Invalid schedule date.");
 const date=new Date(day+"T12:00:00Z");
 if(Number.isNaN(date.getTime()))throw Error("Invalid schedule date.");
 date.setUTCDate(date.getUTCDate()+delta);
 return date.toISOString().slice(0,10);
}
export function mondayFor(day:string):string{
 if(!ISO.test(day))throw Error("Invalid schedule date.");
 const date=new Date(day+"T12:00:00Z");
 if(Number.isNaN(date.getTime()))throw Error("Invalid schedule date.");
 return addIsoDays(day,-((date.getUTCDay()+6)%7));
}
export function daysOfWeek(monday:string):string[]{
 return Array.from({length:7},(_,i)=>addIsoDays(monday,i));
}
export function cgcShowOnDay(show:PostConShow,date:string):boolean{
 const start=show.startDate??show.showDate;
 return ISO.test(date)&&ISO.test(start)&&ISO.test(show.showDate)&&
  !nonCgc.test(show.showName+" "+show.rooms)&&date>=start&&date<=show.showDate;
}
export function cgcShowsForWeek(shows:readonly PostConShow[],monday:string):PostConShow[]{
 const sunday=addIsoDays(monday,6);
 return shows.filter(s=>{
  const start=s.startDate??s.showDate;
  return ISO.test(start)&&ISO.test(s.showDate)&&
   !nonCgc.test(s.showName+" "+s.rooms)&&start<=sunday&&s.showDate>=monday;
 }).sort((a,b)=>(a.startDate??a.showDate).localeCompare(b.startDate??b.showDate)||
   a.showName.localeCompare(b.showName));
}

/** Source-linked airwall information. An EOC mention is not proof of a
 * scheduled move TODAY; confirm timing and the setup against the source. */
export type AirwallFinding={
 kind:"action"|"mention"|"no-change";
 text:string;source:string;page?:number;fileId?:string;
};
export type AirwallAssessment={
 state:"action"|"review"|"explicit-none"|"unknown";
 findings:AirwallFinding[];
};
const wall=/\b(?:air[\s-]?walls?|operable[\s-]+partitions?|movable[\s-]+walls?)\b/i;
const action=/\b(?:mov(?:e|ing)|shift|relocat(?:e|ion|ing)|reconfigur(?:e|ation|ing)|adjust|open(?:ed|ing)?|clos(?:e|ed|ing)|fold|unfold|reset|set[\s-]?up|install|remov(?:e|al|ing)|split|combin(?:e|ing)|divid(?:e|ing)|position|change|pull|push)\b/i;
const negative=/(?:\b(?:no|none|without|not|never|don't|do not)\b[\w\s-]{0,55}\b(?:air[\s-]?walls?|partition|mov(?:e|ing)|change)|\bair[\s-]?walls?\b[\w\s-]{0,55}\b(?:remain|stay|unchanged|as[\s-]?is|no change|not moved|not required))\b/i;
export function findAirwallPhrases(text:string,source:string,page?:number,fileId?:string):AirwallFinding[]{
 const result:AirwallFinding[]=[];
 for(const segment of text.split(/\r?\n|[.;](?=\s|$)/).map(s=>s.replace(/\s+/g," ").trim())){
  if(!wall.test(segment))continue;
  // Match actions in the same instruction, not a distant unrelated paragraph.
  const kind:AirwallFinding["kind"]=negative.test(segment)?"no-change":action.test(segment)?"action":"mention";
  if(!result.some(f=>f.kind===kind&&f.text===segment))
   result.push({kind,text:segment.slice(0,300),source,...(page?{page}:{}),...(fileId?{fileId}:{})});
  if(result.length>=10)break;
 }
 return result;
}
export function airwallsForEvent(
 eocs:readonly {id:string;name:string;eocExcerpts:readonly EocExcerpt[]}[],
 hints:readonly ZipScheduleHint[]=[]
):AirwallAssessment{
 const raw:AirwallFinding[]=[];
 for(const file of eocs){
  for(const e of file.eocExcerpts){
   if(e.section==="Attendance")continue;
   raw.push(...findAirwallPhrases(e.text,file.name,e.page,file.id));
  }
 }
 for(const hint of hints)raw.push(...findAirwallPhrases(hint.text,hint.source));
 const seen=new Set<string>();
 const findings=raw.filter(f=>{
  const id=[f.kind,f.source,f.page??"",f.text].join("|");
  if(seen.has(id))return false;seen.add(id);return true;
 }).sort((a,b)=>({action:0,mention:1,"no-change":2})[a.kind]-({action:0,mention:1,"no-change":2})[b.kind]).slice(0,12);
 return {
  state:findings.some(f=>f.kind==="action")?"action":
   findings.some(f=>f.kind==="mention")?"review":
   findings.some(f=>f.kind==="no-change")?"explicit-none":"unknown",
  findings
 };
}
/** Reviewed Event Schedule recommendations use "Make ABE" and
 * "Make full ballroom", not just bare letter codes. Include these dated
 * recommendations without treating an undated EOC mention as a work order. */
export function scheduledWallChanges(tasks:readonly TaskNote[],day:string):TaskNote[]{
 const instruction=/^(?:[A-G]{1,7}|Make (?:Hall )?(?:full ballroom|[A-G]{1,7})(?:\/(?:full ballroom|[A-G]{1,7}))*)$/i;
 return tasks.filter(t=>t.date===day&&
  (t.section==="BALLROOM"||t.section==="HALLS")&&instruction.test(t.text.trim()));
}
export function wallTaskLabel(task:TaskNote):string{
 const instruction=task.text.trim();
 const section=task.section==="HALLS"?"Halls":"Ballrooms";
 if(/^Make\s+/i.test(instruction))return section+" — "+instruction;
 if(/^[A-G]{1,7}$/i.test(instruction))return section+" "+instruction.toUpperCase().split("").join(" + ");
 return section+" — "+instruction;
}
