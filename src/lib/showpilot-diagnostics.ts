/** User-shareable support reports. Deliberate allowlists prevent work titles,
 * names, notes, paths, raw model completions, tokens or exception strings
 * from leaking into exported diagnostics, including through hostile errors.
 */
export type DiagnosticStatus="pass"|"fail"|"warn"|"skip";
export const diagnosticSteps={
 "desktop.runtime":"Desktop application and Electron environment",
 "desktop.graphics":"Electron GPU feature flags",
 "gpu.adapter":"Local WebGPU adapter detected",
 "gpu.compute":"Real GPU compute-shader round trip",
 "model.status":"Local AI model loaded",
 "model.inference":"Actual on-device AI generation",
 "model.stage":"Local AI Stage Planner recommendation",
 "model.floor":"Local AI Floor Maps recommendation",
 "model.staffing":"Local AI Event Schedule recommendation",
 "model.tasks":"Local AI engineering-task recommendation",
 "rules.stage":"Stage inventory and solver safety",
 "rules.floor":"Floor-map utility and booth parsing",
 "rules.staffing":"CGC scheduling and hard rules",
 "rules.postcon":"Post-Con show selection and venue filter",
 "rules.validation":"AI output scope validation",
 "memory.sqlite":"Native SQLite database integrity",
 "memory.schema":"Native Memory table schema",
 "memory.export":"JSON memory export/restore round trip (read-only)",
 "memory.history":"Historical schedules imported",
 "memory.postcon":"Saved Post-Con reports",
 "memory.backup":"Weekly backup health and recovery file",
 "privacy.audit":"Diagnostic report privacy and read-only policy"
} as const;
export type DiagnosticId=keyof typeof diagnosticSteps;
export type DiagnosticCode=
 "OK"|"NOT_DESKTOP"|"UNAVAILABLE"|"NOT_LOADED"|"NOT_CONFIGURED"|"NO_DATA"|"NO_BACKUP"|
 "STALE_BACKUP"|"BACKUP_UNREADABLE"|"DATABASE_ERROR"|"SCHEMA_ERROR"|"EXPORT_ERROR"|
 "GPU_UNAVAILABLE"|"GPU_COMPUTE_ERROR"|"GPU_MEMORY"|"MODEL_RUNTIME_ERROR"|
 "MODEL_FORMAT_ERROR"|"MODEL_REJECTED"|"LOG_PRIVACY_ERROR"|"CHECK_ERROR"|"NO_OUTPUT"|"SKIPPED_BY_USER";
