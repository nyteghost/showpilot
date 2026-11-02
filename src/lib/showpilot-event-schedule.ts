import type { EventRow } from "./work-tools";

/** Ungerboeck's grouped "ShowPilot - Event Schedule" print/PDF layout.
 * This reader never guesses event names from the individual function descriptions.
 */
export type ScheduleTextItem = {str:string;x:number;y:number};
export type SchedulePdfPage = ScheduleTextItem[][];
const months=["january","february","march","april","may","june","july","august","september","october","november","december"];
const TIME=/\b(?:0?[1-9]|1[0-2]):[0-5]\d\s*[AP]M\b/i;
const DATE=/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i;
const clean=(s:string)=>s.replace(/\s+/g," ").trim();
export const eventScheduleDate=(value:string):string=>{
 const m=clean(value).match(DATE);
 if(!m)return "";
 const month=months.indexOf(m[1]!.toLowerCase())+1;
 const day=Number(m[2]),year=Number(m[3]);
 if(!month||!day||day>31||!Number.isInteger(year))return "";
 const iso=year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
 return new Date(iso+"T12:00:00Z").toISOString().slice(0,10)===iso?iso:"";
};
const around=(items:ScheduleTextItem[],x:number,hi:number)=>clean(items.filter(i=>i.x>=x-9&&i.x<hi-9).map(i=>i.str).join(" "));
const wordX=(items:ScheduleTextItem[],rx:RegExp)=>items.find(i=>rx.test(clean(i.str)))?.x;
type Header={start:number;end:number;description:number;space:number;eventStart:number;eventId:number;status:number;attendance:number};
const headerFor=(items:ScheduleTextItem[]):Header|null=>{
 const names=items.map(i=>clean(i.str));
 const full=names.join(" ");
 if(!/Start Time/i.test(full)||!/End Time/i.test(full)||!/Description/i.test(full)||!/\bSpace\b/i.test(full)||!/Event ID/i.test(full))return null;
 const starts=items.filter(i=>/^Start Time/i.test(clean(i.str)));
 const ends=items.filter(i=>/^End Time/i.test(clean(i.str)));
 const description=wordX(items,/^Description$/i),space=wordX(items,/^Space$/i);
 const eventId=wordX(items,/^Event ID$/i);
 const status=wordX(items,/^Status(?:\s*-\s*Event)?$/i);
 const attendance=wordX(items,/^Contracted/i);
 if(!starts.length||!ends.length||description===undefined||space===undefined||eventId===undefined)return null;
 const first=starts[0]!.x,second=ends[0]!.x;
 const eventStart=starts[1]?.x ?? space+(eventId-space)*0.4;
 if(!(first<second&&second<description&&description<space&&space<eventId))return null;
 return {start:first,end:second,description,space,eventStart,eventId,status:status??eventId+40,attendance:attendance??eventId+100};
};
const normalizedTime=(value:string)=>clean(value).match(TIME)?.[0]?.replace(/\s+/g," ").toUpperCase()??"";
export function readShowPilotEventSchedulePages(pages:SchedulePdfPage[]):EventRow[]{
 const rows:EventRow[]=[];
 let header:Header|null=null,date="",eventName="",last:EventRow|null=null;
 for(const page of pages) {
  for(const raw of page) {
   const line=[...raw].filter(i=>clean(i.str)).sort((a,b)=>a.x-b.x);
   if(!line.length)continue;
   const txt=clean(line.map(i=>i.str).join(" "));
   const newHeader=headerFor(line);
   if(newHeader){header=newHeader;continue;}
   const day=eventScheduleDate(txt);
   if(day){date=day;eventName="";last=null;continue;}
   if(!header||!date||/^Page\s+\d+\s+of\s+\d+/i.test(txt)||/ShowPilot\s*-\s*Event Schedule/i.test(txt))continue;
   const times=txt.match(/\b(?:0?[1-9]|1[0-2]):[0-5]\d\s*[AP]M\b/gi)??[];
   const desc=around(line,header.description,header.space);
   const space=around(line,header.space,header.eventStart);
   if(times.length>=2&&desc&&space) {
    const id=around(line,header.eventId,header.status).match(/\b\d{4,7}\b/)?.[0]??"";
    // A misaligned event ID is safer as an empty ID than the attendance count.
    const status=around(line,header.status,header.attendance);
    last={level:2,usage:"",start:normalizedTime(times[0]!),end:normalizedTime(times[1]!),
      description:desc,space,event:eventName,
      ...(id?{eventId:id}:{}),...(status?{status}:{}),date};
    rows.push(last);
    continue;
   }
   // Wrapped descriptions are printed as new text rows in the description column.
   if(last&&desc&&!space&&line.every(i=>i.x>=header!.description-9&&i.x<header!.space-9)){
    last.description=clean(last.description+" "+desc);continue;
   }
   // An event group heading occupies the left edge of the page and has no
   // function times. The far-right attendance total must not become its name.
   const heading=line.filter(i=>i.x<header!.description-12);
   if(!times.length&&heading.length&&line.some(i=>i.x<=header!.start+8)&&!desc&&!space){
    eventName=clean(heading.map(i=>i.str).join(" "));last=null;
   }
  }
 }
 return rows;
}
