import {useEffect,useState} from "react";
import {BookOpen,FolderOpen,FolderPlus,Save,Search,Trash2,FilePlus2,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {MemoryCategory,MemoryStatus,MemorySummary} from "@/lib/showpilot-memory-bridge";

const categories:MemoryCategory[]=["Stage Setups","Ballroom Configurations","Recurring Events","Engineering Procedures","Approved Tasks","Lessons Learned"];
const emptyNote={category:"Lessons Learned" as MemoryCategory,title:"",content:""};

export function ShowPilotMemorySettings(){
 const bridge=window.showpilotMemory;
 const [status,setStatus]=useState<MemoryStatus|null>(null);
 const [notes,setNotes]=useState<MemorySummary[]>([]);
 const [query,setQuery]=useState("");
 const [active,setActive]=useState("");
 const [editing,setEditing]=useState("");
 const [newNote,setNewNote]=useState(emptyNote);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [saving,setSaving]=useState(false);
 const [creating,setCreating]=useState(false);
 const refresh=async(q=query)=>{
  if(!bridge)return;
  const state=await bridge.status();setStatus(state);
  if(state.configured)setNotes(await bridge.list(q));else setNotes([]);
 };
 useEffect(()=>{if(bridge)void refresh("").catch(e=>setMessage((e as Error).message));},[bridge]);
 const action=async(callback:()=>Promise<unknown>,success:string)=>{
  setBusy(true);setMessage("");
  try{await callback();await refresh();setMessage(success)}catch(e){setMessage("Notebook error: "+(e as Error).message)}
  finally{setBusy(false)}
 };
 const open=async(id:string)=>{
  if(!bridge)return;
  try{const note=await bridge.read(id);setActive(id);setEditing(note.content);setCreating(false);setMessage("")}
  catch(e){setMessage("Could not open memory: "+(e as Error).message)}
 };
 const saveEdit=async()=>{
  if(!bridge||!active||saving)return;setSaving(true);
  try{await bridge.edit(active,editing);await refresh();setMessage("Memory note saved.");}
  catch(e){setMessage("Save failed: "+(e as Error).message)}
  finally{setSaving(false)}
 };
 const add=async()=>{
  if(!bridge||saving)return;setSaving(true);
  try{
   const result=await bridge.save(newNote);
   setCreating(false);setNewNote(emptyNote);await refresh();await open(result.id);
   setMessage("Memory added to your Obsidian-compatible notebook.");
  }catch(e){setMessage("Could not create note: "+(e as Error).message)}
  finally{setSaving(false)}
 };
 const archive=async()=>{
  if(!bridge||!active||busy)return;
  if(!window.confirm("Move this memory to the notebook's ShowPilot/Trash folder? It will stop appearing in AI suggestions."))return;
  await action(async()=>{await bridge.archive(active);setActive("");setEditing("")},"Memory moved to Trash. You can restore it manually in the notebook folder.");
 };
 const search=async(q:string)=>{
  setQuery(q);
  if(!bridge||!status?.configured)return;
  try{setNotes(await bridge.list(q))}catch(e){setMessage("Search failed: "+(e as Error).message)}
 };
 return <section className="space-y-3 rounded-xl border border-border p-4" aria-label="AI Memory — Obsidian-compatible notebook">
  <div className="flex items-center gap-2"><BookOpen size={20}/><h2 className="font-semibold text-lg">AI Memory — Obsidian notebook</h2></div>
  <p className="text-sm text-muted-foreground">ShowPilot keeps approved work knowledge in ordinary <code>.md</code> files. Obsidian is optional. No separate server, account or paid AI is needed.</p>
  {!bridge?<p className="text-sm rounded-md border border-amber-500/50 p-3">Notebook folder access is available in the Windows portable app. The browser build does not write files on your computer.</p>:
   <>
    <p className="text-xs"><strong>Notebook:</strong> {status?.configured?status.vault:"Not connected"}{status?.error&&<span className="text-destructive"> · {status.error}</span>}</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={()=>void action(()=>bridge.createDefault(),"Local notebook created and ready.")}><FolderPlus size={16}/> Create local notebook</Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={()=>void action(()=>bridge.choose(),"Notebook folder selected.")}><FolderOpen size={16}/> Choose Obsidian vault / folder</Button>
      {status?.configured&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void action(()=>bridge.openFolder(),"Opened notebook folder.")}>Open notebook folder</Button>}
    </div>
    {status?.configured&&<>
      <p className="text-xs text-muted-foreground">ShowPilot writes only inside the <strong>ShowPilot</strong> subfolder of this notebook. You may open the parent folder as a vault in Obsidian, or keep it as regular local files.</p>
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
        <h3 className="text-sm font-semibold">What to remember</h3>
        <label className="flex gap-2 items-start text-sm"><input type="checkbox" className="mt-1" checked={status.rememberTasks} onChange={e=>void action(()=>bridge.preferences({rememberTasks:e.target.checked,rememberStages:status.rememberStages}),"Task memory preference updated.")}/> Save engineering tasks after you approve AI suggestions</label>
        <label className="flex gap-2 items-start text-sm"><input type="checkbox" className="mt-1" checked={status.rememberStages} onChange={e=>void action(()=>bridge.preferences({rememberTasks:status.rememberTasks,rememberStages:e.target.checked}),"Stage memory preference updated.")}/> Save stage setup notes when you click Save in Stage & Deck Planner</label>
        <p className="text-xs text-muted-foreground">Only approved tasks and explicitly saved stage plans can be remembered automatically. Nothing from an imported report is memorized simply because it was uploaded. The notebook can include confidential event details: select a folder approved for work data.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <label className="flex items-center gap-2 text-sm"><Search size={16}/> Search memories
          <input className="rounded-md border border-border bg-background p-2 text-sm max-w-full" value={query} maxLength={160} onChange={e=>void search(e.target.value)} placeholder="stage, ballroom, air wall…"/>
        </label>
        <Button size="sm" onClick={()=>{setCreating(true);setActive("");setNewNote(emptyNote);setMessage("")}}><FilePlus2 size={16}/> New memory</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_minmax(0,2fr)]">
        <div className="max-h-80 overflow-auto rounded-md border border-border p-2" aria-label="Saved memory notes">
          {notes.length===0?<p className="p-2 text-xs text-muted-foreground">No matching notes yet.</p>:notes.map(n=>
            <button type="button" key={n.id} onClick={()=>void open(n.id)} className={"w-full rounded-md p-2 text-left hover:bg-muted "+(active===n.id?"bg-accent":"")}>
              <span className="block text-sm font-medium break-words">{n.title}</span>
              <span className="block text-xs text-muted-foreground">{n.category} · {new Date(n.modified).toLocaleDateString()}</span>
              <span className="block text-xs text-muted-foreground line-clamp-2">{n.excerpt}</span>
            </button>)}
        </div>
        <div className="min-w-0 rounded-md border border-border p-3 space-y-2">
          {creating?<>
            <label className="block text-xs font-medium">Category
              <select className="mt-1 w-full rounded border border-border bg-background p-2 text-sm" value={newNote.category} onChange={e=>setNewNote(n=>({...n,category:e.target.value as MemoryCategory}))}>{categories.map(cat=><option key={cat}>{cat}</option>)}</select>
            </label>
            <label className="block text-xs font-medium">Title
              <input className="mt-1 w-full rounded border border-border bg-background p-2 text-sm" value={newNote.title} maxLength={140} onChange={e=>setNewNote(n=>({...n,title:e.target.value}))}/>
            </label>
            <label className="block text-xs font-medium">Notes (Markdown)
              <textarea className="mt-1 min-h-40 w-full rounded border border-border bg-background p-2 font-mono text-xs" value={newNote.content} maxLength={24000} onChange={e=>setNewNote(n=>({...n,content:e.target.value}))} placeholder="What worked? What should ShowPilot suggest next time?"/>
            </label>
            <Button size="sm" disabled={saving||!newNote.title.trim()||!newNote.content.trim()} onClick={()=>void add()}><Save size={16}/> Save memory</Button>
          </>:active?<>
            <p className="text-sm font-semibold">Edit memory</p>
            <textarea aria-label="Edit memory Markdown" className="min-h-56 w-full rounded border border-border bg-background p-2 font-mono text-xs" maxLength={24000} value={editing} onChange={e=>setEditing(e.target.value)}/>
            <div className="flex flex-wrap gap-2"><Button size="sm" disabled={saving||!editing.trim()} onClick={()=>void saveEdit()}><Save size={16}/> Save changes</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={()=>void archive()}><Trash2 size={16}/> Move to Trash</Button>
            </div>
          </>:<p className="text-xs text-muted-foreground">Select a note to edit its Markdown or create a new one. Existing Obsidian notes remain ordinary files; no AI model is trained or fine-tuned.</p>}
        </div>
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck size={17}/> Your memories stay in the selected folder. The regular ShowPilot work-data JSON backup does not include this notebook. Copy or back up its folder separately. Cloud AI does not receive notebook notes through this feature.</p>
    </>}
    {message&&<p role="status" className="text-xs rounded border border-border p-2">{message}</p>}
   </>
  }
 </section>;
}
