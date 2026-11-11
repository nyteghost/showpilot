import {useEffect,useRef} from "react";
import {createPortal} from "react-dom";
import {BALLROOM_ROWS,HALL_ROWS,type EventEntry,type TaskNote} from "@/lib/work-tools";
import {printableWeek} from "@/lib/showpilot-week-print";

/** The only content mounted outside #root while the browser print dialog is
 * active. Does not change reviewed entries, workbook data, or bookings. */
export function ShowPilotWeekPrint({week,entries,tasks,onClose}:{
 week:string;entries:EventEntry[];tasks:TaskNote[];onClose:()=>void;
}){
 const close=useRef(onClose);
 close.current=onClose;
 const view=printableWeek(entries,tasks,week);
 useEffect(()=>{
  const oldTitle=document.title;
  document.title="ShowPilot DRAFT weekly schedule "+week;
  const after=()=>{document.title=oldTitle;close.current();};
  window.addEventListener("afterprint",after);
  // Give the portal one paint before invoking the native print preview.
  const timer=window.setTimeout(()=>window.print(),120);
  return ()=>{
   window.clearTimeout(timer);
   window.removeEventListener("afterprint",after);
   document.title=oldTitle;
  };
 },[week]);
 const {layout}=view;
 const dates=layout.dates;
 const rows=(rooms:string[])=><>
  {rooms.map(room=><tr key={room}>
   <th scope="row">{room}</th>
   {dates.map((date,i)=><td key={date}>{layout.rows[room]?.[i]?.text??""}</td>)}
  </tr>)}
 </>;
 return createPortal(<section className="sp-week-print-sheet" aria-label="Printable CGC weekly schedule">
  <header className="sp-week-print-header">
   <h1>COBB GALLERIA CENTRE — Engineering Weekly Schedule</h1>
   <p>Week of {dates[0]} through {dates[6]} · DRAFT — verify event bookings and crew coverage before use</p>
   {view.unverifiedNames>0&&<p className="sp-week-print-warning">
    {view.unverifiedNames} activity/activities still lack verified parent event names. They are labeled VERIFY and must be checked against the EOC.
   </p>}
  </header>
  <table className="sp-week-print-table">
   <thead><tr><th scope="col">CGC area</th>{dates.map((date,i)=><th key={date} scope="col">
    {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]} {date.slice(5)}
   </th>)}</tr></thead>
   <tbody>
    <tr className="sp-week-print-section"><th colSpan={8}>EXHIBIT HALLS</th></tr>
    {rows(HALL_ROWS)}
    <tr className="sp-week-print-section"><th colSpan={8}>BALLROOMS</th></tr>
    {rows(BALLROOM_ROWS)}
   </tbody>
  </table>
  {view.tasks.length>0&&<div className="sp-week-print-tasks">
   <h2>Review-only setup / airwall suggestions</h2>
   {view.tasks.map((task,i)=><p key={i}>{task.date} · {task.section}: {task.text}</p>)}
  </div>}
  <p className="sp-week-print-footer">PRINT COPY — operational changes and physical wall movements require human review. Shared-room alerts may be hidden on screen but are not approved or removed.</p>
 </section>,document.body);
}
