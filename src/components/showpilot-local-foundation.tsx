import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Cpu,FileSpreadsheet,RefreshCw} from "lucide-react";
type Status={enabled:boolean;backend:"auto"|"cuda"|"cpu";background:boolean;engine:string;engineReady:boolean;message:string;template:{stored:boolean;bytes?:number;sha256?:string}};
type Bridge={status:()=>Promise<Status>;configure:(settings:Pick<Status,"enabled"|"backend"|"background">)=>Promise<Status>;chooseTemplate:()=>Promise<Status>};
declare global {interface Window {showpilotLocal?:Bridge}}
export function ShowPilotLocalFoundation(){
 const [state,setState]=useState<Status|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const bridge=window.showpilotLocal;
 useEffect(()=>{if(bridge)void bridge.status().then(setState).catch(e=>setError(String(e)))},[bridge]);
 async function configure(next:Partial<Pick<Status,"enabled"|"backend"|"background">>){
  if(!bridge||!state)return;
  setBusy(true);setError("");
  try{setState(await bridge.configure({enabled:next.enabled??state.enabled,backend:next.backend??state.backend,background:next.background??state.background}))}catch(e){setError(String(e))}finally{setBusy(false)}
 }
 async function template(){if(!bridge)return;setBusy(true);setError("");try{setState(await bridge.chooseTemplate())}catch(e){setError(String(e))}finally{setBusy(false)}}
 return <section className="rounded-xl border p-4 space-y-3" aria-label="ShowPilot Local Intelligence foundation">
  <h2 className="flex items-center gap-2 font-semibold"><Cpu size={19}/> ShowPilot Local Intelligence — foundation</h2>
  <p className="text-sm text-muted-foreground">Offline-first preparation for a future bundled llama.cpp engine. This does not install or run AI models. Existing scheduling and WebGPU AI continue unchanged.</p>
  {!bridge?<p className="text-sm">Portable desktop controls are available in the packaged ShowPilot app.</p>:!state?<p role="status" className="text-sm">Reading local settings…</p>:<>
   <p role="status" className="text-sm"><strong>Engine:</strong> {state.engineReady?"Ready":"Not installed"} · {state.message}</p>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={state.enabled} disabled={busy} onChange={e=>void configure({enabled:e.target.checked})}/> Enable future local engine when installed</label>
   <label className="flex items-center gap-2 text-sm">Preferred processing
    <select className="rounded-md border bg-background px-2 py-1" value={state.backend} disabled={busy} onChange={e=>void configure({backend:e.target.value as Status["backend"]})}>
     <option value="auto">Automatic</option><option value="cuda">NVIDIA CUDA</option><option value="cpu">CPU</option>
    </select>
   </label>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={state.background} onChange={e=>void configure({background:e.target.checked})}/> Allow optional background analysis when engine becomes available</label>
   <div className="rounded-lg border p-3 space-y-2">
    <h3 className="flex items-center gap-2 font-medium text-sm"><FileSpreadsheet size={17}/> Approved Excel master template</h3>
    <p className="text-xs text-muted-foreground">{state.template.stored?"Reference saved locally ("+Math.round((state.template.bytes??0)/1024)+" KB). Exporter integration is planned for the next phase.":"No reference workbook saved yet."}</p>
    <Button size="sm" variant="outline" disabled={busy} onClick={()=>void template()}><FileSpreadsheet size={15}/> Choose master XLSX</Button>
   </div>
   <Button size="sm" variant="ghost" onClick={()=>void bridge.status().then(setState)}><RefreshCw size={14}/> Refresh status</Button>
  </>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>;
}