const codes=new Set<DiagnosticCode>([
 "OK","NOT_DESKTOP","UNAVAILABLE","NOT_LOADED","NOT_CONFIGURED","NO_DATA","NO_BACKUP",
 "STALE_BACKUP","BACKUP_UNREADABLE","DATABASE_ERROR","SCHEMA_ERROR","EXPORT_ERROR",
 "GPU_UNAVAILABLE","GPU_COMPUTE_ERROR","GPU_MEMORY","MODEL_RUNTIME_ERROR",
 "MODEL_FORMAT_ERROR","MODEL_REJECTED","LOG_PRIVACY_ERROR","CHECK_ERROR","NO_OUTPUT","SKIPPED_BY_USER"
]);
export type DiagnosticCheck={
 id:DiagnosticId;status:DiagnosticStatus;code:DiagnosticCode;durationMs:number;
 metrics?:Record<string,number|boolean|string>;
};
const metricAllowlist=new Set([
 "count","activeNotes","archivedNotes","historicalEntries","postCons","snapshots","latestAgeDays",
 "proposals","unresolved","assignments","days","ms","schemaVersion","gpuCompositing",
 "webgpuFeature","webglFeature","modelReady","computedValue"
]);
function safeMetrics(input:DiagnosticCheck["metrics"]):DiagnosticCheck["metrics"]{
 if(!input)return undefined;
 const out:Record<string,number|boolean|string>={};
 for(const [key,value] of Object.entries(input)){
  if(!metricAllowlist.has(key))continue;
  if(typeof value==="boolean")out[key]=value;
  if(typeof value==="number"&&Number.isFinite(value))out[key]=Math.max(-1,Math.min(1e9,Math.round(value*100)/100));
  if(typeof value==="string"&&["gpuCompositing","webgpuFeature","webglFeature"].includes(key))
   out[key]=/^(enabled|disabled|unavailable|unknown|software|readback|off|on)$/i.test(value)?value:"unknown";
 }
 return Object.keys(out).length?out:undefined;
}
export function diagnosticFailureCode(error:unknown):DiagnosticCode{
 // Never put a raw exception message into the report: it may include local
 // file paths, company identifiers or model outputs.
 const name=error&&typeof error==="object"&&"name" in error?String((error as {name?:unknown}).name):"";
 const message=error instanceof Error?error.message:typeof error==="string"?error:"";
 if(/out of memory|allocation failed|device lost|resource exhausted/i.test(name+" "+message))return "GPU_MEMORY";
 if(/GrammarMatcher|JSON|json_object|grammar|invalid response|malformed/i.test(name+" "+message))return "MODEL_FORMAT_ERROR";
 if(/webgpu|adapter|device|shader/i.test(name+" "+message))return "GPU_COMPUTE_ERROR";
 return "CHECK_ERROR";
}
export function makeDiagnosticReport(input:{
 version:string;platform:string;architecture:string;electronMajor:number;
 gpuVendor:string;gpuArchitecture:string;modelState:string;modelId:string;
 checks:readonly DiagnosticCheck[];manual?:Readonly<Record<string,boolean>>;
}){
 const manualKeys=["stagePrint","floorOverlay","excelTemplate","postConReopen","offlineModel"];
 const checks=input.checks.filter(c=>c.id in diagnosticSteps).map(c=>({
  id:c.id,label:diagnosticSteps[c.id],status:c.status,
  code:codes.has(c.code)?c.code:"CHECK_ERROR",
  durationMs:Math.max(0,Math.min(1e9,Math.round(c.durationMs))),
  ...(safeMetrics(c.metrics)?{metrics:safeMetrics(c.metrics)}:{})
 }));
 const summary={pass:checks.filter(c=>c.status==="pass").length,
  fail:checks.filter(c=>c.status==="fail").length,
  warn:checks.filter(c=>c.status==="warn").length,
  skip:checks.filter(c=>c.status==="skip").length};
 const safeVersion=/^[a-zA-Z0-9._+-]{1,80}$/.test(input.version)?input.version:"unknown";
 const knownPlatforms=new Set(["Windows","Linux","macOS","Other","Browser"]);
 const knownGpuVendor=new Set(["nvidia","intel","amd","apple","microsoft","unknown","qualcomm"]);
 const vendor=input.gpuVendor.toLowerCase().trim();
 const architecture=/^[a-z0-9 _.+-]{1,60}$/i.test(input.gpuArchitecture)?input.gpuArchitecture:"unknown";
 const model=/^[a-zA-Z0-9_.-]{1,130}$/.test(input.modelId)?input.modelId:"unknown";
 const manual=Object.fromEntries(manualKeys.map(key=>[key,input.manual?.[key]===true]));
 return {
  format:"showpilot-diagnostics",version:1,
  generatedAt:new Date().toISOString(),
  privacy:"No file paths, user names, event/customer details, shifts, schedule text, Post-Con content, API keys, model prompts or completions are included.",
  environment:{
   appVersion:safeVersion,
   platform:knownPlatforms.has(input.platform)?input.platform:"Other",
   architecture:["x64","arm64","Other"].includes(input.architecture)?input.architecture:"Other",
   electronMajor:Number.isFinite(input.electronMajor)?Math.max(0,Math.floor(input.electronMajor)):0,
   gpuVendor:knownGpuVendor.has(vendor)?vendor:"unknown",
   gpuArchitecture:architecture,
   modelState:["ready","loading","not-loaded","error"].includes(input.modelState)?input.modelState:"unknown",
   modelId:model
  },summary,checks,manual
 };
}
export function diagnosticReportText(report:ReturnType<typeof makeDiagnosticReport>){
 const lines=[
  "SHOWPILOT REAL-WORLD DIAGNOSTICS",
  "Generated: "+report.generatedAt,
  "App: "+report.environment.appVersion+" | "+report.environment.platform+" "+report.environment.architecture+
    " | Electron "+report.environment.electronMajor,
  "GPU: "+report.environment.gpuVendor+" "+report.environment.gpuArchitecture,
  "Local model: "+report.environment.modelId+" ("+report.environment.modelState+")",
  "Results: "+report.summary.pass+" pass | "+report.summary.fail+" fail | "+
    report.summary.warn+" warn | "+report.summary.skip+" skipped",
  "",
  ...report.checks.map(c=>"["+c.status.toUpperCase()+"] "+c.label+" | "+c.code+
   " | "+c.durationMs+" ms"+(c.metrics?" | "+Object.entries(c.metrics).map(([k,v])=>k+"="+v).join(", "):"")),
  "",
  "MANUAL CHECKS (checked = visually confirmed by user)",
  ...Object.entries(report.manual).map(([k,v])=>k+": "+(v?"confirmed":"not confirmed")),
  "",
  "PRIVACY: "+report.privacy,
  "Model output is evaluated locally and never copied to this log."
 ];
 return lines.join("\n");
}
