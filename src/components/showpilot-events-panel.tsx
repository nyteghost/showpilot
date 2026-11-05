import {useEffect,useMemo,useState,type ReactNode} from "react";
import {BookOpen,CalendarRange,Save,Search,ClipboardCheck,CalendarClock,FolderOpen,Layers,Map as MapIcon} from "lucide-react";
import {Button} from "@/components/ui/button";
import {ShowPilotEventDocuments} from "@/components/showpilot-event-documents";
import {ShowPilotEventZipImport} from "@/components/showpilot-event-zip-import";
import {PreConPanel} from "@/components/showpilot-precon-panel";
import {PostConPanel} from "@/components/showpilot-postcon-panel";
import {decodePreCon,type PreConDraft} from "@/lib/showpilot-precon";
import {loadDurableShowCatalog,loadPostConShows,type PostConShow} from "@/lib/showpilot-postcon";
import type {PostConReport} from "@/lib/showpilot-memory-bridge";

const noteTitle=(show:PostConShow)=>"Event Notes: "+show.key.slice(0,110);
const matches=(eventId:string,name:string,show:PostConShow)=>
 (!!show.eventId&&!!eventId&&show.eventId===eventId)||
 name.trim().toLowerCase()===show.showName.trim().toLowerCase();
const preFields=[["overview","Pre-show overview"],["staffing","Staffing and engineering"],["stage","Stage and deck"],["floor","Floor map and utilities"],["followUp","Decisions and follow-ups"]] as const;
const postFields=[["wentWell","What went well"],["issues","Issues and outcomes"],["staffing","Staffing lessons"],["stage","Stage notes"],["floor","Floor-map improvements"],["followUp","Follow-ups"]] as const;

