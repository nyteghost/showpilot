import {useEffect,useRef,useState} from "react";
import {Archive,Download,FileImage,FileText,FolderOpen,RotateCcw,UploadCloud,X,Layers,Map as MapIcon} from "lucide-react";
import {ShowPilotWhy} from "@/components/showpilot-why";
import {Button} from "@/components/ui/button";
import type {PostConShow} from "@/lib/showpilot-postcon";
import {stageMentionedInEoc,hallLayoutAttached,eocAttendance} from "@/lib/showpilot-event-highlights";
import {EVENT_ALLOWED_EXTENSIONS,extractEocFocus,extractEocFromPdf,pdfTextPages,guessEventFileKind,kindTitle,validateEventFile,type EventFileKind,type EventFileRecord,type EocSection,type EocExcerpt} from "@/lib/showpilot-event-assets";
import {eocSpaceEvidence,explainSavedRoom,type ScheduleRoomCitation} from "@/lib/showpilot-event-provenance";
import type {ZipScheduleEvidence} from "@/lib/showpilot-zip-schedule";

type Document=EventFileRecord&{available:boolean};
const kinds:EventFileKind[]=["exhibitor-order","work-order","eoc","diagram","other"];
const focus:EocSection[]=["Event Notes","Engineering","Utility"];
const displayBytes=(n:number)=>n<1024?String(n)+" B":n<1024**2?String(Math.round(n/1024))+" KB":(n/(1024**2)).toFixed(1)+" MB";
const mime=(ext:string)=>ext==="pdf"?"application/pdf":ext==="png"?"image/png":ext==="webp"?"image/webp":"image/jpeg";

