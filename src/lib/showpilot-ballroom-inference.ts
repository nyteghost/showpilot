import type {DailyActivity} from "./showpilot-today-sources";
import type {EventRow} from "./work-tools";
import {classifyEvent,expandSpace,isCancelledRow,isPendingRow} from "./work-tools";
import type {PostConShow} from "./showpilot-postcon";

const ISO=/^\d{4}-\d{2}-\d{2}$/;
const ALL="ABCDEFG";
const CGC_EXCLUDED=/\b(?:CEPAC|cobb energy|performing arts)\b/i;
export type BallroomConfiguration={
 date:string;
 groups:string[];
 events:string[];
 source:"event-schedule"|"engineering-workbook"|"events-catalog";
 confidence:"confirmed-layout"|"inferred-from-rooms";
};
export type BallroomTransition={
 id:string;
 section:"BALLROOM";
 afterDate:string;
 needByDate:string;
 fromGroups:string[];
 toGroups:string[];
 target:string;
 fromEvents:string[];
 toEvents:string[];
 source:"inferred";
 confidence:"confirmed-layout"|"review";
 explanation:string;
};
export type BallroomInference={configurations:BallroomConfiguration[];transitions:BallroomTransition[];warnings:string[]};

const normalize=(letters:string)=>[...new Set(letters.toUpperCase().replace(/[^A-G]/g,""))].sort().join("");
const canonical=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g,"");
const dateOkay=(date:string)=>ISO.test(date)&&!Number.isNaN(Date.parse(date+"T12:00:00Z"));
const partName=(letters:string)=>letters===ALL?"Full Ballroom":"Ballroom "+letters;
export const describeBallroomConfiguration=(groups:readonly string[])=>
 groups.map(partName).join(" + ");

/** Only CGC ballroom names count. "Hall AB" is not a ballroom.
 * Recognize explicit "Full Ballroom" and "Chattahoochee" as ABCDEFG. */
export function ballroomGroup(space:string):string|null{
 if(/\b(?:full\s+ball\s*room|ball\s*room\s+full|chattahoochee|brfull)\b/i.test(space))
  return ALL;
 const expanded=expandSpace(space);
 const groups=expanded.map(x=>/^BallRoom ([A-G])$/i.exec(x)?.[1]?.toUpperCase()??"").filter(Boolean);
 return groups.length?normalize(groups.join("")):null;
}
type Owner={date:string;owner:string;name:string;group:string;explicit:boolean;source:BallroomConfiguration["source"]};
function fromRows(rows:readonly EventRow[]):Owner[]{
 const out:Owner[]=[];
 for(const row of rows){
  if(row.level<=1||!dateOkay(row.date)||isCancelledRow(row)||isPendingRow(row)||
   CGC_EXCLUDED.test([row.space,row.event??"",row.description].join(" ")))continue;
  const kind=classifyEvent(row);
  if(!["S","MI","Exmi","MO"].includes(kind??""))continue;
  const group=ballroomGroup(row.space);
  if(!group)continue;
  const name=(row.event||row.description||"").trim();
  const id=(row.eventId??"").trim();
  out.push({date:row.date,owner:id?"id:"+id:"name:"+canonical(name),
   name:name||"Unlabeled booking",group,explicit:group.length>1||group===ALL,source:"event-schedule"});
 }
 return out;
}
function fromActivities(activities:readonly DailyActivity[]):Owner[]{
 const grouped=new Map<string,{date:string;owner:string;name:string;letters:Set<string>}>();
 for(const a of activities){
  if(!dateOkay(a.date)||CGC_EXCLUDED.test(a.showName+" "+a.rooms.join(" ")))continue;
  // An unlabeled Client Arrival/Program is a function, not independent proof
  // of a new partition requirement. Numeric Event ID may still identify it.
  if(!a.eventId.trim()&&/^(?:client|vendor|exhibitor)\s+(?:arrival|move|load)|^(?:program|setup|rehearsal|general session|tables?\s*(?:&|and))/i.test(a.showName))
   continue;
  const letters=a.rooms.map(ballroomGroup).filter((s):s is string=>!!s).join("");
  if(!letters)continue;
  const owner=a.eventId.trim()?"id:"+a.eventId.trim():"name:"+canonical(a.showName);
  const key=a.date+"|"+owner;
  let group=grouped.get(key);
  if(!group){group={date:a.date,owner,name:a.showName,letters:new Set()};grouped.set(key,group);}
  for(const l of normalize(letters))group.letters.add(l);
 }
 return [...grouped.values()].map(x=>({date:x.date,owner:x.owner,name:x.name,
  group:normalize([...x.letters].join("")),explicit:false,source:"engineering-workbook"}));
}
function fromCatalog(shows:readonly PostConShow[]):Owner[]{
 const out:Owner[]=[];
 for(const show of shows){
  if(CGC_EXCLUDED.test(show.showName+" "+show.rooms))continue;
  const date=show.startDate??show.showDate;
  if(!dateOkay(date))continue;
  const name=show.showName.trim();
  // Catalog room ranges can contain multiple independent ballroom usages.
  // Only treat an unambiguous full-room booking as a target configuration.
  const group=ballroomGroup(show.rooms);
  if(group!==ALL&&!/full\s*ballroom|chattahoochee/i.test(show.rooms))continue;
  out.push({date,owner:"id:"+show.eventId,name,group:ALL,explicit:/full\s*ballroom|chattahoochee/i.test(show.rooms),
   source:"events-catalog"});
 }
 return out;
}
const compareGroups=(a:readonly string[],b:readonly string[])=>a.join("|")===b.join("|");
function makeDay(owners:readonly Owner[],source:BallroomConfiguration["source"]):
 BallroomConfiguration|null{
 if(!owners.length)return null;
 const byOwner=new Map<string,{name:string;groups:Set<string>;explicit:boolean}>();
 for(const o of owners){
  let x=byOwner.get(o.owner);
  if(!x){x={name:o.name,groups:new Set(),explicit:false};byOwner.set(o.owner,x);}
  x.groups.add(o.group);if(o.explicit)x.explicit=true;
 }
 // Explicit joined room groups (ABEG and CDF) define physical partition
 // layouts. A sequence of single-letter room cells under ONE booking is a
 // weaker indication of a combined space rather than seven separate walls.
 const groups:string[]=[];
 let hasExplicit=false;
 for(const item of byOwner.values()){
  const all=[...item.groups];
  const joined=all.filter(s=>s.length>1);
  if(joined.length){
   hasExplicit=true;
   for(const g of joined)groups.push(g);
   // A single-letter room not covered by any explicit group is separate.
   for(const g of all.filter(s=>s.length===1)){
    if(!joined.some(x=>x.includes(g)))groups.push(g);
   }
  }else groups.push(normalize(all.join("")));
 }
 const distinct=[...new Set(groups)].sort();
 // Multiple overlapping, nonidentical room groups on the same day can be
 // sequential uses, not one physical configuration. Do not guess their order.
 const occupied=new Map<string,string>();
 for(const group of distinct){
  for(const c of group){
   const previous=occupied.get(c);
   if(previous&&previous!==group)return null;
   occupied.set(c,group);
  }
 }
 return {date:owners[0]!.date,groups:distinct,events:[...new Set(owners.map(o=>o.name))],
  source,confidence:hasExplicit?"confirmed-layout":"inferred-from-rooms"};
}
/** Detect room-set changes BETWEEN dated bookings. The work window starts
 * only AFTER prior occupancy ends and must finish BEFORE the next booking's
 * setup/use. Without trustworthy timestamps, never assert a specific hour.
 *
 * This logic works completely offline and does not require a loaded LLM.
 * It flags uncertain source evidence rather than changing physical walls.
 */
