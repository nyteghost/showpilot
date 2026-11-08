import {useEffect,useMemo,useRef,useState} from "react";
import {BrainCircuit} from "lucide-react";
import {getLocalAiRuntimeState,subscribeLocalAiRuntimeState,reviewRuleEvidenceLocally} from "@/lib/showpilot-ai-local";
import {boundedEvidence,type RuleEvidence} from "@/lib/showpilot-rule-evidence";

/** Non-blocking local AI second opinion; never changes operational data. */
export function ShowPilotRuleReview({evidence}:{evidence:RuleEvidence}){
 const [runtime,setRuntime]=useState(getLocalAiRuntimeState);
 const [result,setResult]=useState<{opinion:string;checks:string[]}|null>(null);
 const [status,setStatus]=useState("");
 const previous=useRef("");
 const safe=useMemo(()=>boundedEvidence(evidence),[evidence.domain,evidence.label,JSON.stringify(evidence.findings)]);
 const fingerprint=JSON.stringify(safe);
 useEffect(()=>subscribeLocalAiRuntimeState(setRuntime),[]);
 useEffect(()=>{
  if(runtime.status!=="ready"||safe.findings.length===0){
   setResult(null);setStatus("");previous.current="";return;
  }
  if(previous.current===fingerprint)return;
  let alive=true;
  const delay=window.setTimeout(()=>{
   previous.current=fingerprint;setResult(null);setStatus("Reviewing with on-device AI…");
   void reviewRuleEvidenceLocally(safe).then(answer=>{
    if(alive){setResult(answer);setStatus("AI second opinion — advisory only");}
   }).catch(error=>{
    if(alive)setStatus("AI review unavailable: "+(error instanceof Error?error.message:String(error)));
   });
  },900);
  return ()=>{alive=false;window.clearTimeout(delay);};
 },[runtime.status,fingerprint]);
 return <div className="rounded-lg border p-3 text-xs" aria-label={"Local AI rule review: "+safe.label}>
  <p className="flex items-center gap-2 font-semibold"><BrainCircuit size={15}/> Rule review · {safe.label}</p>
  <p className="mt-1 text-muted-foreground">Deterministic rules remain authoritative. AI checks for assumptions or omissions but never changes saved results automatically.</p>
  {runtime.status!=="ready"?<p className="mt-2 text-muted-foreground">Enable Local AI in the header for an independent review.</p>:
   <div className="mt-2 space-y-2" role="status">
    <p>{status||"Waiting for rule review…"}</p>
    {result&&<>
     <p><strong>AI opinion:</strong> {result.opinion}</p>
     {result.checks.length>0&&<div><strong>Check before acting:</strong>
      <ul className="ml-4 list-disc">{result.checks.map((check,i)=><li key={i}>{check}</li>)}</ul>
     </div>}
    </>}
   </div>}
 </div>;
}
