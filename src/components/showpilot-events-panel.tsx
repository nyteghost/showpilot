import {useEffect,useMemo,useState} from "react";
import {BookOpen,CalendarRange,Save,Search} from "lucide-react";
import {Button} from "@/components/ui/button";
import {ShowPilotEventDocuments} from "@/components/showpilot-event-documents";
import {decodePreCon,type PreConDraft} from "@/lib/showpilot-precon";
import {loadDurableShowCatalog,loadPostConShows,type PostConShow} from "@/lib/showpilot-postcon";
import type {PostConReport} from "@/lib/showpilot-memory-bridge";

const noteTitle=(show:PostConShow)=>"Event Notes: "+show.key.slice(0,110);
const matches=(eventId:string,name:string,show:PostConShow)=>
 (!!show.eventId&&!!eventId&&show.eventId===eventId)||
 name.trim().toLowerCase()===show.showName.trim().toLowerCase();
const preFields=[["overview","Pre-show overview"],["staffing","Staffing and engineering"],["stage","Stage and deck"],["floor","Floor map and utilities"],["followUp","Decisions and follow-ups"]] as const;
const postFields=[["wentWell","What went well"],["issues","Issues and outcomes"],["staffing","Staffing lessons"],["stage","Stage notes"],["floor","Floor-map improvements"],["followUp","Follow-ups"]] as const;