export function inferBallroomTransitions(
 activities:readonly DailyActivity[],
 reviewRows:readonly EventRow[]=[],
 catalog:readonly PostConShow[]=[]
):BallroomInference{
 const warnings:string[]=[];
 const fromReview=fromRows(reviewRows);
 const fromWorkbook=fromActivities(activities);
 const fromEvents=fromCatalog(catalog);
 const byDate=new Map<string,BallroomConfiguration>();
 const sources=[
  {items:fromEvents,source:"events-catalog" as const},
  {items:fromWorkbook,source:"engineering-workbook" as const},
  {items:fromReview,source:"event-schedule" as const}
 ];
 for(const {items,source} of sources){
  const dated=new Map<string,Owner[]>();
  for(const owner of items)(dated.get(owner.date)??dated.set(owner.date,[]).get(owner.date)!).push(owner);
  for(const [day,owners]of dated){
   const config=makeDay(owners,source);
   if(!config){
    warnings.push(day+" has overlapping ballroom groups; verify the EOC and timed functions.");
    byDate.delete(day);continue;
   }
   // A reviewed Event Schedule beats a generic workbook, which beats a broad
   // Events catalog range when both describe the same day.
   byDate.set(day,config);
  }
 }
 const configurations=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
 const transitions:BallroomTransition[]=[];
 for(let i=1;i<configurations.length;i++){
  const before=configurations[i-1]!;
  const next=configurations[i]!;
  if(compareGroups(before.groups,next.groups))continue;
  const gap=Math.round((Date.parse(next.date+"T12:00:00Z")-Date.parse(before.date+"T12:00:00Z"))/86400000);
  if(gap<1||gap>14)continue;
  // Missing rooms are not evidence of a move *within* an unbooked area.
  // At least one currently configured ballroom must change partition group.
  const oldMap=new Map([...before.groups].flatMap(g=>[...g].map(c=>[c,g] as const)));
  if(!next.groups.some(g=>[...g].some(c=>oldMap.has(c)&&oldMap.get(c)!==g)))continue;
  const confidence=before.confidence==="confirmed-layout"&&next.confidence==="confirmed-layout"?
   "confirmed-layout" as const:"review" as const;
  const id=["ballroom",before.date,next.date,
   before.groups.join("_"),next.groups.join("_")].join(":").toLowerCase();
  transitions.push({
   id,section:"BALLROOM",afterDate:before.date,needByDate:next.date,
   fromGroups:before.groups,toGroups:next.groups,
   target:describeBallroomConfiguration(next.groups),
   fromEvents:before.events,toEvents:next.events,
   source:"inferred",confidence,
   explanation:"After "+before.date+" ("+before.events.join(", ")+") finishes using "+
    describeBallroomConfiguration(before.groups)+
    "; before "+next.date+" ("+next.events.join(", ")+") needs "+
    describeBallroomConfiguration(next.groups)+
    ". "+(confidence==="review"?
     "Inferred from booked rooms; confirm the partition arrangement, move-in times and EOC before moving walls.":
     "Both configurations are supported by explicitly grouped ballroom rows; confirm the handoff time.")
  });
 }
 return {configurations,transitions,warnings};
}
