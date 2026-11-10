import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, CalendarClock, CalendarDays, CalendarPlus, CalendarSync, FolderOpen, Download, FileUp, GitBranch, Layers, Eye, Map as MapIcon, Store, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {ShowPilotRuleReview} from "@/components/showpilot-rule-review";
import {shiftRuleEvidence,calendarRuleEvidence,eventScheduleRuleEvidence,exportRuleEvidence} from "@/lib/showpilot-rule-evidence";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KeepAliveTabContent } from "@/components/showpilot-keep-alive-tab";
import { buildIcs, DEFAULT_SCHEDULE_NAME, editShift, entryLabel, formatMinutes, googleCalendarLink, isIsoDate, minutesToTime, newShiftId, nextMondayIso, parsePastedShiftsWithReview, shiftLabel, shiftNeedsReview, airwallTasks, detailedAirwallTask, isCancelledRow, isPendingRow, sharedSpaces, expandSpace, summarizeEvents, attachShowNames, taskSuggestions, timeToMinutes, withShiftIds, type EventEntry, type EventRow, type Shift, type TaskNote } from "@/lib/work-tools";
import { StandaloneVendors } from "@/components/showpilot-vendors";
import { FloorMapPanel } from "@/components/floor-map-panel";
import { scopeShowPilotRows } from "@/lib/showpilot-venue";
import { ScheduleReview } from "@/components/showpilot-review-panel";
import {ClaudeStaffingSettingsPanel} from "@/components/showpilot-claude-settings";
import {readClaudeSettings,saveClaudeSettings,type ClaudeStaffingSettings} from "@/lib/showpilot-claude-settings";
import { ShowPilotExcelPreview } from "@/components/showpilot-excel-preview";
import type {PreviewWorkbook} from "@/lib/showpilot-excel-preview";
import {reviewScopeDates,type ReviewDateScope} from "@/lib/showpilot-review-months";
import {scopedScheduleData} from "@/lib/showpilot-export-scope";
import { AiTaskAssistant } from "@/components/showpilot-ai-task-assistant";
import { LocalPlanningAssistant } from "@/components/showpilot-planning-assistant";
import { staffingPlanningContext } from "@/lib/showpilot-planning";
import {ShowPilotEventsPanel} from "@/components/showpilot-events-panel";
import {ShowPilotTodayPanel} from "@/components/showpilot-today-panel";
import { rememberPostConShowsFromReportRows } from "@/lib/showpilot-postcon";
import { applyReview, emptyReviewDraft, fingerprintRows, parseDraft, parseReviewProject, storageKey, type ReviewDraft, type ReviewProject } from "@/lib/showpilot-review";

const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export function WorkTools() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="engine-trigger"><Briefcase className="size-4" /> Work tools</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Show Services tools</DialogTitle>
          <DialogDescription>Everything runs in this browser — files never leave your device.</DialogDescription>
        </DialogHeader>
        <ShowServicesTools />
      </DialogContent>
    </Dialog>
  );
}

const TABS = [
  { id: "today", label: "Today", Icon: Sun, hint: "Today’s CGC shows, EOC documents, airwall notes and weekly view." },
  { id: "events", label: "Event Schedule", Icon: CalendarDays, hint: "Import event reports and create reviewed engineering schedules." },
  { id: "eventhub", label: "Events", Icon: FolderOpen, hint: "Show details, Pre/Post-Con notes, work orders, EOCs and diagrams." },
  { id: "shifts", label: "My shifts", Icon: CalendarClock, hint: "Pull your shifts from the monthly schedule and put them on your calendar." },
  { id: "vendors", label: "Vendors", Icon: Store, hint: "Compare prices and rentals across your usual suppliers." },
  { id: "floor", label: "Floor map", Icon: MapIcon, hint: "Color a floor plan from the work order: who ordered what power, where." },
] as const;
export type WorkTabId = (typeof TABS)[number]["id"];
type TabId = WorkTabId;
const TAB_KEY = "pixelpals:work-tab";
const startTab = (): TabId => {
  try {
    const q = new URLSearchParams(location.search).get("tab") ?? localStorage.getItem(TAB_KEY);
    if(q==="precon"||q==="postcon"||q==="deck")return "eventhub";
    return TABS.some((x) => x.id === q) ? (q as TabId) : "events";
  } catch { return "events"; }
};

export type OpenEventRequest={key:string;section:"documents"|"overview";revision:number};
export function ShowServicesTools({ page = false, selectedTab, hideTabBar = false, venueOnly = false, openEventRequest }: { page?: boolean; selectedTab?: WorkTabId; hideTabBar?: boolean; venueOnly?: boolean; openEventRequest?:OpenEventRequest|null } = {}) {
  const [tab, setTab] = useState<TabId>("events");
  // Keep each visited tab mounted. Radix normally unmounts inactive TabsContent,
  // which used to erase imported files, review edits, and unresolved booth work.
  // Unvisited tools remain lazy so opening Event Schedule does not load them all.
  const [visited, setVisited] = useState<TabId[]>(() => [selectedTab ?? "events"]);
  useEffect(() => { if (!selectedTab) setTab(startTab()); }, [selectedTab]); // after mount so server and browser render the same first frame
  const pick = (v: string) => { setTab(v as TabId); try { localStorage.setItem(TAB_KEY, v); } catch { /* private window */ } };
  const activeTab = selectedTab ?? tab;
  useEffect(() => {
    setVisited(previous => previous.includes(activeTab) ? previous : [...previous, activeTab]);
  }, [activeTab]);
  const cur = TABS.find((x) => x.id === activeTab) ?? TABS[0];
  return <Tabs value={activeTab} onValueChange={pick}>
          {!hideTabBar && <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            {TABS.map(({ id, label, Icon }) => (
              <TabsTrigger key={id} value={id} className="gap-1.5"><Icon className="size-4" aria-hidden />{label}</TabsTrigger>
            ))}
          </TabsList>}
          <div className="flex items-start justify-between gap-3 pt-2">
            <p className="text-sm text-muted-foreground">{cur.hint}</p>

          </div>
          {visited.includes("today") && <KeepAliveTabContent value="today"><ShowPilotTodayPanel active={activeTab==="today"}/></KeepAliveTabContent>}
          {visited.includes("events") && <KeepAliveTabContent value="events"><EventsTab venueOnly={venueOnly} /></KeepAliveTabContent>}
          {visited.includes("eventhub") && <KeepAliveTabContent value="eventhub"><ShowPilotEventsPanel active={activeTab==="eventhub"} openEventRequest={openEventRequest} stagePlanner={<DeckTab/>} floorMaps={(files,eventId)=><FloorMapPanel initialEventDocuments={files} selectedEventId={eventId}/>} /></KeepAliveTabContent>}
          {visited.includes("shifts") && <KeepAliveTabContent value="shifts"><ShiftsTab /></KeepAliveTabContent>}
          {visited.includes("vendors") && <KeepAliveTabContent value="vendors"><StandaloneVendors /></KeepAliveTabContent>}
          {visited.includes("floor") && <KeepAliveTabContent value="floor"><FloorMapPanel /></KeepAliveTabContent>}
        </Tabs>;
}

