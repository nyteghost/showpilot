import type {PostConShow} from "./showpilot-postcon";
import type {TodayJoined} from "./showpilot-today-sources";
import {addIsoDays} from "./showpilot-today";

/** Today's CGC operations use the venue's clock rather than any UTC date. */
export function cgcVenueClock(now=new Date()):{date:string;minute:number}{
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",hourCycle:"h23"
 }).formatToParts(now);
 const value=(type:string)=>parts.find(p=>p.type===type)?.value??"";
 const date=value("year")+"-"+value("month")+"-"+value("day");
 return {date,minute:Number(value("hour"))*60+Number(value("minute"))};
}

export type TodayShowPhase="in-progress"|"upcoming"|"finished"|"time-unverified";
type Window={start:number;end:number};
const TIME=/^(\d{1,2})(?::(\d{2}))?\s*([ap])(?:m)?$/i;
function clock(text:string):number|null{
 const m=TIME.exec(text.trim());
 if(!m)return null;
 const h=Number(m[1]),min=Number(m[2]??"0");
 if(h<1||h>12||min>59)return null;
 return (h%12)*60+min+(m[3]!.toLowerCase()==="p"?720:0);
}
/** Only explicit start AND end times count. No estimated hours based on
 * catalog booking dates or lone function start times. */
export function parseShowTimeWindows(lines:readonly string[]):Window[]{
 const spans:Window[]=[];
 // Handles Event Schedule "MI 7a–9:15a" and engineering workbook
 // "S 9:15a-7p"; split lines may contain a parent-function description.
 const re=/\b(?:Exmi|MI|MO|S|Arr|MTG|Food|Dinner|Breakfast|Lunch)\s+(\d{1,2}(?::\d{2})?\s*[ap](?:m)?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*[ap](?:m)?)(?!\w)/gi;
 for(const line of lines){
  for(const match of line.matchAll(re)){
   const start=clock(match[1]??""),endRaw=clock(match[2]??"");
   if(start===null||endRaw===null)continue;
   if(endRaw===start)continue; // Equal endpoints do not establish a 24-hour booking.
   const end=endRaw<start?endRaw+1440:endRaw;
   if(end>start&&end-start<=1440)spans.push({start,end});
  }
 }
 return spans;
}

export function showPhaseForToday(
 show:PostConShow,date:string,minute:number,joined:TodayJoined
):TodayShowPhase{
 if(!Number.isInteger(minute)||minute<0||minute>=1440)return "time-unverified";
 const today=parseShowTimeWindows(joined.daily[show.key]?.[date]??[]);
 const previous=parseShowTimeWindows(joined.daily[show.key]?.[addIsoDays(date,-1)]??[])
  .filter(window=>window.end>1440)
  .map(window=>({start:0,end:window.end-1440}));
 const windows=[...today,...previous];
 if(!windows.length)return "time-unverified";
 if(windows.some(w=>minute>=w.start&&minute<w.end))return "in-progress";
 if(windows.some(w=>minute<w.start))return "upcoming";
 return "finished";
}

export function showHasOvernightActivity(
 show:PostConShow,date:string,minute:number,joined:TodayJoined
):boolean{
 const previous=parseShowTimeWindows(joined.daily[show.key]?.[addIsoDays(date,-1)]??[]);
 return previous.some(w=>w.end>1440&&minute<w.end-1440);
}

export type DatedFindingGroups={today:string[];past:string[];future:string[]};
/** Keep historical findings and upcoming planning warnings accessible, but
 * never present them as current-day hazards. A transition due today can mention
 * yesterday as its source and still belongs in Today. */
export function scopeDatedRuleFindings(findings:readonly string[],today:string):DatedFindingGroups{
 const groups:DatedFindingGroups={today:[],past:[],future:[]};
 for(const finding of findings){
  const dates=[...finding.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)].map(m=>m[0]!);
  if(!dates.length||dates.includes(today)){groups.today.push(finding);continue;}
  if(dates.every(date=>date<today))groups.past.push(finding);
  else groups.future.push(finding);
 }
 return groups;
}
