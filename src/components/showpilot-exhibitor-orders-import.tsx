import {useRef,useState} from "react";
import {FileStack,UploadCloud,CheckCircle2,AlertTriangle} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {PostConShow} from "@/lib/showpilot-postcon";
import {pdfTextPages,validateEventFile} from "@/lib/showpilot-event-assets";
import {matchExhibitorOrder,type ExhibitorOrderMatch} from "@/lib/showpilot-exhibitor-orders";

type ReviewedOrder={
 id:string;file:File;source:string;match:ExhibitorOrderMatch;
 eventKey:string;acknowledged:boolean;selected:boolean;warning:string;
};
const maxZip=150*1024*1024;
const limit=80;
const supported=/\.(?:pdf|docx|xlsx|xls|txt|csv|png|jpg|jpeg|webp)$/i;
async function extractOrderText(file:File):Promise<{text:string;warning:string}>{
 const ext=file.name.split(".").pop()?.toLowerCase()??"";
 try{
  if(ext==="pdf"){
   const pages=await pdfTextPages(file,6);
   const text=pages.join("\n").slice(0,60000);
   return {text,warning:text.trim()?"":"No selectable text found in PDF. Confirm the Event ID manually."};
  }
  if(ext==="txt"||ext==="csv")return {text:(await file.text()).slice(0,60000),warning:""};
  if(ext==="xls"||ext==="xlsx"){
   const xlsx=await import("xlsx");
   const data=await file.arrayBuffer();
   const workbook=xlsx.read(new Uint8Array(data),{type:"array",cellFormula:false});
   const text=workbook.SheetNames.slice(0,5).map(name=>
    xlsx.utils.sheet_to_csv(workbook.Sheets[name]!,{blankrows:false}).slice(0,12000)).join("\n");
   return {text:text.slice(0,60000),warning:""};
  }
  return {text:"",warning:"This format does not expose readable Event ID text here. Confirm the event manually."};
 }catch(e){
  return {text:"",warning:"Unable to read Event ID from this document. Review it manually: "+
   (e instanceof Error?e.message:String(e)).slice(0,180)};
 }
}
export function ShowPilotExhibitorOrdersImport({shows,onSaved}:{
 shows:readonly PostConShow[];onSaved?:(eventKey:string)=>void;
}){
 const bridge=window.showpilotMemory;
 const picker=useRef<HTMLInputElement>(null);
 const [rows,setRows]=useState<ReviewedOrder[]>([]);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const [drag,setDrag]=useState(false);
 const [saved,setSaved]=useState(0);
 const pending=rows.filter(r=>r.selected);
 const eligible=(r:ReviewedOrder)=>{
  if(!r.eventKey)return false;
  if(r.match.status==="conflicting-ids"||r.match.status==="ambiguous-event"||
   r.match.status==="unmatched-id")return false;
  if(r.match.status==="matched"&&r.match.show?.key!==r.eventKey)return false;
  return r.match.status==="missing-id"?r.acknowledged:
   r.match.evidence.some(e=>e.source==="document")||r.acknowledged;
 };
 const canSave=pending.length>0&&pending.every(eligible);
 const update=(id:string,patch:Partial<ReviewedOrder>)=>
  setRows(old=>old.map(r=>r.id===id?{...r,...patch}:r));
 const stage=async(files:File[])=>{
  if(!bridge?.eventZipReadOrders||!bridge?.eventFileSave){
   setStatus("Importing Exhibitor Orders requires a current ShowPilot desktop build.");return;
  }
  if(busy)return;
  setBusy(true);setStatus("");setSaved(0);
  try{
   const catalog=await bridge.showCatalogList();
   const candidates: {file:File;source:string}[]=[];
   const messages:string[]=[];
   for(const input of files.slice(0,30)){
    if(/\.zip$/i.test(input.name)){
     if(input.size>maxZip)throw Error(input.name+" exceeds the 150 MB ZIP limit.");
     const extracted=await bridge.eventZipReadOrders(await input.arrayBuffer());
     if(extracted.skipped||extracted.ignored.length)
      messages.push(input.name+": "+extracted.skipped+" EOC/diagram files excluded, "+
       extracted.ignored.length+" unsupported entries skipped.");
     for(const item of extracted.files){
      const copy=new Uint8Array(item.bytes);
      candidates.push({file:new File([copy],item.name),source:input.name+" / "+item.path});
     }
    }else if(supported.test(input.name)){
     candidates.push({file:input,source:input.name});
    }else messages.push(input.name+" is not a supported Work Order document.");
   }
   if(!candidates.length)throw Error("No supported Work Orders found. Choose PDFs, Office files or a Work Orders ZIP.");
   if(candidates.length+rows.length>limit)throw Error("Review up to "+limit+" Work Orders at a time. Save or clear the existing queue first.");
   const staged:ReviewedOrder[]=[];
   for(const candidate of candidates){
    try{
     validateEventFile(candidate.file);
     const {text,warning}=await extractOrderText(candidate.file);
     const match=matchExhibitorOrder(candidate.source,text,catalog);
     staged.push({
      id:crypto.randomUUID(),file:candidate.file,source:candidate.source,match,
      eventKey:match.status==="matched"?match.show!.key:"",
      acknowledged:false,selected:true,warning
     });
    }catch(e){messages.push(candidate.source+": "+(e instanceof Error?e.message:String(e)));}
   }
   setRows(old=>[...old,...staged]);
   setStatus(staged.length+" Work Order(s) ready for review. "+
    (messages.length?messages.join(" | ").slice(0,900):"Match each order to an Events record before saving."));
  }catch(e){setStatus("Import not staged: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);if(picker.current)picker.current.value="";}
 };
 const save=async()=>{
  if(!bridge||busy||!canSave)return;
  setBusy(true);setStatus("");
  const done=new Set<string>();const touched=new Set<string>();
  let added=0,duplicates=0;
  const errors:string[]=[];
  try{
   // Revalidate IDs against the current SQLite Events catalog immediately
   // before writing. A stale selection cannot attach to a different show.
   const live=await bridge.showCatalogList();
   for(const row of rows.filter(r=>r.selected)){
    try{
     const next=matchExhibitorOrder(row.source,
      row.match.evidence.filter(e=>e.source==="document")
       .map(e=>"Event ID: "+e.value).join("\n"),live);
     const destination=live.find(s=>s.key===row.eventKey);
     if(!destination)throw Error("The selected Events record no longer exists.");
     if(row.match.status==="matched"||row.match.status==="unmatched-id"||
        row.match.status==="conflicting-ids"||row.match.status==="ambiguous-event"){
      if(next.status!=="matched"||next.show?.key!==row.eventKey)
       throw Error("Event ID no longer matches the selected event.");
     }else if(row.match.status==="missing-id"){
      if(!row.acknowledged)throw Error("Manual Event ID review not confirmed.");
     }
     if(!eligible(row))throw Error("Unresolved Event ID or review confirmation.");
     const savedFile=await bridge.eventFileSave({
      eventKey:row.eventKey,kind:"exhibitor-order",name:row.file.name,
      bytes:await row.file.arrayBuffer()
     });
     done.add(row.id);touched.add(row.eventKey);
     if("duplicate" in savedFile&&savedFile.duplicate===true)duplicates++;
     else added++;
    }catch(e){errors.push(row.source+": "+(e instanceof Error?e.message:String(e)));}
   }
   if(done.size){
    setRows(old=>old.filter(r=>!done.has(r.id)));
    setSaved(old=>old+done.size);
    window.dispatchEvent(new Event("showpilot:event-files-updated"));
    if(touched.size===1)onSaved?.([...touched][0]!);
   }
   setStatus("Saved "+added+" Exhibitor Order(s) to "+touched.size+" event(s). "+
    (duplicates?duplicates+" duplicate(s) already stored. ":"")+
    (errors.length?errors.join(" | ").slice(0,950):"Ready for the next upload."));
  }catch(e){setStatus("Unable to save orders: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 };
 return <section className="rounded-xl border p-4 space-y-3" aria-label="Import Exhibitor Orders">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h3 className="flex items-center gap-2 font-semibold"><FileStack size={18}/> Import Exhibitor Work Orders</h3>
    <p className="mt-1 text-xs text-muted-foreground">Upload PDF Work Orders or a ZIP containing orders for several shows. ShowPilot reads each file's Event ID, matches it to saved CGC Events, and files the original under Exhibitor Orders after your review.</p>
   </div>
   {rows.length>0&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>{setRows([]);setStatus("Review queue cleared. No saved documents were deleted.");}}>Clear review queue</Button>}
  </div>
  <div role="button" tabIndex={0} aria-label="Upload Exhibitor Work Orders"
   className={"rounded-lg border-2 border-dashed px-4 py-5 text-center cursor-pointer "+(drag?"border-blue-500 bg-blue-500/10":"border-border hover:bg-muted/30")}
   onClick={()=>picker.current?.click()}
   onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();picker.current?.click()}}}
   onDragOver={e=>{e.preventDefault();setDrag(true)}}
   onDragLeave={e=>{e.preventDefault();setDrag(false)}}
   onDrop={e=>{e.preventDefault();setDrag(false);void stage([...e.dataTransfer.files]);}}>
   <UploadCloud className="mx-auto mb-2 text-muted-foreground" size={24}/>
   <strong className="text-sm">{busy?"Processing Work Orders…":"Drop Work Orders or a ZIP here"}</strong>
   <p className="mt-1 text-xs text-muted-foreground">Or click to choose files · PDF, Office documents, text, CSV or ZIP.</p>
   <input ref={picker} type="file" multiple className="hidden"
    accept=".pdf,.docx,.xlsx,.xls,.txt,.csv,.png,.jpg,.jpeg,.webp,.zip"
    onChange={e=>void stage([...e.target.files??[]])}/>
  </div>
  {rows.length>0&&<div className="space-y-2">
   <p className="text-sm font-semibold">{rows.length} Work Order(s) awaiting review</p>
   {rows.map(row=>{
    const needsManual=row.match.status==="missing-id";
    const selectAllowed=needsManual;
    const label=row.match.status==="matched"?
     "Matched Event #"+row.match.eventId:
     row.match.status==="missing-id"?"No verified Event ID — manual assignment required":
     row.match.status==="unmatched-id"?"Event #"+row.match.eventId+" not in Events — import the schedule first":
     row.match.status==="ambiguous-event"?"Duplicate Events records for #"+row.match.eventId:
     "Conflicting Event IDs — split/correct the source files";
    return <div key={row.id} className="rounded-lg border p-3 space-y-2 text-xs">
     <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-0.5" checked={row.selected} disabled={busy}
       onChange={e=>update(row.id,{selected:e.target.checked})}/>
      <span className="min-w-0 break-all font-semibold">{row.file.name}<span className="block font-normal text-muted-foreground">{row.source}</span></span>
     </label>
     <p className={row.match.status==="matched"?"text-emerald-600":"text-amber-600"}>
      {row.match.status==="matched"?<CheckCircle2 size={13} className="mr-1 inline"/>:<AlertTriangle size={13} className="mr-1 inline"/>}{label}</p>
     {!!row.match.evidence.length&&<p className="text-muted-foreground">ID evidence: {row.match.evidence.map(e=>"#"+e.value+" ("+e.source+")").join(", ")}</p>}
     {row.warning&&<p className="text-amber-600">{row.warning}</p>}
     <label className="block">Destination in Events
      <select className="mt-1 block w-full rounded border bg-background p-2" value={row.eventKey}
       disabled={busy||!selectAllowed}
       onChange={e=>update(row.id,{eventKey:e.target.value,acknowledged:false})}>
       <option value="">Choose an event…</option>
       {shows.map(s=><option key={s.key} value={s.key}>{s.showName} · Event #{s.eventId||"Unknown"}</option>)}
      </select>
     </label>
     {(needsManual||row.match.status==="matched"&&
        !row.match.evidence.some(e=>e.source==="document"))&&
      <label className="flex gap-2 text-xs">
       <input type="checkbox" checked={row.acknowledged} disabled={busy}
        onChange={e=>update(row.id,{acknowledged:e.target.checked})}/>
       <span>I reviewed this Work Order and confirmed its Event ID and selected destination.</span>
      </label>}
    </div>;
   })}
   <div className="flex flex-wrap items-center gap-2">
    <Button size="sm" type="button" disabled={busy||!canSave} onClick={()=>void save()}>
     {busy?"Saving…":"Confirm & import selected orders"}
    </Button>
    <span className="text-xs text-muted-foreground">{pending.length} selected · {pending.filter(eligible).length} ready</span>
   </div>
   <p className="text-xs text-muted-foreground">A missing ID requires your confirmation. Conflicting IDs or IDs absent from Events cannot be assigned to another show. Multiple events in one ZIP are reviewed one Work Order at a time. Files stay on this PC and do not modify the EOC or Event Schedule.</p>
  </div>}
  {!!saved&&<p className="text-xs text-muted-foreground">{saved} order(s) processed in this session.</p>}
  {status&&<p role="status" className="rounded border p-2 text-xs break-words">{status}</p>}
 </section>;
}
