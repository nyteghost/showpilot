import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EventEntry, TaskNote } from "@/lib/work-tools";
import { taskContext, validateTaskResponse, type AiTaskSuggestion } from "@/lib/showpilot-ai-tasks";
import { runLocalTaskAI } from "@/lib/showpilot-ai-local";
import { AI_PROVIDERS, type AiProviderId } from "@/lib/showpilot-ai-providers";
import { reviewScopeDates, reviewScopeLabel, reviewWeekStart, type ReviewDateScope } from "@/lib/showpilot-review-months";
import { approvedTaskMemoryDraft } from "@/lib/showpilot-memory-notes";
import type { MemoryReference } from "@/lib/showpilot-memory-bridge";

const modelKey="showpilot:ai:local-model";
function aiError(e:unknown):string {
 if(e instanceof Error&&e.message)return e.message;
 if(typeof e==="string"&&e.trim())return e;
 if(e&&typeof e==="object"){
  const o=e as {message?:unknown;reason?:unknown;cause?:unknown};
  for(const v of [o.message,o.reason,o.cause])if(typeof v==="string"&&v.trim())return v;
  try{const description=JSON.stringify(e);if(description&&description!=="{}")return description.slice(0,300)}catch{}
 }
 return "Unknown AI runtime error; inspect the model status in Settings & AI.";
}
type Mode="local"|"online";
export function AiTaskAssistant({ entries, tasks, onApprove, scope }:{
 entries:EventEntry[]; tasks:TaskNote[]; scope:ReviewDateScope|null; onApprove:(task:TaskNote)=>void;
}) {
 const scopeKey=(scope?.view??"none")+":"+(scope?.value??"");
 const selectedDates=useMemo(()=>reviewScopeDates(entries,scope),[entries,scopeKey]);
 const eligibleDates=useMemo(()=>selectedDates.filter(d=>entries.some(e=>e.date===d&&
   ["S","MI","Exmi","MO"].includes(e.code)&&!/\\b(?:cepac|cobb energy|performing arts)\\b/i.test(e.space))),[entries,selectedDates]);
 const weeks=useMemo(()=>{
   const grouped=new Map<string,string[]>();
   for(const d of eligibleDates){const wk=reviewWeekStart(d)??d;grouped.set(wk,[...(grouped.get(wk)??[]),d]);}
   return [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,ds])=>ds);
 },[eligibleDates]);
 const scopeVersion=useRef(scopeKey);
 scopeVersion.current=scopeKey;
 const [mode,setMode]=useState<Mode>("local");
 const [available,setAvailable]=useState<AiProviderId[]>([]);
 const [provider,setProvider]=useState<AiProviderId>("openai");
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [suggestions,setSuggestions]=useState<AiTaskSuggestion[]>([]);
 const [edits,setEdits]=useState<Record<string,string>>({});
 const [dismissed,setDismissed]=useState<string[]>([]);
 const [memoryRefs,setMemoryRefs]=useState<MemoryReference[]>([]);
 useEffect(()=>{if(!window.showpilotAI)return;void window.showpilotAI.status().then(s=>{
   const p=s.providers.filter((n):n is AiProviderId=>AI_PROVIDERS.some(x=>x.id===n&&x.canGenerate));
   setAvailable(p);if(p.length)setProvider(p[0]!);
 }).catch(()=>{})},[]);
 const list=suggestions.filter(s=>!dismissed.includes(s.id));
 const run=async()=>{
  if(!scope||!weeks.length||busy)return;
  const selectedScope=scopeVersion.current;
  setBusy(true);setStatus("");setSuggestions([]);setDismissed([]);setEdits({});setMemoryRefs([]);
  try{
   let model="";
   if(mode==="local"){
     model=(()=>{try{return localStorage.getItem(modelKey)||""}catch{return ""}})();
     if(!model)throw new Error("Choose and download a local model in Settings & AI first.");
   } else {
     if(!window.showpilotAI||!available.includes(provider))throw new Error("Connect a supported cloud provider in Settings first.");
     const count=weeks.length;
     if(!window.confirm("Analyze "+count+" selected week"+(count===1?"":"s")+
       " and use the week before and after each as context? This sends event names, rooms, phases and times in "+
       count+" request"+(count===1?"":"s")+" to "+provider+
       ". No PDFs, employee shifts, notebook memories or API keys will be sent."))return;
   }
   let refs:MemoryReference[]=[];
   if(mode==="local"&&window.showpilotMemory){
     try{
       const memory=window.showpilotMemory;
       if((await memory.status()).configured){
         const selected=new Set(eligibleDates);
         const keywords=[...new Set(entries.filter(e=>selected.has(e.date)).flatMap(e=>[e.space,e.title]))].join(" ").slice(0,155);
         refs=await memory.search(keywords);
         setMemoryRefs(refs);
       }
     }catch{/* Notebook is optional. */}
   }
   const all:AiTaskSuggestion[]=[];
   const failed:string[]=[];
   for(let i=0;i<weeks.length;i++){
     if(scopeVersion.current!==selectedScope)throw new Error("Schedule selection changed; rerun the assistant.");
     const dates=weeks[i]!;
     const input={date:dates[0]!,dates,entries,
       memory:refs.map(r=>r.title+" ("+r.category+"): "+r.excerpt)};
     const context=taskContext(input);
     const progress="Analyzing selected week "+(i+1)+"/"+weeks.length+" (plus prior and following weeks)…";
     setStatus(progress);
     try{
       if(mode==="local"){
         const found=await runLocalTaskAI(input,model,message=>setStatus(progress+" "+message));
         all.push(...found);
       }else{
         const raw=await window.showpilotAI!.suggestTasks(provider,context);
         all.push(...validateTaskResponse(raw,context,"online"));
       }
     }catch(e){failed.push(dates[0]!+": "+aiError(e));}
   }
   if(scopeVersion.current!==selectedScope)throw new Error("Schedule selection changed; rerun the assistant.");
   if(failed.length===weeks.length)throw new Error(failed.join(" | "));
   const existing=new Set(tasks.map(t=>[t.date,t.section,t.text.toLowerCase().trim()].join("|")));
   const unique=new Map<string,AiTaskSuggestion>();
   for(const suggestion of all){
     const key=[suggestion.task.date,suggestion.task.section,suggestion.task.text.toLowerCase().trim()].join("|");
     if(!existing.has(key)&&!unique.has(key))unique.set(key,suggestion);
   }
   const result=[...unique.values()];
   setSuggestions(result);
   setStatus((result.length?result.length+" suggestions to review.":"No usable new suggestions.")+
     " Only the selected period can receive tasks; adjacent weeks provide context only."+
     (failed.length?" "+failed.length+" week(s) failed: "+failed.join(" | ").slice(0,500):""));
  }catch(e){setStatus("AI suggestion failed: "+aiError(e))}
  finally{setBusy(false)}
 };
 const approve=(s:AiTaskSuggestion)=>{
  const text=(edits[s.id]??s.task.text).trim();
  if(!text){setStatus("Enter a task description before approving.");return;}
  const approved={...s.task,text};
  onApprove(approved);
  setDismissed(a=>[...a,s.id]);
  setStatus("Approved task added to your reviewed schedule; Excel export will include it.");
  if(window.showpilotMemory)void (async()=>{
    try{
      const memory=window.showpilotMemory!;
      const prefs=await memory.status();
      if(!prefs.configured||!prefs.rememberTasks)return;
      await memory.save(approvedTaskMemoryDraft(approved,s.reason,s.evidence));
      setStatus("Approved task added to your schedule and saved to your Obsidian notebook.");
    }catch(e){setStatus("Task approved in schedule. Could not save notebook memory: "+(e as Error).message)}
  })();
 };
 return <section className="space-y-3 rounded-xl border border-border p-3 sm:p-4" aria-label="AI Task Assistant">
   <div className="flex items-start gap-3">
     <span className="rounded-lg bg-muted p-2"><Sparkles size={20}/></span>
     <div><h3 className="font-semibold">AI Task Assistant</h3>
       <p className="text-xs text-muted-foreground">Suggests air-wall, stage and room-turn checks. Recommendations never change engineer shifts and require your approval.</p></div>
   </div>
   <div className="flex flex-wrap gap-3 items-center">
     <label className="text-sm">Date <select aria-label="AI task date" className="rounded border bg-background px-3 py-2" value={chosenDate} onChange={e=>setDate(e.target.value)}>{dates.map(d=><option value={d} key={d}>{d}</option>)}</select></label>
     <label className="text-sm">Mode <select aria-label="AI task mode" className="rounded border bg-background px-3 py-2" value={mode} onChange={e=>setMode(e.target.value as Mode)}>
       <option value="local">Local GPU (private, no server)</option><option value="online">Cloud provider (optional)</option>
     </select></label>
     {mode==="online"&&<label className="text-sm">Provider <select className="rounded border bg-background px-3 py-2" value={provider} onChange={e=>setProvider(e.target.value as AiProviderId)}>
       {available.map(x=><option value={x} key={x}>{AI_PROVIDERS.find(a=>a.id===x)?.name}</option>)}
     </select></label>}
     <Button size="sm" onClick={()=>void run()} disabled={!chosenDate||busy||(mode==="online"&&!available.length)}>
       <Sparkles size={16}/>{busy?"Analyzing...":"Suggest engineering tasks"}
     </Button>
   </div>
   <p className="text-xs text-muted-foreground flex items-center gap-2"><ShieldCheck size={14}/> Local mode reads relevant local notebook notes when connected, without sending them online. Cloud mode sends no notebook memories. First-time model loading requires a download; cached models can run without internet.</p>
   {status&&<p role="status" className="text-xs rounded bg-muted p-2">{status}</p>}
   {memoryRefs.length>0&&<div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
    <strong>Related notes from your local ShowPilot notebook</strong>
    {memoryRefs.map(n=><p key={n.id}><span className="font-semibold">{n.title}</span> · {n.category}</p>)}
    <p className="text-muted-foreground">Used as historical hints for this local GPU request only. Confirm current room, stage and safety details before approving.</p>
   </div>}
   {list.map(s=><div key={s.id} className="rounded-lg border p-3 space-y-2">
     <div className="flex justify-between gap-2 text-xs text-muted-foreground"><span>{s.task.date} · {s.task.section} · {s.provider==="local"?"Local GPU":"Online AI"}</span><span>Requires approval</span></div>
     <Input aria-label={"Edit suggested task "+s.id} value={edits[s.id]??s.task.text} onChange={e=>setEdits(a=>({...a,[s.id]:e.target.value}))}/>
     <p className="text-xs">{s.reason}</p>
     <p className="text-xs text-muted-foreground">Evidence: {s.evidence.join(" · ")}</p>
     <div className="flex gap-2"><Button size="sm" onClick={()=>approve(s)}>Approve and add to schedule</Button>
       <Button size="sm" variant="outline" onClick={()=>setDismissed(a=>[...a,s.id])}>Dismiss</Button></div>
   </div>)}
 </section>;
}
