import {useEffect,useState} from "react";
import {BookOpen,Database,Download,Upload,Save,Search,Trash2,FilePlus2,ShieldCheck,FolderOpen} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {MemoryCategory,MemoryStatus,MemorySummary} from "@/lib/showpilot-memory-bridge";

const categories:MemoryCategory[]=["Stage Setups","Ballroom Configurations","Recurring Events","Engineering Procedures","Approved Tasks","Lessons Learned"];
const blank={category:"Lessons Learned" as MemoryCategory,title:"",content:""};

export function ShowPilotMemorySettings(){
 const bridge=window.showpilotMemory;
 const [status,setStatus]=useState<MemoryStatus|null>(null);
 const [notes,setNotes]=useState<MemorySummary[]>([]);
 const [query,setQuery]=useState("");
 const [active,setActive]=useState("");
 const [editing,setEditing]=useState("");
 const [newNote,setNewNote]=useState(blank);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [creating,setCreating]=useState(false);
 const refresh=async(q=query)=>{
  if(!bridge)return;
  const state=await bridge.status();setStatus(state);
  setNotes(await bridge.list(q));
 };
 useEffect(()=>{if(bridge)void refresh("").catch(e=>setMessage("Memory unavailable: "+(e as Error).message));},[bridge]);
 const perform=async(callback:()=>Promise<unknown>,messageIfSuccess:string)=>{
  if(busy)return;
  setBusy(true);setMessage("");
  try{await callback();await refresh();if(messageIfSuccess)setMessage(messageIfSuccess);}
  catch(e){setMessage("Memory operation failed: "+(e as Error).message);}
  finally{setBusy(false);}
 };
 const updatePrefs=(changes:Partial<Pick<MemoryStatus,"rememberTasks"|"rememberStages"|"rememberExports">>)=>{
  if(!bridge||!status)return;
  void perform(()=>bridge.preferences({
   rememberTasks:changes.rememberTasks??status.rememberTasks,
   rememberStages:changes.rememberStages??status.rememberStages,
   rememberExports:changes.rememberExports??status.rememberExports,
  }),"Memory preferences updated.");
 };
 const importData=()=>{
  if(!bridge)return;
  void perform(async()=>{
   const result=await bridge.importJson();
   if(result.cancelled){setMessage("Import cancelled.");return;}
   setMessage("Imported "+result.notesAdded+" new notes and "+result.historyAdded+" new historical entries. Existing memories were kept.");
  },"");
 };
 const exportData=()=>{
  if(!bridge)return;
  void perform(async()=>{
   const result=await bridge.exportJson();
   if(result.cancelled){setMessage("Export cancelled.");return;}
   setMessage("Local JSON backup saved ("+result.notes+" notes and "+result.history+" historical entries).");
  },"");
 };
 const open=async(id:string)=>{
  if(!bridge)return;
  try{const note=await bridge.read(id);setActive(id);setEditing(note.content);setCreating(false);setMessage("");}
  catch(e){setMessage("Could not open memory: "+(e as Error).message);}
 };
 const add=()=>{
  if(!bridge||!newNote.title.trim()||!newNote.content.trim())return;
  void perform(async()=>{
   const saved=await bridge.save(newNote);
   setCreating(false);setNewNote(blank);
   setActive(saved.id);setEditing((await bridge.read(saved.id)).content);
  },"Memory saved locally.");
 };
 const saveEdit=()=>{
  if(!bridge||!active||!editing.trim())return;
  void perform(()=>bridge.edit(active,editing),"Changes saved.");
 };
 const archive=()=>{
  if(!bridge||!active||!window.confirm("Archive this memory? It will no longer appear in AI suggestions. Export a JSON backup first if you want a separate copy."))return;
  void perform(async()=>{await bridge.archive(active);setActive("");setEditing("");},"Memory archived.");
 };
 const search=async(q:string)=>{
  setQuery(q);
  if(!bridge)return;
  try{setNotes(await bridge.list(q));}catch(e){setMessage("Search failed: "+(e as Error).message);}
 };
 return <section className="space-y-4 rounded-xl border border-border p-4" aria-label="ShowPilot Native Memory">
  <div className="flex items-start gap-3">
   <span className="rounded-lg bg-muted p-2"><Database size={21}/></span>
   <div>
    <h2 className="font-semibold text-lg">ShowPilot Native Memory</h2>
    <p className="text-sm text-muted-foreground">Offline SQLite memory built into ShowPilot. No Obsidian, account, background server, or cloud connection required.</p>
   </div>
  </div>
  {!bridge?<p className="text-sm rounded-md border border-amber-500/50 p-3">Native memory file access requires the Windows or Linux desktop build. The browser build cannot write private files directly.</p>:<>
   <div className="grid gap-3 sm:grid-cols-3">
    <div className="rounded-lg border p-3"><p className="text-xl font-semibold tabular-nums">{status?.noteCount??"—"}</p><p className="text-xs text-muted-foreground">Saved memory notes</p></div>
    <div className="rounded-lg border p-3"><p className="text-xl font-semibold tabular-nums">{status?.historicalCount??"—"}</p><p className="text-xs text-muted-foreground">Historical entries</p></div>
    <div className="rounded-lg border p-3"><p className="text-xl font-semibold tabular-nums">{status?.migratedCount??"—"}</p><p className="text-xs text-muted-foreground">Old notebook notes migrated</p></div>
   </div>
   <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
    <div className="flex flex-wrap gap-2 items-center justify-between">
     <p className="text-sm font-semibold flex items-center gap-2"><BookOpen size={16}/> Import, export and restore</p>
     <p className="text-xs text-muted-foreground">Private local files — no GitHub upload</p>
    </div>
    <div className="flex flex-wrap gap-2">
     <Button size="sm" disabled={busy} onClick={importData}><Upload size={16}/> Import JSON memory</Button>
     <Button variant="outline" size="sm" disabled={busy} onClick={exportData}><Download size={16}/> Export JSON backup</Button>
     <Button variant="outline" size="sm" disabled={busy} onClick={()=>void perform(()=>bridge.openFolder(),"Opened application data folder.")}><FolderOpen size={16}/> Open local data folder</Button>
    </div>
    <p className="text-xs text-muted-foreground">Extract the memory ZIP first, then choose the included <code>ShowPilot-Memory-Import-2025-2026.json</code>. Re-importing the same package skips existing records. Older Obsidian-compatible notes are copied into SQLite automatically on first launch; their original files are left untouched.</p>
   </div>
   {status&&<div className="rounded-lg border p-3 space-y-2">
    <h3 className="text-sm font-semibold">What ShowPilot should remember</h3>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={busy} checked={status.rememberTasks} onChange={e=>updatePrefs({rememberTasks:e.target.checked})}/> Approved AI engineering tasks</label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={busy} checked={status.rememberStages} onChange={e=>updatePrefs({rememberStages:e.target.checked})}/> Saved stage configurations</label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={busy} checked={status.rememberExports} onChange={e=>updatePrefs({rememberExports:e.target.checked})}/> Reviewed Event Schedule entries when I export Excel</label>
    <p className="text-xs text-muted-foreground">Export history is optional and defaults off. Any exported schedules remembered here are marked as reviewed examples, not as confirmed staffing assignments. AI does not automatically alter shifts.</p>
   </div>}
   <div className="flex flex-wrap gap-2 justify-between items-center">
    <label className="flex gap-2 items-center text-sm"><Search size={16}/> Search memories
     <input className="rounded-md border bg-background p-2 text-sm max-w-full" maxLength={160} value={query} placeholder="JTF, Ballroom, Stage…" onChange={e=>void search(e.target.value)}/>
    </label>
    <Button size="sm" onClick={()=>{setCreating(true);setActive("");setNewNote(blank);setMessage("");}}><FilePlus2 size={16}/> New memory</Button>
   </div>
   <div className="grid gap-3 md:grid-cols-[minmax(190px,1fr)_minmax(0,2fr)]">
    <div className="max-h-80 overflow-auto rounded-lg border p-2" aria-label="Saved native memory notes">
     {notes.length===0?<p className="p-2 text-xs text-muted-foreground">No matching notes yet. Import your history JSON to begin.</p>:notes.map(n=>
      <button type="button" key={n.id} onClick={()=>void open(n.id)} className={"w-full rounded-md p-2 text-left hover:bg-muted "+(active===n.id?"bg-accent":"")}>
       <span className="block text-sm font-medium break-words">{n.title}</span>
       <span className="block text-xs text-muted-foreground">{n.category} · {new Date(n.modified).toLocaleDateString()}</span>
       <span className="block text-xs text-muted-foreground line-clamp-2">{n.excerpt}</span>
      </button>)}
    </div>
    <div className="min-w-0 rounded-lg border p-3 space-y-2">
     {creating?<>
      <label className="block text-xs font-medium">Category
       <select className="mt-1 w-full rounded border bg-background p-2 text-sm" value={newNote.category} onChange={e=>setNewNote(n=>({...n,category:e.target.value as MemoryCategory}))}>{categories.map(c=><option key={c}>{c}</option>)}</select>
      </label>
      <label className="block text-xs font-medium">Title
       <input className="mt-1 w-full rounded border bg-background p-2 text-sm" maxLength={140} value={newNote.title} onChange={e=>setNewNote(n=>({...n,title:e.target.value}))}/>
      </label>
      <label className="block text-xs font-medium">Memory text
       <textarea className="mt-1 min-h-40 w-full rounded border bg-background p-2 font-mono text-xs" maxLength={24000} value={newNote.content} onChange={e=>setNewNote(n=>({...n,content:e.target.value}))} placeholder="Describe the decision, the event, and what you want ShowPilot to remember."/>
      </label>
      <Button size="sm" disabled={busy||!newNote.title.trim()||!newNote.content.trim()} onClick={add}><Save size={16}/> Save memory</Button>
     </>:active?<>
      <p className="text-sm font-semibold">Edit memory</p>
      <textarea aria-label="Edit memory" className="min-h-56 w-full rounded border bg-background p-2 font-mono text-xs" maxLength={24000} value={editing} onChange={e=>setEditing(e.target.value)}/>
      <div className="flex flex-wrap gap-2">
       <Button size="sm" disabled={busy||!editing.trim()} onClick={saveEdit}><Save size={16}/> Save changes</Button>
       <Button size="sm" variant="outline" disabled={busy} onClick={archive}><Trash2 size={16}/> Archive</Button>
      </div>
     </>:<p className="text-xs text-muted-foreground">Select a note to edit it, or create a new one. Historic schedule entries remain searchable by the Local AI Task Assistant; they do not become mandatory rules.</p>}
    </div>
   </div>
   <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck size={17}/> Memory stays on this computer, in your ShowPilot application data folder. Use Export JSON backup when migrating to another Windows computer. Treat employee schedules as confidential and follow company IT policy.</p>
  </>}
  {message&&<p role="status" className="text-xs rounded border p-3">{message}</p>}
 </section>;
