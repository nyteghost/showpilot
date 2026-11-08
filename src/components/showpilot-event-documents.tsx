import {useEffect,useRef,useState} from "react";
import {Archive,Download,FileImage,FileText,FolderOpen,RotateCcw,UploadCloud,X,Layers,Map as MapIcon} from "lucide-react";
import {ShowPilotWhy} from "@/components/showpilot-why";
import {Button} from "@/components/ui/button";
import type {PostConShow} from "@/lib/showpilot-postcon";
import {stageMentionedInEoc,hallLayoutAttached,eocAttendance} from "@/lib/showpilot-event-highlights";
import {EVENT_ALLOWED_EXTENSIONS,extractEocFromPdf,pdfTextPages,guessEventFileKind,kindTitle,validateEventFile,type EventFileKind,type EventFileRecord,type EocSection} from "@/lib/showpilot-event-assets";
import {eocSpaceEvidence,explainSavedRoom} from "@/lib/showpilot-event-provenance";
import type {ZipScheduleEvidence} from "@/lib/showpilot-zip-schedule";

type Document=EventFileRecord&{available:boolean};
const kinds:EventFileKind[]=["exhibitor-order","work-order","eoc","diagram","other"];
const focus:EocSection[]=["Event Notes","Engineering","Utility"];
const displayBytes=(n:number)=>n<1024?String(n)+" B":n<1024**2?String(Math.round(n/1024))+" KB":(n/(1024**2)).toFixed(1)+" MB";
const mime=(ext:string)=>ext==="pdf"?"application/pdf":ext==="png"?"image/png":ext==="webp"?"image/webp":"image/jpeg";

