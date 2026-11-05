import {useEffect,useState} from "react";
import {ClipboardCheck,Save,Archive,RotateCcw,Search} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {PostConReport} from "@/lib/showpilot-memory-bridge";
import {loadPostConShows,loadDurableShowCatalog,completedShowsLastMonth,localIsoDate,type PostConShow} from "@/lib/showpilot-postcon";

const today=localIsoDate;
const empty=():PostConReport=>({eventId:"",showName:"",showDate:today(),rooms:"",rating:0,
 wentWell:"",issues:"",staffing:"",stage:"",floor:"",followUp:""});
const fields=[
 {key:"wentWell",label:"What went well?",hint:"What should we repeat next time?"},
 {key:"issues",label:"What went wrong or caused delays?",hint:"Issues, timing, shortages, access problems…"},
 {key:"staffing",label:"Engineering crew and scheduling",hint:"Coverage and staffing lessons…"},
 {key:"stage",label:"Stage and deck setups",hint:"Dimensions, holders and build lessons…"},
 {key:"floor",label:"Floor maps and utilities",hint:"Booth numbers, utility placements and missing orders…"},
 {key:"followUp",label:"Follow-ups for next time",hint:"Actions to remember for a future show…"}
] as const;
export function PostConPanel({focusShow}:{focusShow?:PostConShow}={}){
 const bridge=window.showpilotMemory;
 const [catalog,setCatalog]=useState<PostConShow[]>(()=>loadPostConShows());
 const [catalogError,setCatalogError]=useState("");
 const [reports,setReports]=useState<(PostConReport&{id:string})[]>([]);
 const [draft,setDraft]=useState<PostConReport>(empty);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [filter,setFilter]=useState("");
 const [selectedShow,setSelectedShow]=useState("");
 const refresh=async()=>{if(bridge)setReports(await bridge.postConList());};
 useEffect(()=>{
  if(bridge)void refresh().catch(e=>setMessage("Unable to read Post-Con reports: "+(e as Error).message));
  let active=true;
  const hydrate=()=>{
   void loadDurableShowCatalog().then(shows=>{if(active)setCatalog(shows)})
    .catch(error=>{
      if(active){setCatalog(loadPostConShows());setCatalogError("Could not open saved shows: "+(error instanceof Error?error.message:String(error)));}
    });
  };
  hydrate();
  window.addEventListener("showpilot:postcon-catalog",hydrate);
  return ()=>{active=false;window.removeEventListener("showpilot:postcon-catalog",hydrate)};
 },[bridge]);
 // Allow an Events-selected show to open its own Post-Con report even
 // after it leaves the previous-30-day quick picker.
 useEffect(()=>{
  if(!focusShow)return;
  let active=true;
  const initial={
   ...empty(),showName:focusShow.showName,eventId:focusShow.eventId,
   rooms:focusShow.rooms,showDate:focusShow.showDate
  };
  setDraft(initial);setSelectedShow(focusShow.key);
  if(bridge)void bridge.postConList().then(all=>{
   if(!active)return;
   const original=all.find(r=>
    (focusShow.eventId&&r.eventId===focusShow.eventId)||
    (r.showName===focusShow.showName&&r.showDate===focusShow.showDate));
   if(original)setDraft({...original});
  }).catch(e=>{if(active)setMessage("Unable to load this show's saved Post-Con: "+String(e))});
  return ()=>{active=false};
 },[focusShow?.key,bridge]);
 const change=(key:keyof PostConReport,value:string|number)=>setDraft(d=>({...d,[key]:value}));
 const chooseShow=(key:string)=>{
  const selected=catalog.find(s=>s.key===key);
  if(!selected)return;
  const existing=reports.find(r=>r.eventId===selected.eventId&&r.showDate===selected.showDate&&r.showName===selected.showName);
  setDraft(existing?{...existing}:{...empty(),showName:selected.showName,showDate:selected.showDate,rooms:selected.rooms,eventId:selected.eventId});
  setSelectedShow(key);
  setMessage("");
 };
 const save=async()=>{
  if(!bridge||busy)return;
  if(!draft.showName.trim()||draft.showDate>today()||
   ![draft.wentWell,draft.issues,draft.staffing,draft.stage,draft.floor,draft.followUp].some(s=>s.trim())){
   setMessage("Choose a completed CGC show and enter at least one post-con observation.");return;
  }
  setBusy(true);setMessage("");
  try{
   const result=await bridge.postConSave(draft);
   await refresh();setDraft(d=>({...d,id:result.id}));
   setMessage("Post-Con saved in local ShowPilot memory. Weekly JSON backups include this report.");
  }catch(e){setMessage("Post-Con was not saved: "+(e as Error).message);}
  finally{setBusy(false);}
 };
 const archive=async()=>{
  if(!bridge||!draft.id||busy||!window.confirm("Archive this Post-Con? It will be hidden from search but retained in backups."))return;
  setBusy(true);
  try{await bridge.postConArchive(draft.id);setDraft(empty());setSelectedShow("");await refresh();setMessage("Post-Con archived.");}
  catch(e){setMessage("Archive failed: "+(e as Error).message);}
  finally{setBusy(false);}
 };
 const completed=completedShowsLastMonth(catalog);
 const matches=reports.filter(r=>(r.showName+" "+r.showDate+" "+r.rooms).toLowerCase().includes(filter.toLowerCase()));
 return <section className="space-y-4 pt-2" aria-label="Post-Con Reports">
  <div className="rounded-xl border p-4 space-y-3">
   <div className="flex items-center gap-2"><ClipboardCheck size={20}/><h2 className="text-lg font-semibold">Post-Con — show wrap-up</h2></div>
   <p className="text-sm text-muted-foreground">Record what actually happened after each Cobb Galleria Centre show. Your notes stay on this computer and can inform future local AI recommendations.</p>
   {!bridge?<p role="alert" className="rounded border border-amber-500 p-3 text-sm">Native Post-Con saving requires the Windows/Linux portable app, not the browser preview.</p>:<>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
     <div className="space-y-3">
      <div>
       <label htmlFor="postcon-previous" className="text-sm font-semibold">Completed CGC shows — last 30 days</label>
       <select id="postcon-previous" className="mt-1 w-full rounded border bg-background p-2 text-sm" value={selectedShow} onChange={e=>chooseShow(e.target.value)}>
        <option value="">Choose imported show or enter manually…</option>
        {focusShow&&!completed.some(s=>s.key===focusShow.key)&&<option value={focusShow.key}>{focusShow.showDate} · {focusShow.showName} (selected event)</option>}
        {completed.map(s=><option key={s.key} value={s.key}>{s.showDate} · {s.showName} · {s.rooms}</option>)}
       </select>
       {catalogError&&<p role="alert" className="text-xs text-red-500">{catalogError}</p>}
       <p className="text-xs text-muted-foreground">Shows completed in the last 30 days (including today) appear after importing an Event Schedule. Older saved reports remain below. You can also enter a show manually.</p>
      </div>
      <div className="space-y-1">
       <label className="text-sm font-semibold" htmlFor="postcon-find"><Search size={14} className="inline"/> Saved Post-Con reports ({reports.length})</label>
       <input id="postcon-find" className="w-full rounded border bg-background p-2 text-sm" placeholder="Search show or date…" value={filter} onChange={e=>setFilter(e.target.value)}/>
       <div className="max-h-72 overflow-auto space-y-1 rounded border p-2">
        {matches.length===0?<p className="text-xs text-muted-foreground">No saved reports yet.</p>:matches.map(r=>
         <button type="button" key={r.id} onClick={()=>{setDraft({...r});setSelectedShow("");setMessage("");}} className={"block w-full rounded p-2 text-left text-sm hover:bg-muted "+(draft.id===r.id?"bg-accent":"")}>
          <strong>{r.showName}</strong><span className="block text-xs text-muted-foreground">{r.showDate} · {r.rooms||"Room not specified"} · {r.rating ? (r.rating+"/5") : "Unrated"}</span>
         </button>)}
       </div>
      </div>
      <Button size="sm" variant="outline" onClick={()=>{setDraft(empty());setSelectedShow("");setMessage("");}}><RotateCcw size={16}/> New Post-Con</Button>
     </div>
     <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
       <label className="text-xs font-semibold">Show name
        <input className="mt-1 w-full rounded border bg-background p-2 text-sm" maxLength={140} value={draft.showName} onChange={e=>change("showName",e.target.value)}/>
       </label>
       <label className="text-xs font-semibold">Final show date
        <input type="date" className="mt-1 w-full rounded border bg-background p-2 text-sm" max={today()} value={draft.showDate} onChange={e=>change("showDate",e.target.value)}/>
       </label>
       <label className="text-xs font-semibold sm:col-span-2">CGC halls and ballrooms used
        <input className="mt-1 w-full rounded border bg-background p-2 text-sm" maxLength={300} value={draft.rooms} placeholder="Hall A, Hall B, BallRoom C" onChange={e=>change("rooms",e.target.value)}/>
       </label>
       <label className="text-xs font-semibold">Overall event outcome
        <select className="mt-1 w-full rounded border bg-background p-2 text-sm" value={draft.rating} onChange={e=>change("rating",Number(e.target.value))}>
         <option value={0}>Not rated</option><option value={1}>1 — Major issues</option><option value={2}>2 — Below expectations</option><option value={3}>3 — Mixed</option><option value={4}>4 — Good</option><option value={5}>5 — Excellent</option>
        </select>
       </label>
      </div>
      {fields.map(f=><label key={f.key} className="block space-y-1 text-xs font-semibold">{f.label}
       <textarea className="w-full min-h-16 rounded border bg-background p-2 text-sm font-normal" maxLength={4000} value={draft[f.key]} onChange={e=>change(f.key,e.target.value)} placeholder={f.hint}/>
      </label>)}
      <div className="flex flex-wrap gap-2">
       <Button disabled={busy||!draft.showName.trim()} onClick={()=>void save()}><Save size={16}/>{busy?"Saving…":draft.id?"Update Post-Con":"Save Post-Con"}</Button>
       {draft.id&&<Button variant="outline" disabled={busy} onClick={()=>void archive()}><Archive size={16}/> Archive report</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Only CGC shows are permitted. Notes are historical observations, not standing rules. Weekly backups include saved reports.</p>
     </div>
    </div>
   </>}
   {message&&<p role="status" className="rounded border p-2 text-xs">{message}</p>}
  </div>
 </section>;
}