export function ShowPilotEventDocuments({show,zipSchedule,scheduleRooms=[],onOpenStage,onOpenFloorMaps}:{show:PostConShow;zipSchedule?:ZipScheduleEvidence|null;scheduleRooms?:readonly ScheduleRoomCitation[];onOpenStage?:()=>void;onOpenFloorMaps?:()=>void}){
 const bridge=window.showpilotMemory;
 const [files,setFiles]=useState<Document[]>([]);
 const [roomAudit,setRoomAudit]=useState<ReturnType<typeof eocSpaceEvidence>>({assigned:[],unassigned:[]});
 const [freshEocSections,setFreshEocSections]=useState<Record<string,EocExcerpt[]>>({});
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
  setRoomAudit({assigned:[],unassigned:[]});setFreshEocSections({});setRoomAuditWarning("");
  if(!bridge||!eocPdfs.length){setRoomAuditLoading(false);return;}
  setRoomAuditLoading(true);
  // Inspection is read-only. Existing uploaded PDFs are opened locally and
  // Function Space lines are read with page citations; no data is rewritten.
  void Promise.allSettled(eocPdfs.map(async f=>{
   const saved=await bridge.eventFileRead(f.id);
   const pdf=new File([new Uint8Array(saved.bytes)],f.name,{type:"application/pdf"});
   return {id:f.id,file:f.name,pages:await pdfTextPages(pdf,80)};
  })).then(results=>{
   if(!alive)return;
   const available=results.filter((x):x is PromiseFulfilledResult<{id:string;file:string;pages:string[]}>=>
    x.status==="fulfilled").map(x=>x.value);
   setRoomAudit(eocSpaceEvidence(available));
   // Recompute sections for the UI from saved originals. This repairs old
   // summaries that accidentally included Food & Beverage in Engineering or
   // Public Safety/Shipping in Utility, without rewriting any EOC or database.
   setFreshEocSections(Object.fromEntries(available.map(x=>[x.id,extractEocFocus(x.pages)])));
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
 const eocs=files.filter(file=>file.kind==="eoc"&&!file.archived)
  .map(file=>freshEocSections[file.id]?{...file,eocExcerpts:freshEocSections[file.id]}:file);
 const attendance=eocAttendance(eocs);
 const stageRequested=eocs.some(file=>stageMentionedInEoc(file.eocExcerpts));
 const layoutAvailable=hallLayoutAttached(files.filter(f=>!f.archived));
 const catalogRooms=show.rooms.split(",").map(x=>x.trim()).filter(Boolean);
 const roomEvidence=zipSchedule?.detected?.evidence??[];
 const eocAssignedRooms=[...new Set(roomAudit.assigned.map(x=>x.room))];
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
     <div className="flex items-center justify-end gap-1">
      <p className="text-xs font-semibold text-muted-foreground">Attendance</p>
      <ShowPilotWhy label="Attendance figure">
       <p>ShowPilot searches the EOC's readable PDF text for an explicit attendance, attendee, guest count, or similar labeled number. It does not estimate attendance from rooms, meal counts, or client details.</p>
       {attendance.readings.length?attendance.readings.map((item,i)=>
        <p key={i}>Found <strong>{item.value}</strong> in <strong>{item.file}</strong>, PDF page {item.page}.</p>
       ):<p>No labeled attendance value was extracted. Check the original EOC.</p>}
       {attendance.conflicting&&<p>Different explicit figures were found, so no single value was selected.</p>}
      </ShowPilotWhy>
     </div>
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
   <div className="rounded-lg border p-3 space-y-2" aria-label="EOC room assignments and room origin audit">
    <div className="flex items-center gap-2">
     <h4 className="font-semibold text-sm">Room assignment check</h4>
     <ShowPilotWhy label="why these rooms are shown">
      <p>The <strong>Events</strong> room list may combine saved Event Schedule rows, reviewed ZIP metadata, and manually selected rooms. It is not necessarily taken from this EOC. When a matching numeric Event ID is present in a saved schedule, the explanation shows its precise date, function, and Space field.</p>
      <p>To confirm rooms, ShowPilot reads the original EOC PDF's <strong>Function Space</strong> fields. Text such as <strong>No Space Assigned</strong> does not assign Hall C, Hall D, or any other room.</p>
      <p>A ZIP filename or a casual reference to a hall is only a mention, not proof of a booking. Previous imports might not have retained exact text provenance.</p>
     </ShowPilotWhy>
    </div>
    {roomAuditLoading?<p className="text-xs text-muted-foreground">Checking saved EOC Function Space lines and PDF page references…</p>:null}
    {roomAuditWarning&&<p className="text-xs text-amber-600">{roomAuditWarning}</p>}
    {roomAudit.unassigned.length>0&&<p className="text-xs text-muted-foreground">{roomAudit.unassigned.length} EOC Function Space line(s) say <strong>No Space Assigned</strong>. These do not establish any room.</p>}
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
     {catalogRooms.map(room=>{
      const origin=explainSavedRoom(room,roomEvidence,roomAudit.assigned,scheduleRooms);
      const status=roomAuditLoading?"Checking EOC…":
       origin.status==="eoc-confirmed"?"EOC Function Space confirmed":
       origin.status==="schedule-listed"?"Event Schedule lists room — EOC unconfirmed":
       origin.status==="zip-assigned"?"ZIP assignment — verify EOC":
       origin.status==="mention-only"?"Mention only — unverified":
       "Not established by the inspected EOC";
      return <div key={room} className="rounded border p-2 text-xs">
       <div className="flex items-center gap-1">
        <strong className="flex-1">{room}</strong>
        <ShowPilotWhy label={room}>
         <p>{origin.reason}</p>
         {origin.sources.length?origin.sources.slice(0,10).map((item,i)=>
          <div key={i} className="border-t pt-1">
           <p><strong>{item.certainty==="assigned"?"Direct assignment":item.certainty==="mentioned"?"Text mention":"Legacy evidence"}:</strong> {item.source}</p>
           <p className="whitespace-pre-wrap">{item.context}</p>
          </div>
         ):<p>No saved room source line was available. Compare the original EOC and your approved Event Schedule before assuming this location.</p>}
        </ShowPilotWhy>
       </div>
       <p className={origin.status==="eoc-confirmed"&&!roomAuditLoading?"text-emerald-600":"text-amber-600"}>{status}</p>
      </div>;
     })}
    </div>
    {eocAssignedRooms.filter(room=>!catalogRooms.includes(room)).length>0&&
     <p className="text-xs text-amber-600">EOC explicitly assigns additional rooms that are missing from the saved event catalog: {eocAssignedRooms.filter(room=>!catalogRooms.includes(room)).join(", ")}. Review before editing the event.</p>}
    {!roomAuditLoading&&eocs.length>0&&!roomAudit.assigned.length&&
     <p className="text-xs text-muted-foreground">No explicit room assignments were extracted from the available EOC Function Space lines. This does not mean that the event uses no rooms; check the original PDF.</p>}
   </div>
   <p className="text-xs text-muted-foreground">Showing <strong>Event Notes, Engineering, and Utility</strong> with source PDF page numbers. Attendance is shown above when listed in the EOC. Always verify against the original PDF.</p>
   <div className="grid gap-3 lg:grid-cols-3">
    {focus.map(section=>{
     const matched=eocs.flatMap(file=>file.eocExcerpts.filter(x=>x.section===section).map(x=>({file,x})));
     return <div key={section} className="rounded border p-3 space-y-2">
      <div className="flex items-center gap-1">
       <h4 className="font-semibold text-sm">{section}</h4>
       <ShowPilotWhy label={section+" EOC section"}>
        <p>These lines were placed under <strong>{section}</strong> because the PDF text has a matching department heading. The text is copied from that heading until another recognized department begins; this is a reading aid, not AI-generated instructions.</p>
        {matched.length?matched.map(({file,x},i)=>
         <p key={i}><strong>Source:</strong> {file.name}, page {x.page}. The original PDF is authoritative.</p>
        ):<p>There was no readable {section} section in the saved EOC excerpts.</p>}
        <p>Room assignments are checked separately using the EOC's <strong>Function Space</strong> lines. A <strong>No Space Assigned</strong> entry cannot justify including Hall C or any other location.</p>
       </ShowPilotWhy>
      </div>
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
