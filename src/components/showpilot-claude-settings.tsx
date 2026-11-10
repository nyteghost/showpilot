import {SHOW_STAFF,MARK_FLEX} from "@/lib/staffing";
import type {ClaudeStaffingSettings} from "@/lib/showpilot-claude-settings";
const DAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] as const;
export function ClaudeStaffingSettingsPanel({value,onChange}:{
 value:ClaudeStaffingSettings;onChange:(next:ClaudeStaffingSettings)=>void;
}){
 const update=(change:Partial<ClaudeStaffingSettings>)=>onChange({...value,...change});
 const people=[...SHOW_STAFF,MARK_FLEX];
 return <details className="rounded-lg border border-border p-3 text-xs" aria-label="Experimental staffing preferences">
  <summary className="cursor-pointer font-semibold">Claude scheduling preferences (experimental)</summary>
  <p className="my-2 text-muted-foreground">These affect suggested staffing only. Existing human-entered shifts, CGC-only filtering and approved schedules take precedence. Preferences are saved locally and included in work backups.</p>
  <div className="grid gap-2 sm:grid-cols-2">
   <label className="flex items-center gap-2"><input type="checkbox" checked={value.coverBookingClose}
    onChange={e=>update({coverBookingClose:e.target.checked})}/>Cover source booking close after last function (1 engineer)</label>
   <label className="flex items-center gap-2"><input type="checkbox" checked={value.respectExistingOff}
    onChange={e=>update({respectExistingOff:e.target.checked})}/>Respect human OFF in imported workbook (recommended)</label>
   <label className="flex items-center gap-2"><input type="checkbox" checked={value.managerRegularLine}
    onChange={e=>update({managerRegularLine:e.target.checked})}/>Suggest manager normal weekday line (9a–6p)</label>
   <label className="flex items-center gap-2"><input type="checkbox" checked={value.managerMayWorkAlone} disabled={!value.managerRegularLine}
    onChange={e=>update({managerMayWorkAlone:e.target.checked})}/>Allow manager to be sole coverage on a show</label>
   <label className="flex items-center gap-2">Attendance threshold (off if blank)
    <input className="w-24 rounded border border-border bg-background p-1" type="number" min="1" max="1000000"
     value={value.attendanceThreshold??""}
     onChange={e=>update({attendanceThreshold:e.target.value?Math.max(1,Math.min(1000000,Math.trunc(Number(e.target.value)||1))):null})}/>
   </label>
  </div>
  <p className="mb-2 mt-3 font-semibold">Preferred days off — soft preference, not a hard availability rule</p>
  <div className="space-y-2">
   {people.map(person=><div className="flex flex-wrap items-center gap-2" key={person.name}>
    <span className="w-40 font-medium">{person.name}</span>
    {DAYS.map((day,index)=>{
     const checked=(value.preferredDaysOffByName[person.name]??person.preferredDaysOff??[]).includes(index);
     return <label key={day} className="inline-flex items-center gap-1">
      <input type="checkbox" checked={checked} onChange={e=>{
       const prev=value.preferredDaysOffByName[person.name]??person.preferredDaysOff??[];
       const next=e.target.checked?[...new Set([...prev,index])].sort():prev.filter(x=>x!==index);
       update({preferredDaysOffByName:{...value.preferredDaysOffByName,[person.name]:next}});
      }}/>{day}
     </label>
    })}
    <span className="flex flex-wrap items-center gap-1 text-muted-foreground">Usual weekdays:
     {DAYS.map((day,index)=>{
      const checked=(value.usualWeekdaysByName[person.name]??person.baseline?.weekdays??[]).includes(index);
      return <label key={day} className="inline-flex items-center gap-1">
       <input type="checkbox" checked={checked} onChange={e=>{
        const prev=value.usualWeekdaysByName[person.name]??person.baseline?.weekdays??[];
        const next=e.target.checked?[...new Set([...prev,index])].sort():prev.filter(x=>x!==index);
        update({usualWeekdaysByName:{...value.usualWeekdaysByName,[person.name]:next}});
       }}/>{day}
      </label>;
     })}
    </span>
    <label className="flex items-center gap-1">Aliases:
      <input className="w-52 rounded border border-border bg-background p-1" aria-label={person.name+" aliases"}
       placeholder="Alternate names, comma separated" value={(value.aliasesByName[person.name]??[]).join(", ")}
       onChange={e=>update({aliasesByName:{...value.aliasesByName,
        [person.name]:e.target.value.split(",").map(x=>x.trim()).filter(Boolean).slice(0,8)}})}/>
    </label>
   </div>)}
  </div>
  <p className="mt-3 text-muted-foreground">A sixth day remains review-only; it is never added automatically. Confirm a new attendance threshold or solo-coverage permission against local staffing policy before relying on the resulting plan.</p>
 </details>;
}
