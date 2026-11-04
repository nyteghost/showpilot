import {useMemo,useRef,useState} from "react";
import {Activity,CheckCircle2,Copy,Download,FlaskConical,ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {getLocalAiRuntimeState,probeLoadedLocalAi,runLocalPlanningAI,runLocalTaskAI} from "@/lib/showpilot-ai-local";
import {checkStageRules,checkFloorRules,checkStaffingRules,checkPostConRules,checkPlanningValidation,checkWebGpuCompute,
 STAGE_FIXTURE,FLOOR_FIXTURE,FIXTURE_DATE,staffingFixture} from "@/lib/showpilot-diagnostic-checks";
import {diagnosticSteps,diagnosticFailureCode,makeDiagnosticReport,diagnosticReportText,
 type DiagnosticCheck,type DiagnosticId,type DiagnosticCode,type DiagnosticStatus} from "@/lib/showpilot-diagnostics";
import type {NativeDiagnostics} from "@/lib/showpilot-diagnostics-bridge";
import type {EventEntry} from "@/lib/work-tools";

type Outcome={status?:DiagnosticStatus;code?:DiagnosticCode;metrics?:DiagnosticCheck["metrics"]};
const manualTasks=[
 {key:"stagePrint",label:"Stage Planner's actual crew sheet and Layout View print correctly"},
 {key:"floorOverlay",label:"A real CGC floor map aligns with the work order after visual inspection"},
 {key:"excelTemplate",label:"The exported Excel schedule matches the uploaded master template"},
 {key:"postConReopen",label:"I saved a real Post-Con, reopened it, and the notes remained"},
 {key:"offlineModel",label:"I disconnected from the network and the cached Local GPU AI still ran"}
] as const;
const fixes:Record<string,string>={
 GPU_UNAVAILABLE:"Check Windows graphics driver, GPU acceleration, and WebGPU availability.",
 GPU_COMPUTE_ERROR:"The GPU adapter was found but a real compute job failed. Check drivers and GPU feature settings.",
 GPU_MEMORY:"The GPU ran out of memory or was lost. Close competing GPU apps and try a smaller local model.",
 MODEL_RUNTIME_ERROR:"Load the local model under Settings & AI → Local GPU AI. Check that Active AI says Ready.",
 MODEL_FORMAT_ERROR:"The model returned invalid JSON. Try a different small model or rerun the check.",
 MODEL_REJECTED:"Local inference completed, but the recommendation failed validation. Try another model.",
 NOT_LOADED:"First load the selected model under Settings & AI → Local GPU AI. Reopen diagnostics afterward.",
 NO_DATA:"Import the historical memory JSON to exercise history retrieval.",
 NO_BACKUP:"Open Native Memory → Weekly backups and run Back up now to verify a recovery point.",
 STALE_BACKUP:"Open Native Memory → Weekly backups and run Back up now.",
 BACKUP_UNREADABLE:"Inspect the selected backup folder and restore from a different verified JSON snapshot.",
 DATABASE_ERROR:"Native Memory could not pass its read-only integrity check. Back up existing files before repairing.",
 SCHEMA_ERROR:"The Native Memory schema is incomplete. Keep a backup before any app reinstall.",
 EXPORT_ERROR:"Memory could not round-trip its JSON schema. Do not overwrite prior backups.",
 NOT_DESKTOP:"Run these checks from the installed ShowPilot Windows portable app.",
 NOT_CONFIGURED:"Open Native Memory settings and confirm backup preferences.",
 CHECK_ERROR:"An internal check failed. Export the report so the failure code can be investigated.",
 NO_OUTPUT:"The AI request finished without a valid response; try a different model."
};
const syntheticTask={date:FIXTURE_DATE,space:"Hall A",title:"Diagnostic sample",code:"S",eventId:"SAMPLE",start:600,end:1200} as EventEntry;
function pass(metrics?:DiagnosticCheck["metrics"]):Outcome{return {status:"pass",code:"OK",metrics};}
function skip(code:DiagnosticCode):Outcome{return {status:"skip",code};}
function warn(code:DiagnosticCode,metrics?:DiagnosticCheck["metrics"]):Outcome{return {status:"warn",code,metrics};}
function fail(code:DiagnosticCode):Outcome{return {status:"fail",code};}

export function ShowPilotDiagnosticsPanel(){
 const [records,setRecords]=useState<DiagnosticCheck[]>([]);
 const [running,setRunning]=useState(false);
 const [progress,setProgress]=useState("");
 const [done,setDone]=useState(false);
 const [deep,setDeep]=useState(true);
 const [manual,setManual]=useState<Record<string,boolean>>({});
 const [info,setInfo]=useState<{
  native:NativeDiagnostics|null;vendor:string;architecture:string;modelState:string;modelId:string;
 }>({native:null,vendor:"unknown",architecture:"unknown",modelState:"not-loaded",modelId:""});
 const stopped=useRef(false);
 const report=useMemo(()=>done?makeDiagnosticReport({
  version:info.native?.appVersion??__APP_VERSION__,
  platform:info.native?.platform??"Browser",
  architecture:info.native?.architecture??"Other",
  electronMajor:info.native?.electronMajor??0,
  gpuVendor:info.vendor,gpuArchitecture:info.architecture,
  modelState:info.modelState,modelId:info.modelId,
  checks:records,manual
 }):null,[done,info,records,manual]);

 const execute=async()=>{
  if(running)return;
  stopped.current=false;
  setRecords([]);setDone(false);setRunning(true);
  const local:DiagnosticCheck[]=[];
  let native:NativeDiagnostics|null=null,adapter:any=null;
  let vendor="unknown",architecture="unknown";
  const now=()=>performance.now();
  const run=async(id:DiagnosticId,fn:()=>Outcome|Promise<Outcome>,failureCode?:DiagnosticCode)=>{
   if(stopped.current){
    const canceled:DiagnosticCheck={id,status:"skip",code:"SKIPPED_BY_USER",durationMs:0};
    local.push(canceled);setRecords([...local]);return canceled;
   }
   setProgress("Testing: "+diagnosticSteps[id]);
   const start=now();
   let outcome:Outcome;
   try{outcome=await fn();}
   catch(error){outcome=fail(failureCode??diagnosticFailureCode(error));}
   const result:DiagnosticCheck={id,status:outcome.status??"pass",code:outcome.code??"OK",
    durationMs:Math.round(now()-start),...(outcome.metrics?{metrics:outcome.metrics}:{})};
   local.push(result);setRecords([...local]);return result;
  };
  try{
   await run("desktop.runtime",async()=>{
    if(!window.showpilotDiagnostics)return skip("NOT_DESKTOP");
    native=await window.showpilotDiagnostics.inspect();
    if(!native||native.desktop!==true)return fail("NOT_DESKTOP");
    return pass();
   });
   await run("desktop.graphics",()=>!native?skip("NOT_DESKTOP"):pass({
    gpuCompositing:native.gpuFeatures.gpu_compositing??"unknown",
    webgpuFeature:native.gpuFeatures.webgpu??"unknown",
    webglFeature:native.gpuFeatures.webgl??"unknown"
   }));
   await run("gpu.adapter",async()=>{
    const gpu=(navigator as Navigator&{gpu?:{requestAdapter:()=>Promise<any>}}).gpu;
    if(!gpu)return fail("GPU_UNAVAILABLE");
    adapter=await gpu.requestAdapter();
    if(!adapter)return fail("GPU_UNAVAILABLE");
    const detail=adapter.info as {vendor?:string;architecture?:string}|undefined;
    vendor=detail?.vendor?.toLowerCase().trim()||"unknown";
    architecture=detail?.architecture?.toLowerCase().trim()||"unknown";
    // A software fallback adapter is not proof of hardware GPU acceleration.
    return adapter.isFallbackAdapter?warn("GPU_UNAVAILABLE"):pass();
   },"GPU_UNAVAILABLE");
   await run("gpu.compute",async()=>{
    if(!adapter)return skip("GPU_UNAVAILABLE");
    return pass(await checkWebGpuCompute(adapter));
   },"GPU_COMPUTE_ERROR");
   await run("rules.stage",()=>pass(checkStageRules()));
   await run("rules.floor",()=>pass(checkFloorRules()));
   await run("rules.staffing",()=>pass(checkStaffingRules()));
   await run("rules.postcon",()=>pass(checkPostConRules()));
   await run("rules.validation",()=>pass(checkPlanningValidation()));
   await run("memory.sqlite",()=>{
    if(!native)return skip("NOT_DESKTOP");
    if(native.memoryError||!native.memory)return fail("DATABASE_ERROR");
    return native.memory.sqliteIntegrityOK?pass():fail("DATABASE_ERROR");
   });
   await run("memory.schema",()=>{
    if(!native)return skip("NOT_DESKTOP");
    if(!native.memory)return skip("DATABASE_ERROR");
    return native.memory.schemaOK?pass():fail("SCHEMA_ERROR");
   });
   await run("memory.export",()=>{
    if(!native)return skip("NOT_DESKTOP");
    if(!native.memory)return skip("DATABASE_ERROR");
    return native.memory.exportRoundtripOK?pass({
     activeNotes:native.memory.activeNoteCount,archivedNotes:native.memory.archivedNoteCount,
     historicalEntries:native.memory.historicalCount,postCons:native.memory.postConCount
    }):fail("EXPORT_ERROR");
   });
   await run("memory.history",async()=>{
    if(!native?.memory)return skip("NOT_DESKTOP");
    if(native.memory.historicalCount<1)return warn("NO_DATA",{historicalEntries:0});
    // Search returns real memory titles, but diagnostics only record a count.
    if(!window.showpilotMemory)return fail("DATABASE_ERROR");
    const refs=await window.showpilotMemory.search("stage");
    if(!Array.isArray(refs))return fail("DATABASE_ERROR");
    return pass({historicalEntries:native.memory.historicalCount});
   },"DATABASE_ERROR");
   await run("memory.postcon",()=>{
    if(!native?.memory)return skip("NOT_DESKTOP");
    return native.memory.postConCount>0?pass({postCons:native.memory.postConCount}):skip("NO_DATA");
   });
   await run("memory.backup",()=>{
    if(!native?.memory)return skip("NOT_DESKTOP");
    const backup=native.memory;
    if(!backup.weeklyBackupEnabled)return warn("NOT_CONFIGURED");
    if(!backup.backupFolderAccessible||backup.backupCount===0)return warn("NO_BACKUP",{snapshots:backup.backupCount});
    if(!backup.latestBackupValid)return fail("BACKUP_UNREADABLE");
    if(backup.latestBackupAgeDays>9)return warn("STALE_BACKUP",{latestAgeDays:backup.latestBackupAgeDays,snapshots:backup.backupCount});
    return pass({snapshots:backup.backupCount,latestAgeDays:backup.latestBackupAgeDays});
   });
   const modelState=getLocalAiRuntimeState();
   await run("model.status",()=>modelState.status==="ready"?pass({modelReady:true}):warn("NOT_LOADED",{modelReady:false}));
   const modelReady=deep&&modelState.status==="ready"&&Boolean(adapter)&&!stopped.current;
   const progress=(message:string)=>{if(message&&message.length)setProgress("Running live local GPU diagnostics…");};
   if(!modelReady){
    for(const id of ["model.inference","model.stage","model.floor","model.staffing","model.tasks"] as DiagnosticId[])
     await run(id,()=>skip(!deep?"SKIPPED_BY_USER":"NOT_LOADED"));
   }else{
    await run("model.inference",async()=>{
     const ping=await probeLoadedLocalAi();
     return ping.generated?pass({ms:ping.durationMs}):warn("NO_OUTPUT");
    },"MODEL_RUNTIME_ERROR");
    await run("model.stage",async()=>{
     const suggestions=await runLocalPlanningAI("stage",STAGE_FIXTURE,modelState.model,[],progress);
     return suggestions.length?pass({proposals:suggestions.length}):warn("MODEL_REJECTED",{proposals:0});
    },"MODEL_RUNTIME_ERROR");
    await run("model.floor",async()=>{
     const suggestions=await runLocalPlanningAI("floor",FLOOR_FIXTURE,modelState.model,[],progress);
     return suggestions.length?pass({proposals:suggestions.length}):warn("MODEL_REJECTED",{proposals:0});
    },"MODEL_RUNTIME_ERROR");
    await run("model.staffing",async()=>{
     const suggestions=await runLocalPlanningAI("staffing",staffingFixture(),modelState.model,[],progress);
     return suggestions.length?pass({proposals:suggestions.length}):warn("MODEL_REJECTED",{proposals:0});
    },"MODEL_RUNTIME_ERROR");
    await run("model.tasks",async()=>{
     const tasks=await runLocalTaskAI({date:FIXTURE_DATE,dates:[FIXTURE_DATE],entries:[syntheticTask],memory:[]},modelState.model,progress);
     return tasks.length?pass({proposals:tasks.length}):warn("NO_OUTPUT",{proposals:0});
    },"MODEL_RUNTIME_ERROR");
   }
   await run("privacy.audit",()=>{
    const sample=makeDiagnosticReport({
     version:"1.0-beta",platform:"Windows",architecture:"x64",electronMajor:1,
     gpuVendor:"nvidia",gpuArchitecture:"test",modelState:"ready",modelId:"test-model",
     checks:[{id:"memory.sqlite",status:"pass",code:"OK",durationMs:1,metrics:{
      count:1,secretEventTitle:"PRIVATE_TEST_VALUE",localFilePath:"PRIVATE_TEST_VALUE"
     }}]
    });
    return JSON.stringify(sample).includes("PRIVATE_TEST_VALUE")?fail("LOG_PRIVACY_ERROR"):pass();
   });
   setInfo({native,vendor,architecture,modelState:modelState.status,modelId:modelState.model});
  }finally{
   setRecords([...local]);setDone(true);setRunning(false);setProgress("");
  }
 };
 const changeManual=(key:string,value:boolean)=>setManual(m=>({...m,[key]:value}));
 const download=()=>{
  if(!report)return;
  const body=diagnosticReportText(report);
  const blob=new Blob([body],{type:"text/plain;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;
  a.download="ShowPilot-Diagnostics-"+report.generatedAt.replace(/[:.]/g,"-")+".txt";
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 };
 const copy=async()=>{
  if(!report)return;
  try{await navigator.clipboard.writeText(diagnosticReportText(report));setProgress("Diagnostic report copied to clipboard.");}
  catch{setProgress("Copy not available; use Download diagnostic log.");}
 };
 const counts={pass:records.filter(x=>x.status==="pass").length,fail:records.filter(x=>x.status==="fail").length,
  warn:records.filter(x=>x.status==="warn").length,skip:records.filter(x=>x.status==="skip").length};
 return <section className="rounded-xl border p-4 space-y-4" aria-label="ShowPilot Real-World Diagnostics">
  <div className="flex gap-3 items-start">
   <span className="rounded-lg bg-muted p-2"><Activity size={22}/></span>
   <div>
    <h2 className="font-semibold text-lg">Real-World Diagnostics</h2>
    <p className="text-sm text-muted-foreground">Test this Windows PC, GPU compute, locally loaded AI, SQLite memory, backups, Stage Planner, Floor Maps, Event Schedule and Post-Con. Export one privacy-safe report for troubleshooting.</p>
   </div>
  </div>
  <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
   <label className="text-sm flex items-start gap-2">
    <input type="checkbox" className="mt-1" checked={deep} disabled={running} onChange={e=>setDeep(e.target.checked)}/>
    <span><strong>Include actual Local GPU AI generation</strong><span className="block text-xs text-muted-foreground">Runs synthetic test requests through the already loaded model in all four AI workflows. Uses no company documents or historical notes; may be slow on smaller GPUs. It will not download or switch models. Load one first under Local GPU AI.</span></span>
   </label>
   <div className="flex flex-wrap items-center gap-2">
    <Button disabled={running} onClick={()=>void execute()}><FlaskConical size={16}/>{running?"Running checks…":"Run all diagnostics"}</Button>
    {running&&<Button variant="outline" onClick={()=>{stopped.current=true;setProgress("Stopping after the current check finishes. No work data will be changed.");}}>Stop after current check</Button>}
    {report&&<><Button variant="outline" size="sm" onClick={download}><Download size={15}/> Download diagnostic log</Button>
     <Button variant="outline" size="sm" onClick={()=>void copy()}><Copy size={15}/> Copy report</Button></>}
   </div>
   {progress&&<p role="status" className="text-xs text-muted-foreground">{progress}</p>}
   <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck size={15}/> Automated checks do not edit schedules, Post-Con notes, stage plans, or memory. No raw work documents, notes, employee names, API keys, machine paths, or model responses appear in the report.</p>
  </div>
  {records.length>0&&<div className="space-y-2">
   <div className="flex flex-wrap gap-3 text-xs font-semibold">
    <span>{counts.pass} passed</span><span>{counts.fail} failed</span><span>{counts.warn} warnings</span><span>{counts.skip} skipped</span>
   </div>
   <div className="max-h-80 space-y-1 overflow-auto rounded border p-2">
    {records.map(r=><div key={r.id} className="flex items-start justify-between gap-3 border-b py-1.5 text-xs last:border-b-0">
     <div><p className="font-medium">{diagnosticSteps[r.id]}</p>
      <p className="text-muted-foreground">{r.code} · {r.durationMs} ms{fixes[r.code]?" — "+fixes[r.code]:""}</p>
     </div>
     <strong className={r.status==="fail"?"text-destructive":r.status==="pass"?"text-green-700 dark:text-green-400":"text-muted-foreground"}>{r.status.toUpperCase()}</strong>
    </div>)}
   </div>
  </div>}
  <div className="space-y-2 rounded-lg border p-3">
   <h3 className="text-sm font-semibold flex items-center gap-2"><CheckCircle2 size={16}/> Manual checks with your actual files</h3>
   <p className="text-xs text-muted-foreground">These cannot be verified from a synthetic test without inspecting your real screen, printer and documents. Check them only after you have personally verified each one. Your answers are included in the downloaded report, but no underlying files are copied.</p>
   {manualTasks.map(task=><label key={task.key} className="flex gap-2 items-start text-xs"><input type="checkbox" className="mt-0.5" checked={manual[task.key]===true} onChange={e=>changeManual(task.key,e.target.checked)}/>{task.label}</label>)}
  </div>
  {done&&<p role="status" className="text-sm">Diagnostics finished. {counts.fail?"Some checks failed; download the log for review.":"Review any warnings or skipped items, then download the log."} You can paste the text into ChatGPT without attaching sensitive workbooks.</p>}
 </section>;
}