export function ShowPilotEventDocuments({show,zipSchedule,onOpenStage,onOpenFloorMaps}:{show:PostConShow;zipSchedule?:ZipScheduleEvidence|null;onOpenStage?:()=>void;onOpenFloorMaps?:()=>void}){
 const bridge=window.showpilotMemory;
 const [files,setFiles]=useState<Document[]>([]);
 const [roomAudit,setRoomAudit]=useState<ReturnType<typeof eocSpaceEvidence>>({assigned:[],unassigned:[]});
 const [roomAuditLoading,setRoomAuditLoading]=useState(false);
 const [roomAuditWarning,setRoomAuditWarning]=useState("");
 const [archived,setArchived]=useState(false);
 const [category,setCategory]=useState<EventFileKind|"auto">("auto");
 const [busy,setBusy]=useState(false);
 const [dragging,setDragging]=useState(false);
 const [message,setMessage]=useState("");
 const [preview,setPreview]=useState<{file:Document;url:string}|null>(null);
 const picker=useRef<HTMLInputElement>(null);
 const reload=async()=>{if(bridge)setFiles(await bridge.eventFileList(show.key,archived));};
 useEffect(()=>{
  let active=true;
  setFiles([]);setPreview(null);
  if(bridge)void bridge.eventFileList(show.key,archived)
   .then(next=>{if(active)setFiles(next)})
   .catch(e=>{if(active)setMessage("Could not load event documents: "+String(e))});
  return ()=>{active=false};
 },[bridge,show.key,archived]);
 useEffect(()=>{
  let alive=true;
  const eocPdfs=files.filter(f=>f.kind==="eoc"&&!f.archived&&f.available&&f.extension==="pdf").slice(0,6);
  setRoomAudit({assigned:[],unassigned:[]});setRoomAuditWarning("");
  if(!bridge||!eocPdfs.length){setRoomAuditLoading(false);return;}
  setRoomAuditLoading(true);
  // Inspection is read-only. Existing uploaded PDFs are opened locally and
  // Function Space lines are read with page citations; no data is rewritten.
  void Promise.allSettled(eocPdfs.map(async f=>{
   const saved=await bridge.eventFileRead(f.id);
   const pdf=new File([new Uint8Array(saved.bytes)],f.name,{type:"application/pdf"});
   return {file:f.name,pages:await pdfTextPages(pdf,80)};
  })).then(results=>{
   if(!alive)return;
   const available=results.filter((x):x is PromiseFulfilledResult<{file:string;pages:string[]}>=>
    x.status==="fulfilled").map(x=>x.value);
   setRoomAudit(eocSpaceEvidence(available));
   if(results.some(x=>x.status==="rejected"))
    setRoomAuditWarning("Some EOC pages could not be read. Verify rooms in the original PDF.");
   if(files.filter(f=>f.kind==="eoc"&&!f.archived&&f.available&&f.extension==="pdf").length>6)
    setRoomAuditWarning("Only the first six EOCs were inspected for room assignments. Verify other originals.");
  }).finally(()=>{if(alive)setRoomAuditLoading(false)});
  return ()=>{alive=false};
 },[bridge,files,show.key]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url)},[preview]);
 const upload=async(selected:File[])=>{
  if(!bridge||busy||!selected.length)return;
  setBusy(true);setMessage("");
  let uploaded=0;
  const failures:string[]=[];
  try{
   for(const file of selected.slice(0,30)){
    try{
     validateEventFile(file);
     const kind=category==="auto"?guessEventFileKind(file.name):category;
     const eocExcerpts=kind==="eoc"&&/\.pdf$/i.test(file.name)
      ?await extractEocFromPdf(file).catch(()=>[]):[];
     await bridge.eventFileSave({eventKey:show.key,kind,name:file.name,bytes:await file.arrayBuffer(),eocExcerpts});
     uploaded++;
    }catch(e){failures.push(file.name+": "+(e instanceof Error?e.message:String(e)));}
   }
   await reload();
   if(uploaded>0)window.dispatchEvent(new Event("showpilot:event-files-updated"));
   setMessage(String(uploaded)+" file(s) saved for "+show.showName+". "+
    (failures.length?failures.join(" | ").slice(0,600):"Originals are stored locally, outside the installation folder."));
  }finally{setBusy(false);if(picker.current)picker.current.value="";}
 };
 const open=async(file:Document)=>{
  try{await bridge?.eventFileOpen(file.id)}
  catch(e){setMessage("Cannot open original: "+(e instanceof Error?e.message:String(e)));}
 };
 const view=async(file:Document)=>{
  if(!bridge)return;
  if(!["pdf","png","jpg","jpeg","webp"].includes(file.extension)){await open(file);return;}
  try{
   const original=await bridge.eventFileRead(file.id);
   const blob=new Blob([new Uint8Array(original.bytes)],{type:mime(file.extension)});
   setPreview({file,url:URL.createObjectURL(blob)});
  }catch(e){setMessage("Cannot preview file: "+(e instanceof Error?e.message:String(e)));}
 };
 const changeArchived=async(file:Document)=>{
  if(!bridge||!window.confirm((file.archived?"Restore ":"Archive ")+file.name+"? The original will not be deleted."))return;
  try{await bridge.eventFileArchive(file.id,!file.archived);await reload();window.dispatchEvent(new Event("showpilot:event-files-updated"));}
  catch(e){setMessage("Cannot change file status: "+(e instanceof Error?e.message:String(e)));}
 };
 const backup=async()=>{
  if(!bridge)return;
  try{
   setMessage("Backing up saved documents…");
   const result=await bridge.backupNow();
   setMessage(result.created?"Verified original attachments and show metadata copied into ShowPilot's backup folder.":
    "No backup created: "+(result.reason??"unknown reason"));
  }catch(e){setMessage("Backup failed: "+(e instanceof Error?e.message:String(e)));}
 };
 const eocs=files.filter(file=>file.kind==="eoc"&&!file.archived);
 const attendance=eocAttendance(eocs);
 const stageRequested=eocs.some(file=>stageMentionedInEoc(file.eocExcerpts));
 const layoutAvailable=hallLayoutAttached(files.filter(f=>!f.archived));
 return <div className="space-y-4">
  <div className="rounded-xl border p-4 space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <div><h3 className="font-semibold">Event documents</h3>
     <p className="text-xs text-muted-foreground">Attach Exhibitor Orders, Event Order Confirmations (EOCs), diagrams and layouts to this show.</p></div>
    <Button size="sm" variant="outline" onClick={()=>void backup()}><Download size={16}/> Back up attachments</Button>
   </div>
   <div className="flex flex-wrap items-center gap-4">
    <label className="text-sm">Type
     <select className="ml-2 rounded border bg-background p-2" value={category} onChange={e=>setCategory(e.target.value as EventFileKind|"auto")}>
      <option value="auto">Detect from filename</option>
      <option value="exhibitor-order">Exhibitor Order</option>
      <option value="work-order">Other Work Order (legacy)</option>
      <option value="eoc">Event Order Confirmation</option>
      <option value="diagram">Diagram / event layout</option>
      <option value="other">Other event file</option>
     </select>
    </label>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/> Show archived files</label>
   </div>
   <div role="button" tabIndex={0} aria-label="Drop event documents or click to browse"
    className={"cursor-pointer rounded-xl border-2 border-dashed p-6 text-center "+(dragging?"border-blue-500 bg-blue-500/10":"border-border hover:bg-muted/30")}
    onClick={()=>picker.current?.click()}
    onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();picker.current?.click();}}}
    onDragEnter={e=>{e.preventDefault();setDragging(true)}}
    onDragOver={e=>{e.preventDefault();setDragging(true)}}
    onDragLeave={e=>{e.preventDefault();setDragging(false)}}
    onDrop={e=>{e.preventDefault();setDragging(false);const files=[...e.dataTransfer.files];if(files.some(f=>/\.zip$/i.test(f.name)))return;void upload(files);}}>
    <UploadCloud className="mx-auto mb-2 size-8 text-muted-foreground"/>
    <strong>{busy?"Saving files…":"Drag and drop your event documents here"}</strong>
    <p className="mt-1 text-xs text-muted-foreground">Or click to browse · PDF, images, Word, Excel, text, CSV, DWG, DXF · up to 25 MB each.</p>
    <input ref={picker} type="file" multiple className="hidden" accept={EVENT_ALLOWED_EXTENSIONS.map(s=>"."+s).join(",")}
     onChange={e=>void upload(Array.from(e.target.files??[]))}/>
   </div>
   {kinds.map(kind=><div key={kind} className="space-y-2">
    <h4 className="font-semibold text-sm">{kindTitle(kind)} ({files.filter(f=>f.kind===kind).length})</h4>
    {files.filter(f=>f.kind===kind).length===0?<p className="text-xs text-muted-foreground">No attached documents.</p>:
     files.filter(f=>f.kind===kind).map(file=><div key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
       {["png","jpg","jpeg","webp"].includes(file.extension)?<FileImage size={17}/>:<FileText size={17}/>}
       <div className="min-w-0"><strong className="block break-all">{file.name}</strong>
        <span className="text-xs text-muted-foreground">{displayBytes(file.bytes)} · {file.created.slice(0,10)}{file.archived?" · Archived":""}{!file.available?" · Missing original":""}</span>
       </div>
      </div>
      <div className="flex flex-wrap gap-1">
       {file.available&&<Button size="sm" variant="outline" onClick={()=>void view(file)}>Preview</Button>}
       {file.available&&<Button size="sm" variant="outline" onClick={()=>void open(file)}><FolderOpen size={15}/> Open original</Button>}
       <Button size="sm" variant="ghost" onClick={()=>void changeArchived(file)}>
        {file.archived?<RotateCcw size={15}/>:<Archive size={15}/>} {file.archived?"Restore":"Archive"}</Button>
      </div>
     </div>)}
   </div>)}
   <p className="text-xs text-muted-foreground">The originals remain unchanged in ShowPilot's private event-file vault, including when you install an update. Archived files are never deleted. Backups include original files in a companion folder beside the JSON snapshot.</p>
  </div>
  <div className="rounded-xl border p-4 space-y-3">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="space-y-2">
     <h3 className="font-semibold">EOC quick reference</h3>
     <div className="flex flex-wrap gap-2">
      {stageRequested&&onOpenStage&&<Button size="sm" variant="outline" onClick={onOpenStage}><Layers size={15}/> Open Stage &amp; Deck Planner</Button>}
      {layoutAvailable&&onOpenFloorMaps&&<Button size="sm" variant="outline" onClick={onOpenFloorMaps}><MapIcon size={15}/> Open Floor Maps</Button>}
     </div>
    </div>
    <div className="min-w-44 rounded-md border p-3 text-right" aria-label="EOC attendance">
     <p className="text-xs font-semibold text-muted-foreground">Attendance</p>
     {attendance.readings.length?
      <><strong className="block text-lg tabular-nums">{attendance.conflicting?"Review figures":attendance.readings[0]!.value}</strong>
       <div className="space-y-1 text-xs text-muted-foreground">
        {attendance.readings.slice(0,6).map((a,i)=><p key={a.file+":"+a.page+":"+i}>
         {attendance.conflicting?a.value+" · ":""}{a.file} · page {a.page}
        </p>)}
       </div>
       {attendance.conflicting&&<p className="mt-1 text-xs text-amber-600">Different attendance figures found. Verify the EOC.</p>}
      </>:<p className="text-sm text-muted-foreground">Not found in EOC</p>}
    </div>
   </div>
   <p className="text-xs text-muted-foreground">Showing <strong>Event Notes, Engineering, and Utility</strong> with source PDF page numbers. Attendance is shown above when listed in the EOC. Always verify against the original PDF.</p>
   <div className="grid gap-3 lg:grid-cols-3">
    {focus.map(section=>{
     const matched=eocs.flatMap(file=>file.eocExcerpts.filter(x=>x.section===section).map(x=>({file,x})));
     return <div key={section} className="rounded border p-3 space-y-2">
      <h4 className="font-semibold text-sm">{section}</h4>
      {matched.length?matched.map(({file,x},i)=><div key={file.id+":"+i} className="space-y-1 border-t pt-2 text-xs">
       <strong>{file.name} · page {x.page}</strong>
       <p className="whitespace-pre-wrap break-words">{x.text}</p>
      </div>):<p className="text-xs text-muted-foreground">No extractable section found. A scanned EOC may need to be checked in the original document.</p>}
     </div>
    })}
   </div>
  </div>
  {preview&&<div className="rounded-xl border p-3 space-y-2">
   <div className="flex flex-wrap justify-between items-center gap-2">
    <strong className="break-all">{preview.file.name}</strong>
    <Button size="sm" variant="outline" onClick={()=>setPreview(null)}><X size={15}/> Close preview</Button>
   </div>
   {preview.file.extension==="pdf"?<iframe className="h-[66vh] w-full rounded border bg-white" src={preview.url} title={"PDF preview: "+preview.file.name}/>
    :<img src={preview.url} className="max-h-[66vh] max-w-full object-contain" alt={"Preview: "+preview.file.name}/>}
   <p className="text-xs text-muted-foreground">Preview is local and read-only; use Open original for native editing or printing.</p>
  </div>}
  {message&&<p role="status" className="rounded border p-2 text-xs">{message}</p>}
 </div>;
}
