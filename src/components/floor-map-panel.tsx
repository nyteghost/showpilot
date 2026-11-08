import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileUp, MapPin, RotateCcw, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildEntries, cellAround, locate, mergeTexts, parseBooth, parseWorkOrderLines, parseShowPilotItemLines, type ShowPilotItem, placedCsv, planKey, questionsCsv, resolve, type Answers, type Box, type Entry, type Question } from "@/lib/floor-map";
import type { PlanDoc } from "@/lib/floor-map-pdf";
import { LocalPlanningAssistant } from "@/components/showpilot-planning-assistant";
import {findFloorMapShowById,linkedMapDocuments,isBetterWorkOrderItems} from "@/lib/showpilot-floor-map-events";
import type {PostConShow} from "@/lib/showpilot-postcon";

type Saved = { answers: Answers; ok: Record<string, true> };
const storeKey = (k: string) => `pixelpals:floormap:${k}`;
const load = (k: string): Saved => { try { return JSON.parse(localStorage.getItem(storeKey(k)) ?? "") as Saved; } catch { return { answers: {}, ok: {} }; } };
const save = (k: string, v: Saved) => { try { localStorage.setItem(storeKey(k), JSON.stringify(v)); } catch { /* private window: answers just won't be remembered */ } };

/**
 * Floor map: drop a floor plan PDF and the "Better Work Order Items" PDF, get the plan colored.
 * Anything it isn't sure of goes in a "Needs your answer" list; answers are remembered for that plan.
 */
