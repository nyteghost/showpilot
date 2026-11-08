import {useEffect,useState} from "react";
type Channel="main"|"beta";
type Latest={
 runId:number;buildNumber:number;version:string|null;sha:string;created:string;url:string;
 artifact:string;platform:string;installAvailable?:boolean;
};
type Check={channel:Channel;platform:string;latest:null|Latest;upToDate:boolean;message:string};
type UpdateProgress={phase:string;message:string;percent:number};
type LastUpdate={status:"pending"|"success"|"failed";message:string;version:string;updated:string};
type Api={
 status:()=>Promise<{channel:Channel;installedVersion:string;platform:string;lastUpdate?:LastUpdate|null}>;
 setChannel:(v:Channel)=>Promise<{channel:Channel}>;
 check:()=>Promise<Check>;
 open:()=>Promise<unknown>;
 openLog:()=>Promise<unknown>;
 copyReport:()=>Promise<{copied:boolean;hasLog:boolean}>;
 install:()=>Promise<{cancelled?:boolean;started?:boolean;version?:string}>;
 onProgress:(callback:(event:UpdateProgress)=>void)=>(()=>void);
};
declare global {interface Window {showpilotUpdates?:Api}}
export function ShowPilotUpdates(){
 const api=typeof window!=="undefined"?window.showpilotUpdates:undefined;
 const [channel,setChannel]=useState<Channel>("beta");
 const [version,setVersion]=useState("");
 const [platform,setPlatform]=useState("win32");
 const [check,setCheck]=useState<Check|null>(null);
 const [busy,setBusy]=useState(false);
 const [installing,setInstalling]=useState(false);
 const [progress,setProgress]=useState<UpdateProgress|null>(null);
 const [lastUpdate,setLastUpdate]=useState<LastUpdate|null>(null);
 const [error,setError]=useState("");
 const [copiedReport,setCopiedReport]=useState("");
 useEffect(()=>{if(api)void api.status().then(s=>{
  setChannel(s.channel);setVersion(s.installedVersion);setPlatform(s.platform);setLastUpdate(s.lastUpdate??null);
 }).catch(e=>setError(String(e)))},[api]);
 useEffect(()=>{
  if(!api||lastUpdate?.status!=="pending")return;
  const interval=window.setInterval(()=>{
   void api.status().then(s=>setLastUpdate(s.lastUpdate??null)).catch(()=>{});
  },3500);
  return ()=>window.clearInterval(interval);
 },[api,lastUpdate?.status]);
 useEffect(()=>{
  if(!api?.onProgress)return;
  return api.onProgress(setProgress);
 },[api]);
 const change=async(v:Channel)=>{
  setError("");setCheck(null);setProgress(null);
  if(!api)return;
  try{await api.setChannel(v);setChannel(v)}catch(e){setError(String(e))}
 };
 const run=async()=>{
  if(!api)return;
  setBusy(true);setError("");setProgress(null);
  try{setCheck(await api.check())}catch(e){setError(String(e))}
  finally{setBusy(false)}
 };
 const open=async()=>{
  if(!api)return;
  setBusy(true);setError("");
  try{await api.open()}catch(e){setError(String(e))}
  finally{setBusy(false)}
 };
 const openLog=async()=>{
  if(!api?.openLog)return;
  try{await api.openLog()}catch(e){setError(e instanceof Error?e.message:String(e))}
 };
 const copyReport=async()=>{
  if(!api?.copyReport)return;
  setCopiedReport("");
  try{
   const result=await api.copyReport();
   setCopiedReport(result.copied?(result.hasLog?
    "Updater report copied. Paste it into the ShowPilot troubleshooting chat to identify the specific install blocker.":
    "No installation log exists yet. Basic updater status was copied."):
    "Could not copy the updater report.");
  }catch(e){setError("Couldn't copy updater diagnostics: "+(e instanceof Error?e.message:String(e)));}
 };
 const install=async()=>{
  if(!api?.install||installing)return;
  setInstalling(true);setError("");setProgress(null);
  try{
   const response=await api.install();
   if(response.cancelled){setProgress(null);return}
   if(response.started)setProgress({phase:"restarting",message:"Update verified. Installer handoff requested; restart is not yet confirmed.",percent:100});
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setInstalling(false)}
 };
 const autoReady=!!check?.latest?.installAvailable&&!check.upToDate&&platform==="win32";
 const downloading=progress&&["verifying","downloading","staging","restarting"].includes(progress.phase);
 return <div className="rounded-lg border border-border p-4 space-y-3">
  <h2 className="font-semibold text-lg">App Updates</h2>
  <p className="text-sm text-muted-foreground">Check for the newest ShowPilot build, then download and install a verified Windows portable update directly in the app.</p>
  {!api?<p className="text-sm">In-app updates are available in the Windows desktop application. Other platforms can download packages from GitHub.</p>:<>
   <label className="block text-sm font-medium">Update channel
    <select className="block mt-1 rounded border border-border bg-background p-2 w-full max-w-xs"
     value={channel} disabled={busy||installing} onChange={e=>void change(e.target.value as Channel)}>
     <option value="main">Main — stable</option><option value="beta">Beta — testing</option>
    </select>
   </label>
   <p className="text-xs text-muted-foreground">Installed: {version||"Unknown"} · {platform==="linux"?"Linux x86_64":platform==="win32"?"Windows x64":platform}. Only verified Windows beta releases support automatic installation at present.</p>
   <div className="flex gap-2 flex-wrap">
    <button type="button" className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50"
     disabled={busy||installing} onClick={()=>void run()}>{busy?"Checking…":"Check for Updates"}</button>
    {autoReady&&<button type="button" className="rounded bg-blue-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
     disabled={busy||installing} onClick={()=>void install()}>{installing?"Preparing update…":"Download & Install Update"}</button>}
    {check?.latest&&!check.upToDate&&<button type="button"
     className="rounded border border-border px-4 py-2 text-sm disabled:opacity-50"
     disabled={busy||installing} onClick={()=>void open()}>View GitHub build (manual)</button>}
   </div>
   {lastUpdate&&<div className="space-y-2 rounded-md border border-border p-3" role="status">
     <p className="text-sm font-semibold">
      {lastUpdate.status==="failed"?"Previous automatic update did not finish":
       lastUpdate.status==="pending"?"Update prepared — installation not confirmed":
       "Previous automatic update completed"}
     </p>
     <p className="text-xs">{lastUpdate.message}</p>
     {(lastUpdate.status==="failed"||lastUpdate.status==="pending")&&<div className="flex flex-wrap gap-2 items-center">
      <button type="button" className="rounded border border-border px-3 py-2 text-xs font-semibold" onClick={()=>void openLog()}>View installation log</button>
      <span className="text-xs text-muted-foreground">{lastUpdate.status==="pending"?"The download is staged, but folder replacement and relaunch are unconfirmed. If ShowPilot remains open, copy the diagnostics and check the log.":"Your saved notes, documents and schedules are not deleted when an update fails."}</span>
     </div>}
    </div>}
   {check&&<div className="space-y-1 rounded-md border border-border bg-muted/40 p-3" role="status">
     <p className="text-sm font-medium">{check.message}</p>
     {check.latest&&<>
      <p className="text-sm"><strong>Latest {check.channel==="beta"?"Beta":"Main"}:</strong> {check.latest.version?"v"+check.latest.version:"Legacy build (no automatic version number)"}</p>
      <p className="text-xs text-muted-foreground">{check.latest.artifact==="showpilot-linux-appimage"?"Linux AppImage":check.latest.artifact==="showpilot-linux-portable"?"Linux portable archive":"Windows portable ZIP"} · Build #{check.latest.buildNumber} · Commit <code>{check.latest.sha.slice(0,9)}</code> · {new Date(check.latest.created).toLocaleDateString()}</p>
      {check.upToDate&&<p className="text-xs font-semibold text-green-700 dark:text-green-400">This version is already installed.</p>}
     </>}
   </div>}
   {downloading&&<div className="space-y-2 rounded border p-3" role="status" aria-live="polite">
    <p className="text-sm font-semibold">{progress.message}</p>
    <div className="h-2 overflow-hidden rounded bg-muted">
     <div className="h-full bg-blue-600 transition-all" style={{width:progress.percent+"%"}}/>
    </div>
    <p className="text-xs text-muted-foreground">{progress.phase==="downloading"?progress.percent+"% downloaded":"Windows portable update · "+progress.phase}</p>
   </div>}
   <div className="flex flex-wrap items-center gap-2">
    <button type="button" className="rounded border border-border px-3 py-2 text-xs font-semibold" onClick={()=>void copyReport()}>
     Copy updater diagnostics
    </button>
    <span className="text-xs text-muted-foreground">Copies the installer log and version results locally with filesystem paths redacted; nothing is sent automatically.</span>
   </div>
   {copiedReport&&<p className="text-xs" role="status">{copiedReport}</p>}
   <p className="text-xs text-muted-foreground">The in-app updater asks for confirmation before closing ShowPilot. Save any unfinished work first. It downloads the official public GitHub Release, checks its SHA-256 checksum, stages the files without administrator rights, then closes, replaces and restarts the app. Your SQLite memory and event files stay in the user-data folder. The previous app folder is retained for rollback. If installation is blocked by IT permissions, use the GitHub manual download instead.</p>
  </>}
  {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
 </div>;
}