export function ShowPilotEventsPanel({active=true}:{active?:boolean}){
 const bridge=window.showpilotMemory;
 const [shows,setShows]=useState<PostConShow[]>(()=>loadPostConShows());
 const [selectedKey,setSelectedKey]=useState("");
 const [search,setSearch]=useState("");
 const [noteText,setNoteText]=useState("");
 const [noteId,setNoteId]=useState("");
 const [notesDirty,setNotesDirty]=useState(false);
 const [saving,setSaving]=useState(false);
 const [precon,setPrecon]=useState<PreConDraft|null>(null);
 const [postcon,setPostcon]=useState<PostConReport|null>(null);
 const [message,setMessage]=useState("");
 const show=shows.find(s=>s.key===selectedKey);
 const visible=useMemo(()=>shows.filter(s=>
  (s.showName+" "+s.eventId+" "+s.rooms+" "+s.showDate).toLowerCase().includes(search.toLowerCase())
 ),[shows,search]);
 useEffect(()=>{
  let live=true;
  const refresh=()=>void loadDurableShowCatalog()
   .then(data=>{if(live)setShows(data)})
   .catch(e=>{if(live)setMessage("Unable to load the event catalog: "+String(e))});
  refresh();
  window.addEventListener("showpilot:postcon-catalog",refresh);
  return ()=>{live=false;window.removeEventListener("showpilot:postcon-catalog",refresh)};
 },[]);
 useEffect(()=>{
  if(!active||!show||!bridge)return;
  let live=true;
  const selected=show;
  void Promise.all([bridge.list("Event Notes:"),bridge.list("Pre-Con:"),bridge.postConList()])
   .then(async ([notes,preNotes,postReports])=>{
    if(!live)return;
    const own=notes.find(n=>n.title===noteTitle(selected));
    const original=own?await bridge.read(own.id):null;
    if(live&&!notesDirty){setNoteText(original?.content??"");setNoteId(own?.id??"");}
    let loaded:PreConDraft|null=null;
    for(const note of preNotes.filter(n=>n.title.startsWith("Pre-Con:"))){
     try{
      const draft=decodePreCon((await bridge.read(note.id)).content);
      if(matches(draft.eventId,draft.showName,selected)){loaded=draft;break;}
     }catch{/* Unrelated or invalid note; preserve other show details. */}
    }
    if(live){setPrecon(loaded);setPostcon(postReports.find(r=>matches(r.eventId,r.showName,selected))??null);}
   }).catch(e=>{if(live)setMessage("Unable to load this show's linked notes: "+String(e))});
  return ()=>{live=false};
 },[selectedKey,active,bridge]);
 const choose=(key:string)=>{
  if(notesDirty&&!window.confirm("Switch events? Unsaved general notes will be lost."))return;
  setSelectedKey(key);setNoteText("");setNoteId("");setNotesDirty(false);
  setPrecon(null);setPostcon(null);setMessage("");
 };
 const saveNote=async()=>{
  if(!bridge||!show||!noteText.trim()||saving)return;
  setSaving(true);setMessage("");
  try{
   if(noteId)await bridge.edit(noteId,noteText);
   else{
    const saved=await bridge.save({category:"Recurring Events",title:noteTitle(show),content:noteText});
    setNoteId(saved.id);
   }
   setNotesDirty(false);setMessage("General event notes saved to ShowPilot's private SQLite memory and JSON backups.");
  }catch(e){setMessage("Event notes could not be saved: "+(e instanceof Error?e.message:String(e)));}
  finally{setSaving(false)}
 };
 return <section className="space-y-4" aria-label="Events">
  <div className="space-y-3 rounded-xl border p-4">
   <div className="flex gap-2 items-start"><CalendarRange size={22}/><div>
    <h2 className="text-lg font-semibold">Events — central show records</h2>
    <p className="text-sm text-muted-foreground">Every imported CGC show in one place: dates, room locations, Pre-Con and Post-Con information, general notes, work orders, EOCs and event diagrams.</p>
   </div></div>
   <div className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold">Search shows
     <span className="relative mt-1 block"><Search size={15} className="absolute left-2 top-2.5 text-muted-foreground"/>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search names, event ID, rooms…"
       className="w-full rounded border bg-background py-2 pl-8 pr-2 font-normal"/>
     </span>
    </label>
    <label className="text-sm font-semibold md:col-span-2">Show
     <select className="mt-1 w-full rounded border bg-background p-2 font-normal" value={selectedKey}
      onChange={e=>choose(e.target.value)}>
      <option value="">Choose an imported CGC event…</option>
      {visible.map(s=><option key={s.key} value={s.key}>{s.startDate??s.showDate} · {s.showName}{s.eventId?" · #"+s.eventId:""}</option>)}
     </select>
    </label>
   </div>
   <p className="text-xs text-muted-foreground">{shows.length} saved show{shows.length===1?"":"s"}. Only actual event names, not individual schedule functions. New shows are added when an Event Schedule report is imported.</p>
   {!bridge&&<p className="text-sm text-amber-600">Saving notes and attaching documents requires the ShowPilot desktop application with local memory enabled.</p>}
  </div>
  {show&&<div className="rounded-xl border p-4">
   <h3 className="text-lg font-semibold">{show.showName}</h3>
   <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
    <p><strong>Event ID:</strong> {show.eventId||"Not provided"}</p>
    <p><strong>Dates:</strong> {show.startDate??show.showDate}{(show.startDate??show.showDate)!==show.showDate?" – "+show.showDate:""}</p>
    <p><strong>CGC rooms:</strong> {show.rooms}</p>
   </div>
  </div>}
  {show&&bridge&&<>
   <div className="grid gap-4 lg:grid-cols-2">
    <div className="space-y-2 rounded-xl border p-4">
     <div className="flex items-center gap-2"><BookOpen size={17}/><h3 className="font-semibold">Pre-Con preparation</h3></div>
     {precon?preFields.filter(([key])=>precon[key].trim()).map(([key,label])=>
      <div key={key} className="text-sm"><strong>{label}</strong><p className="whitespace-pre-wrap break-words text-muted-foreground">{precon[key]}</p></div>)
      :<p className="text-sm text-muted-foreground">No saved Pre-Con notes for this event. Add preparation notes in the Pre-Con Notes tab.</p>}
    </div>
    <div className="space-y-2 rounded-xl border p-4">
     <div className="flex items-center gap-2"><BookOpen size={17}/><h3 className="font-semibold">Post-Con outcomes</h3></div>
     {postcon?postFields.filter(([key])=>postcon[key]?.trim()).map(([key,label])=>
      <div key={key} className="text-sm"><strong>{label}</strong><p className="whitespace-pre-wrap break-words text-muted-foreground">{postcon[key]}</p></div>)
      :<p className="text-sm text-muted-foreground">No saved Post-Con report for this show. Outcomes and lessons appear here after the report is saved.</p>}
    </div>
   </div>
   <div className="space-y-3 rounded-xl border p-4">
    <h3 className="font-semibold">General event notes</h3>
    <textarea className="min-h-36 w-full rounded border bg-background p-3 text-sm" maxLength={15000}
     value={noteText} onChange={e=>{setNoteText(e.target.value);setNotesDirty(true)}}
     placeholder="Show details, special instructions, client changes, outstanding questions, key contacts, and other notes…"/>
    <div className="flex items-center gap-3">
     <Button size="sm" disabled={!noteText.trim()||saving} onClick={()=>void saveNote()}><Save size={15}/>{saving?"Saving…":"Save notes"}</Button>
     {notesDirty&&<span className="text-xs text-amber-600">Unsaved changes</span>}
    </div>
   </div>
   <ShowPilotEventDocuments key={show.key} show={show}/>
  </>}
  {message&&<p role="status" className="rounded border p-2 text-xs">{message}</p>}
 </section>;
}
