import type {EventRow} from "./work-tools";
import type {DailyActivity} from "./showpilot-today-sources";
import {classifyEvent,expandSpace,isCancelledRow,isPendingRow} from "./work-tools";

const excluded=/\b(?:cepac|cobb energy|performing arts)\b/i;
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+"T12:00:00Z"));
export function hallGroup(space:string):string|null{
 const parts=expandSpace(space).map(x=>/^Hall ([A-D])$/i.exec(x)?.[1]?.toUpperCase()||"").filter(Boolean);
 return parts.length?[...new Set(parts)].sort().join(""):null;
}
export type HallOverlap={date:string;source:"event-schedule"|"engineering-workbook";
 firstShow:string;secondShow:string;firstGroup:string;secondGroup:string;
 shared:string;sameEvent:boolean;explanation:string};
type Owner={date:string;eventId:string;name:string;group:string;source:HallOverlap["source"]};
export function detectHallOverlaps(rows:readonly EventRow[],activities:readonly DailyActivity[]):HallOverlap[]{
 const items:Owner[]=[];
 for(const r of rows){
  if(r.level<=1||!validDate(r.date)||isCancelledRow(r)||isPendingRow(r)||
   excluded.test([r.space,r.event??"",r.description].join(" ")))continue;
  if(!["S","MI","Exmi","MO"].includes(classifyEvent(r)??""))continue;
  const group=hallGroup(r.space);
  if(group)items.push({date:r.date,eventId:r.eventId?.trim()||"",name:(r.event||r.description||"Unlabeled function").trim(),group,source:"event-schedule"});
 }
 for(const a of activities){
  if(!validDate(a.date)||excluded.test(a.showName+" "+a.rooms.join(" ")))continue;
  const group=hallGroup(a.rooms.join(", "));
  if(group)items.push({date:a.date,eventId:a.eventId.trim(),name:a.showName,group,source:a.source});
 }
 const found=new Map<string,HallOverlap>();
 for(const source of ["event-schedule","engineering-workbook"] as const){
  const rowsForSource=items.filter(x=>x.source===source);
  for(let i=0;i<rowsForSource.length;i++){
   for(let j=i+1;j<rowsForSource.length;j++){
    const a=rowsForSource[i]!,b=rowsForSource[j]!;
    if(a.date!==b.date||a.group===b.group)continue;
    const shared=[...a.group].filter(x=>b.group.includes(x)).join("");
    if(!shared)continue;
    const sameEvent=!!a.eventId&&a.eventId===b.eventId;
    const explanation=sameEvent?
      "The same Event ID uses multiple Hall configurations. This may be an intentional change between functions; verify function times and room availability.":
      "These Hall groups share physical sections. Verify whether bookings are sequential, associated with one event, or truly simultaneous.";
    const key=[source,a.date,...[a.group+"|"+a.name,b.group+"|"+b.name].sort()].join("|");
    found.set(key,{date:a.date,source,firstShow:a.name,secondShow:b.name,
      firstGroup:a.group,secondGroup:b.group,shared,sameEvent,explanation});
   }
  }
 }
 return [...found.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.firstShow.localeCompare(b.firstShow));
}
export function describeHallOverlap(x:HallOverlap):string{
 return x.date+" ("+x.source+"): "+x.firstShow+" [Hall "+x.firstGroup+"] and "+
  x.secondShow+" [Hall "+x.secondGroup+"] overlap in Hall "+[...x.shared].join(", ")+". "+x.explanation;
}