type EventSection="overview"|"documents"|"precon"|"postcon"|"stage"|"floor";
export function ShowPilotEventsPanel({active=true,stagePlanner,floorMaps}:{active?:boolean;stagePlanner?:ReactNode;floorMaps?:ReactNode}){
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
 const [section,setSection]=useState<EventSection>("overview");
 const [filesRevision,setFilesRevision]=useState(0);
 const [visited,setVisited]=useState<EventSection[]>([]);
 const selectSection=(next:EventSection)=>{
  setSection(next);
  setVisited(v=>v.includes(next)?v:[...v,next]);
 };
 const imported=(key:string)=>{
  setSelectedKey(key);setFilesRevision(v=>v+1);selectSection("documents");
  setMessage("Event ZIP imported. The documents are stored locally under this show.");
 };
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
 },[selectedKey,active,bridge,section]);
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
  <div className="rounded-xl border p-4 space-y-3">
   <div className="flex gap-2 items-start"><CalendarRange size={22}/><div>
    <h2 className="text-lg font-semibold">Events — central show records</h2>
    <p className="text-sm text-muted-foreground">Choose a CGC event or import an event ZIP. Manage its work orders, EOCs, diagrams, Pre-Con preparation and Post-Con lessons in one workspace.</p>
   </div></div>
   <div className="grid gap-3 md:grid-cols-3">
    <label className="text-sm font-semibold">Search shows
     <span className="relative mt-1 block"><Search size={15} className="absolute left-2 top-2.5 text-muted-foreground"/>
      <input value={search} onChange={e=>setSearch(e.target.value)}
       placeholder="Search by show name, event ID or room…"
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
   <p className="text-xs text-muted-foreground">{shows.length} saved CGC show{shows.length===1?"":"s"}. Events imported from ShowPilot Event Schedule or event ZIPs are saved in SQLite and remain available after software updates.</p>
  </div>
  <ShowPilotEventZipImport shows={shows} selectedKey={selectedKey} onImported={imported} active={active}/>
  <div className="flex flex-wrap gap-2 rounded-lg border p-2" role="tablist" aria-label="Events sections">
   {([
    ["overview","Overview & notes",BookOpen],
    ["documents","Event documents",FolderOpen],
    ["precon","Pre-Con Notes",CalendarClock],
    ["postcon","Post-Con Reports",ClipboardCheck],
    ["stage","Stage & Deck Planner",Layers],
    ["floor","Floor Maps",MapIcon]
   ] as const).map(([id,title,Icon])=>
    <button key={id} role="tab" aria-selected={section===id} type="button" onClick={()=>selectSection(id)}
     className={"flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors "+
      (section===id?"bg-blue-600 text-white border-blue-600":"hover:bg-muted")}>
     <Icon size={16}/>{title}
    </button>)}
  </div>
  {show&&<div className="rounded-xl border p-4">
   <h3 className="text-lg font-semibold">{show.showName}</h3>
   <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
    <p><strong>Event ID:</strong> {show.eventId||"Not provided"}</p>
    <p><strong>Dates:</strong> {show.startDate??show.showDate}{(show.startDate??show.showDate)!==show.showDate?" – "+show.showDate:""}</p>
    <p><strong>CGC rooms:</strong> {show.rooms}</p>
   </div>
  </div>}
  <div hidden={section!=="overview"}>
   {show&&bridge?<div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-2">
     <div className="space-y-2 rounded-xl border p-4">
      <div className="flex items-center gap-2"><BookOpen size={17}/><h3 className="font-semibold">Pre-Con preparation</h3></div>
      {precon?preFields.filter(([key])=>precon[key].trim()).map(([key,label])=>
       <div key={key} className="text-sm"><strong>{label}</strong><p className="whitespace-pre-wrap break-words text-muted-foreground">{precon[key]}</p></div>)
       :<p className="text-sm text-muted-foreground">No saved Pre-Con notes for this show. Open the Pre-Con Notes section above.</p>}
     </div>
     <div className="space-y-2 rounded-xl border p-4">
      <div className="flex items-center gap-2"><BookOpen size={17}/><h3 className="font-semibold">Post-Con outcomes</h3></div>
      {postcon?postFields.filter(([key])=>postcon[key]?.trim()).map(([key,label])=>
       <div key={key} className="text-sm"><strong>{label}</strong><p className="whitespace-pre-wrap break-words text-muted-foreground">{postcon[key]}</p></div>)
       :<p className="text-sm text-muted-foreground">No saved Post-Con report. Open the Post-Con Reports section above.</p>}
     </div>
    </div>
    <div className="space-y-3 rounded-xl border p-4">
     <h3 className="font-semibold">General event notes</h3>
     <textarea className="min-h-36 w-full rounded border bg-background p-3 text-sm" maxLength={15000}
      value={noteText} onChange={e=>{setNoteText(e.target.value);setNotesDirty(true)}}
      placeholder="Special instructions, client changes, outstanding questions, contacts and other details…"/>
     <div className="flex items-center gap-3">
      <Button size="sm" disabled={!noteText.trim()||saving} onClick={()=>void saveNote()}><Save size={15}/>{saving?"Saving…":"Save notes"}</Button>
      {notesDirty&&<span className="text-xs text-amber-600">Unsaved changes</span>}
     </div>
    </div>
   </div>:<div className="rounded-xl border p-4 text-sm text-muted-foreground">
    {bridge?"Choose a show above, or import a ZIP to create one, to see its event notes.":"Saving show notes requires the ShowPilot portable desktop app."}
   </div>}
  </div>
  {section==="documents"&&<div className="space-y-3">
   {show&&bridge?<ShowPilotEventDocuments key={show.key+":"+filesRevision} show={show} onOpenStage={()=>selectSection("stage")} onOpenFloorMaps={()=>selectSection("floor")}/>
    :<div className="rounded-xl border p-4 text-sm text-muted-foreground">Choose a show or import an event ZIP to see its work orders, EOCs and diagrams.</div>}
  </div>}
  <div hidden={section!=="precon"}>{visited.includes("precon")&&<PreConPanel focusShow={show}/>}</div>
  <div hidden={section!=="postcon"}>{visited.includes("postcon")&&<PostConPanel focusShow={show}/>}</div>
  <div hidden={section!=="stage"}>{visited.includes("stage")&&stagePlanner}</div>
  <div hidden={section!=="floor"}>{visited.includes("floor")&&floorMaps}</div>
  {message&&<p role="status" className="rounded border p-2 text-xs">{message}</p>}
 </section>;
}
