import {useEffect,useState} from "react";
import {BrainCircuit,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {runLocalPlanningAI} from "@/lib/showpilot-ai-local";
import {type PlanningKind,type PlanningContext,type PlanningSuggestion} from "@/lib/showpilot-planning";
import type {MemoryReference} from "@/lib/showpilot-memory-bridge";

const modelKey="showpilot:ai:local-model";
const copy={
 stage:{title:"Local AI · Stage planning",button:"Suggest stage configurations",disclaimer:"Every proposed size is checked against the current deck solver and available inventory. This is not a structural or load certification."},
 floor:{title:"Local AI · Floor-map review",button:"Analyze unanswered booths",disclaimer:"AI can point to current unresolved questions, not invent coordinates or color booths. Verify each physical location on the plan before changing it."},
 staffing:{title:"Local AI · Staffing review",button:"Analyze staffing with historical memory",disclaimer:"AI explains current rule-based draft assignments and historical patterns. It never changes personnel shifts or the approved Excel workbook."},
};
export function LocalPlanningAssistant({
 kind,context,memoryQuery,onApply,applyLabel
}:{
 kind:PlanningKind;context:PlanningContext;memoryQuery:string;
 onApply?:(suggestion:PlanningSuggestion)=>void;applyLabel?:string;
}){
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const [suggestions,setSuggestions]=useState<PlanningSuggestion[]>([]);
 const [references,setReferences]=useState<MemoryReference[]>([]);
 const [approved,setApproved]=useState<string[]>([]);
 const key=JSON.stringify(context);
 useEffect(()=>{setSuggestions([]);setReferences([]);setApproved([]);},[key]);
 const run=async()=>{
  if(busy)return;
  setBusy(true);setStatus("");setSuggestions([]);setReferences([]);setApproved([]);
  try{
   const model=(()=>{try{return localStorage.getItem(modelKey)||"";}catch{return "";}})();
   if(!model)throw Error("Open Settings & AI → Local GPU AI, select and load a model first.");
   let refs:MemoryReference[]=[];
   if(window.showpilotMemory){
    try{refs=await window.showpilotMemory.search(memoryQuery.slice(0,160));}
    catch{/* Memory is optional for inference. */}
   }
   setReferences(refs);
   const found=await runLocalPlanningAI(kind,context,model,
    refs.map(r=>r.title+" ("+r.category+"): "+r.excerpt),setStatus);
   setSuggestions(found);
   setStatus(found.length?found.length+" locally generated recommendations for review.":"No valid AI recommendations matched the current rules or inventory. Your existing deterministic plan is unchanged.");
  }catch(e){setStatus("Local AI planning could not run: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 };
 const remember=async(item:PlanningSuggestion)=>{
  if(!window.showpilotMemory)return setStatus("Native Memory requires the Windows/Linux portable app.");
  try{
   await window.showpilotMemory.save({
    category:kind==="stage"?"Stage Setups":"Lessons Learned",
    title:("Reviewed "+kind+" planning idea: "+item.title).slice(0,140),
    content:[
     "## Operator-reviewed AI planning idea (not confirmed as executed)",
     "- Module: "+kind,
     "- Proposal: "+item.title,
     "- Reason: "+item.reason,
     "- Evidence: "+item.evidence.join("; "),
     "- Saved on: "+new Date().toISOString().slice(0,10),
     "",
     "This is a historical planning reference, not a standing instruction. Confirm current venue, equipment, employee availability, work orders, and approvals before applying it."
    ].join("\n")
   });
   setApproved(a=>[...a,item.id]);
   setStatus("Reviewed planning idea saved to local memory.");
  }catch(e){setStatus("Could not save the planning note: "+(e as Error).message);}
 };
 const meta=copy[kind];
 return <section className="no-print rounded-xl border border-border bg-card p-3 space-y-3" aria-label={meta.title}>
  <div className="flex items-start gap-2"><BrainCircuit size={19}/><div><h3 className="font-semibold text-sm">{meta.title}</h3>
   <p className="text-xs text-muted-foreground">Uses the same optional on-device WebGPU model as the AI Task Assistant, plus relevant private Native Memory references.</p></div></div>
  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void run()}><BrainCircuit size={16}/>{busy?"Thinking locally…":meta.button}</Button>
  <p className="text-xs text-muted-foreground"><ShieldCheck size={13} className="inline mr-1"/>{meta.disclaimer}</p>
  {status&&<p className="rounded border border-border p-2 text-xs" role="status">{status}</p>}
  {references.length>0&&<details className="text-xs"><summary className="cursor-pointer">Historical memory consulted ({references.length})</summary>
   <ul className="mt-1 list-disc pl-4">{references.map(r=><li key={r.id}>{r.title} · {r.category}</li>)}</ul>
  </details>}
  {suggestions.map(s=><div key={s.id} className="space-y-2 rounded-lg border p-3">
   <p className="text-sm font-semibold">{s.title}</p>
   {s.stage&&<p className="text-xs font-medium">{s.stage.widthFt} × {s.stage.lengthFt} ft · {s.stage.heightIn} in high · {s.stage.mostlyThree?"Prefer 3-deck holders":"Minimize holders"}</p>}
   {s.staffName&&s.date&&<p className="text-xs font-medium">{s.date} · {s.staffName} · existing draft assignment</p>}
   {s.targetId&&<p className="text-xs font-medium">Unresolved work-order question: {s.targetId}</p>}
   <p className="text-xs">{s.reason}</p>
   <p className="text-xs text-muted-foreground">Evidence: {s.evidence.length?s.evidence.join(" · "):"Model did not cite specific evidence; verify before use."}</p>
   <div className="flex flex-wrap gap-2">
    {onApply&&<Button size="sm" onClick={()=>{onApply(s);setSuggestions([]);setStatus("Applied for review. Verify the result before saving or publishing.");}}>{applyLabel??"Review suggestion"}</Button>}
    <Button size="sm" variant="outline" disabled={approved.includes(s.id)} onClick={()=>void remember(s)}>{approved.includes(s.id)?"Saved to memory":"Save reviewed idea to memory"}</Button>
   </div>
  </div>)}
 </section>;
}
