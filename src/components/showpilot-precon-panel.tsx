import {useEffect,useState} from "react";
import {Archive,CalendarClock,RotateCcw,Save,Search} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {MemorySummary} from "@/lib/showpilot-memory-bridge";
import {emptyPreCon,encodePreCon,decodePreCon,preConNoteTitle,type PreConDraft} from "@/lib/showpilot-precon";
import {loadPostConShows,upcomingPreConShows,localIsoDate,type PostConShow} from "@/lib/showpilot-postcon";

const fields=[
 {key:"overview",label:"Pre-show overview and requirements",hint:"Important requests, deadlines, meeting notes, and things to verify…"},
 {key:"staffing",label:"Staffing and engineering coverage",hint:"Crew needs, conflicts, shift considerations and questions…"},
 {key:"stage",label:"Stage and deck plans",hint:"Requested stage dimensions, access, inventory, changes to confirm…"},
 {key:"floor",label:"Floor maps and exhibitor utilities",hint:"Booth locations, utility orders, layout discrepancies and unanswered questions…"},
 {key:"followUp",label:"Decisions and follow-ups",hint:"Who to contact, approvals needed, and what to check before move-in…"}
] as const;

export function PreConPanel(){
 const bridge=window.showpilotMemory;
 const [catalog,setCatalog]=useState<PostConShow[]>(()=>loadPostConShows());
 const [notes,setNotes]=useState<MemorySummary[]>([]);
 const [draft,setDraft]=useState<PreConDraft>(()=>emptyPreCon(localIsoDate()));
 const [editingId,setEditingId]=useState<string|null>(null);
 const [selectedShow,setSelectedShow]=useState("");
 const [search,setSearch]=useState("");
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [dirty,setDirty]=useState(false);
 const refresh=async()=>{
  if(!bridge)return;
  const found=await bridge.list("Pre-Con:");
  setNotes(found.filter(n=>n.category==="Recurring Events"&&n.title.startsWith("Pre-Con:")));
 };
 useEffect(()=>{
  if(bridge)void refresh().catch(e=>setStatus("Could not load saved Pre-Con notes: "+(e as Error).message));
  const changed=()=>setCatalog(loadPostConShows());
  window.addEventListener("showpilot:postcon-catalog",changed);
  return ()=>window.removeEventListener("showpilot:postcon-catalog",changed);
 },[bridge]);
 const change=(key:keyof PreConDraft,value:string)=>{
  setDraft(d=>({...d,[key]:value}));setDirty(true);
 };
 const confirmLeave=()=>!dirty||window.confirm("Leave this Pre-Con draft without saving your latest changes?");
 const openSaved=async (id:string)=>{
  if(!bridge||busy||!confirmLeave())return;
  setBusy(true);setStatus("");
  try{
   const note=await bridge.read(id);
   const loaded=decodePreCon(note.content);
   setDraft(loaded);setEditingId(id);setSelectedShow("");setDirty(false);
  }catch(e){setStatus("Could not open Pre-Con note: "+(e as Error).message);}
  finally{setBusy(false)}
 };
 const choose=async (key:string)=>{
  if(busy||!confirmLeave())return;
  const selected=catalog.find(s=>s.key===key);
  if(!selected)return;
  const showDate=selected.startDate??selected.showDate;
  const next={...emptyPreCon(showDate),showName:selected.showName,rooms:selected.rooms,eventId:selected.eventId};
  setDraft(next);setEditingId(null);setSelectedShow(key);setDirty(false);setStatus("");
  const old=notes.find(n=>n.title===preConNoteTitle(next));
  if(old&&bridge){
   setBusy(true);
   try{
    const existing=await bridge.read(old.id);
    setDraft(decodePreCon(existing.content));setEditingId(old.id);
    setSelectedShow(key);setDirty(false);
   }catch(e){setStatus("Could not reopen saved notes: "+(e as Error).message)}
   finally{setBusy(false)}
  }
 };
 const reset=()=>{
  if(!confirmLeave())return;
  setDraft(emptyPreCon(localIsoDate()));setEditingId(null);setSelectedShow("");setStatus("");setDirty(false);
 };
 const save=async()=>{
  if(!bridge||busy)return;
  setBusy(true);setStatus("");
  try{
   const content=encodePreCon(draft);
   if(editingId)await bridge.edit(editingId,content);
   else{
    const saved=await bridge.save({category:"Recurring Events",title:preConNoteTitle(draft),content});
    setEditingId(saved.id);
   }
   setDirty(false);await refresh();
   setStatus("Pre-Con notes saved to private local memory. They are included in ShowPilot JSON backups.");
  }catch(e){setStatus("Pre-Con was not saved: "+(e as Error).message)}
  finally{setBusy(false)}
 };
 const archive=async()=>{
  if(!bridge||!editingId||busy||!window.confirm("Archive this Pre-Con note? Its history will be retained in your backups."))return;
  setBusy(true);
  try{
   await bridge.archive(editingId);await refresh();
   setEditingId(null);setSelectedShow("");setDraft(emptyPreCon(localIsoDate()));setDirty(false);
   setStatus("Pre-Con note archived.");
  }catch(e){setStatus("Could not archive Pre-Con: "+(e as Error).message)}
  finally{setBusy(false)}
 };
 const upcoming=upcomingPreConShows(catalog);
 const matching=notes.filter(n=>(n.title+" "+n.excerpt).toLowerCase().includes(search.toLowerCase()));
 return <section className="space-y-4 pt-2" aria-label="Pre-Con Notes">
  <div className="rounded-xl border p-4 space-y-3">
   <div className="flex items-center gap-2"><CalendarClock size={20}/><h2 className="text-lg font-semibold">Pre-Con — prepare for upcoming shows</h2></div>
   <p className="text-sm text-muted-foreground">Choose a CGC show scheduled in the next <strong>30 days</strong> (today through day 29), or enter one manually. Keep your planning notes here and reopen them before the show.</p>
   {!bridge?<p role="alert" className="rounded border border-amber-500 p-3 text-sm">Saving notes requires the portable Windows/Linux ShowPilot application with local memory enabled.</p>:<>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
     <div className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="precon-next">Next 30 days — scheduled CGC shows
       <select id="precon-next" className="mt-1 w-full rounded border bg-background p-2 text-sm font-normal"
        value={selectedShow} onChange={e=>void choose(e.target.value)}>
        <option value="">Choose a scheduled show…</option>
        {upcoming.map(show=><option key={show.key} value={show.key}>
          {show.startDate??show.showDate}{show.startDate&&show.startDate!==show.showDate?" to "+show.showDate:""} · {show.showName} · {show.rooms}
        </option>)}
       </select>
      </label>
      <p className="text-xs text-muted-foreground">{upcoming.length} upcoming show{upcoming.length===1?"":"s"} found in your imported Event Schedule history. {upcoming.length===0?"Import a ShowPilot Event Schedule covering the next 30 days to populate the list.":""} This is local CGC data only.</p>
      <div className="space-y-1">
       <label className="text-sm font-semibold" htmlFor="precon-search"><Search size={14} className="inline"/> Saved Pre-Con notes ({notes.length})</label>
       <input id="precon-search" className="w-full rounded border bg-background p-2 text-sm" placeholder="Search saved shows…" value={search} onChange={e=>setSearch(e.target.value)}/>
       <div className="max-h-72 space-y-1 overflow-auto rounded border p-2">
        {matching.length===0?<p className="text-xs text-muted-foreground">No saved Pre-Con notes yet.</p>:matching.map(note=>
         <button key={note.id} type="button" onClick={()=>void openSaved(note.id)}
          className={"block w-full rounded p-2 text-left text-sm hover:bg-muted "+(editingId===note.id?"bg-accent":"")}>
          <strong>{note.title.slice(9)}</strong>
          <span className="block text-xs text-muted-foreground">Updated {note.modified.slice(0,10)}</span>
         </button>)}
       </div>
      </div>
      <Button size="sm" variant="outline" onClick={reset}><RotateCcw size={16}/> New Pre-Con</Button>
     </div>
     <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
       <label className="text-xs font-semibold">Show name
        <input className="mt-1 w-full rounded border bg-background p-2 text-sm font-normal" maxLength={140}
         disabled={!!editingId} value={draft.showName} onChange={e=>change("showName",e.target.value)}/>
       </label>
       <label className="text-xs font-semibold">First scheduled show date
        <input type="date" className="mt-1 w-full rounded border bg-background p-2 text-sm font-normal"
         disabled={!!editingId} value={draft.showDate} onChange={e=>change("showDate",e.target.value)}/>
       </label>
       <label className="text-xs font-semibold sm:col-span-2">CGC halls and ballrooms
        <input className="mt-1 w-full rounded border bg-background p-2 text-sm font-normal" maxLength={300}
         value={draft.rooms} placeholder="Hall A, Hall B, BallRoom C" onChange={e=>change("rooms",e.target.value)}/>
       </label>
      </div>
      {fields.map(f=><label key={f.key} className="block space-y-1 text-xs font-semibold">{f.label}
       <textarea className="w-full min-h-20 rounded border bg-background p-2 text-sm font-normal" maxLength={4000}
        value={draft[f.key]} onChange={e=>change(f.key,e.target.value)} placeholder={f.hint}/>
      </label>)}
      <div className="flex flex-wrap gap-2">
       <Button disabled={busy||!draft.showName.trim()} onClick={()=>void save()}>
        <Save size={16}/>{busy?"Saving…":editingId?"Update Pre-Con":"Save Pre-Con"}
       </Button>
       {editingId&&<Button variant="outline" disabled={busy} onClick={()=>void archive()}><Archive size={16}/> Archive</Button>}
       {dirty&&<span className="self-center text-xs text-amber-600">Unsaved changes</span>}
      </div>
      <p className="text-xs text-muted-foreground">Your pre-show notes are references, not automatic staffing or stage instructions. Existing schedules remain unchanged.</p>
     </div>
    </div>
   </>}
   {status&&<p role="status" className="rounded border p-2 text-xs">{status}</p>}
  </div>
 </section>;
}
