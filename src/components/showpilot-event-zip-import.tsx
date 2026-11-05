import {useCallback,useEffect,useRef,useState} from "react";
import {FileArchive,UploadCloud} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {EventZipInspection} from "@/lib/showpilot-memory-bridge";
import type {PostConShow} from "@/lib/showpilot-postcon";
import {extractEocFromPdf} from "@/lib/showpilot-event-assets";

const roomsAvailable=["Hall A","Hall B","Hall C","Hall D",
 "BallRoom A","BallRoom B","BallRoom C","BallRoom D","BallRoom E","BallRoom F","BallRoom G"];
const validDay=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day+"T12:00:00Z"));
const suggested=(name:string)=>name.replace(/\.zip$/i,"").replace(/[_-]+/g," ").trim().slice(0,140);
const fromManifest=(str:string)=>roomsAvailable.filter(room=>
 str.split(",").some(chunk=>chunk.trim().toLowerCase()===room.toLowerCase()));

export function ShowPilotEventZipImport({shows,selectedKey,onImported,active=true}:{
 shows:PostConShow[];selectedKey:string;onImported:(key:string)=>void;active?:boolean;
}){
 const bridge=window.showpilotMemory;
 const picker=useRef<HTMLInputElement>(null);
 const [archive,setArchive]=useState<File|null>(null);
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
 const reset=()=>{setArchive(null);setInspection(null);if(picker.current)picker.current.value="";};
 const stage=useCallback(async(file:File)=>{
  if(!bridge?.eventZipInspect){setStatus("ZIP import requires the current ShowPilot portable desktop build.");return;}
  if(!/\.zip$/i.test(file.name)){setStatus("Choose an event ZIP file.");return;}
  if(file.size>150*1024*1024){setStatus("Event ZIPs must be 150 MB or smaller.");return;}
  setBusy(true);setStatus("");setInspection(null);
  try{
   const result=await bridge.eventZipInspect(await file.arrayBuffer());
   const meta=result.manifest;
   setArchive(file);setInspection(result);
   setName(meta?.showName||suggested(file.name));
   setEventId(meta?.eventId||"");
   setStart(validDay(meta?.startDate??"")?meta!.startDate:"");
   setEnd(validDay(meta?.showDate??"")?meta!.showDate:"");
   setRooms(fromManifest(meta?.rooms??""));
   setTarget(selectedKey||"");setMode(selectedKey?"existing":"new");
   setStatus("Review the ZIP and confirm its event before anything is saved.");
  }catch(e){reset();setStatus("Could not inspect ZIP: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 },[bridge,selectedKey]);
 useEffect(()=>{
  if(!active)return;
  const dragover=(e:DragEvent)=>{if(e.dataTransfer?.types.includes("Files"))e.preventDefault();};
  const drop=(e:DragEvent)=>{
   const zips=Array.from(e.dataTransfer?.files??[]).filter(f=>/\.zip$/i.test(f.name));
   if(!zips.length)return;
   e.preventDefault();e.stopPropagation();
   if(zips.length!==1){setStatus("Drop one ZIP at a time so you can confirm its event.");return;}
   void stage(zips[0]!);
  };
  document.addEventListener("dragover",dragover);
  document.addEventListener("drop",drop);
  return ()=>{document.removeEventListener("dragover",dragover);document.removeEventListener("drop",drop)};
 },[active,stage]);
 const submit=async()=>{
  if(!archive||!inspection||!bridge?.eventZipImport||busy)return;
  let key=target;
  if(mode==="existing"){
   if(!shows.some(s=>s.key===target)){setStatus("Choose an existing show.");return;}
  }else{
   if(!name.trim()||!validDay(start)||!validDay(end)||end<start||!rooms.length){
    setStatus("Confirm event name, start/end dates and at least one CGC room.");return;
   }
   if(/\b(?:cepac|cobb energy|performing arts)\b/i.test(name)){
    setStatus("Only Cobb Convention Center-Atlanta shows can be added.");return;
   }
   key=eventId.trim()?"id:"+eventId.trim():"name:"+name.trim().toLowerCase();
  }
  setBusy(true);setStatus("Saving event documents locally…");
  try{
   if(mode==="new"){
    await bridge.showCatalogSave([{key,eventId:eventId.trim(),showName:name.trim(),
     startDate:start,showDate:end,rooms:rooms.join(", ")}]);
    window.dispatchEvent(new Event("showpilot:postcon-catalog"));
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
   onImported(key);reset();
   setStatus(result.imported.length+" document(s) imported. "+result.duplicates.length+
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
   <h3 className="font-semibold">Import an event ZIP</h3>
   <p className="text-sm text-muted-foreground">Drop a show ZIP anywhere on the Events screen. Review its documents, then choose an existing show or create one. No automatic guesses are saved.</p>
  </div></div>
  <div className={"cursor-pointer rounded-xl border-2 border-dashed p-5 text-center "+(dragging?"border-blue-500 bg-blue-500/10":"hover:bg-muted/30")}
   role="button" tabIndex={0} aria-label="Drop or browse for an event ZIP"
   onClick={()=>picker.current?.click()}
   onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();picker.current?.click();}}}
   onDragOver={e=>{e.preventDefault();setDragging(true)}}
   onDragLeave={e=>{e.preventDefault();setDragging(false)}}
   onDrop={e=>{
    e.preventDefault();e.stopPropagation();setDragging(false);
    const files=Array.from(e.dataTransfer.files);
    if(files.length!==1){setStatus("Choose one event ZIP at a time.");return;}
    void stage(files[0]!);
   }}>
   <UploadCloud className="mx-auto mb-2 size-7 text-muted-foreground"/>
   <strong>{busy?"Reading event ZIP…":"Drop event .zip here"}</strong>
   <p className="mt-1 text-xs text-muted-foreground">Or click to browse · ZIPs up to 150 MB · processed offline</p>
   <input ref={picker} type="file" className="hidden" accept=".zip"
    onChange={e=>{const f=e.target.files?.[0];if(f)void stage(f);}}/>
  </div>
  {inspection&&archive&&<div className="space-y-3 rounded-lg border p-3">
   <strong className="break-all text-sm">{archive.name}</strong>
   <p className="text-xs text-muted-foreground">{inspection.files.length} supported documents ({Math.round(inspection.totalBytes/1024)} KB). {inspection.ignored.length} unsupported entries skipped.</p>
   <details className="text-xs"><summary className="cursor-pointer font-semibold">Review ZIP documents</summary>
    <div className="max-h-44 overflow-auto border rounded p-2 mt-2">
     {inspection.files.map(f=><p key={f.path} className="break-all">{f.path} · {f.kind}</p>)}
     {inspection.ignored.length>0&&<p>Skipped: {inspection.ignored.slice(0,12).join(", ")}</p>}
    </div>
   </details>
   <fieldset className="space-y-2">
    <legend className="font-semibold text-sm">Import into</legend>
    <div className="flex flex-wrap gap-4 text-sm">
     <label className="flex gap-2 items-center"><input type="radio" name="zip-target" checked={mode==="existing"} onChange={()=>setMode("existing")}/> Existing show</label>
     <label className="flex gap-2 items-center"><input type="radio" name="zip-target" checked={mode==="new"} onChange={()=>setMode("new")}/> New show</label>
    </div>
    {mode==="existing"?<label className="block text-sm">Choose saved event
     <select className="mt-1 w-full rounded border bg-background p-2" value={target} onChange={e=>setTarget(e.target.value)}>
      <option value="">Choose show…</option>
      {shows.map(s=><option key={s.key} value={s.key}>{s.showName} · {s.startDate??s.showDate}</option>)}
     </select>
    </label>:<div className="space-y-3">
     <p className="text-xs text-muted-foreground">The ZIP filename or event.json may suggest details. Verify them before creating the show.</p>
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
    <Button size="sm" variant="outline" disabled={busy} onClick={reset}>Cancel</Button>
   </div>
  </div>}
  {status&&<p role="status" className="text-xs text-muted-foreground">{status}</p>}
 </div>;
}
