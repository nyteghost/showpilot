import {useEffect,useMemo,useRef,useState} from "react";
import {CalendarDays,ChevronLeft,ChevronRight,FileText,FolderOpen,RefreshCw,AlertTriangle,Layers3} from "lucide-react";
import {Button} from "@/components/ui/button";
import {ShowPilotTodayChecklist} from "@/components/showpilot-today-checklist";
import {inferBallroomTransitions} from "@/lib/showpilot-ballroom-inference";
import type {EventRow} from "@/lib/work-tools";
import {loadDurableShowCatalog,type PostConShow} from "@/lib/showpilot-postcon";
import type {TaskNote} from "@/lib/work-tools";
import {parseZipSchedule,type ZipScheduleHint} from "@/lib/showpilot-zip-schedule";
import type {EventFileRecord} from "@/lib/showpilot-event-assets";
import {
 todayIso,addIsoDays,mondayFor,daysOfWeek,
 airwallsForEvent,scheduledWallChanges,wallTaskLabel,type AirwallAssessment
} from "@/lib/showpilot-today";
import {
 activitiesFromReviewProject,combineTodaySources,showHasActivityOnDay,isUnlinkedTodayShow,
 readEngineeringWeekWorkbook,type DailyActivity,type WorkbookWallTask
} from "@/lib/showpilot-today-sources";

