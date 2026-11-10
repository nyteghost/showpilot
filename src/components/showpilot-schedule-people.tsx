import {useState} from "react";
import {SHOW_STAFF,MARK_FLEX,ON_CALL} from "@/lib/staffing";
import {ENGINEER_ROSTER} from "@/lib/work-tools";
import {CustomSchedulePersonSchema,ScheduleDayOverrideSchema,type ClaudeStaffingSettings} from "@/lib/showpilot-claude-settings";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

const WEEKDAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const readClock=(value:string)=>{
 const match=/^(\d{2}):(\d{2})$/.exec(value);
 if(!match)return null;
 const hours=Number(match[1]),minutes=Number(match[2]);
 return hours<=23&&minutes<=59?hours*60+minutes:null;
};
const asClock=(value:number)=>String(Math.floor(value%1440/60)).padStart(2,"0")+":"+String(value%60).padStart(2,"0");
export function SchedulePeopleEditor({value,onChange}:{value:ClaudeStaffingSettings;onChange:(next:ClaudeStaffingSettings)=>void}){
 const [newName,setNewName]=useState("");
 const [newBadge,setNewBadge]=useState("");
 const [newTitle,setNewTitle]=useState("Show Services Engineer");
 const [newStart,setNewStart]=useState("08:00");
 const [newEnd,setNewEnd]=useState("16:30");
 const [newWeekdays,setNewWeekdays]=useState([0,1,2,3,4]);
 const [newNotAlone,setNewNotAlone]=useState(true);
 const [removing,setRemoving]=useState<string|null>(null);
 const [confirmText,setConfirmText]=useState("");
 const [date,setDate]=useState("");
 const [person,setPerson]=useState("");
 const [kind,setKind]=useState<"shift"|"off">("shift");
 const [start,setStart]=useState("08:00");
 const [end,setEnd]=useState("16:30");
 const [feedback,setFeedback]=useState("");
 const defaults=[...SHOW_STAFF,MARK_FLEX,ON_CALL];
 const all=[...defaults,...value.extraPeople];
 const disabled=new Set(value.excludedPeople.map(x=>x.toLowerCase()));
 const available=all.filter(x=>!disabled.has(x.name.toLowerCase()));
 const update=(part:Partial<ClaudeStaffingSettings>)=>{
  onChange({...value,...part});setFeedback("");
 };
 const addPerson=()=>{
  const startMinute=readClock(newStart),endMinute=readClock(newEnd);
  if(startMinute===null||endMinute===null){setFeedback("Enter valid shift hours.");return;}
  const realEnd=endMinute<=startMinute?endMinute+1440:endMinute;
  const draft=CustomSchedulePersonSchema.safeParse({name:newName,badge:newBadge,title:newTitle,
   start:startMinute,end:realEnd,usualWeekdays:newWeekdays,notAlone:newNotAlone});
  if(!draft.success){setFeedback(draft.error.issues[0]?.message??"Check the person and shift.");return;}
  if(ENGINEER_ROSTER.some(p=>p.name.toLowerCase()===newName.trim().toLowerCase())||
     all.some(p=>p.name.toLowerCase()===newName.trim().toLowerCase())){
    setFeedback("That person is already listed. Use the Restore button instead, or choose a unique name.");return;
  }
  update({extraPeople:[...value.extraPeople,draft.data]});
  setNewName("");setNewBadge("");setFeedback("Person added to new scheduling plans. No source workbook was changed.");
 };
 const confirmRemoval=()=>{
  if(!removing||confirmText!=="REMOVE")return;
  // Preserve custom records so Restore is always possible.
  // Preserve approved manual instructions for a later Restore, too.
  update({excludedPeople:[...new Set([...value.excludedPeople,removing])]});
  setRemoving(null);setConfirmText("");
  setFeedback("Removed from new schedules. Existing published workbook cells remain unchanged.");
 };
 const restore=(name:string)=>{
  update({excludedPeople:value.excludedPeople.filter(x=>x.toLowerCase()!==name.toLowerCase())});
  setFeedback("Restored to future scheduling suggestions.");
 };
 const applyDate=()=>{
  if(!person||!date){setFeedback("Choose a person and a date.");return;}
  let partial={date,name:person,action:kind} as const;
  const startMin=readClock(start),endMin=readClock(end);
  const normalizedEnd=startMin!==null&&endMin!==null&&endMin<=startMin?endMin+1440:endMin;
  const draft=kind==="off"
   ?ScheduleDayOverrideSchema.safeParse(partial)
   :ScheduleDayOverrideSchema.safeParse({...partial,start:startMin,end:normalizedEnd});
  if(!draft.success){setFeedback(draft.error.issues[0]?.message??"Review your date and shift hours.");return;}
  update({dayOverrides:[...value.dayOverrides.filter(x=>x.date!==date||x.name.toLowerCase()!==person.toLowerCase()),draft.data]});
  setFeedback("Day instruction saved. Re-export to see its effect; master-workbook shifts take precedence.");
 };
 const dayNames=(items:number[])=>items.map(i=>WEEKDAYS[i]??"").join(", ");
 return <details className="rounded-lg border border-border p-3 text-xs" aria-label="Schedule People">
  <summary className="cursor-pointer font-semibold">Schedule People — add, remove and edit days</summary>
  <p className="mt-2 text-muted-foreground">Change who the planner can suggest for future CGC schedules. Nobody is deleted from your uploaded master, published schedules or Google Calendar. Removed people can be restored.</p>
  <h4 className="mt-3 font-semibold">Active scheduling people</h4>
  <div className="mt-2 space-y-1">
   {all.map(p=><div key={p.name} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1">
     <span><strong>{p.name}</strong> <span className="text-muted-foreground">— {p.title}{("usualWeekdays" in p)?" · "+dayNames(p.usualWeekdays):""}</span>
      {disabled.has(p.name.toLowerCase())?" (removed from new schedules)":""}
     </span>
     {disabled.has(p.name.toLowerCase())
      ?<Button size="sm" variant="outline" onClick={()=>restore(p.name)}>Restore</Button>
      :<Button size="sm" variant="outline" onClick={()=>{setRemoving(p.name);setConfirmText("");}}>Remove</Button>}
    </div>)}
  </div>
  {removing&&<div role="alert" className="mt-2 space-y-2 rounded border border-amber-500 p-3">
   <p>Remove <strong>{removing}</strong> from new scheduling suggestions? Existing approved and typed shifts will NOT be erased. Their saved person details remain available for Restore.</p>
   <label className="block">Type <strong>REMOVE</strong> to confirm.</label>
   <Input aria-label="Confirm remove schedule person" value={confirmText} onChange={e=>setConfirmText(e.target.value)} className="max-w-44"/>
   <div className="flex gap-2">
    <Button size="sm" variant="destructive" disabled={confirmText!=="REMOVE"} onClick={confirmRemoval}>Confirm removal</Button>
    <Button size="sm" variant="outline" onClick={()=>setRemoving(null)}>Cancel</Button>
   </div>
  </div>}
  <h4 className="mt-4 font-semibold">Add a person</h4>
  <div className="mt-2 grid gap-2 sm:grid-cols-2">
   <label>Name<Input aria-label="New schedule person name" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Full name"/></label>
   <label>Role<Input aria-label="New schedule person role" value={newTitle} onChange={e=>setNewTitle(e.target.value)}/></label>
   <label>Badge (optional)<Input aria-label="New schedule person badge" value={newBadge} onChange={e=>setNewBadge(e.target.value)}/></label>
   <div className="flex gap-2">
    <label>Usual start<Input type="time" aria-label="New person usual start" value={newStart} onChange={e=>setNewStart(e.target.value)}/></label>
    <label>Usual end<Input type="time" aria-label="New person usual end" value={newEnd} onChange={e=>setNewEnd(e.target.value)}/></label>
   </div>
  </div>
  <div className="mt-2 flex flex-wrap gap-2">{WEEKDAYS.map((day,i)=><label key={day} className="flex items-center gap-1">
   <input type="checkbox" checked={newWeekdays.includes(i)} onChange={e=>setNewWeekdays(old=>e.target.checked?[...old,i].sort():old.filter(x=>x!==i))}/>{day}
  </label>)}</div>
  <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={newNotAlone} onChange={e=>setNewNotAlone(e.target.checked)}/>Requires another engineer on a show (recommended)</label>
  <div className="mt-2"><Button size="sm" onClick={addPerson}>Add to scheduling roster</Button></div>
  <h4 className="mt-4 font-semibold">Change a specific day (reviewed override)</h4>
  <p className="mt-1 text-muted-foreground">Add a specific shift or mark someone OFF for a date in newly generated plans. If the source workbook already contains a shift or PTO, its entry wins and the change is flagged in Staffing Why. Manual shift changes may exceed a normal week; verify before publishing.</p>
  <div className="mt-2 grid gap-2 sm:grid-cols-2">
   <label>Date<Input type="date" aria-label="Schedule override date" value={date} onChange={e=>setDate(e.target.value)}/></label>
   <label>Person<select aria-label="Schedule override person" className="block w-full rounded border border-border bg-background p-2" value={person} onChange={e=>setPerson(e.target.value)}>
    <option value="">Select person</option>
    {available.filter(p=>p.name!==ON_CALL.name&&(p.name!==MARK_FLEX.name||value.managerRegularLine)).map(p=><option key={p.name} value={p.name}>{p.name}</option>)}
   </select></label>
   <label>Action<select aria-label="Schedule override action" className="block w-full rounded border border-border bg-background p-2" value={kind} onChange={e=>setKind(e.target.value as "off"|"shift")}>
    <option value="shift">Add this shift</option><option value="off">Mark OFF for this day</option>
   </select></label>
   {kind==="shift"&&<div className="flex gap-2">
    <label>Start<Input type="time" aria-label="Manual schedule start" value={start} onChange={e=>setStart(e.target.value)}/></label>
    <label>End<Input type="time" aria-label="Manual schedule end" value={end} onChange={e=>setEnd(e.target.value)}/></label>
   </div>}
  </div>
  <Button size="sm" className="mt-2" onClick={applyDate}>Save day instruction</Button>
  {value.dayOverrides.length>0&&<div className="mt-3 space-y-1">
    <strong>Saved day instructions</strong>
    {value.dayOverrides.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(x=><div key={x.name+x.date} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1">
      <span>{x.date} · {x.name} — {x.action==="off"?"OFF":asClock(x.start!)+"–"+asClock(x.end!)+" (manual)"}</span>
      <Button size="sm" variant="outline" onClick={()=>update({dayOverrides:value.dayOverrides.filter(z=>z!==x)})}>Undo</Button>
    </div>)}
  </div>}
  {feedback&&<p role="status" className="mt-2 text-sm">{feedback}</p>}
  <p className="mt-3 text-muted-foreground">For additions missing from your approved master workbook, use Download week (fresh layout), or add an authorized three-row staff block to the master before merging. The original master is never automatically restructured.</p>
 </details>;
}
