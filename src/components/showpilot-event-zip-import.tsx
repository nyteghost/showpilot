import {useCallback,useEffect,useRef,useState} from "react";
import {FileArchive,UploadCloud} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {EventZipInspection} from "@/lib/showpilot-memory-bridge";
import type {PostConShow} from "@/lib/showpilot-postcon";
import {matchEventZipToShow,type EventZipMatch} from "@/lib/showpilot-event-match";
import {extractEocFromPdf,pdfTextPages} from "@/lib/showpilot-event-assets";
import {discoverEventMetadata,ROOMS,type EventMetadataResult,type EventMetadataSource} from "@/lib/showpilot-event-discovery";
import {scheduleHintsFromSources,serializeZipSchedule,type ZipScheduleHint} from "@/lib/showpilot-zip-schedule";

const roomsAvailable=ROOMS;
const validDay=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day+"T12:00:00Z"));


export function ShowPilotEventZipImport({shows,selectedKey,onImported,active=true}:{
 shows:PostConShow[];selectedKey:string;onImported:(key:string)=>void;active?:boolean;
}){
 const bridge=window.showpilotMemory;
 const picker=useRef<HTMLInputElement>(null);
 const [archive,setArchive]=useState<File|null>(null);
 const [queue,setQueue]=useState<File[]>([]);
 const [queueTotal,setQueueTotal]=useState(0);
 const [queueReviewed,setQueueReviewed]=useState(0);
 const [inspection,setInspection]=useState<EventZipInspection|null>(null);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [dragging,setDragging]=useState(false);
 const [mode,setMode]=useState<"existing"|"new">("new");
 const [target,setTarget]=useState("");
 const [name,setName]=useState("");
 const [eventId,setEventId]=useState("");
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [rooms,setRooms]=useState<string[]>([]);
 const [metadata,setMetadata]=useState<EventMetadataResult|null>(null);
 const [scheduleHints,setScheduleHints]=useState<ZipScheduleHint[]>([]);
 const [readWarnings,setReadWarnings]=useState<string[]>([]);
 const [applyExisting,setApplyExisting]=useState(false);
 const [matchResult,setMatchResult]=useState<EventZipMatch|null>(null);
 const [availableShows,setAvailableShows]=useState<PostConShow[]|null>(null);
 const candidates=availableShows??shows;
 const reset=()=>{setArchive(null);setInspection(null);setMetadata(null);setScheduleHints([]);setReadWarnings([]);setApplyExisting(false);setMatchResult(null);setAvailableShows(null);if(picker.current)picker.current.value="";};
 const stage=useCallback(async(file:File)=>{
  if(!bridge?.eventZipInspect){setStatus("ZIP import requires the current ShowPilot portable desktop build.");return;}
  if(!/\.zip$/i.test(file.name)){setStatus("Choose an event ZIP file.");return;}
  if(file.size>150*1024*1024){setStatus("Event ZIPs must be 150 MB or smaller.");return;}
  setBusy(true);setStatus("");setInspection(null);
  try{
   const bytes=await file.arrayBuffer();
   const result=await bridge.eventZipInspect(bytes);
   const scanWarnings:string[]=[];
   const sources:EventMetadataSource[]=[];
   if(bridge.eventZipScan){
    try{
     const scan=await bridge.eventZipScan(bytes);
     for(const entry of scan.sources){
      if(entry.format==="text")sources.push({path:entry.path,text:entry.text});
      else {
       try{
        const pdf=new File([new Uint8Array(entry.bytes)],entry.path,{type:"application/pdf"});
        const pages=await pdfTextPages(pdf,20);
        sources.push({path:entry.path,text:pages.join("\n")});
       }catch{scanWarnings.push("Could not read PDF text: "+entry.path);}
      }
     }
     if(scan.skipped.length)scanWarnings.push(scan.skipped.length+" documents could not be scanned. They can still be attached.");
    }catch(e){scanWarnings.push("Could not fully scan ZIP documents: "+String(e));}
   }else scanWarnings.push("This build cannot inspect ZIP document contents.");
   const found=discoverEventMetadata(sources,result.manifest,file.name);
   const fromEoc=found.evidence.some(item=>item.source.startsWith("EOC cover page:"));
   const detectedSource=fromEoc
    ?"Show name, Event ID and dates read from the EOC cover. "
    :"No readable EOC cover header was found; verify any ZIP filename or manifest suggestions. ";
   setArchive(file);setInspection(result);setMetadata(found);setScheduleHints(scheduleHintsFromSources(sources));setReadWarnings(scanWarnings);
   setName(found.showName);setEventId(found.eventId);setStart(found.startDate);setEnd(found.showDate);
   setRooms(found.rooms);
   // Read the current SQLite catalog, including events imported from Event
   // Schedule while this screen was open. Never default to the highlighted show
   // when a ZIP carries a different Event ID.
   const savedShows=await bridge.showCatalogList();
   setAvailableShows(savedShows);
   const match=matchEventZipToShow(found,savedShows);
   setMatchResult(match);
   if(match.status==="matched"){
    setTarget(match.show.key);setMode("existing");
    setStatus(detectedSource+"Event ID "+found.eventId+" matched "+match.show.showName+". Confirm to attach these documents to its Events record.");
   }else{
    setTarget("");setMode("new");
    setStatus(detectedSource+(match.status==="conflicting-ids"?
     "Conflicting Event IDs were found. No event was chosen automatically. Review the documents before importing.":
     match.status==="ambiguous"?
     "Several saved records have this Event ID. No event was chosen automatically; review the catalog first.":
     match.status==="no-match"?
     "Event ID "+found.eventId+" is not in the saved schedule. Review the ZIP details before creating a new event.":
     "No Event ID found. Choose an existing event manually or create one after reviewing the details."));
   }
   setApplyExisting(false);
  }catch(e){reset();setStatus("Could not inspect ZIP: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 },[bridge,shows]);
 const addArchives=useCallback((files:File[])=>{
  const zips=files.filter(f=>/\.zip$/i.test(f.name));
  if(zips.length!==files.length){setStatus("Only ZIP files were added; other files were ignored.");}
  if(!zips.length){setStatus("Choose one or more event ZIP files.");return;}
  if(zips.length+queue.length+(archive?1:0)>40){
   setStatus("A batch can contain up to 40 event ZIPs. Finish this batch before adding more.");return;
  }
  if(archive||busy){
   setQueue(old=>[...old,...zips]);
   setQueueTotal(old=>old+zips.length);
   setStatus(zips.length+" event ZIP(s) added to review queue.");
  }else{
   setQueue(zips.slice(1));setQueueTotal(zips.length);setQueueReviewed(0);
   void stage(zips[0]!);
  }
 },[archive,busy,queue.length,stage]);
 const advance=()=>{
  const next=queue[0];
  setQueue(old=>old.slice(1));
  reset();
  if(next)void stage(next);
  else setStatus("All selected ZIP files have been reviewed.");
 };
 useEffect(()=>{
  if(!active)return;
  const dragover=(e:DragEvent)=>{if(e.dataTransfer?.types.includes("Files"))e.preventDefault();};
  const drop=(e:DragEvent)=>{
   const zips=Array.from(e.dataTransfer?.files??[]).filter(f=>/\.zip$/i.test(f.name));
   if(!zips.length)return;
   e.preventDefault();e.stopPropagation();
   addArchives(zips);
  };
  document.addEventListener("dragover",dragover);
  document.addEventListener("drop",drop);
  return ()=>{document.removeEventListener("dragover",dragover);document.removeEventListener("drop",drop)};
 },[active,addArchives]);
 const submit=async()=>{
  if(!archive||!inspection||!bridge?.eventZipImport||busy)return;
  let key=target;
  // Multiple different IDs inside one ZIP are not safe to attach to any
  // existing Event. Require the customer to correct/split that archive.
  // Reviewing a dropdown alone does not resolve conflicting source evidence.
  if(metadata&&matchEventZipToShow(metadata,candidates).status==="conflicting-ids"){
   setStatus("Conflicting Event IDs were found in this ZIP (EOC, manifest or filename)."+
     " Verify the correct EOC and separate mismatched documents before importing.");
   return;
  }
  if(mode==="existing"){
   const chosen=candidates.find(s=>s.key===target);
   if(!chosen){setStatus("Choose an existing show.");return;}
   if(metadata&&matchEventZipToShow(metadata,[chosen]).status==="no-match"){
    setStatus("The ZIP Event ID "+metadata.eventId+" does not match "+chosen.showName+
      " (#"+(chosen.eventId||"not provided")+"). Choose the matching event; documents were not attached.");
    return;
   }
  }else{
   if(!name.trim()||!validDay(start)||!validDay(end)||end<start||!rooms.length){
    setStatus("Confirm event name, start/end dates and at least one CGC room.");return;
   }
   if(/\b(?:cepac|cobb energy|performing arts)\b/i.test(name)){
    setStatus("Only Cobb Convention Center-Atlanta shows can be added.");return;
   }
   key=eventId.trim()?"id:"+eventId.trim():"name:"+name.trim().toLowerCase();
   if(candidates.some(existing=>existing.key===key)){
    setStatus("This show already exists. Choose Existing show so its name, dates and rooms are not overwritten.");return;
   }
  }
  setBusy(true);setStatus("Saving event documents locally…");
  try{
   if(mode==="existing"&&applyExisting){
    const existing=candidates.find(x=>x.key===key);
    if(!existing)throw Error("Selected event is no longer available.");
    if(!validDay(start)||!validDay(end)||end<start||!rooms.length)
     throw Error("Review the scanned start/end dates and rooms before updating the saved show.");
    // Extends confirmed date range and rooms; never removes prior locations
    // or touches the protected Excel engineering schedule.
    await bridge.showCatalogSave([{...existing,startDate:start,showDate:end,rooms:rooms.join(", ")}]);
    window.dispatchEvent(new Event("showpilot:postcon-catalog"));
   }
   if(mode==="new"){
    // Recheck SQLite itself: an app upgrade may still be loading the catalog.
    const current=await bridge.showCatalogList();
    if(current.some(existing=>existing.key===key))
     throw Error("That show already exists in SQLite. Choose Existing show instead of overwriting it.");
    await bridge.showCatalogSave([{key,eventId:eventId.trim(),showName:name.trim(),
     startDate:start,showDate:end,rooms:rooms.join(", ")}]);
    window.dispatchEvent(new Event("showpilot:postcon-catalog"));
   }
   // Verify immediately before writing so a stale UI selection or a second
   // import cannot silently attach documents under a different Event ID.
   const live=await bridge.showCatalogList();
   if(mode==="existing"&&metadata){
    const selected=live.find(x=>x.key===key);
    if(!selected)throw Error("The selected event no longer exists in the catalog.");
    if(matchEventZipToShow(metadata,[selected]).status==="no-match")
     throw Error("ZIP Event ID does not match the selected event. Nothing was attached.");
   }
   const result=await bridge.eventZipImport({eventKey:key,bytes:await archive.arrayBuffer()});
   let indexed=0,unreadable=0;
   for(const file of result.imported.filter(f=>f.kind==="eoc"&&f.extension==="pdf")){
    try{
     const saved=await bridge.eventFileRead(file.id);
     const pdf=new File([new Uint8Array(saved.bytes)],file.name,{type:"application/pdf"});
     const excerpts=await extractEocFromPdf(pdf);
     if(excerpts.length){await bridge.eventFileSetEocExcerpts(file.id,excerpts);indexed++;}
    }catch{unreadable++;}
   }
   if(metadata){
    try{
     const content=serializeZipSchedule({
      version:1,eventKey:key,sourceZip:archive.name,
      reviewed:{eventId,showName:name,startDate:start,showDate:end,rooms},
      detected:metadata,hints:scheduleHints,
      documents:inspection.files.map(f=>({path:f.path,kind:f.kind})),
      created:new Date().toISOString()
     });
     await bridge.save({category:"Recurring Events",title:("ZIP Schedule: "+key+" · "+archive.name).slice(0,140),content:content.slice(0,14500)});
    }catch{ /* Imported originals remain safe if optional review-note saving fails. */ }
   }
   window.dispatchEvent(new Event("showpilot:postcon-catalog"));
   onImported(key);setQueueReviewed(old=>old+1);
   const next=queue[0];
   setQueue(old=>old.slice(1));reset();
   if(next)await stage(next);
   else setStatus(result.imported.length+" document(s) imported. "+result.duplicates.length+
    " duplicates skipped; "+result.ignored.length+" unsupported entries ignored."+
    (result.errors.length?" "+result.errors.length+" file(s) failed: "+
     result.errors.map(e=>e.name+" ("+e.error+")").join("; ").slice(0,350):"")+
    (indexed?" EOC focus sections indexed: "+indexed+".":"")+
    (unreadable?" EOC PDFs needing manual review: "+unreadable+".":""));
  }catch(e){setStatus("ZIP import failed: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 };
 return <div className="space-y-3 rounded-xl border p-4" aria-label="Import event ZIP">
  <div className="flex items-start gap-2"><FileArchive size={21}/><div>
   <h3 className="font-semibold">Import event ZIPs</h3>
   <p className="text-sm text-muted-foreground">Select or drop multiple ZIP files. ShowPilot reviews each archive in order, matches the EOC Event ID to existing Events, and asks you to confirm before attaching documents.</p>
  </div></div>
  <div className={"cursor-pointer rounded-xl border-2 border-dashed p-5 text-center "+(dragging?"border-blue-500 bg-blue-500/10":"hover:bg-muted/30")}
   role="button" tabIndex={0} aria-label="Drop or browse for multiple event ZIPs"
   onClick={()=>picker.current?.click()}
   onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();picker.current?.click();}}}
   onDragOver={e=>{e.preventDefault();setDragging(true)}}
   onDragLeave={e=>{e.preventDefault();setDragging(false)}}
   onDrop={e=>{
    e.preventDefault();e.stopPropagation();setDragging(false);
    const files=Array.from(e.dataTransfer.files);
    addArchives(files);
   }}>
   <UploadCloud className="mx-auto mb-2 size-7 text-muted-foreground"/>
   <strong>{busy?"Reading event ZIP…":"Drop event ZIPs here"}</strong>
   <p className="mt-1 text-xs text-muted-foreground">Or click to browse · select multiple · up to 150 MB each · processed offline</p>
   <input ref={picker} type="file" className="hidden" accept=".zip" multiple
    onChange={e=>{const files=Array.from(e.target.files??[]);if(files.length)addArchives(files);e.target.value="";}}/>
  </div>
  {(queueTotal>1||queue.length>0)&&<div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-xs" role="status">
   <strong>Batch: {queueReviewed} imported · {queue.length} waiting{archive?" · 1 under review":""}</strong>
   {queue.length>0&&<span className="text-muted-foreground">Next: {queue[0]!.name}</span>}
   {!archive&&queue.length>0&&<Button size="sm" variant="outline" disabled={busy} onClick={advance}>Review next ZIP</Button>}
  </div>}
  {inspection&&archive&&<div className="space-y-3 rounded-lg border p-3">
   <strong className="break-all text-sm">{archive.name}</strong>
   <p className="text-xs text-muted-foreground">{inspection.files.length} supported documents ({Math.round(inspection.totalBytes/1024)} KB). {inspection.ignored.length} unsupported entries skipped.</p>
   <details className="text-xs"><summary className="cursor-pointer font-semibold">Review ZIP documents</summary>
    <div className="max-h-44 overflow-auto border rounded p-2 mt-2">
     {inspection.files.map(f=><p key={f.path} className="break-all">{f.path} · {f.kind}</p>)}
     {inspection.ignored.length>0&&<p>Skipped: {inspection.ignored.slice(0,12).join(", ")}</p>}
    </div>
   </details>
   {matchResult?.status==="matched"&&<p className="rounded-md border border-green-600/40 bg-green-600/10 px-3 py-2 text-xs font-semibold" role="status">
    Matched Event ID {metadata?.eventId} to {matchResult.show.showName}. Documents will be filed under the existing event after confirmation.
   </p>}
   {metadata&&<div className="space-y-2 rounded border p-3 text-xs">
    <p className="font-semibold">Information found in ZIP documents</p>
    <p className="text-muted-foreground">{metadata.evidence.some(item=>item.source.startsWith("EOC cover page:"))
     ?"Read from the EOC cover: line 2 is the event name and ID, line 3 is the start/end date range. Review these before importing."
     :"EOC cover data was not readable. Filename/manifest or other document suggestions may be incomplete; confirm the details manually."}</p>
    <p>Event ID: <strong>{metadata.eventId||"Not found"}</strong> · Show: <strong>{metadata.showName||"Not found"}</strong></p>
    <p>Dates: <strong>{metadata.startDate||"Unknown"} to {metadata.showDate||"Unknown"}</strong></p>
    <p>CGC locations: <strong>{metadata.rooms.join(", ")||"Not found"}</strong></p>
    <details><summary className="cursor-pointer">View document sources ({metadata.evidence.length})</summary>
     <div className="mt-1 max-h-40 overflow-auto">
      {metadata.evidence.slice(0,80).map((item,i)=><p key={i}>{item.field}: {item.value} — {item.source}</p>)}
     </div>
    </details>
    {[...metadata.warnings,...readWarnings].map((warning,i)=><p key={i} className="text-amber-600">Review: {warning}</p>)}
    <p className="font-semibold">Schedule review hints from documents: {scheduleHints.length}</p>
    {scheduleHints.slice(0,8).map((hint,i)=><p key={i}>{hint.topic}: {hint.text} — {hint.source}</p>)}
    <p className="text-muted-foreground">These are review hints, not automatic shift or staffing changes. Importing saves a local schedule evidence note for this event, which you can compare against the engineering schedule.</p>
   </div>}
   <fieldset className="space-y-2">
    <legend className="font-semibold text-sm">Import into</legend>
    <div className="flex flex-wrap gap-4 text-sm">
     <label className="flex gap-2 items-center"><input type="radio" name="zip-target" checked={mode==="existing"} onChange={()=>setMode("existing")}/> Existing show</label>
     <label className="flex gap-2 items-center"><input type="radio" name="zip-target" checked={mode==="new"} onChange={()=>setMode("new")}/> New show</label>
    </div>
    {mode==="existing"?<label className="block text-sm">Choose saved event
     <select className="mt-1 w-full rounded border bg-background p-2" value={target} onChange={e=>setTarget(e.target.value)}>
      <option value="">Choose show…</option>
      {candidates.map(s=><option key={s.key} value={s.key}>{s.showName} · #{s.eventId||"No ID"} · {s.startDate??s.showDate}</option>)}
     </select>
     <label className="mt-2 flex items-center gap-2 text-xs">
      <input type="checkbox" checked={applyExisting} onChange={e=>setApplyExisting(e.target.checked)}/>
      Add reviewed ZIP dates/locations to this show's saved catalog (never overwrite Excel)
     </label>
    </label>:<div className="space-y-3">
     <p className="text-xs text-muted-foreground">ShowPilot uses the EOC cover for the event name, ID and date range when readable. ZIP filename or event.json values are fallbacks. Verify all fields before creating the show.</p>
     <label className="block text-xs font-semibold">Actual show name
      <input className="mt-1 w-full rounded border bg-background p-2 font-normal" value={name} maxLength={140} onChange={e=>setName(e.target.value)}/>
     </label>
     <div className="grid grid-cols-2 gap-2">
      <label className="text-xs font-semibold">Event ID (optional)
       <input className="mt-1 w-full rounded border bg-background p-2 font-normal" maxLength={100} value={eventId} onChange={e=>setEventId(e.target.value)}/>
      </label><div/>
      <label className="text-xs font-semibold">Start date
       <input type="date" className="mt-1 w-full rounded border bg-background p-2 font-normal" value={start} onChange={e=>setStart(e.target.value)}/>
      </label>
      <label className="text-xs font-semibold">End date
       <input type="date" className="mt-1 w-full rounded border bg-background p-2 font-normal" value={end} onChange={e=>setEnd(e.target.value)}/>
      </label>
     </div>
     <fieldset><legend className="font-semibold text-xs">CGC halls and ballrooms</legend>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
       {roomsAvailable.map(room=><label key={room} className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={rooms.includes(room)} onChange={e=>setRooms(v=>e.target.checked?[...v,room]:v.filter(r=>r!==room))}/>{room}
       </label>)}
      </div>
     </fieldset>
    </div>}
   </fieldset>
   <div className="flex gap-2">
    <Button size="sm" disabled={busy||(mode==="existing"?!target:!name.trim()||!validDay(start)||!validDay(end)||!rooms.length)}
     onClick={()=>void submit()}>{busy?"Importing…":"Confirm & import"}</Button>
    <Button size="sm" variant="outline" disabled={busy} onClick={advance}>
     {queue.length?"Skip this ZIP & review next":"Cancel"}
    </Button>
   </div>
  </div>}
  {status&&<p role="status" className="text-xs text-muted-foreground">{status}</p>}
 </div>;
}