type Attached=EventFileRecord&{available:boolean};
type Details={eocs:Attached[];airwalls:AirwallAssessment;error?:string};
const emptyAirwalls:AirwallAssessment={state:"unknown",findings:[]};
const fmt=(iso:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat("en-US",{
 ...options,timeZone:"UTC"
}).format(new Date(iso+"T12:00:00Z"));
const dayLabel=(day:string)=>fmt(day,{weekday:"short",month:"short",day:"numeric"});
const rangeLabel=(monday:string)=>fmt(monday,{month:"short",day:"numeric"})+" – "+
 fmt(addIsoDays(monday,6),{month:"short",day:"numeric",year:"numeric"});

function openSavedEvent(key:string){
 window.dispatchEvent(new CustomEvent("showpilot:navigate",{
  detail:{tab:"eventhub",eventKey:key,section:"documents"}
 }));
}

export function ShowPilotTodayPanel({active=true}:{active?:boolean}){
 const bridge=window.showpilotMemory;
 const [today,setToday]=useState(todayIso);
 const [week,setWeek]=useState(()=>mondayFor(todayIso()));
 const [shows,setShows]=useState<PostConShow[]>([]);
 const [scheduleActivities,setScheduleActivities]=useState<DailyActivity[]>([]);
 const [reviewRows,setReviewRows]=useState<EventRow[]>([]);
 const [workbookWalls,setWorkbookWalls]=useState<WorkbookWallTask[]>([]);
 const [sourceWarnings,setSourceWarnings]=useState<string[]>([]);
 const [uploadBusy,setUploadBusy]=useState(false);
 const uploadPicker=useRef<HTMLInputElement>(null);
 const [details,setDetails]=useState<Record<string,Details>>({});
 const [suggestions,setSuggestions]=useState<TaskNote[]>([]);
 const [loading,setLoading]=useState(true);
 const [warning,setWarning]=useState("");
 const [message,setMessage]=useState("");
 const [refreshToken,refresh]=useState(0);
 const thisWeek=mondayFor(today);
 const dates=useMemo(()=>daysOfWeek(week),[week]);
 const joined=useMemo(()=>combineTodaySources(shows,scheduleActivities),[shows,scheduleActivities]);
 const inferredLayouts=useMemo(()=>inferBallroomTransitions(scheduleActivities,reviewRows,shows),[scheduleActivities,reviewRows,shows]);
 const currentShows=useMemo(()=>joined.shows.filter(show=>showHasActivityOnDay(show,today,joined))
  .sort((a,b)=>a.showName.localeCompare(b.showName)),[joined,today]);
 const currentWeekShows=useMemo(()=>joined.shows.filter(show=>
  dates.some(date=>showHasActivityOnDay(show,date,joined))),[joined,dates]);
 const todayChanges=useMemo(()=>scheduledWallChanges(suggestions,today),[suggestions,today]);
 const todayWorkbookWalls=useMemo(()=>workbookWalls.filter(t=>t.date===today),[workbookWalls,today]);
 const todayUnmatched=useMemo(()=>joined.unlinkedFunctions.filter(f=>f.date===today),[joined,today]);
 const todayAirwalls=useMemo(()=>Object.fromEntries(currentShows.map(show=>[
   show.key,details[show.key]?.airwalls??emptyAirwalls
 ])),[currentShows,details]);

 useEffect(()=>{
  if(!active)return;
  const check=()=>{
   const next=todayIso();
   setToday(old=>old===next?old:next);
  };
  check();
  const timer=window.setInterval(check,60000);
  document.addEventListener("visibilitychange",check);
  return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",check);};
 },[active]);

 useEffect(()=>{
  if(!active)return;
  let live=true;
  setLoading(true);setWarning("");
  void (async()=>{
   try{
    const catalog=await loadDurableShowCatalog();
    if(!live)return;
    // First read the actual date-specific schedule. The SQLite show catalog
    // can have incomplete start/end ranges, so it is NOT sufficient for Today.
    const activities:DailyActivity[]=[];
    const warnings:string[]=[];
    let tasks:TaskNote[]=[];
    let acceptedReviewRows:EventRow[]=[];
    let walls:WorkbookWallTask[]=[];
    let snapshot:Awaited<ReturnType<NonNullable<typeof window.showpilotScheduleSession>["load"]>>=null;
    try{
     snapshot=await window.showpilotScheduleSession?.load()??null;
     if(snapshot){
      const extracted=activitiesFromReviewProject(snapshot.project);
      activities.push(...extracted.activities);
      tasks=extracted.airwalls;
      acceptedReviewRows=extracted.acceptedRows;
     }
    }catch(e){warnings.push("Saved schedule review could not be read: "+String(e));}
    try{
     const overview=await window.showpilotScheduleSession?.readOverviewWorkbook();
     // An explicitly imported Today workbook takes priority over historical
     // masters. Never re-date a workbook just to fill the Today dashboard.
     const bytes=overview??snapshot?.templateBytes??
      (await window.showpilotLocal?.readTemplate());
     if(bytes){
      const extracted=await readEngineeringWeekWorkbook(bytes);
      activities.push(...extracted.activities);
      walls=extracted.airwalls;
      warnings.push(...extracted.warnings);
     }
    }catch(e){warnings.push("Engineering workbook could not be read: "+String(e));}
    if(!live)return;
    const joinedSnapshot=combineTodaySources(catalog,activities);
    const needed=new Map<string,PostConShow>();
    for(const show of joinedSnapshot.shows){
     if(!joinedSnapshot.unlinkedKeys.includes(show.key)&&
       (daysOfWeek(week).some(date=>showHasActivityOnDay(show,date,joinedSnapshot))||
        showHasActivityOnDay(show,today,joinedSnapshot)))needed.set(show.key,show);
    }
    let items:(readonly [string,Details])[]=[];
    if(bridge){
     let notes:Awaited<ReturnType<typeof bridge.list>>=[];
     try{notes=await bridge.list("ZIP Schedule:");}catch{/* EOCs still work. */}
     items=await Promise.all([...needed.values()].map(async show=>{
      let eocs:Attached[]=[];
      let error="";
      try{
       const files=await bridge.eventFileList(show.key);
       eocs=files.filter(file=>file.kind==="eoc"&&!file.archived);
      }catch(e){error="Documents unavailable: "+String(e);}
      let hints:ZipScheduleHint[]=[];
      const prefix="ZIP Schedule: "+show.key+" · ";
      const note=notes.filter(n=>n.title.startsWith(prefix))
       .sort((a,b)=>b.modified.localeCompare(a.modified))[0];
      if(note){
       try{
        const saved=await bridge.read(note.id);
        const evidence=parseZipSchedule(saved.content);
        if(evidence?.eventKey===show.key)hints=evidence.hints;
       }catch{/* Optional ZIP index must not block the actual EOC file. */}
      }
      return [show.key,{eocs,airwalls:airwallsForEvent(eocs,hints),
       ...(error?{error}:{})}] as const;
     }));
    }
    if(live){
     setShows(catalog);setScheduleActivities(activities);setReviewRows(acceptedReviewRows);
     setDetails(Object.fromEntries(items));
     setSuggestions(tasks);setWorkbookWalls(walls);setSourceWarnings(warnings);
     if(!bridge)setWarning("EOC links require the ShowPilot portable desktop app. Saved schedule activity can still be viewed.");
    }
   }catch(e){
    if(live)setWarning("Could not read saved Events: "+(e instanceof Error?e.message:String(e)));
   }finally{if(live)setLoading(false);}
  })();
  return ()=>{live=false;};
 },[active,week,today,refreshToken,bridge]);

 useEffect(()=>{
  if(!active)return;
  const onData=()=>refresh(n=>n+1);
  window.addEventListener("showpilot:postcon-catalog",onData);
  window.addEventListener("showpilot:event-files-updated",onData);
  window.addEventListener("showpilot:schedule-autosaved",onData);
  return ()=>{
   window.removeEventListener("showpilot:postcon-catalog",onData);
   window.removeEventListener("showpilot:event-files-updated",onData);
   window.removeEventListener("showpilot:schedule-autosaved",onData);
  };
 },[active]);

 const importEngineeringWorkbook=async(file:File)=>{
  if(uploadBusy)return;
  setUploadBusy(true);setMessage("");
  try{
   if(!/\.xlsx$/i.test(file.name)||file.size<100||file.size>30*1024*1024)
    throw Error("Select an original .xlsx engineering workbook under 30 MB.");
   const bytes=await file.arrayBuffer();
   const parsed=await readEngineeringWeekWorkbook(bytes);
   if(!parsed.activities.length&&!parsed.airwalls.length)
    throw Error(parsed.warnings.join(" ")||"The workbook has no dated CGC engineering events.");
   if(!window.showpilotScheduleSession)
    throw Error("Saving the weekly workbook requires the portable ShowPilot desktop app.");
   await window.showpilotScheduleSession.saveOverviewWorkbook(bytes);
   setMessage("Weekly engineering workbook saved locally: "+parsed.activities.length+
    " dated activity record(s). Today and the week view will now use its actual dates.");
   refresh(n=>n+1);
  }catch(e){setMessage("Workbook not imported: "+(e instanceof Error?e.message:String(e)));}
  finally{setUploadBusy(false);if(uploadPicker.current)uploadPicker.current.value="";}
 };
 const openEoc=async(file:Attached)=>{
  if(!bridge||!file.available)return;
  setMessage("");
  try{await bridge.eventFileOpen(file.id);}
  catch(e){setMessage("Could not open "+file.name+": "+(e instanceof Error?e.message:String(e)));}
 };
 const badge=(assessment:AirwallAssessment)=>
  assessment.state==="action"?"Airwall action mentioned":
  assessment.state==="review"?"Airwall note — review":
  assessment.state==="explicit-none"?"No change stated — verify":"Not specified";
 const detail=(show:PostConShow)=>details[show.key]??{eocs:[],airwalls:emptyAirwalls};
 const wallEvidenceCount=currentShows.filter(s=>{
  const state=detail(s).airwalls.state;return state==="action"||state==="review";
 }).length;
 const eocCount=currentShows.filter(s=>detail(s).eocs.some(f=>f.available)).length;

 return <section className="space-y-5" aria-label="Today and weekly event overview">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays size={20}/> Today · {fmt(today,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</h2>
    <p className="text-sm text-muted-foreground">Today combines saved Event records with actual dated activity from Event Schedule and the engineering Excel workbook. EOC links attach only to confirmed Events records.</p>
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <input ref={uploadPicker} className="sr-only" type="file" accept=".xlsx" aria-label="Choose dated weekly engineering Excel workbook"
     onChange={e=>{const file=e.target.files?.[0];if(file)void importEngineeringWorkbook(file);}}/>
    <Button size="sm" variant="outline" disabled={uploadBusy} onClick={()=>uploadPicker.current?.click()}>
     {uploadBusy?"Importing workbook…":"Use engineering workbook"}
    </Button>
    <Button size="sm" variant="outline" disabled={loading} onClick={()=>refresh(n=>n+1)}>
     <RefreshCw size={15}/>{loading?"Loading…":"Refresh Events"}
    </Button>
   </div>
  </div>
  {warning&&<p role="alert" className="rounded-lg border border-amber-500 p-3 text-sm">{warning}</p>}
  {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
  {(sourceWarnings.length>0||inferredLayouts.warnings.length>0)&&<div className="rounded-lg border border-amber-500 p-3 text-xs" role="status">
   {[...sourceWarnings,...inferredLayouts.warnings].map((warning,i)=><p key={i}>{warning}</p>)}
  </div>}
  <div className="grid gap-3 sm:grid-cols-3">
   <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Actual shows on today's date</p>
    <strong className="text-2xl tabular-nums">{currentShows.length}</strong></div>
   <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Shows with attached EOCs</p>
    <strong className="text-2xl tabular-nums">{eocCount}</strong></div>
   <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Events with airwall notes</p>
    <strong className="text-2xl tabular-nums">{wallEvidenceCount}</strong></div>
  </div>
  {loading&&<p role="status" className="text-sm text-muted-foreground">Loading the local event catalog and EOC notes…</p>}
  {!loading&&<ShowPilotTodayChecklist key={today} day={today} shows={currentShows}
   airwalls={todayAirwalls} workbookWalls={todayWorkbookWalls} suggestions={todayChanges}
   transitions={inferredLayouts.transitions}/>}
  {!loading&&!warning&&currentShows.length===0&&<div className="rounded-xl border p-5">
   <strong>No saved CGC activity is available for today's date.</strong>
   <p className="mt-1 text-sm text-muted-foreground">Use engineering workbook above to import the dated Excel schedule, or import an Ungerboeck Event Schedule. No saved activity does not mean the building is inactive.</p>
   <Button className="mt-3" variant="outline" size="sm" onClick={()=>
    window.dispatchEvent(new CustomEvent("showpilot:navigate",{detail:{tab:"events"}}))
   }>Open Event Schedule</Button>
  </div>}
  <div className="space-y-3">
   {currentShows.map(show=>{
    const info=detail(show);
    const report=info.airwalls;
    const unlinked=isUnlinkedTodayShow(show,joined);
    const dayDetails=joined.daily[show.key]?.[today]??[];
    return <article key={show.key} className="rounded-xl border p-4 space-y-3">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
       <h3 className="font-semibold">{show.showName}</h3>
       <p className="text-xs text-muted-foreground">Event {show.eventId?"#"+show.eventId:"(no ID)"} · {show.rooms||"Rooms not listed"}</p>
       <p className="text-xs text-muted-foreground">{show.startDate??show.showDate} – {show.showDate}</p>
       {joined.origin[show.key]&&<p className="text-xs text-muted-foreground">Today's source: {joined.origin[show.key]==="engineering-workbook"?"engineering Excel workbook":"reviewed Event Schedule"}</p>}
       {dayDetails.length>0&&<p className="mt-2 text-xs font-medium break-words">Today: {dayDetails.join(" · ")}</p>}
      </div>
      {unlinked?<span className="text-xs text-amber-600">Schedule-only entry · no linked Event ID/EOC</span>:
       <Button size="sm" variant="outline" onClick={()=>openSavedEvent(show.key)}><FolderOpen size={15}/> View in Events</Button>}
     </div>
     <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-2 rounded-lg border p-3">
       <h4 className="flex items-center gap-2 text-sm font-semibold"><FileText size={16}/> Event Order Confirmation</h4>
       {unlinked?<p className="text-xs text-muted-foreground">Not linked to a saved Events record. Import this show's Event ID to link its EOC.</p>:info.eocs.length?info.eocs.map(file=>
        <div key={file.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs">
         <span className="min-w-0 break-all">{file.name}{!file.available?" (file unavailable)":""}</span>
         <Button size="sm" variant="outline" disabled={!file.available} onClick={()=>void openEoc(file)}>
          Open EOC
         </Button>
        </div>):<p className="text-xs text-muted-foreground">No EOC attached. Open this event to add or review its documents.</p>}
       {info.error&&<p className="text-xs text-amber-600">{info.error}</p>}
      </div>
      <div className="space-y-2 rounded-lg border p-3">
       <h4 className="flex items-center gap-2 text-sm font-semibold"><Layers3 size={16}/> Airwalls</h4>
       <p className={"text-xs font-semibold "+(report.state==="action"?"text-amber-600":"text-muted-foreground")}>{badge(report)}</p>
       {report.findings.length?<>
        {report.findings.slice(0,4).map((finding,i)=>
         <div key={i} className="border-t pt-2 text-xs">
          <p className="whitespace-pre-wrap break-words">{finding.text}</p>
          <span className="text-muted-foreground">{finding.source}{finding.page?" · PDF page "+finding.page:""}</span>
          {finding.fileId&&info.eocs.some(f=>f.id===finding.fileId&&f.available)&&
           <button type="button" className="ml-2 text-primary underline" onClick={()=>
            void openEoc(info.eocs.find(f=>f.id===finding.fileId)!)
           }>Open source EOC</button>}
         </div>)}
       </>:<p className="text-xs text-muted-foreground">No airwall instruction found in indexed EOC/ZIP notes. Check the full EOC and room setup before concluding no movement is needed.</p>}
       <p className="text-xs text-muted-foreground">Document notes may describe setup for any day of the event. Verify the required move and timing.</p>
      </div>
     </div>
    </article>;
   })}
  </div>
  {todayUnmatched.length>0&&<details className="rounded-xl border border-amber-500/60 p-3">
   <summary className="cursor-pointer font-medium text-sm">Functions needing Event ID review today ({todayUnmatched.length})</summary>
   <p className="mt-2 text-xs text-muted-foreground">These are engineering functions, not additional shows. ShowPilot could not identify a unique event using the saved EOC/Event ID or date and room evidence.</p>
   <div className="mt-2 space-y-1">{todayUnmatched.map((f,i)=>
    <p key={i} className="text-xs">{f.showName} · {f.rooms.join(", ")}{f.details.length?" · "+f.details.join(" · "):""}</p>
   )}</div>
  </details>}
  <section className="space-y-3" aria-label="Scheduled airwall changes today">
   <h3 className="flex items-center gap-2 font-semibold"><AlertTriangle size={18}/> Airwall changes suggested for today</h3>
   {(todayChanges.length>0||todayWorkbookWalls.length>0||inferredLayouts.transitions.some(t=>today>=t.afterDate&&today<=t.needByDate))?<div className="rounded-lg border border-amber-500 p-3 space-y-1">
    {inferredLayouts.transitions.filter(t=>today>=t.afterDate&&today<=t.needByDate).map(t=><p key={t.id} className="text-sm">
     <strong>Inferred airwall handoff:</strong> Make {t.target} and verify lighting — after {t.afterDate}, before {t.needByDate}. Confirm the source EOC and access window.
    </p>)}
    {todayWorkbookWalls.map((task,i)=><p key={"workbook-"+i} className="text-sm">
     <strong>Engineering workbook:</strong> {task.text} ({task.section==="HALLS"?"Halls":"Ballrooms"}) — verify before moving
    </p>)}
    {todayChanges.map((task,i)=><p key={"suggestion-"+i} className="text-sm">
     <strong>Schedule suggestion:</strong> {wallTaskLabel(task)} — check layout before moving
    </p>)}
    <p className="text-xs text-muted-foreground">Workbook tasks retain their original dated Excel instructions. Other suggestions come from the locally saved Event Schedule. Confirm room configuration and timing in the EOC.</p>
   </div>:<p className="rounded-lg border p-3 text-sm text-muted-foreground">No dated airwall-change suggestion is available from the last saved Event Schedule. This is not confirmation that no walls need moving.</p>}
  </section>
  <section className="space-y-3" aria-label="Easy seven-day event view">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
     <h3 className="text-lg font-semibold">Week at a glance</h3>
     <p className="text-sm text-muted-foreground">{rangeLabel(week)} · Monday–Sunday · {currentWeekShows.length} named CGC shows{joined.unlinkedFunctions.some(f=>dates.includes(f.date))?" · unmatched functions listed separately":""}</p>
    </div>
    <div className="flex items-center gap-2">
     <Button variant="outline" size="sm" onClick={()=>setWeek(addIsoDays(week,-7))} aria-label="Previous week"><ChevronLeft size={16}/></Button>
     <Button variant="outline" size="sm" onClick={()=>setWeek(thisWeek)} disabled={week===thisWeek}>This week</Button>
     <Button variant="outline" size="sm" onClick={()=>setWeek(addIsoDays(week,7))} aria-label="Next week"><ChevronRight size={16}/></Button>
    </div>
   </div>
   <div className="overflow-x-auto rounded-xl border" role="region" aria-label="Seven day CGC Events calendar" tabIndex={0}>
    <div className="grid min-w-[940px] grid-cols-7 divide-x">
     {dates.map(date=>{
      const dayShows=currentWeekShows.filter(s=>showHasActivityOnDay(s,date,joined));
      const wallChanges=scheduledWallChanges(suggestions,date);
      const unmatched=joined.unlinkedFunctions.filter(f=>f.date===date);
      const sheetWalls=workbookWalls.filter(t=>t.date===date);
      const plannedMoves=inferredLayouts.transitions.filter(t=>date>=t.afterDate&&date<=t.needByDate);
      const isToday=date===today;
      return <div key={date} className={"min-h-52 p-2 space-y-2 "+(isToday?"bg-primary/5":"")}>
       <div className="border-b pb-2">
        <p className={"text-xs font-semibold "+(isToday?"text-primary":"")}>{dayLabel(date)}{isToday?" · Today":""}</p>
        <p className="text-xs text-muted-foreground">{dayShows.length} show{dayShows.length===1?"":"s"}{unmatched.length?" · "+unmatched.length+" function(s) to match":""}</p>
       </div>
       {dayShows.map(show=>{
        const unlinked=isUnlinkedTodayShow(show,joined);
        const report=detail(show);
        const hasEoc=report.eocs.some(f=>f.available);
        const wall=report.airwalls.state;
        return <button type="button" key={show.key} onClick={()=>unlinked?
         window.dispatchEvent(new CustomEvent("showpilot:navigate",{detail:{tab:"events"}})):openSavedEvent(show.key)}
         className="block w-full rounded-md border p-2 text-left text-xs hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
         <strong className="block break-words">{show.showName}</strong>
         <span className="mt-1 block text-muted-foreground break-words">{show.rooms}</span>
         <span className="mt-1 block text-muted-foreground">{unlinked?"Schedule only · match Event ID to attach EOC":hasEoc?"EOC attached":"EOC missing"}</span>
         {(joined.daily[show.key]?.[date]?.length??0)>0&&<span className="mt-1 block text-muted-foreground">{joined.daily[show.key]![date]!.slice(0,3).join(" · ")}</span>}
         {(wall==="action"||wall==="review")&&<span className="mt-1 block font-semibold text-amber-600">Airwall note — review</span>}
        </button>;
       })}
       {unmatched.length>0&&<details className="rounded-md border border-amber-500/70 p-2 text-xs">
        <summary className="cursor-pointer font-semibold">Functions to match ({unmatched.length})</summary>
        <div className="mt-2 space-y-2">
         {unmatched.map((f,i)=><div key={i}>
          <strong className="break-words">{f.showName}</strong>
          <p className="text-muted-foreground break-words">{f.rooms.join(", ")}{f.details.length?" · "+f.details.join(" · "):""}</p>
         </div>)}
         <p className="text-muted-foreground">No event assigned; verify the EOC or Event Schedule ID before linking.</p>
        </div>
       </details>}
       {plannedMoves.map(t=><div key={t.id} className="rounded-md border border-amber-500 px-2 py-1 text-xs">
        <strong>Airwall setup window</strong>
        <p>Make {t.target}</p><p>Then verify lighting</p>
        <p className="text-muted-foreground">After {t.afterDate}, before {t.needByDate}; verify EOC and room availability.</p>
       </div>)}
       {sheetWalls.map((task,i)=><div key={"sheet-wall-"+i} className="rounded-md border border-amber-500 px-2 py-1 text-xs">
        <strong>Engineering task</strong><p>{task.text}</p>
       </div>)}
       {wallChanges.map((task,i)=><div key={"wall-"+i} className="rounded-md border border-amber-500 px-2 py-1 text-xs">
        <strong>Airwall suggestion</strong><p>{wallTaskLabel(task)}</p>
       </div>)}
       {!dayShows.length&&!wallChanges.length&&!sheetWalls.length&&!plannedMoves.length&&<p className="text-xs text-muted-foreground">No saved events</p>}
      </div>;
     })}
    </div>
   </div>
   <p className="text-xs text-muted-foreground">Functions are grouped under named shows using a matching Event ID or a unique same-day room match; inferred matches say “verify”. Functions without an unambiguous match are separate and do not count as shows. The saved Events catalog and EOCs are never edited by this view. Verify airwall work in the EOC and current room setup.</p>
  </section>
 </section>;
}
