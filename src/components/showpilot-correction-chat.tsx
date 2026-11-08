import {useEffect,useRef,useState,type FormEvent} from "react";
import {MessageSquareText,Send,BookCheck} from "lucide-react";
import {conciseChatAnswer,conciseChatReference} from "@/lib/showpilot-chat-format";
import {parseEventDeleteRequest,selectEventDeletionTargets,isExactDeleteConfirmation,type EventDeleteTarget} from "@/lib/showpilot-event-delete";
import {loadDurableShowCatalog} from "@/lib/showpilot-postcon";
import {chatWithShowPilotLocalAI,getLocalAiRuntimeState,subscribeLocalAiRuntimeState,
 type LocalChatMessage} from "@/lib/showpilot-ai-local";

const KEY="showpilot:correction-chat:v1";
function restore():LocalChatMessage[]{
 try{
  const data:unknown=JSON.parse(localStorage.getItem(KEY)||"[]");
  if(!Array.isArray(data))return [];
  return data.filter((x):x is LocalChatMessage=>!!x&&typeof x==="object"&&
   (x.role==="user"||x.role==="assistant")&&typeof x.content==="string"&&x.content.length<=2500)
   .slice(-12).map(x=>x.role==="assistant"?{...x,content:conciseChatAnswer(x.content)}:x);
 }catch{return [];}
}
/** The conversation runs locally; saving a verified correction is a separate
 * deliberate action and never edits the EOC or scheduling algorithm. */
