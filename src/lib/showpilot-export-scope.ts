import {reviewMonthOf,reviewWeekStart,type ReviewDateScope} from "./showpilot-review-months";
import type {EventEntry,TaskNote} from "./work-tools";

/** An export follows the currently selected review period, not the full upload.
 * Task AI may read adjacent weeks but they must never appear in a weekly export.
 */
export function scopedScheduleData(
  entries:readonly EventEntry[],tasks:readonly TaskNote[],scope:ReviewDateScope|null
):{entries:EventEntry[];tasks:TaskNote[];period:string;singleWeek:string|null}{
 const effective=scope??{view:"all" as const,value:""};
 const selected=(date:string)=>{
  if(effective.view==="all")return true;
  if(!effective.value)return false;
  if(effective.view==="week")return reviewWeekStart(date)===effective.value;
  if(effective.view==="month")return reviewMonthOf(date)===effective.value;
  return date===effective.value;
 };
 const matched=entries.filter(e=>selected(e.date));
 if(!matched.length)throw new Error("No reviewed events in the selected "+effective.view+" to export.");
 const matchedTasks=tasks.filter(t=>selected(t.date));
 return {
   entries:matched,
   tasks:matchedTasks,
   period:effective.view==="all"?"all":effective.view+"-"+effective.value,
   singleWeek:effective.view==="week"?effective.value:null
 };
}
