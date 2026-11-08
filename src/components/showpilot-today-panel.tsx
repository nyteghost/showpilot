import {useEffect,useMemo,useState} from "react";
import {CalendarDays,ChevronLeft,ChevronRight,FileText,FolderOpen,RefreshCw,AlertTriangle,Layers3} from "lucide-react";
import {Button} from "@/components/ui/button";
import {loadDurableShowCatalog,type PostConShow} from "@/lib/showpilot-postcon";
import {isCancelledRow,isPendingRow,airwallTasks,type TaskNote} from "@/lib/work-tools";
import {scopeShowPilotRows} from "@/lib/showpilot-venue";
import {parseZipSchedule,type ZipScheduleHint} from "@/lib/showpilot-zip-schedule";
import type {EventFileRecord} from "@/lib/showpilot-event-assets";
import {
 todayIso,addIsoDays,mondayFor,daysOfWeek,cgcShowOnDay,cgcShowsForWeek,
 airwallsForEvent,scheduledWallChanges,wallTaskLabel,type AirwallAssessment
} from "@/lib/showpilot-today";

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
 const [details,setDetails]=useState<Record<string,Details>>({});
 const [suggestions,setSuggestions]=useState<TaskNote[]>([]);
 const [loading,setLoading]=useState(true);
 const [warning,setWarning]=useState("");
 const [message,setMessage]=useState("");
 const [refreshToken,refresh]=useState(0);
 const thisWeek=mondayFor(today);
 const dates=useMemo(()=>daysOfWeek(week),[week]);
 const currentShows=useMemo(()=>shows.filter(show=>cgcShowOnDay(show,today))
  .sort((a,b)=>a.showName.localeCompare(b.showName)),[shows,today]);
 const currentWeekShows=useMemo(()=>cgcShowsForWeek(shows,week),[shows,week]);
 const todayChanges=useMemo(()=>scheduledWallChanges(suggestions,today),[suggestions,today]);

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
    setShows(catalog);
    const needed=new Map<string,PostConShow>();
    for(const show of [...cgcShowsForWeek(catalog,week),...catalog.filter(s=>cgcShowOnDay(s,today))])
     needed.set(show.key,show);
    if(!bridge){
     setDetails({});
     setSuggestions([]);
     setWarning("EOC links and airwall evidence require the ShowPilot portable desktop app.");
     return;
    }
    let notes:Awaited<ReturnType<typeof bridge.list>>=[];
    try{notes=await bridge.list("ZIP Schedule:");}catch{/* EOC evidence still works. */}
    const items=await Promise.all([...needed.values()].map(async show=>{
     let eocs:Attached[]=[];
     let error="";
     try{
      const attachments=await bridge.eventFileList(show.key);
      eocs=attachments.filter(file=>file.kind==="eoc"&&!file.archived);
     }catch(e){error="Documents unavailable: "+String(e);}
     let hints:ZipScheduleHint[]=[];
     const prefix="ZIP Schedule: "+show.key+" · ";
     const matching=notes.filter(note=>note.title.startsWith(prefix))
       .sort((a,b)=>b.modified.localeCompare(a.modified))[0];
     if(matching){
      try{
       const saved=await bridge.read(matching.id);
       const evidence=parseZipSchedule(saved.content);
       if(evidence?.eventKey===show.key)hints=evidence.hints;
      }catch{/* Keep originals available even if an optional ZIP review note is unreadable. */}
     }
     return [show.key,{eocs,airwalls:airwallsForEvent(eocs,hints),...(error?{error}:{})}] as const;
    }));
    let tasks:TaskNote[]=[];
    try{
     const snapshot=await window.showpilotScheduleSession?.load();
     if(snapshot){
      const project=snapshot.project;
      const candidates=project.originalRows.filter(row=>!isCancelledRow(row));
      const scoped=scopeShowPilotRows(candidates,project.approvedSpaces).accepted;
      tasks=airwallTasks(scoped.filter(row=>project.includePending||!isPendingRow(row)));
     }
    }catch{/* EOC data remains authoritative even without a saved scheduling workspace. */}
    if(live){setDetails(Object.fromEntries(items));setSuggestions(tasks);}
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
  return ()=>{
   window.removeEventListener("showpilot:postcon-catalog",onData);
   window.removeEventListener("showpilot:event-files-updated",onData);
  };
 },[active]);

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
    <p className="text-sm text-muted-foreground">CGC shows from the saved Events catalog. Dates reflect the event's saved start–end range, not confirmed daily function times.</p>
   </div>
   <Button size="sm" variant="outline" disabled={loading} onClick={()=>refresh(n=>n+1)}>
    <RefreshCw size={15}/>{loading?"Loading…":"Refresh Events"}
   </Button>
  </div>
  {warning&&<p role="alert" className="rounded-lg border border-amber-500 p-3 text-sm">{warning}</p>}
  {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
  <div className="grid gap-3 sm:grid-cols-3">
   <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Shows on today's date</p>
    <strong className="text-2xl tabular-nums">{currentShows.length}</strong></div>
   <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Shows with attached EOCs</p>
    <strong className="text-2xl tabular-nums">{eocCount}</strong></div>
   <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Events with airwall notes</p>
    <strong className="text-2xl tabular-nums">{wallEvidenceCount}</strong></div>
  </div>
  {loading&&<p role="status" className="text-sm text-muted-foreground">Loading the local event catalog and EOC notes…</p>}
  {!loading&&!warning&&currentShows.length===0&&<div className="rounded-xl border p-5">
   <strong>No saved CGC shows cover today's date.</strong>
   <p className="mt-1 text-sm text-muted-foreground">Import an Ungerboeck Event Schedule or event ZIP to populate the Events catalog. This does not confirm the building has no activity.</p>
   <Button className="mt-3" variant="outline" size="sm" onClick={()=>
    window.dispatchEvent(new CustomEvent("showpilot:navigate",{detail:{tab:"events"}}))
   }>Open Event Schedule</Button>
  </div>}
  <div className="space-y-3">
   {currentShows.map(show=>{
    const info=detail(show);
    const report=info.airwalls;
    return <article key={show.key} className="rounded-xl border p-4 space-y-3">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
       <h3 className="font-semibold">{show.showName}</h3>
       <p className="text-xs text-muted-foreground">Event {show.eventId?"#"+show.eventId:"(no ID)"} · {show.rooms||"Rooms not listed"}</p>
       <p className="text-xs text-muted-foreground">{show.startDate??show.showDate} – {show.showDate}</p>
      </div>
      <Button size="sm" variant="outline" onClick={()=>openSavedEvent(show.key)}><FolderOpen size={15}/> View in Events</Button>
     </div>
     <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-2 rounded-lg border p-3">
       <h4 className="flex items-center gap-2 text-sm font-semibold"><FileText size={16}/> Event Order Confirmation</h4>
       {info.eocs.length?info.eocs.map(file=>
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
  <section className="space-y-3" aria-label="Scheduled airwall changes today">
   <h3 className="flex items-center gap-2 font-semibold"><AlertTriangle size={18}/> Airwall changes suggested for today</h3>
   {todayChanges.length?<div className="rounded-lg border border-amber-500 p-3 space-y-1">
    {todayChanges.map((task,i)=><p key={i} className="text-sm">{wallTaskLabel(task)} — check layout before moving</p>)}
    <p className="text-xs text-muted-foreground">Suggestions derived from your last locally saved Event Schedule, not approved work orders. Confirm room configuration and timing in the EOC.</p>
   </div>:<p className="rounded-lg border p-3 text-sm text-muted-foreground">No dated airwall-change suggestion is available from the last saved Event Schedule. This is not confirmation that no walls need moving.</p>}
  </section>
  <section className="space-y-3" aria-label="Easy seven-day event view">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
     <h3 className="text-lg font-semibold">Week at a glance</h3>
     <p className="text-sm text-muted-foreground">{rangeLabel(week)} · Monday–Sunday · {currentWeekShows.length} unique saved shows</p>
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
      const dayShows=currentWeekShows.filter(s=>cgcShowOnDay(s,date));
      const wallChanges=scheduledWallChanges(suggestions,date);
      const isToday=date===today;
      return <div key={date} className={"min-h-52 p-2 space-y-2 "+(isToday?"bg-primary/5":"")}>
       <div className="border-b pb-2">
        <p className={"text-xs font-semibold "+(isToday?"text-primary":"")}>{dayLabel(date)}{isToday?" · Today":""}</p>
        <p className="text-xs text-muted-foreground">{dayShows.length} show{dayShows.length===1?"":"s"}</p>
       </div>
       {dayShows.map(show=>{
        const report=detail(show);
        const hasEoc=report.eocs.some(f=>f.available);
        const wall=report.airwalls.state;
        return <button type="button" key={show.key} onClick={()=>openSavedEvent(show.key)}
         className="block w-full rounded-md border p-2 text-left text-xs hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
         <strong className="block break-words">{show.showName}</strong>
         <span className="mt-1 block text-muted-foreground break-words">{show.rooms}</span>
         <span className="mt-1 block text-muted-foreground">{hasEoc?"EOC attached":"EOC missing"}</span>
         {(wall==="action"||wall==="review")&&<span className="mt-1 block font-semibold text-amber-600">Airwall note — review</span>}
        </button>;
       })}
       {wallChanges.map((task,i)=><div key={"wall-"+i} className="rounded-md border border-amber-500 px-2 py-1 text-xs">
        <strong>Airwall suggestion</strong><p>{wallTaskLabel(task)}</p>
       </div>)}
       {!dayShows.length&&!wallChanges.length&&<p className="text-xs text-muted-foreground">No saved events</p>}
      </div>;
     })}
    </div>
   </div>
   <p className="text-xs text-muted-foreground">The weekly view shows saved event date ranges. Airwall notes may apply to a different day; dated suggestions come from the last saved Event Schedule. Verify the EOC, current room setup and work orders before moving walls.</p>
  </section>
 </section>;
}
