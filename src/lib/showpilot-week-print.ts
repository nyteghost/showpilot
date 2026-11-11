import {BALLROOM_ROWS,HALL_ROWS,expandSpace,isFunctionOnlyTitle,weekLayouts,
 type EventEntry,type TaskNote,type WeekLayout} from "./work-tools";
import {reviewWeekStart} from "./showpilot-review-months";

export type WeekPrintPreview={
 layout:WeekLayout;
 tasks:TaskNote[];
 unverifiedNames:number;
};

/** Draft printing is intentionally independent from advisory shared-room
 * notices. It must never make unnamed events look like verified bookings,
 * include another week, or plot a room outside the CGC template. */
export function printableWeek(
 entries:readonly EventEntry[],
 tasks:readonly TaskNote[],
 monday:string
):WeekPrintPreview{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(monday)||reviewWeekStart(monday)!==monday)
  throw new Error("Select a valid Monday–Sunday week first.");
 if(!entries.length)throw new Error("No events in the selected week to print.");
 const rooms=new Set([...HALL_ROWS,...BALLROOM_ROWS]);
 const out:EventEntry[]=[];
 let unverifiedNames=0;
 for(const e of entries){
  if(reviewWeekStart(e.date)!==monday)
   throw new Error("Only the currently selected week can be printed.");
  if(/cepac|cobb energy|performing arts/i.test(e.space))
   throw new Error("Unverified CGC room "+e.space+". Other-venue schedules cannot be printed.");
  const expanded=expandSpace(e.space);
  if(!expanded.length||expanded.some(space=>!rooms.has(space)))
   throw new Error("Unverified CGC room "+e.space+". Review the venue and room before printing.");
  const show=(e.showName??"").trim();
  const verified=show&&!isFunctionOnlyTitle(show)?show:
   !e.eventId&&!isFunctionOnlyTitle(e.title)&&e.title.trim()?e.title.trim():"";
  if(!verified)unverifiedNames++;
  const label=verified||"VERIFY parent event name"+(e.eventId?" (Event ID "+e.eventId+")":"");
  for(const space of expanded)out.push({...e,space,title:label,showName:label});
 }
 const layout=weekLayouts(out,[monday])[0];
 if(!layout)throw new Error("Could not produce the selected week.");
 return {layout,tasks:tasks.filter(t=>reviewWeekStart(t.date)===monday),unverifiedNames};
}