export function ShowPilotCorrectionChat(){
 const [open,setOpen]=useState(false);
 const [runtime,setRuntime]=useState(getLocalAiRuntimeState);
 const [history,setHistory]=useState<LocalChatMessage[]>(restore);
 const [draft,setDraft]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [saved,setSaved]=useState<number[]>([]);
 const [pendingDelete,setPendingDelete]=useState<EventDeleteTarget[]>([]);
 const bottom=useRef<HTMLDivElement>(null);
 useEffect(()=>subscribeLocalAiRuntimeState(setRuntime),[]);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(history.slice(-12)));}catch{}},[history]);
 useEffect(()=>{if(open)bottom.current?.scrollIntoView({block:"end"});},[open,history]);
 const submit=async(e:FormEvent)=>{
  e.preventDefault();
  const content=draft.trim().slice(0,1000);
  if(!content||busy)return;
  setDraft("");
  // Destructive operations never use model-generated instructions: this
  // exact, previewed selection is handled by deterministic application code.
  if(pendingDelete.length){
   if(!isExactDeleteConfirmation(content)){
    setPendingDelete([]);
    setMessage("Deletion cancelled. Request it again to see a new preview.");
    return;
   }
   setBusy(true);setMessage("");
   try{
    const bridge=window.showpilotMemory;
    if(!bridge?.showCatalogDeleteSelected)throw Error("Event deletion requires the portable desktop app.");
    const result=await bridge.showCatalogDeleteSelected({records:pendingDelete});
    setPendingDelete([]);
    setHistory(previous=>[...previous,{role:"assistant" as const,
     content:"Deleted "+result.deleted+" event catalog record"+(result.deleted===1?"":"s")+
      ". A backup was created first; EOCs, attachments and saved workbooks were not deleted."}].slice(-12));
    try{
     await loadDurableShowCatalog();
     window.dispatchEvent(new Event("showpilot:postcon-catalog"));
    }catch(error){
     setMessage("The records were deleted, but the Events screen did not refresh: "+String(error));
    }
   }catch(error){
    setPendingDelete([]);
    setMessage("No records deleted: "+(error instanceof Error?error.message:String(error))+
     ". Request deletion again to refresh the preview.");
   }finally{setBusy(false);}
   return;
  }
  const deletion=parseEventDeleteRequest(content);
  if(deletion){
   if(deletion.kind==="need-date"){
    setMessage("Which events? Say, for example: Delete events before 2025-01-01.");
    return;
   }
   if(deletion.kind==="unrecognized"){
    setMessage("Specify an Event ID, exact show name, or cutoff date. Nothing deleted.");
    return;
   }
   if(!window.showpilotMemory?.showCatalogDeleteSelected){
    setMessage("Event deletion requires ShowPilot's portable desktop app. No records deleted.");
    return;
   }
   setBusy(true);setMessage("");
   try{
    const records=await window.showpilotMemory.showCatalogList();
    const matches=selectEventDeletionTargets(deletion,records);
    if(!matches.length){setMessage("No matching events found in the saved catalog. Nothing deleted.");return;}
    if(matches.length>25){setMessage("Found "+matches.length+" events. Narrow the date or event selection to at most 25 at a time.");return;}
    setPendingDelete(matches);
    setMessage("Review the "+matches.length+" event"+(matches.length===1?"":"s")+" below. Type yes to delete ONLY these catalog records. A verified backup is required. EOCs, attachments, and workbooks stay untouched. Anything other than yes cancels.");
   }catch(error){setMessage("Unable to preview events: "+(error instanceof Error?error.message:String(error)));}
   finally{setBusy(false);}
   return;
  }
  const next=[...history,{role:"user" as const,content}].slice(-12);
  setHistory(next);setDraft("");setBusy(true);setMessage("");
  try{
   const refs:string[]=[];
   if(window.showpilotMemory){
    try{
     const status=await window.showpilotMemory.status();
     if(status.configured){
      const confirmed=await window.showpilotMemory.list("User-verified ShowPilot correction");
      refs.push(...confirmed.map(x=>conciseChatReference(x.title+": "+x.excerpt)).filter(Boolean).slice(0,3));
     }
    }catch{/* Chat works without native memory. */}
   }
   const reply=await chatWithShowPilotLocalAI(next,refs);
   setHistory(previous=>[...previous,{role:"assistant" as const,content:reply}].slice(-12));
  }catch(error){setMessage("Local AI couldn't respond: "+(error instanceof Error?error.message:String(error)));}
  finally{setBusy(false);}
 };
 const remember=async(index:number)=>{
  const item=history[index];
  if(!item||item.role!=="user"||!window.showpilotMemory)return;
  setBusy(true);setMessage("");
  try{
   const status=await window.showpilotMemory.status();
   if(!status.configured)throw Error("Configure Native Memory first under Settings & AI.");
   await window.showpilotMemory.save({
    category:"Lessons Learned",
    title:("User-verified ShowPilot correction: "+item.content.slice(0,80)).slice(0,140),
    content:["## Operator-confirmed correction","- User statement: "+item.content,
     "- Confirmed by operator: yes","- Recorded: "+new Date().toISOString(),
     "This is an operator-provided historical correction, not an automatic change to software rules, approved work orders or source EOCs.",
     "Review event-specific evidence and dates before applying to future shows."].join("\n")
   });
   setSaved(old=>[...old,index]);
   window.dispatchEvent(new Event("showpilot:rule-feedback-saved"));
   setMessage("Correction saved to local Native Memory for future AI reviews.");
  }catch(error){setMessage("Unable to save correction: "+(error instanceof Error?error.message:String(error)));}
  finally{setBusy(false);}
 };
 return <div className="min-w-0" aria-label="ShowPilot correction chat">
  <button type="button" onClick={()=>setOpen(value=>!value)} aria-expanded={open}
   title="Chat with Local AI and correct its assumptions"
   className="flex w-full items-center gap-2 rounded-lg border border-current/20 px-2 py-2 text-left text-xs font-semibold">
   <MessageSquareText size={15}/><span className="truncate">Correct ShowPilot</span>
   <span className="ml-auto">{open?"−":"+"}</span>
  </button>
  {open&&<div className="mt-2 space-y-2 rounded-lg border border-current/20 p-2 text-xs">
   <p className="text-[11px] opacity-80">Chat directly with loaded Local AI. Save a verified correction to memory when you want it remembered.</p>
   <p role="status" className="text-[11px]">{runtime.status==="ready"?"Local AI ready":runtime.status==="loading"?"AI loading":"Local AI not loaded"}</p>
   <div className="max-h-52 space-y-2 overflow-y-auto" aria-live="polite">
    {history.map((item,index)=><div key={index} className="rounded-md border border-current/15 px-2 py-1.5">
     <strong>{item.role==="user"?"You":"Local AI"}</strong>
     <p className="mt-1 whitespace-pre-wrap break-words">{item.content}</p>
     {item.role==="user"&&<button type="button" disabled={busy||saved.includes(index)||!window.showpilotMemory}
      className="mt-1 inline-flex items-center gap-1 underline disabled:opacity-50"
      onClick={()=>void remember(index)}><BookCheck size={12}/>{saved.includes(index)?"Saved":"Save verified correction"}</button>}
    </div>)}
    <div ref={bottom}/>
   </div>
   <form onSubmit={e=>void submit(e)} className="space-y-1">
    <textarea rows={2} maxLength={1000} value={draft} onChange={e=>setDraft(e.target.value)}
     aria-label="Message to local ShowPilot AI"
     placeholder="E.g. The Nov 14 reception belongs to the main event..."
     className="w-full resize-y rounded-md border bg-background p-2 text-foreground"
     disabled={busy}/>
    <button type="submit" disabled={!draft.trim()||busy||(runtime.status!=="ready"&&!pendingDelete.length&&!parseEventDeleteRequest(draft))}
     className="inline-flex items-center gap-1 rounded-md border border-current/30 px-2 py-1.5 disabled:opacity-40">
     <Send size={13}/>{busy?"Working…":pendingDelete.length?"Confirm or cancel":"Send"}
    </button>
   </form>
   {pendingDelete.length>0&&<div role="alert" className="max-h-44 overflow-y-auto rounded-md border border-amber-500 p-2 text-[11px]">
    <strong>Confirm deletion of {pendingDelete.length} catalog record(s):</strong>
    {pendingDelete.map(x=><p key={x.key} className="mt-1 break-words">{x.showDate} · {x.showName}</p>)}
    <strong className="mt-2 block">Type yes below to confirm; any other message cancels.</strong>
   </div>}
   {message&&<p role="status" className="break-words text-[11px]">{message}</p>}
  </div>}
 </div>;
}