export function FloorMapPanel({initialEventDocuments,selectedEventId=""}:{initialEventDocuments?:File[];selectedEventId?:string}={}) {
  const [plan, setPlan] = useState<PlanDoc | null>(null);
  const [name, setName] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState<Saved>({ answers: {}, ok: {} });
  const [sel, setSel] = useState<string | null>(null);
  const [picks, setPicks] = useState<Box[]>([]);
  const [typed, setTyped] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pageNo, setPageNo] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [rows, setRows] = useState(0);
  const [itemized,setItemized]=useState<ShowPilotItem[]>([]);
  const [eventId,setEventId]=useState(selectedEventId);
  const [eventIdInput,setEventIdInput]=useState(selectedEventId);
  const [knownShows,setKnownShows]=useState<PostConShow[]>([]);
  const [savedEventMaps,setSavedEventMaps]=useState<{eventKey:string;eventId:string;showName:string;planCount:number}[]>([]);
  const [pendingLayout,setPendingLayout]=useState<File|null>(null);
  const [linkStatus,setLinkStatus]=useState("");
  const [linking,setLinking]=useState(false);
  const [eventImage,setEventImage]=useState("");
  const loadedSeed=useRef("");
  const bridge=window.showpilotMemory;
  const selectedShow=useMemo(()=>findFloorMapShowById(eventIdInput,knownShows),[eventIdInput,knownShows]);
  useEffect(()=>{
    let alive=true;
    const refresh=()=>{
      void bridge?.showCatalogList().then(shows=>{if(alive)setKnownShows(shows)})
       .catch(()=>{if(alive)setLinkStatus("Could not read saved Events. Event ID matching is unavailable.")});
      void bridge?.eventFloorMapEvents?.().then(entries=>{if(alive)setSavedEventMaps(entries)})
       .catch(()=>{if(alive)setSavedEventMaps([])});
    };
    refresh();
    window.addEventListener("showpilot:postcon-catalog",refresh);
    window.addEventListener("showpilot:event-files-updated",refresh);
    return ()=>{
      alive=false;
      window.removeEventListener("showpilot:postcon-catalog",refresh);
      window.removeEventListener("showpilot:event-files-updated",refresh);
    };
  },[bridge]);
  const eventFileKey=initialEventDocuments?.map(f=>f.name+":"+f.size).join("|")??"";
  const [noteHints,setNoteHints]=useState<ShowPilotItem[]>([]);
  const view = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{x:number;y:number;left:number;top:number;moved:boolean}|null>(null);
  const suppressClick = useRef(false);
  const zoomTo=(next:number)=>{
    const el=viewport.current;
    const clamped=Math.max(0.75,Math.min(6,Math.round(next*4)/4));
    if(el){
      const cx=(el.scrollLeft+el.clientWidth/2)/zoom;
      const cy=(el.scrollTop+el.clientHeight/2)/zoom;
      requestAnimationFrame(()=>{
        if(viewport.current){
          viewport.current.scrollLeft=cx*clamped-viewport.current.clientWidth/2;
          viewport.current.scrollTop=cy*clamped-viewport.current.clientHeight/2;
        }
      });
    }
    setZoom(clamped);
  };
  function startPan(e:React.MouseEvent<HTMLCanvasElement>){
    if(e.button!==0&&e.button!==1)return;
    const el=viewport.current;if(!el)return;
    drag.current={x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop,moved:false};
  }
  function movePan(e:React.MouseEvent<HTMLCanvasElement>){
    const d=drag.current,el=viewport.current;if(!d||!el)return;
    const dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(Math.abs(dx)+Math.abs(dy)>6)d.moved=true;
    if(d.moved){el.scrollLeft=d.left-dx;el.scrollTop=d.top-dy;}
  }
  function stopPan(){if(drag.current?.moved)suppressClick.current=true;drag.current=null;}

  const base = useRef<HTMLCanvasElement | null>(null);
  const geom = useRef({ s: 1, band: 0 });

  const key = plan ? planKey(name+(eventId?" · #"+eventId:""), plan.prims) : "";
  const resolved = useMemo(() => (plan ? resolve(plan.prims, entries, saved.answers) : null), [plan, entries, saved.answers]);
  const open = (resolved?.questions ?? []).filter((q) => !saved.ok[q.id]);
  const blocking = open.filter((q) => q.kind !== "check");
  const checks = open.filter((q) => q.kind === "check");

  function chooseEvent(id:string,items=itemized){
    setEventId(id);
    const selected=items.filter(x=>x.venue==="CGC"&&x.eventId===id);
    setEntries(buildEntries(selected.map(x=>x.line)));
    setRows(selected.length);
    setNoteHints(selected.filter(x=>x.noteBooth));
  }
  async function read(fs: File[], page = pageNo, targetEventId=eventIdInput||selectedEventId) {
    setStatus("Reading…"); setPlan(null); setSel(null); setPicks([]);
    try {
      const pdf = await import("@/lib/floor-map-pdf");
      let lines: string[] = []; let planFile: File | null = null;
      let summaryReport = false;
      const wideItems:ShowPilotItem[]=[];
      for (const f of fs.filter(x => /\.pdf$/i.test(x.name))) {
        const l = await pdf.readWorkOrder(f);
        const parsedWide=parseShowPilotItemLines(l);
        if(parsedWide.length&&isBetterWorkOrderItems(f.name)){wideItems.push(...parsedWide);lines.push(...l);}
        else if (parseWorkOrderLines(l).length >= 3) lines = l;
        else if (l.some(x => /better work orders/i.test(x)) && l.some(x => /booth number|bill-to account|space - order/i.test(x))) summaryReport = true;
        else planFile = f;
      }
      if(!lines.length&&planFile){
        // A hall layout from Events can be displayed before work orders arrive.
        // Only color booths after the separately verified itemized work order
        // is supplied — no utility data or booth orders are invented.
        const doc=await pdf.readPlan(planFile,page);
        setEntries([]);setRows(0);setItemized([]);setNoteHints([]);
        setPlan(doc);setName(planFile.name);setFiles(fs);setEventId(targetEventId);
        setSaved(load(planKey(planFile.name+(targetEventId?" · #"+targetEventId:""),doc.prims)));
        const scale=pdf.pickScale(doc.prims);
        const canvas=document.createElement("canvas");
        await doc.render(canvas,scale);
        base.current=canvas;geom.current={s:scale,band:0};
        setStatus("Event hall layout loaded. If this event has saved Better Work Order Items, choose its Event ID and load its documents to color matching booths.");
        return;
      }
      if (!lines.length) {
        setStatus(summaryReport
          ? "This is the Better Work Orders SUMMARY, not the itemized Better Work Order Items report. It lists booths and order numbers, but not the utility descriptions and quantities needed to color booths. Export Better Work Order Items and select it together with the floor plan."
          : "I need the itemized Better Work Order Items PDF with utility descriptions and quantities, plus the floor plan PDF. Select both together.");
        setFiles(fs); return;
      }
      if (!planFile) { setStatus("Work order items found, but the FLOOR PLAN PDF with booth positions is missing. Select both files together."); setFiles(fs); return; }
      const doc = await pdf.readPlan(planFile, page);
      setItemized(wideItems);
      if(wideItems.length){const ids=[...new Set(wideItems.filter(x=>x.venue==="CGC").map(x=>x.eventId))];const initial=targetEventId&&ids.includes(targetEventId)?targetEventId:ids.length===1?ids[0]!:"";chooseEvent(initial,wideItems);if(targetEventId&&!ids.includes(targetEventId))setStatus("The linked itemized report does not contain Event ID "+targetEventId+". No unrelated booths were placed.");}
      else {const parsed=parseWorkOrderLines(lines);setEntries(buildEntries(parsed));setRows(parsed.length);setNoteHints([]);setEventId(targetEventId);}
      setPlan(doc); setName(planFile.name); setFiles(fs);
      setSaved(load(planKey(planFile.name+(targetEventId?" · #"+targetEventId:""), doc.prims)));
      const s = pdf.pickScale(doc.prims);
      const c = document.createElement("canvas");
      await doc.render(c, s);
      base.current = c; geom.current = { s, band: 0 };
      setStatus("");
    } catch (e) { setStatus(`Couldn't read those PDFs: ${(e as Error).message}`); }
  }

  /** A standalone plan is attached only after its Event ID resolves to one
   * existing CGC show. Saved itemized reports are loaded by that same exact ID.
   * No network/AI or separate report upload is required. */
  async function loadEventLayoutAndOrders(id=eventIdInput,attachUploaded=false){
    if(!bridge){setLinkStatus("This action requires ShowPilot desktop storage.");return;}
    if(linking)return;
    setLinking(true);setLinkStatus("");
    try{
      const catalog=await bridge.showCatalogList();
      setKnownShows(catalog);
      const match=findFloorMapShowById(id,catalog);
      if(match.status!=="matched"||!match.show){
        throw Error(match.status==="ambiguous"?"Multiple saved CGC events use this Event ID. Resolve the duplicate before attaching a layout.":"Enter an existing CGC Event ID from Events before linking a layout.");
      }
      const show=match.show;
      const all=await bridge.eventFileList(show.key);
      const linked=linkedMapDocuments(all);
      const loaded=async(fileId:string)=>{
        const saved=await bridge.eventFileRead(fileId);
        return new File([new Uint8Array(saved.bytes)],saved.name,{type:saved.extension==="pdf"?"application/pdf":"application/octet-stream"});
      };
      const layout=pendingLayout??(linked.layouts.length?await loaded(linked.layouts[0]!.id):null);
      if(!layout)throw Error("No floor layout is saved for this event. Upload a layout PDF or image first.");
      const reportList=linked.reports.slice(0,6);
      const reports=await Promise.all(reportList.map(f=>loaded(f.id)));
      setEventIdInput(show.eventId);
      if(attachUploaded&&pendingLayout){
        if(!/\.pdf$|\.png$|\.jpe?g$|\.webp$/i.test(pendingLayout.name))
          throw Error("Attach a PDF or image layout.");
        // Preserve existing layout originals, and avoid blindly duplicating
        // an identical filename/length already in this show's vault.
        const already=all.some(x=>!x.archived&&x.kind==="diagram"&&
          x.name===pendingLayout.name&&x.bytes===pendingLayout.size);
        if(!already){
          await bridge.eventFileSave({eventKey:show.key,kind:"diagram",
            name:pendingLayout.name,bytes:await pendingLayout.arrayBuffer()});
          window.dispatchEvent(new Event("showpilot:event-files-updated"));
        }
      }
      if(/\.pdf$/i.test(layout.name)){
        setEventImage("");
        await read([layout,...reports],1,show.eventId);
      }else{
        const url=URL.createObjectURL(layout);
        setEventImage(previous=>{if(previous)URL.revokeObjectURL(previous);return url;});
        setPlan(null);setName(layout.name);setEntries([]);setRows(0);
        setStatus("Image layout loaded. Booth utility coloring requires a text/vector PDF floor plan.");
      }
      setPendingLayout(null);
      setLinkStatus("Linked to "+show.showName+" (Event #"+show.eventId+"). "+
        (reports.length?reports.length+" saved itemized report(s) loaded for automatic booth placement.":
        "No itemized Better Work Order Items report is saved for this event yet. Upload one to its Exhibitor Orders."));
    }catch(e){setLinkStatus("Layout not linked: "+(e instanceof Error?e.message:String(e)));}
    finally{setLinking(false);}
  }
  const importLayoutFiles=(selected:File[])=>{
    if(!selected.length)return;
    const layout=selected.find(f=>/\.(?:pdf|png|jpg|jpeg|webp)$/i.test(f.name)&&
      !isBetterWorkOrderItems(f.name));
    setPendingLayout(layout??null);
    setLinkStatus(layout?"Enter or verify the Event ID and select Link layout & load saved orders.":"Choose a floor layout PDF or image to link to an Event ID.");
    if(layout&&/\.(?:png|jpg|jpeg|webp)$/i.test(layout.name)){
      const url=URL.createObjectURL(layout);
      setEventImage(previous=>{if(previous)URL.revokeObjectURL(previous);return url;});
      setPlan(null);setName(layout.name);
    }else {
      setEventImage(previous=>{if(previous)URL.revokeObjectURL(previous);return "";});
      void read(selected,1,eventIdInput||selectedEventId);
    }
  };

  useEffect(()=>{
    if(!initialEventDocuments?.length||!eventFileKey||loadedSeed.current===eventFileKey)return;
    loadedSeed.current=eventFileKey;
    const hasPdf=initialEventDocuments.some(f=>/\.pdf$/i.test(f.name));
    const image=!hasPdf?initialEventDocuments.find(f=>/\.(?:png|jpg|jpeg|webp)$/i.test(f.name)):undefined;
    if(image){
      const url=URL.createObjectURL(image);
      setEventImage(url);
      setStatus("Event hall image layout loaded. PDF floor plans and itemized utility orders are needed for booth coloring.");
      return ()=>URL.revokeObjectURL(url);
    }
    setEventImage("");
    if(selectedEventId)setEventIdInput(selectedEventId);
    void read(initialEventDocuments,1,selectedEventId);
  },[eventFileKey,selectedEventId]);
  // paint: plan + legend strip + colors (+ the booths being picked)
  useEffect(() => {
    const v = view.current, b = base.current;
    if (!v || !b || !plan || !resolved) return;
    let alive = true;
    import("@/lib/floor-map-pdf").then((pdf) => {
      if (!alive) return;
      const { s } = geom.current;
      const tmp = document.createElement("canvas");
      tmp.width = b.width; tmp.height = 10;
      const ctx0 = tmp.getContext("2d"); if (!ctx0) return;
      const band = Math.ceil(pdf.drawLegend(ctx0, b.width, s, `POWER ORDERS — ${name.replace(/\.pdf$/i, "")}`));
      geom.current = { s, band };
      v.width = b.width; v.height = b.height + band;
      const ctx = v.getContext("2d"); if (!ctx) return;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, v.width, v.height);
      pdf.drawLegend(ctx, b.width, s, `POWER ORDERS — ${name.replace(/\.pdf$/i, "")}`);
      ctx.drawImage(b, 0, band);
      pdf.drawOverlay(ctx, s, resolved.placed, picks, band);
    });
    return () => { alive = false; };
  }, [plan, resolved, picks, name]);

  const commit = (q: Question, cells: Box[]) => { const next = { ...saved, answers: { ...saved.answers, [q.entryKey]: { cells } } }; setSaved(next); save(key, next); setPicks([]); setSel(null); setTyped(""); };
  const skip = (q: Question) => { const next = { ...saved, answers: { ...saved.answers, [q.entryKey]: { skip: true as const } } }; setSaved(next); save(key, next); setSel(null); setPicks([]); };
  const okay = (q: Question) => { const next = { ...saved, ok: { ...saved.ok, [q.id]: true as const } }; setSaved(next); save(key, next); };
  const forget = () => { const next: Saved = { answers: {}, ok: {} }; setSaved(next); save(key, next); setSel(null); setPicks([]); };

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if(suppressClick.current){suppressClick.current=false;return;}
    if (!sel || !plan) return;
    const v = e.currentTarget, r = v.getBoundingClientRect();
    const { s, band } = geom.current;
    const x = ((e.clientX - r.left) / r.width) * v.width / s;
    const y = (((e.clientY - r.top) / r.height) * v.height - band) / s;
    const c = cellAround(plan.prims, x, y);
    if (c) setPicks((p) => (p.some((q) => q.x === c.x && q.y === c.y) ? p.filter((q) => !(q.x === c.x && q.y === c.y)) : [...p, c]));
    else setStatus("I couldn't find a booth outline there — try the middle of the booth.");
  }

  function tryTyped(q: Question) {
    if (!plan) return;
    const labels = mergeTexts(plan.prims.texts);
    const cells = parseBooth(typed).ids.map((id) => locate(plan.prims, labels, id)).filter((c): c is Box => !!c);
    if (cells.length) setPicks(cells); else setStatus(`"${typed}" isn't labeled on the plan either.`);
    setSel(q.id);
  }

  async function out(kind: "png" | "pdf" | "placed" | "questions") {
    if (!view.current || !resolved) return;
    const pdf = await import("@/lib/floor-map-pdf");
    const { downloadBlob } = await import("@/lib/work-files");
    const base0 = name.replace(/\.pdf$/i, "") || "floor-plan";
    if (kind === "png") downloadBlob(await pdf.canvasToPngBlob(view.current), `${base0}-power-orders.png`);
    else if (kind === "pdf") downloadBlob(await pdf.canvasToPdfBlob(view.current), `${base0}-power-orders.pdf`);
    else if (kind === "placed") downloadBlob(new Blob([placedCsv(resolved.placed)], { type: "text/csv" }), `${base0}-colored.csv`);
    else downloadBlob(new Blob([questionsCsv(open)], { type: "text/csv" }), `${base0}-needs-your-answer.csv`);
  }

  const renderQ = (q: Question) => {
    const active = sel === q.id;
    return (
      <li key={q.id} className="rounded-md border border-border p-2 text-sm">
        <div className="font-medium">{q.exhibitor || "(no name)"} <span className="font-mono text-xs text-muted-foreground">{q.booth}</span></div>
        <div className="text-muted-foreground">{q.text}</div>
        {q.kind === "check" ? (
          <div className="mt-1 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => okay(q)}>Looks right</Button><Button size="sm" variant="outline" onClick={() => { setSel(active ? null : q.id); setPicks([]); }}><MapPin className="size-3.5" /> Fix on plan</Button></div>
        ) : (
          <div className="mt-1 space-y-1">
            {(q.hints ?? []).filter((h) => h.cell).map((h, i) => (
              <Button key={i} size="sm" variant="outline" className="mr-1" onClick={() => { setSel(q.id); setPicks([h.cell!]); }}>Use “{h.text.slice(0, 30)}” on the plan</Button>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={active ? "default" : "outline"} onClick={() => { setSel(active ? null : q.id); setPicks([]); }}><MapPin className="size-3.5" /> {active ? "Click the booth(s) on the plan…" : "Pick on plan"}</Button>
              <Input value={active ? typed : ""} onChange={(e) => { setTyped(e.target.value); setSel(q.id); }} placeholder="or type its booth #" className="h-8 w-36" />
              <Button size="sm" variant="outline" disabled={!active || !typed.trim()} onClick={() => tryTyped(q)}>Find</Button>
              <Button size="sm" variant="ghost" onClick={() => skip(q)}>Skip</Button>
            </div>
          </div>
        )}
        {active && picks.length > 0 && (
          <div className="mt-1 flex items-center gap-2"><span className="text-xs text-muted-foreground">{picks.length} booth{picks.length > 1 ? "s" : ""} outlined in blue.</span><Button size="sm" onClick={() => commit(q, picks)}>Color {picks.length > 1 ? "them" : "it"}</Button><Button size="sm" variant="ghost" onClick={() => setPicks([])}>Clear</Button></div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="rounded-lg border p-3 space-y-2">
        <p className="font-semibold text-sm">Event ID — link layout and saved Exhibitor Orders</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-44 flex-1 text-xs">CGC Event ID
            <Input className="mt-1" value={eventIdInput} placeholder="e.g. 41622"
              list="floor-map-saved-events"
              onChange={e=>{setEventIdInput(e.target.value);setLinkStatus("");}}/>
            <datalist id="floor-map-saved-events">{knownShows.filter(s=>s.eventId&&
              !/CEPAC|Cobb Energy|Performing Arts/i.test(s.showName+" "+s.rooms))
              .map(s=><option value={s.eventId} key={s.key}>{s.showName}</option>)}</datalist>
          </label>
          <Button size="sm" disabled={linking||selectedShow.status!=="matched"||!pendingLayout}
            onClick={()=>void loadEventLayoutAndOrders(eventIdInput,true)}>
            {linking?"Linking…":"Link uploaded layout & fill orders"}
          </Button>
          <Button size="sm" variant="outline" disabled={linking||selectedShow.status!=="matched"}
            onClick={()=>void loadEventLayoutAndOrders(eventIdInput,false)}>
            Load saved layout & orders
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedShow.status==="matched"&&selectedShow.show?
           "Matched: "+selectedShow.show.showName+" (#"+selectedShow.show.eventId+")":
           selectedShow.status==="ambiguous"?"More than one Events record has this ID; resolve the duplicate first.":
           eventIdInput?"No unique saved CGC event matches this ID. Import it in Events before linking.":"Enter an existing Event ID, or choose a saved event from the suggestions."}
        </p>
        {savedEventMaps.length>0&&<label className="block text-xs font-medium">
          Floor maps already found in Events ({savedEventMaps.length} events)
          <select className="mt-1 w-full rounded border bg-background p-2 font-normal"
            value={savedEventMaps.some(entry=>entry.eventId===eventIdInput)?eventIdInput:""}
            onChange={e=>{setEventIdInput(e.target.value);setPendingLayout(null);setLinkStatus("");}}>
            <option value="">Choose an event with a saved floor map…</option>
            {savedEventMaps.map(entry=>
              <option key={entry.eventKey} value={entry.eventId}>
                {entry.showName} · #{entry.eventId} · {entry.planCount} plan{entry.planCount===1?"":"s"}
              </option>)}
          </select>
        </label>}
        <p className="text-xs text-muted-foreground">Floor plans detected in an Event ZIP are listed above automatically, including layouts named Floorplan.pdf. Select the saved event and click Load saved layout & orders; no separate upload is needed. Existing itemized Better Work Order Items PDFs in Exhibitor Orders provide booth utility information when available. Unclear booth locations still require review.</p>
        {linkStatus&&<p role="status" className="text-xs">{linkStatus}</p>}
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const l = [...e.dataTransfer.files]; if (l.length) importLayoutFiles(l); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center text-sm hover:bg-muted ${over ? "border-primary bg-muted text-foreground" : "border-border text-muted-foreground"}`}
      >
        <span className="flex items-center gap-2"><FileUp className="size-4" /> Upload floor layout PDF or image (and optionally Better Work Order Items PDF)</span>
        <span className="text-xs">Choose an Event ID above to load saved order items automatically, even when the layout was not in the EOC ZIP.</span>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple className="sr-only" onChange={(e) => { const l = [...(e.target.files ?? [])]; if (l.length) importLayoutFiles(l); e.target.value = ""; }} />
      </label>
      <p className="text-xs text-muted-foreground">10 amp = yellow · 20 amp = orange · both = split · more than one → x#. Small squares: red 30 amp, green 60 amp, blue water, purple compressed air. Showcase power is yellow (SCase xN), track lights show A / B xN. Runs in this browser; answers you give are remembered for the same plan.</p>
      {itemized.length>0&&<div className="rounded-md border p-3 space-y-2 text-sm">
        <label className="block font-semibold" htmlFor="floor-event">Choose event before placing utilities</label>
        <select id="floor-event" className="w-full rounded border bg-background p-2" value={eventId} onChange={e=>chooseEvent(e.target.value)}>
          <option value="">Select one CGC event…</option>
          {[...new Map(itemized.filter(x=>x.venue==="CGC").map(x=>[x.eventId,x.eventName])).entries()].map(([id,title])=><option key={id} value={id}>{title} (ID {id})</option>)}
        </select>
        <p className="text-xs text-muted-foreground">CEPAC items are excluded. Empty booth fields are not guessed from notes.</p>
        {noteHints.length>0&&<details><summary className="cursor-pointer font-semibold">{noteHints.length} note-based booth hints — review manually</summary>
         <ul className="mt-2 list-disc space-y-1 pl-5">{noteHints.map((x,i)=><li key={i}>{x.line.pre}: possible booth {x.noteBooth} (order {x.line.order}). Verify the note and use Needs your answer to place it.</li>)}</ul>
        </details>}
      </div>}
      {status && <p className={`text-sm ${/^Couldn|^I need/.test(status) ? "text-destructive" : ""}`} role="status">{status}</p>}
      {eventImage&&<div className="rounded-md border p-3"><p className="mb-2 text-sm font-semibold">Event hall layout</p><img src={eventImage} alt="Attached CGC hall layout" className="max-w-full object-contain"/></div>}
      {!plan && !status && <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground"><li>Drop the plan and the work order report.</li><li>Check the colored map — zoom in with the slider.</li><li>Answer anything under “Needs your answer” (pick the booth on the plan, or skip).</li><li>Download the picture or PDF.</li></ol>}
      {plan && resolved && (
        <>
          <p className="text-xs text-muted-foreground">{name} · {rows} order lines read · {entries.length} exhibitors</p>
          <p className="text-sm font-medium">{resolved.placed.length} colored · {blocking.length} need your answer{checks.length ? ` · ${checks.length} to double-check` : ""}</p>
          {open.length>0&&<LocalPlanningAssistant kind="floor"
            memoryQuery={[name,eventId,...open.slice(0,3).map(q=>q.booth+" "+q.exhibitor)].join(" ").slice(0,160)}
            context={{
              planName:name,eventId,placedCount:resolved.placed.length,
              unresolved:open.slice(0,20).map(q=>({
                id:q.id,kind:q.kind,booth:q.booth,exhibitor:q.exhibitor,
                text:q.text.slice(0,180),hints:(q.hints??[]).slice(0,4).map(h=>h.text.slice(0,100))
              }))
            }}
            onApply={suggestion=>{
              const match=open.find(q=>q.id===suggestion.targetId);
              if(!match)return;
              setSel(match.id);setPicks([]);setTyped("");
              setStatus("AI selected an unresolved booth question for review. Verify its location on the plan before coloring.");
            }}
            applyLabel="Review this booth on map"
          />}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void out("png")}><Download className="size-4" /> Picture (PNG)</Button>
            <Button size="sm" variant="outline" onClick={() => void out("pdf")}><Download className="size-4" /> PDF</Button>
            <Button size="sm" variant="outline" onClick={() => void out("placed")}><Download className="size-4" /> Colored list (CSV)</Button>
            {open.length > 0 && <Button size="sm" variant="outline" onClick={() => void out("questions")}><Download className="size-4" /> Questions (CSV)</Button>}
            <Button size="sm" variant="ghost" onClick={forget} title="Forget the answers saved for this plan"><RotateCcw className="size-4" /> Reset answers</Button>
            <div className="ml-auto flex items-center gap-1" role="group" aria-label="Floor plan zoom">
              <Button size="sm" variant="outline" aria-label="Zoom out" disabled={zoom<=0.75} onClick={()=>zoomTo(zoom-0.5)}><ZoomOut className="size-4"/></Button>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">Zoom <Input aria-label="Zoom level" type="range" min={0.75} max={6} step={0.25} value={zoom} onChange={(e)=>zoomTo(Number(e.target.value))} className="h-6 w-28"/></label>
              <span className="min-w-12 text-center text-xs">{Math.round(zoom*100)}%</span>
              <Button size="sm" variant="outline" aria-label="Zoom in" disabled={zoom>=6} onClick={()=>zoomTo(zoom+0.5)}><ZoomIn className="size-4"/></Button>
              <Button size="sm" variant="outline" aria-label="Reset zoom" onClick={()=>{setZoom(1);if(viewport.current){viewport.current.scrollLeft=0;viewport.current.scrollTop=0;}}}><Maximize2 className="size-4"/></Button>
            </div>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">Page <Input type="number" min={1} value={pageNo} onChange={(e) => setPageNo(Math.max(1, Number(e.target.value) || 1))} onBlur={() => files.length && void read(files, pageNo)} className="h-7 w-16" /></label>
          </div>
          <p className="text-xs text-muted-foreground">Zoom with the controls, then drag the plan to pan. While answering a booth question, a click selects a booth; dragging moves the map instead.</p>
          <div ref={viewport} className="max-h-[65vh] overflow-auto rounded-md border border-border bg-white">
            <canvas ref={view} onClick={onClick} onMouseDown={startPan} onMouseMove={movePan} onMouseUp={stopPan} onMouseLeave={stopPan} onAuxClick={e=>e.preventDefault()} style={{ width: `${zoom * 100}%`, cursor: drag.current ? "grabbing" : sel ? "crosshair" : "grab", maxWidth:"none", display:"block", userSelect:"none" }} />
          </div>
          {blocking.length > 0 && (<><h4 className="text-sm font-semibold">Needs your answer</h4><ul className="space-y-2">{blocking.map(renderQ)}</ul></>)}
          {checks.length > 0 && (<details><summary className="cursor-pointer text-sm font-semibold">Double-check ({checks.length})</summary><ul className="mt-2 space-y-2">{checks.map(renderQ)}</ul></details>)}
        </>
      )}
    </div>
  );
}