function FilePick({ accept, label, onFile, onFiles }: { accept: string; label: string; onFile?: (f: File) => void; onFiles?: (f: File[]) => void }) {
  const [over, setOver] = useState(false);
  const take = (list: File[]) => { if (onFiles && list.length) onFiles(list); else if (list[0]) onFile?.(list[0]); };
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take([...e.dataTransfer.files]); }}
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-center text-sm hover:bg-muted ${over ? "border-primary bg-muted text-foreground" : "border-border text-muted-foreground"}`}
    >
      <FileUp className="size-4 shrink-0" /> {label}
      <input type="file" accept={accept} multiple={!!onFiles} className="sr-only" onChange={(e) => { take([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </label>
  );
}

function EventsTab({ venueOnly = false }: { venueOnly?: boolean }) {
  const [entries, setEntries] = useState<EventEntry[]>([]);
  const [claudePolicy,setClaudePolicy]=useState<ClaudeStaffingSettings>(readClaudeSettings);
  const changeClaudePolicy=(value:ClaudeStaffingSettings)=>{
   setClaudePolicy(value);
   try{saveClaudeSettings(value)}catch{/* Readable in current session even when storage is blocked. */}
  };
  const [aiScope,setAiScope] = useState<ReviewDateScope|null>(null);
  const [status, setStatus] = useState("");
  const [exportBusy,setExportBusy] = useState(false);
  const [exportStatus,setExportStatus] = useState("");
  const [previewOpen,setPreviewOpen]=useState(false);
  const [previewBusy,setPreviewBusy]=useState(false);
  const [previewKind,setPreviewKind]=useState<"original"|"approved">("original");
  const [previewWorkbook,setPreviewWorkbook]=useState<PreviewWorkbook|null>(null);
  const [previewTitle,setPreviewTitle]=useState("");

  const [suggestedEntries, setSuggestedEntries] = useState<EventEntry[]>([]);
  const [suggestedTasks, setSuggestedTasks] = useState<TaskNote[]>([]);
  const [draft, setDraft] = useState<ReviewDraft>(emptyReviewDraft);
  const draftRef = useRef<ReviewDraft>(emptyReviewDraft());
  const fingerprintRef = useRef("");
  const [merged, setMerged] = useState(false);
  const [tasks, setTasks] = useState<TaskNote[]>([]);
  const selectedStaffingDates=aiScope?reviewScopeDates(entries,aiScope):[];
  const selectedStaffingKey=selectedStaffingDates.join("|");
  const staffingContext=useMemo(()=>staffingPlanningContext(entries,selectedStaffingDates),[entries,selectedStaffingKey]);
  const [shared, setShared] = useState<string[]>([]);
  const [conflictTarget,setConflictTarget] = useState<{date:string;space:string;title:string;nonce:number}|null>(null);
  const bookingConflicts = (() => {
    const byRoom = new Map<string, Map<string, EventEntry>>();
    for (const e of entries) for (const space of expandSpace(e.space)) {
      const key = e.date + "|" + space;
      const bookings = byRoom.get(key) ?? new Map<string, EventEntry>();
      const identity = e.eventId?.trim() ? "id:" + e.eventId : "title:" + e.title.trim().toLowerCase();
      if (!bookings.has(identity)) bookings.set(identity,e);
      byRoom.set(key,bookings);
    }
    return [...byRoom].filter(([,shows])=>shows.size>1).map(([key,shows])=>{
      const [date,space]=key.split("|");
      return {date,space,shows:[...shows.values()]};
    }).sort((a,b)=>a.date.localeCompare(b.date)||a.space.localeCompare(b.space));
  })();
  const [source, setSource] = useState<{ rows: EventRow[]; existing?: File; sources: number } | null>(null);
  const [withPending, setWithPending] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [venueReview, setVenueReview] = useState<string[]>([]);
  const [venueExcluded, setVenueExcluded] = useState(0);
  const [approvedSpaces, setApprovedSpaces] = useState<string[]>([]);
  const [report, setReport] = useState("");
  const [sessionReady,setSessionReady]=useState(!window.showpilotScheduleSession);
  const [autoSaveEnabled,setAutoSaveEnabled]=useState(false);
  const [autoSaveMessage,setAutoSaveMessage]=useState("");
  const [restoredScope,setRestoredScope]=useState<ReviewDateScope|null>(null);
  const saveSequence=useRef(0);
  const saveDraftForCurrent = (next: ReviewDraft) => {
    draftRef.current = next; setDraft(next);
    if (fingerprintRef.current) {
      try { localStorage.setItem(storageKey(fingerprintRef.current), JSON.stringify(next)); }
      catch { setStatus("Local storage is full or disabled. Save your review project to preserve changes."); }
    }
  };
  function draftFor(rows: EventRow[], override?: ReviewDraft): ReviewDraft {
    const fingerprint = fingerprintRows(rows);
    if (override) {
      fingerprintRef.current = fingerprint; saveDraftForCurrent(override); return override;
    }
    if (fingerprintRef.current === fingerprint) return draftRef.current;
    fingerprintRef.current = fingerprint;
    try {
      const text = localStorage.getItem(storageKey(fingerprint));
      const next = text ? parseDraft(text) : emptyReviewDraft();
      draftRef.current = next; setDraft(next); return next;
    } catch {
      const next = emptyReviewDraft();
      draftRef.current = next; setDraft(next); return next;
    }
  }
  function compileReview(proposals: EventEntry[],notes: TaskNote[],nextDraft: ReviewDraft,originalRows:EventRow[]=source?.rows??[]) {
    // Never prebuild a differently formatted workbook during editing.
    // The user-provided Excel template is read only for preview or download.
    const approved=applyReview(proposals,notes,nextDraft);
    const named=attachShowNames(approved.entries,originalRows);
    setEntries(named);
    setTasks(approved.tasks);
    setShared(sharedSpaces(named));
  }
  async function build(src: { rows: EventRow[]; existing?: File; sources: number }, includePending: boolean, approved: string[] = [], overrideDraft?: ReviewDraft) {
    const nextDraft = draftFor(src.rows, overrideDraft);
    const uncancelled = src.rows.filter((r) => !isCancelledRow(r));
    const scope = venueOnly ? scopeShowPilotRows(uncancelled, approved) : { accepted: uncancelled, excluded: [] as EventRow[], needsReview: [] as EventRow[] };
    const live = scope.accepted;
    setVenueExcluded(scope.excluded.length);
    setVenueReview([...new Set(scope.needsReview.map((r) => r.space || "(no space)"))].sort());
    setPending([...new Set(live.filter(isPendingRow).map((r) => (r.event || r.description) + " (" + r.status + ")"))].sort());
    const rows = includePending ? live : live.filter((r) => !isPendingRow(r));
    // The Event and Event ID columns name the actual show. A function
    // description may be a valid engineering schedule entry, but must not
    // become an individual Pre-Con or Post-Con dropdown choice.
    const showCatalog=await rememberPostConShowsFromReportRows(live).catch(error=>({
      shows:0,unnamedRows:0,storage:"none" as const,
      error:error instanceof Error?error.message:String(error)
    }));
    const proposals = summarizeEvents(rows, true);
    const dayList = [...new Set(live.map((r) => r.date))].sort();
    const statuses = new Map<string, number>();
    for (const r of src.rows) statuses.set(r.status ?? "(none)", (statuses.get(r.status ?? "(none)") ?? 0) + 1);
    setReport((old) => [old.split("\n--- counts ---")[0], "--- counts ---",
      "rows read: " + src.rows.length, "cancelled: " + (src.rows.length - uncancelled.length),
      "other-building rows excluded: " + scope.excluded.length,
      "unverified-space rows: " + scope.needsReview.length,
      "not-yet-definite: " + live.filter(isPendingRow).length + (includePending ? " (included)" : " (excluded)"),
      "rows used: " + rows.length, "entries suggested: " + proposals.length,
      "dates: " + (dayList[0] ?? "-") + " to " + (dayList.at(-1) ?? "-"),
      "statuses: " + ([...statuses].map(([k,v]) => k + "=" + v).join(", ") || "-")].join("\n"));
    const notes = [...airwallTasks(rows).map(t=>detailedAirwallTask(t,rows)), ...taskSuggestions(rows)].sort((a, b) => a.date.localeCompare(b.date));
    setSuggestedEntries(proposals);
    setSuggestedTasks(notes);
    setMerged(!!src.existing);
    setStatus(src.sources + " reports · " + proposals.length + " suggested entries. Review them before exporting."
      + (src.existing ? " Typed shifts and PTO in the existing workbook remain protected." : "")
      + ("error" in showCatalog ? " Show catalog was NOT saved: "+showCatalog.error+". Check Settings & AI local memory before updating ShowPilot." : "")
      + (showCatalog.shows===0 && !("error" in showCatalog) ? " No named shows were identified for Pre-Con/Post-Con. Re-export a report with Event and Event ID columns; function descriptions won't be listed as shows." : "")
      + (showCatalog.storage==="sqlite" ? " "+showCatalog.shows+" shows saved to persistent SQLite for future app updates." : "")
      + (showCatalog.storage==="browser" ? " Show list cached for this browser only; open the desktop app for durable saving." : ""));
    compileReview(proposals, notes, nextDraft, src.rows);
  }

  // Recover the source Ungerboeck rows and every reviewer choice on next
  // launch. Review-draft-only localStorage cannot restore an uploaded report.
  useEffect(()=>{
    const api=window.showpilotScheduleSession;
    if(!api)return;
    let live=true;
    void (async()=>{
      try{
        const snapshot=await api.load();
        if(!live)return;
        if(snapshot?.project){
          const p=parseReviewProject(JSON.stringify(snapshot.project));
          const existing=snapshot.templateBytes?
            new File([new Uint8Array(snapshot.templateBytes)],"restored-engineering-template.xlsx",
              {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}):undefined;
          const recovered={rows:p.originalRows,sources:1,...(existing?{existing}:{})};
          setRestoredScope(p.scope??null);
          setWithPending(p.includePending);setApprovedSpaces(p.approvedSpaces);
          setSource(recovered);
          await build(recovered,p.includePending,p.approvedSpaces,p.draft);
          if(live){
            setAutoSaveMessage("Restored previous Event Schedule from local autosave."+
              (snapshot.templateMissing?" Reattach your uploaded Excel template before exporting.":""));
            setAutoSaveEnabled(true);
          }
        }
      }catch(e){if(live)setAutoSaveMessage("Couldn't restore saved schedule: "+String(e)+
        ". The saved file was not deleted. You can reimport the original report.");}
      finally{if(live)setSessionReady(true);}
    })();
    return ()=>{live=false};
  },[]);

  useEffect(()=>{
    const api=window.showpilotScheduleSession;
    if(!api||!sessionReady||!autoSaveEnabled||!source)return;
    const seq=++saveSequence.current;
    const snapshot:ReviewProject={
      kind:"showpilot-review-project",version:1,originalRows:source.rows,
      draft,approvedSpaces,includePending:withPending,note:"Offline autosave",
      templateSaved:!!source.existing,...(aiScope?{scope:aiScope}:{})
    };
    setAutoSaveMessage("Saving Event Schedule locally…");
    void api.save(snapshot).then(result=>{
      if(saveSequence.current===seq)setAutoSaveMessage("Event Schedule saved locally · "+
        new Date(result.savedAt).toLocaleTimeString());
    }).catch(e=>{
      if(saveSequence.current===seq)setAutoSaveMessage("Autosave failed: "+String(e)+
        ". Download a review project before closing ShowPilot.");
    });
  },[source,draft,approvedSpaces,withPending,aiScope,sessionReady,autoSaveEnabled]);

  const currentExportLabel=aiScope?.view==="week"?"selected week":
    aiScope?.view==="month"?"selected month":aiScope?.view==="day"?"selected day":"full report";
  const fileSuffix=(scope:string)=>scope.replace(/[^a-zA-Z0-9_-]/g,"-");
  type ExportFormat="original"|"approved";
  const selectedTemplate:ExportFormat=(previewKind==="original"&&source?.existing)?"original":(window.showpilotLocal?"approved":"original");
  // Preview and Download share exactly the same generator.
  async function makeSelectedWorkbook(kind:ExportFormat):Promise<{blob:Blob;period:string;week:boolean}>{
    if(!aiScope)throw new Error("Choose a Month, Week or Day in Edit Schedule first.");
    const chosen=scopedScheduleData(entries,tasks,aiScope);
    const lib=await import("@/lib/work-files");
    let original:File|undefined;
    if(kind==="original"){
      original=source?.existing;
      if(!original)throw new Error("Upload your original engineering schedule XLSX alongside the event report to use its formatting.");
    }else if(kind==="approved"){
      const bytes=await window.showpilotLocal?.readTemplate();
      if(!bytes)throw new Error("Choose an approved master Excel template in Settings & AI first.");
      original=new File([new Uint8Array(bytes)],"approved-schedule-template.xlsx");
      await lib.validateApprovedTemplate(original,chosen.entries,{retargetWeek:!!chosen.singleWeek});
    }
    const blob=await lib.eventsWorkbook(chosen.entries,original,chosen.tasks,
      chosen.singleWeek?{singleWeek:chosen.singleWeek,preserveTemplateLayout:true,retargetTemplateWeek:kind==="approved",planning:claudePolicy}:
        {preserveTemplateLayout:true,planning:claudePolicy});
    return {blob,period:chosen.period,week:!!chosen.singleWeek};
  }
  async function exportSelected(kind:ExportFormat){
    if(exportBusy)return;
    setExportBusy(true);setExportStatus("");
    try{
      const out=await makeSelectedWorkbook(kind);
      const lib=await import("@/lib/work-files");
      lib.downloadBlob(out.blob,"ShowPilot-"+fileSuffix(out.period)+"-original-template.xlsx");
      let memoryMessage="";
      if(window.showpilotMemory&&aiScope){
        try{
          const memory=window.showpilotMemory;
          if((await memory.status()).rememberExports){
            const chosen=scopedScheduleData(entries,tasks,aiScope);
            const result=await memory.rememberSchedule({entries:chosen.entries,tasks:chosen.tasks});
            if(result.saved)memoryMessage=" Reviewed event history added to local memory.";
          }
        }catch(e){memoryMessage=" Local memory could not be updated: "+(e as Error).message;}
      }
      setExportStatus("Exported "+currentExportLabel+" using the unchanged source workbook structure."+
        (out.week?" Exactly one visible worksheet.":"")+memoryMessage);
    }catch(e){setExportStatus("Export not generated: "+(e as Error).message);}
    finally{setExportBusy(false)}
  }
  async function exportFreshWeek(){
    if(exportBusy||!aiScope)return;
    setExportBusy(true);setExportStatus("");
    try{
      const chosen=scopedScheduleData(entries,tasks,aiScope);
      if(!chosen.singleWeek)throw new Error("Choose Week view first.");
      const lib=await import("@/lib/work-files");
      const blob=await lib.eventsWorkbook(chosen.entries,undefined,chosen.tasks,{singleWeek:chosen.singleWeek,planning:claudePolicy});
      lib.downloadBlob(blob,"ShowPilot-week-"+chosen.singleWeek+"-fresh-layout.xlsx");
      setExportStatus("Selected week downloaded in the ShowPilot-generated layout. Your original master and reviewed events were not changed.");
    }catch(e){setExportStatus("Fresh week not downloaded: "+(e as Error).message);}
    finally{setExportBusy(false);}
  }
  async function openExcelPreview(){
    if(previewBusy)return;
    setPreviewBusy(true);setExportStatus("");
    try{
      const out=await makeSelectedWorkbook(selectedTemplate);
      const lib=await import("@/lib/showpilot-excel-preview");
      const book=await lib.readWorkbookPreview(out.blob);
      setPreviewWorkbook(book);
      setPreviewTitle(currentExportLabel+" · original engineering workbook");
      setPreviewOpen(true);
    }catch(e){setExportStatus("Could not preview Excel: "+(e as Error).message);}
    finally{setPreviewBusy(false)}
  }
  function reviewChanged(next: ReviewDraft) {
    saveDraftForCurrent(next);
    compileReview(suggestedEntries, suggestedTasks, next);
  }
  function saveProject() {
    if (!source) return;
    const p: ReviewProject = { kind:"showpilot-review-project", version:1, originalRows:source.rows,
      draft:draftRef.current, approvedSpaces, includePending:withPending,
      note:source.existing ? "Original Excel staffing template must be uploaded separately when resuming." : "" };
    const url = URL.createObjectURL(new Blob([JSON.stringify(p)], {type:"application/json"}));
    const a = document.createElement("a");
    a.href=url; a.download="showpilot-review-"+(source.rows[0]?.date ?? "schedule")+".json";a.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function loadProject(f:File) {
    setAutoSaveEnabled(false);setRestoredScope(null);setAiScope(null);
    setStatus("Opening saved review project…");
    try {
      if (f.size > 16_000_000) throw new Error("Project exceeds 16 MB.");
      const p = parseReviewProject(await f.text());
      const nextSource={rows:p.originalRows,sources:1};
      setSource(nextSource);setWithPending(p.includePending);setApprovedSpaces(p.approvedSpaces);
      await build(nextSource,p.includePending,p.approvedSpaces,p.draft);
      setAutoSaveEnabled(true);
      setStatus("Review project loaded. Original report and manual decisions restored. Reattach the original monthly Excel template if you need to preserve its existing shifts/PTO.");
    }catch(e){setStatus("Could not open ShowPilot project: "+(e as Error).message);}
  }
  async function load(files: File[]) {
    setAutoSaveEnabled(false);setRestoredScope(null);setAiScope(null);
    setStatus("Reading…");  setSource(null); setSuggestedEntries([]);
    setApprovedSpaces([]); setVenueReview([]); setVenueExcluded(0);
    const head = [`ShowPilot Events report · ${new Date().toISOString()}`, `build: ${__APP_VERSION__} ${__APP_COMMIT__} ${__APP_BUILD_DATE__}`];
    setReport(head.join("\n"));
    try {
      const { describeSheet } = await import("@/lib/work-files");
      const described = await Promise.all(files.filter((f) => /\.xlsx?$/i.test(f.name)).map(describeSheet));
      const names = `dropped: ${files.map((f) => `${f.name} (${f.size} B)`).join("; ") || "nothing"}`;
      setReport([...head, names, ...described].join("\n"));
    } catch { /* describing is best-effort */ }
    try {
      const { readEventPdf, readEventSheet } = await import("@/lib/work-files");
      const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
      // XLSX may be a ShowPilot Event Schedule report, older For Scheduling report, or monthly staffing template.
      const sheets = files.filter((f) => /\.xlsx?$/i.test(f.name));
      const reports: EventRow[][] = [];
      let existing: File | undefined;
      for (const f of sheets) {
        const r = await readEventSheet(f);
        if (r) reports.push(r); else existing = f;
        setReport((old) => `${old}\nreadEventSheet(${f.name}): ${r ? `${r.length} rows` : "null → treated as a monthly schedule to fill in, not a recognized event report"}`);
      }
      const rows = [...(await Promise.all(pdfs.map(readEventPdf))).flat(), ...reports.flat()];
      const src = { rows, sources: pdfs.length + reports.length, ...(existing ? { existing } : {}) };
      // Cache the originally uploaded Excel workbook in the same private
      // Windows user-data folder as this review. Never place uploads in GitHub.
      if(existing&&window.showpilotScheduleSession)
        await window.showpilotScheduleSession.saveTemplate(await existing.arrayBuffer());
      setSource(src);
      if (!rows.length) {
        setStatus("No event functions found. Export ShowPilot - Event Schedule as PDF or Excel from Ungerboeck. A staffing template alone does not contain event functions.");
        setSource(null);
        return;
      }
      await build(src, withPending, []);
      setAutoSaveEnabled(true);
    } catch (e) {
      setReport((old) => `${old}\nERROR: ${(e as Error).stack ?? (e as Error).message}`);
      setStatus(`Could not read that file: ${(e as Error).message}`);
    }
  }
  const { deliver } = useDeliver();
  return (
    <div className="space-y-3 pt-2">
      {sessionReady?<FilePick accept="application/pdf,.xlsx" label="1. Import ShowPilot - Event Schedule (PDF or Excel) — optionally include your monthly engineering template" onFiles={load} />
        :<p role="status" className="text-xs text-muted-foreground">Restoring your previous Event Schedule…</p>}
      {sessionReady&&<FilePick accept=".json,application/json" label="Or resume a saved ShowPilot review project (.json)" onFile={(f) => { void loadProject(f); }} />}
      {autoSaveMessage&&<p className={"text-xs "+(autoSaveMessage.includes("failed")?"text-destructive":"text-muted-foreground")} role="status">{autoSaveMessage}</p>}
      <p className="text-xs text-muted-foreground">S = show · Exmi = exhibitor move in / service desk · MI = move in · MO = move out · Food = meal or reception after the show · MTG = meeting · MO? = no move-out line in the report; guessed as 3 hours after the show ends, so check it. Combined halls split into each hall. Escalators = 1 hr before first show to 1 hr after.</p>
      {status && <p className={`text-sm ${/^Could not|^No /.test(status) ? "text-destructive" : ""}`} role="status">{status}</p>}
      {report && /^Could not|^No /.test(status) && (
        <div className="space-y-1 rounded-md border border-border p-2 text-xs">
          <div className="flex items-center justify-between gap-2"><span className="font-medium">Details to send me</span><Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(report).catch(() => undefined); }}>Copy details</Button></div>
          <textarea readOnly value={report} rows={8} className="w-full rounded border border-border bg-background p-1 font-mono" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      {venueOnly && (venueExcluded > 0 || venueReview.length > 0) && <details className="rounded border border-amber-500 p-3 text-xs">
        <summary className="cursor-pointer font-semibold">Venue review: {venueExcluded} other-building row(s) excluded; {venueReview.length} unverified space name(s)</summary>
        <p className="mt-2">CEPAC rows are excluded. Unknown spaces are withheld from scheduling unless you confirm they belong to Cobb Convention Center-Atlanta for this import.</p>
        <div className="mt-2 space-y-2">{venueReview.map((space) => <label key={space} className="flex items-center gap-2">
          <input type="checkbox" checked={approvedSpaces.includes(space)} onChange={(e) => {
            const next = e.target.checked ? [...approvedSpaces,space] : approvedSpaces.filter((s) => s !== space);
            setApprovedSpaces(next);
            if (source) void build(source, withPending, next).catch((err) => setStatus(`Could not update venue selections: ${(err as Error).message}`));
          }}/>
          <span>Confirm <strong>{space}</strong> is a convention center location</span>
        </label>)}</div>
      </details>}
      {pending.length > 0 && (
        <label className="flex items-start gap-2 rounded-md border border-amber-500 p-2 text-xs">
          <input type="checkbox" className="mt-0.5" checked={withPending} onChange={(e) => { setWithPending(e.target.checked); if (source) build(source, e.target.checked, approvedSpaces).catch((err) => setStatus(`Could not read that PDF: ${(err as Error).message}`)); }} />
          <span><span className="font-medium">Include {pending.length} not-yet-definite events</span> (left out unless checked): {pending.slice(0, 8).join("; ")}{pending.length > 8 ? ` +${pending.length - 8} more` : ""}</span>
        </label>
      )}
      {suggestedEntries.length === 0 && !status && <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground"><li>Upload a ShowPilot - Event Schedule PDF or Excel export.</li><li>Optional: drop your monthly schedule .xlsx in the same box to fill it in (engineer shifts are kept).</li><li>Download the Excel file.</li></ol>}
      {source && (
        <>
          {bookingConflicts.length > 0 && <section role="alert" className="rounded-lg border border-amber-500 bg-amber-500/10 p-3 text-sm">
            <strong>Possible double-bookings: {bookingConflicts.length} room/day conflicts</strong>
            <p className="mt-1 text-xs">Two distinct shows use the same physical room on the same date. Select a show to jump to its review entry; times may not overlap.</p>
            <div className="mt-2 grid gap-2">{bookingConflicts.map(c=><div key={c.date+"|"+c.space} className="flex flex-wrap items-center gap-2">
              <strong>{c.date} · {c.space}:</strong>
              {c.shows.map((e,i)=><button type="button" key={i} className="rounded border border-amber-500 px-2 py-1 text-xs underline" onClick={()=>setConflictTarget({date:e.date,space:e.space,title:e.title,nonce:Date.now()})}>{e.title}</button>)}
            </div>)}</div>
          </section>}
          <ScheduleReview key={fingerprintRows(source.rows)} initialScope={restoredScope} conflictTarget={conflictTarget} onScopeChange={setAiScope} originalRows={source.rows} proposed={suggestedEntries} suggestedTasks={suggestedTasks} draft={draft} onChange={reviewChanged} onSaveProject={saveProject} />
          <ShowPilotRuleReview evidence={eventScheduleRuleEvidence(entries,tasks,status)}/>
          <AiTaskAssistant scope={aiScope} entries={entries} tasks={tasks} onApprove={task => reviewChanged({...draftRef.current,addedTasks:[...draftRef.current.addedTasks,{id:"ai-task:"+Date.now()+":"+Math.random().toString(36).slice(2),value:task}]})} />
          {selectedStaffingDates.length>0&&<LocalPlanningAssistant kind="staffing"
            memoryQuery={entries.filter(e=>selectedStaffingDates.includes(e.date)).slice(0,12).map(e=>e.title+" "+e.space).join(" ").slice(0,150)}
            context={staffingContext}
          />}
          {selectedStaffingDates.length>7&&<p className="text-xs text-muted-foreground">Local staffing analysis covers the first seven selected dates. Choose Week view for another week. These are review-only; they never change the original Excel schedule.</p>}
          <details className="text-xs"><summary className="cursor-pointer font-medium">Preview final Excel entries ({entries.length})</summary>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left"><tr><th className="p-2">Day</th><th className="p-2">Space</th><th className="p-2">Entry</th></tr></thead>
              <tbody>{entries.map((e, i) => (
                <tr key={i} className="border-t border-border"><td className="p-2">{dayLabel(e.date)}</td><td className="p-2">{e.space}</td><td className="p-2 font-mono">{entryLabel(e)} <span className="text-muted-foreground">{e.title}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
          </details>
          {shared.length > 0 && (
            <details className="rounded-md border border-amber-500 p-2 text-xs">
              <summary className="cursor-pointer font-medium">{shared.length} rooms are shared by more than one event</summary>
              <ul className="mt-1 space-y-0.5">{shared.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </details>
          )}
          {tasks.length > 0 && (
            <details className="rounded-md border border-border p-2 text-xs">
              <summary className="cursor-pointer font-medium">{tasks.length} task suggestions (air walls, stage builds, room turns)</summary>
              <ul className="mt-1 space-y-0.5">{tasks.map((t, i) => <li key={i}><span className="text-muted-foreground">{dayLabel(t.date)}:</span> {t.text}</li>)}</ul>
            </details>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {entries.length>0 && <label className="flex items-center gap-2 text-sm">Original template
              <select value={selectedTemplate} onChange={e=>setPreviewKind(e.target.value as "original"|"approved")}
                className="rounded border bg-background px-2 py-1.5" aria-label="Choose the exact engineering template">
                {source?.existing && <option value="original">Uploaded Excel workbook</option>}
                {window.showpilotLocal && <option value="approved">Saved master workbook (Settings &amp; AI)</option>}
              </select>
            </label>}
            {entries.length>0 && <Button size="sm" variant="outline" disabled={!aiScope||previewBusy}
              onClick={()=>void openExcelPreview()}><Eye className="size-4"/> {previewBusy?"Building preview…":"Preview original Excel"}</Button>}
            {entries.length>0 && <Button size="sm" disabled={!aiScope||exportBusy}
              onClick={()=>void exportSelected(selectedTemplate)}><Download className="size-4"/>
              {exportBusy?"Exporting…":"Download "+currentExportLabel+" (original layout)"}</Button>}
            {entries.length>0&&aiScope?.view==="week"&&<Button size="sm" variant="outline" disabled={exportBusy}
              onClick={()=>void exportFreshWeek()}><Download className="size-4"/> Download week (fresh layout)</Button>}
            {entries.length>0&&aiScope?.view==="week"&&<Button size="sm" variant="outline" disabled={exportBusy}
              title="Use your saved approved blank/master workbook and preserve its formulas, colors and staff rows"
              onClick={()=>void exportSelected("approved")}><Download className="size-4"/> Download week (saved master template)</Button>}
            {exportStatus&&<p role="status" className="w-full text-xs text-muted-foreground">{exportStatus}</p>}
          </div>
          <ClaudeStaffingSettingsPanel value={claudePolicy} onChange={changeClaudePolicy}/>
          <ShowPilotExcelPreview open={previewOpen} onOpenChange={setPreviewOpen} book={previewWorkbook} title={previewTitle}/>
          <ShowPilotRuleReview evidence={exportRuleEvidence("reviewed workbook",entries.length,new Set(entries.map(e=>e.date)).size,exportStatus)}/>
          <p className="text-xs text-muted-foreground">ShowPilot uses the original Excel template as its layout authority. It will not create a new room section or reformat staffing, dates, colors or borders. Upload your master XLSX alongside the event report, or select it under Settings &amp; AI. Other spaces must be reviewed before export.</p>
          {merged && <p className="text-xs text-amber-700 dark:text-amber-300">Your uploaded workbook remains the layout authority; existing shifts, PTO, notes and other untouched cells are retained. Review historical event cells before publishing. No alternate layout is generated.</p>}
        </>
      )}
    </div>
  );
}

function useDeliver() {
  return { deliver: (blob: Blob, name: string) => import("@/lib/work-files").then((m) => m.downloadBlob(blob, name)) };
}

/** Standalone .ics handoff: never call Pixel Pals' server-only Google routes. */
function AddAllToCalendar({ shifts, onStatus, onDownload }: {
  shifts: Shift[]; onStatus: (s: string) => void; onDownload: () => void;
}) {
  return <Button size="sm" variant="secondary" disabled={!shifts.length} onClick={() => {
    onDownload();
    window.open("https://calendar.google.com/calendar/u/0/r/settings/import", "_blank", "noopener");
    onStatus("Downloaded my-shifts.ics. In Google Calendar, open Settings → Import & export → Import and select the file. Manual re-imports may duplicate shifts; direct sync is coming later.");
  }}><CalendarPlus className="size-4"/> Download .ics for Google Calendar</Button>;
}

/** One action adds or updates every shift managed by ShowPilot in the connected Google Calendar. */
function UpdateInGoogle({ shifts, title, onStatus }: {
  shifts: Shift[]; title: string; onStatus: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!window.showpilotCalendar) {
      onStatus("Update in Google needs the portable Windows ShowPilot app. Use Download all (.ics) in the browser version.");
      return;
    }
    if (busy || !shifts.length) return;
    setBusy(true);
    try {
      const bridge = window.showpilotCalendar;
      const state = await bridge.status();
      if (!state.available) throw new Error("Secure Windows credential storage is unavailable. Use .ics export.");
      if (!state.configured) {
        onStatus("One-time Google setup required: open Settings & AI → Google Calendar and import a Google Desktop OAuth JSON file.");
        return;
      }
      if (!window.confirm("Update all " + shifts.length + " shifts in Google Calendar? ShowPilot will create missing shifts and update matching ShowPilot events. It will NOT delete any events.")) return;
      if (!state.connected) {
        onStatus("Opening Google sign-in in your browser. Complete approval, then return to ShowPilot.");
        await bridge.connect();
      }
      onStatus("Updating " + shifts.length + " shift(s) in Google Calendar…");
      const response = await bridge.updateAll({ title, shifts: withShiftIds(shifts) });
      onStatus(response.message + (response.errors.length ? " Problems: " + response.errors.join(" · ") : ""));
    } catch (e) {
      onStatus("Could not update Google Calendar: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <Button size="sm" disabled={!shifts.length || busy} onClick={() => void run()}>
    <CalendarSync className="size-4" /> {busy ? "Updating Google…" : "Update in Google"}
  </Button>;
}

function ShiftsTab() {
  const [name, setNameRaw] = useState(DEFAULT_SCHEDULE_NAME);
  useEffect(() => { try { const n = localStorage.getItem("pixelpals:work-name"); if (n) setNameRaw(n); } catch { /* ignore */ } }, []);
  const setName = (n: string) => { setNameRaw(n); try { localStorage.setItem("pixelpals:work-name", n); } catch { /* ignore */ } };
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [status, setStatus] = useState("");
  const [unreadable,setUnreadable]=useState<{sheet:string;date:string;raw:string}[]>([]);
  const [detectedNames,setDetectedNames]=useState<string[]>([]);
  const [shiftWarnings,setShiftWarnings]=useState<string[]>([]);
  const [weekOverrides,setWeekOverrides]=useState<Record<string,string>>({});
  const sheetDateWarnings=[...new Set(shiftWarnings.map(w=>/^Week #\d+/.exec(w)?.[0]).filter((x):x is string=>!!x))];
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("Mark Work");
  const [removed, setRemoved] = useState<string[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const edit = (i: number, change: Parameters<typeof editShift>[1]) => setShifts((list) => list.map((x, n) => (n === i ? {...editShift(x, change),reviewed:false} : x)));
  const usableShifts=shifts.filter(s=>!shiftNeedsReview(s));
  const pendingShifts=shifts.filter(shiftNeedsReview);
  const drop = (i: number) => {
    const gone = shifts[i];
    if (gone?.id) setRemoved((r) => [...new Set([...r, gone.id!])]);
    setShifts((list) => list.filter((_, n) => n !== i));
    setEditing(null);
  };
  const add = () => {
    const last = shifts[shifts.length - 1];
    const date = last ? new Date(Date.parse(`${last.date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    setShifts((list) => [...list, { date, start: 9 * 60, end: 17 * 60, raw: "9a-5p", id: newShiftId() }]);
    setEditing(shifts.length);
  };
  async function load(f: File, who = name) {
    setFile(f); setStatus("Reading…");
    try {
      const isPdf=/\.pdf$/i.test(f.name)||f.type==="application/pdf";
      const {shifts,people,unreadable,warnings}=isPdf
       ? await (await import("@/lib/showpilot-shift-pdf")).readWeeklyShiftPdf(f,who)
       : await (await import("@/lib/work-files")).readScheduleWorkbook(f,who,weekOverrides,readClaudeSettings().aliasesByName[who]??[]);
      setShifts(withShiftIds(shifts));setUnreadable(unreadable);setShiftWarnings(warnings);
      setDetectedNames(people);
      setRemoved([]);setEditing(null);
      setStatus(shifts.length ? `${shifts.length} shifts for ${who}.` : `No shifts found for “${who}”. Names on sheet: ${people.slice(0,12).join(", ")}`);
    } catch (e) { setStatus(`Could not read that schedule: ${(e as Error).message}`); }
  }
  const ics = () => import("@/lib/work-files").then((m) => m.downloadBlob(new Blob([buildIcs(usableShifts, title.trim() || "Mark Work")], { type: "text/calendar" }), "my-shifts.ics"));
  const [pasted, setPasted] = useState("");
  const [weekStart, setWeekStart] = useState(nextMondayIso);
  function readPasted() {
    const result=parsePastedShiftsWithReview(pasted,weekStart,name);
    const list=result.shifts;
    setUnreadable(result.unreadable.map(x=>({...x,sheet:"Pasted schedule"})));
    setShiftWarnings([]);
    setShifts(withShiftIds(list));setRemoved([]);setEditing(null);
    setStatus(list.length ? `${list.length} shifts for ${name}.` : `No shifts found — make sure the first line starts with “${name}” and the times look like 9a-6p.`);
  }
  return (
    <div className="space-y-3 pt-2">
      <label className="grid gap-1 text-xs text-muted-foreground">Your name exactly as it appears on the schedule (remembered)</label>
      <div className="flex gap-2">
        <Input list="showpilot-detected-shift-names" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name on schedule" />
        <datalist id="showpilot-detected-shift-names">{detectedNames.map(person=><option key={person} value={person}/>)}</datalist>
        {file && <Button variant="outline" onClick={() => load(file)}>Re-read</Button>}
      </div>
      <FilePick accept=".xlsx,.xls,.pdf" label="Drop monthly Excel or weekly text-layer PDF schedule" onFile={(f) => load(f)} />
      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">…or paste your rows from Excel</summary>
        <div className="mt-2 space-y-2">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={3}
            aria-label="Pasted schedule rows"
            placeholder={"Paste the week block from Excel — include the date row (10/19/26 … 10/25/26) and your name row."}
            className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="week-start">Week starting (Mon)</label>
            <Input id="week-start" type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="w-auto" />
            <Button size="sm" onClick={readPasted} disabled={!pasted.trim()}>Read</Button>
          </div>
        </div>
      </details>
      {status && <p className={`text-sm ${/^Could not|^No shifts/.test(status) ? "text-destructive" : ""}`} role="status">{status}</p>}
      {file&&!/\.pdf$/i.test(file.name)&&sheetDateWarnings.length>0&&
       <details className="rounded border border-amber-500 p-2 text-xs">
        <summary className="cursor-pointer font-medium">Correct a worksheet week start (operator override)</summary>
        <p className="my-2">If the Excel date formulas are stale, enter the true Monday for the affected sheet. This changes only the imported shift dates, never the original workbook. Check your calendars before syncing.</p>
        {sheetDateWarnings.map(sheet=><label key={sheet} className="mb-2 flex items-center gap-2">{sheet}
         <Input type="date" className="w-auto" value={weekOverrides[sheet]??""}
          onChange={e=>setWeekOverrides(prev=>({...prev,[sheet]:e.target.value}))}/>
        </label>)}
        <Button size="sm" variant="outline" onClick={()=>void load(file)}>Re-read with corrections</Button>
       </details>}
      {shiftWarnings.length>0&&<div role="alert" className="rounded border border-amber-500 p-2 text-xs"><strong>Date-row warnings:</strong>{shiftWarnings.map((w,i)=><p key={i}>{w}</p>)}</div>}
      {unreadable.length>0&&<div role="alert" className="rounded border border-amber-500 p-2 text-xs">
       <strong>{unreadable.length} unreadable shift cell(s) — review and add manually:</strong>
       {unreadable.slice(0,30).map((u,i)=><p key={i}>{u.sheet} · {u.date} · {u.raw}</p>)}
      </div>}
      {pendingShifts.length>0&&<p role="alert" className="rounded border border-amber-500 p-2 text-xs">
       {pendingShifts.length} shift(s) are outside the 2–14 hour review range. They are excluded from calendar export/sync until you explicitly confirm their time below. Check AM/PM first.
      </p>}
      {shifts.length>0&&<ShowPilotRuleReview evidence={shiftRuleEvidence(shifts,removed.length)}/>}
      {shifts.length>0&&<ShowPilotRuleReview evidence={calendarRuleEvidence(shifts,title,"google")}/>}
      {shifts.length>0&&<ShowPilotRuleReview evidence={calendarRuleEvidence(shifts,title,"ics")}/>}
      {(shifts.length > 0 || removed.length > 0) && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="shift-title">Event title</label>
            <Input id="shift-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="w-48" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={ics} disabled={!usableShifts.length}><Download className="size-4" /> Download all (.ics)</Button>
            <UpdateInGoogle shifts={usableShifts} title={title.trim() || "Mark Work"} onStatus={setStatus} />
            <AddAllToCalendar onDownload={() => void ics()} shifts={usableShifts} onStatus={setStatus} />
            <Button size="sm" variant="outline" onClick={add}>Add a shift</Button>
          </div>
          {removed.length > 0 && <p className="text-xs text-muted-foreground">{removed.length} removed shift{removed.length === 1 ? "" : "s"} will be omitted from the next .ics export; already imported Google Calendar events are not deleted automatically by either Google sync or .ics export.</p>}
          <p className="text-xs text-muted-foreground">Press Edit on a shift to change its date, times or note. After editing, use Update in Google to update all ShowPilot-managed calendar events at once. Manually imported .ics events may create duplicates.</p>
          <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {shifts.map((s, i) => (
              <li key={s.id ?? `${s.date}-${i}`} className="rounded border border-border px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span>{dayLabel(s.date)} · <span className="font-mono">{shiftLabel(s)}</span>{s.note ? <span className="text-muted-foreground"> · {s.note}</span> : null}{shiftNeedsReview(s)?<span className="ml-2 text-amber-600">Check this shift</span>:null}</span>
                  <span className="flex items-center gap-2">
                    <button type="button" className="text-primary underline" aria-expanded={editing === i} onClick={() => setEditing(editing === i ? null : i)}>{editing === i ? "Done" : "Edit"}</button>
                    {!shiftNeedsReview(s)&&<a href={googleCalendarLink(s, title.trim() || "Mark Work")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline"><CalendarPlus className="size-4" /> Google</a>}
                    {shiftNeedsReview(s)&&<button type="button" className="text-primary underline" onClick={()=>setShifts(list=>list.map((item,n)=>n===i?{...item,reviewed:true}:item))}>Confirm time</button>}
                  </span>
                </div>
                {editing === i && (
                  <div className="mt-2 grid gap-2 border-t border-border pt-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs text-muted-foreground">Date
                      <Input type="date" value={s.date} onChange={(e) => { if (isIsoDate(e.target.value)) edit(i, { date: e.target.value }); }} />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1 text-xs text-muted-foreground">Start
                        <Input type="time" value={minutesToTime(s.start)} onChange={(e) => { const m = timeToMinutes(e.target.value); if (m !== null) edit(i, { start: m }); }} />
                      </label>
                      <label className="grid gap-1 text-xs text-muted-foreground">End
                        <Input type="time" value={minutesToTime(s.end)} onChange={(e) => { const m = timeToMinutes(e.target.value); if (m !== null) edit(i, { end: m }); }} />
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">Note (added to the event description)
                      <Input value={s.note ?? ""} maxLength={300} onChange={(e) => edit(i, { note: e.target.value })} placeholder="e.g. Hall B load-in" />
                    </label>
                    <div className="sm:col-span-2"><Button size="sm" variant="ghost" className="text-destructive" onClick={() => drop(i)}>Remove this shift</Button></div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const DeckPlanner = lazy(() => import("@/components/deck-planner/planner").then((m) => ({ default: m.DeckPlanner })));

function DeckTab() {
  return (
    <div className="pt-2">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the stage planner…</p>}>
        <DeckPlanner />
      </Suspense>
      <p className="mt-3 text-xs text-muted-foreground">Use the planner above to design, review, and save your deck layouts locally.</p>
    </div>
  );
}

