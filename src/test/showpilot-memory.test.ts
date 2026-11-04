import {describe,it,expect,afterEach} from "vitest";
import {readFileSync,mkdtempSync,existsSync,rmSync,mkdirSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {fileURLToPath} from "node:url";
import {stageMemoryDraft,approvedTaskMemoryDraft} from "@/lib/showpilot-memory-notes";
import {safeMemoryReferences} from "@/lib/showpilot-ai-tasks";

const nativeRequire=createRequire(import.meta.url);
const code=readFileSync(fileURLToPath(new URL("../../desktop/showpilot-memory.cjs",import.meta.url)),"utf8");
const dirs:string[]=[];
type NativeMemory=Record<string,(...args:any[])=>Promise<any>>;
function memory(existingDir?:string) {
 const dir=existingDir??mkdtempSync(path.join(tmpdir(),"showpilot-native-memory-test-"));
 if(!existingDir)dirs.push(dir);
 const module={exports:{} as NativeMemory};
 const electron={
  app:{getPath:(type:string)=>type==="userData"?dir:path.join(dir,type)},
  dialog:{showOpenDialog:async()=>({canceled:true,filePaths:[]}),showSaveDialog:async()=>({canceled:true})},
  ipcMain:{handle:()=>{}},
  shell:{openPath:async()=>""},
 };
 runInNewContext(code,{
  module,exports:module.exports,
  require:(id:string)=>id==="electron"?electron:nativeRequire(id),
  Buffer,Date,
 },{filename:"desktop/showpilot-memory.cjs"});
 return {api:module.exports,dir};
}
afterEach(()=>{while(dirs.length){const dir=dirs.pop();if(dir)rmSync(dir,{recursive:true,force:true})}});

describe("native SQLite ShowPilot memory",()=>{
 it("creates a private offline SQLite database automatically, with conservative export remembering",async()=>{
  const {api,dir}=memory();
  const state=await api.status();
  expect(state.configured).toBe(true);
  expect(state.storage).toBe("sqlite");
  expect(state.rememberTasks).toBe(true);
  expect(state.rememberStages).toBe(true);
  expect(state.rememberExports).toBe(false);
  const dbPath=path.join(dir,"showpilot-memory.sqlite");
  expect(existsSync(dbPath)).toBe(true);
  expect(readFileSync(dbPath).subarray(0,15).toString("utf8")).toBe("SQLite format 3");
 });
 it("saves, retrieves, searches, edits, archives and persists across launches",async()=>{
  const {api,dir}=memory();
  const note=await api.save({category:"Stage Setups",title:"Ballroom ABCD Stage",content:"Two platforms with bridges and holders."});
  expect((await api.list("Ballroom"))[0].id).toBe(note.id);
  expect((await api.search("ABCD stage"))[0].id).toBe(note.id);
  await api.edit(note.id,"Updated bridges and holders");
  expect((await api.read(note.id)).content).toContain("Updated bridges");
  const again=memory(dir);
  expect((await again.api.read(note.id)).content).toContain("Updated bridges");
  await api.archive(note.id);
  expect(await api.list("")).toHaveLength(0);
  expect((await api.exportPack()).notes).toHaveLength(0);
 });
 it("migrates legacy Markdown only once, preserving original files and preferences",async()=>{
  const {api,dir}=memory();
  const legacy=path.join(dir,"ShowPilot Memory","ShowPilot","Stage Setups");
  mkdirSync(legacy,{recursive:true});
  const markdown=path.join(legacy,"ballroom-setup.md");
  writeFileSync(markdown,"# Ballroom setup\n\nUse 4x8 decks; verify bridges.","utf8");
  writeFileSync(path.join(dir,"showpilot-memory-config.json"),JSON.stringify({vault:path.join(dir,"ShowPilot Memory"),rememberTasks:false,rememberStages:true}));
  const status=await api.status();
  expect(status.migratedCount).toBe(1);
  expect(status.noteCount).toBe(1);
  expect(status.rememberTasks).toBe(false);
  expect((await api.list("ballroom"))[0].title).toBe("Ballroom setup");
  expect(readFileSync(markdown,"utf8")).toContain("verify bridges");
  expect((await memory(dir).api.status()).noteCount).toBe(1);
 });
 it("imports JSON v1 notes and CGC history, deduplicates and exports a portable backup",async()=>{
  const {api}=memory();
  const pack={
   format:"showpilot-memory",version:1,
   notes:[{id:"2025-week-01",category:"Recurring Events",title:"JTF convention 2025",content:"Hall A stage work; source historical."}],
   historicalEntries:[{kind:"CGC-room-or-task",date:"2025-01-11",room:"Hall A",area:"halls",
     text:"JTF 2025 move-in",original_source:"original 2025 schedule",week:"2025-01-06",approval:"archived-unverified"}]
  };
  const first=await api.importPack(pack);
  expect(first.notesAdded).toBe(1);
  expect(first.historyAdded).toBe(1);
  const second=await api.importPack(pack);
  expect(second.notesAdded).toBe(0);
  expect(second.historyAdded).toBe(0);
  expect((await api.status()).historicalCount).toBe(1);
  expect((await api.search("JTF"))).toHaveLength(2);
  const exportData=await api.exportPack();
  expect(exportData.format).toBe("showpilot-memory");
  expect(exportData.version).toBe(1);
  expect(exportData.notes[0].title).toBe("JTF convention 2025");
  expect(exportData.historicalEntries[0].text).toContain("move-in");
 });
 it("rejects unrelated, oversized and malformed imports without corrupting existing memory",async()=>{
  const {api}=memory();
  await expect(api.importPack({format:"other",version:1,notes:[],historicalEntries:[]})).rejects.toThrow(/Not a ShowPilot/);
  await expect(api.importPack({format:"showpilot-memory",version:1,
   notes:[{category:"Stage Setups",title:"Bad",content:"x".repeat(25000)}],historicalEntries:[]})).rejects.toThrow(/Invalid memory/);
  const bad={format:"showpilot-memory",version:1,
   notes:[{id:"good",category:"Lessons Learned",title:"Valid note",content:"Valid content"}],
   historicalEntries:[{kind:"reviewed-event",date:"invalid-date",room:"Hall A",text:"test"}]};
  await expect(api.importPack(bad)).rejects.toThrow(/valid date/);
  expect((await api.status()).noteCount).toBe(0);
  await expect(api.save({category:"Bad Folder",title:"Invalid",content:"test"})).rejects.toThrow(/Invalid memory/);
 });
 it("makes verified local JSON snapshots after import and does not rebackup until due",async()=>{
  const {api,dir}=memory();
  const source={
   format:"showpilot-memory",version:1,
   notes:[{id:"schedule-jtf",category:"Recurring Events",title:"JTF 2025",content:"Hall A example"}],
   historicalEntries:[{kind:"CGC-room-or-task",date:"2025-01-01",room:"Hall A",text:"JTF move-in"}],
  };
  const first=await api.importPack(source);
  expect(first.notesAdded).toBe(1);
  const folder=path.join(dir,"ShowPilot Memory Backups");
  expect(existsSync(folder)).toBe(true);
  const files=(await import("node:fs")).readdirSync(folder);
  expect(files).toHaveLength(1);
  const backup=JSON.parse(readFileSync(path.join(folder,files[0]!),"utf8"));
  expect(backup.format).toBe("showpilot-memory");
  expect(backup.notes[0].title).toBe("JTF 2025");
  expect(backup.historicalEntries).toHaveLength(1);
  expect((await api.status()).lastBackupAt.length).toBeGreaterThan(5);
  expect((await api.automaticBackupCheck()).reason).toBe("not-due");
  expect((await import("node:fs")).readdirSync(folder)).toHaveLength(1);
  const manual=await api.backupNow(true);
  expect(manual.created).toBe(true);
  expect((await import("node:fs")).readdirSync(folder)).toHaveLength(2);
 });
 it("backs up archived memories and honors the weekly-backup switch",async()=>{
  const {api,dir}=memory();
  const note=await api.save({category:"Lessons Learned",title:"Archived historical rule",content:"Check before reuse"});
  await api.archive(note.id);
  await api.setBackupEnabled(false);
  const result=await api.importPack({format:"showpilot-memory",version:1,notes:[],
    historicalEntries:[{kind:"CGC-room-or-task",date:"2025-06-01",room:"Hall A",text:"Historical build"}]});
  expect(result.historyAdded).toBe(1);
  expect(existsSync(path.join(dir,"ShowPilot Memory Backups"))).toBe(false);
  await api.setBackupEnabled(true);
  const folder=path.join(dir,"ShowPilot Memory Backups");
  const files=(await import("node:fs")).readdirSync(folder);
  expect(files).toHaveLength(1);
  const payload=JSON.parse(readFileSync(path.join(folder,files[0]!),"utf8"));
  expect(payload.archivedNotes.map((n:{id:string})=>n.id)).toContain(note.id);
  const again=memory();
  await again.api.importPack(payload);
  expect((await again.api.status()).archivedCount).toBe(1);
  expect((await again.api.status()).historicalCount).toBe(1);
 });
 it("only captures reviewed exports if user opted in and excludes CEPAC room assignments",async()=>{
  const {api}=memory();
  const schedule={entries:[
   {date:"2026-10-10",space:"Hall A",title:"JTF",code:"S",start:480,end:1200},
   {date:"2026-10-10",space:"Cobb Energy Performing Arts Centre",title:"Other venue",code:"S"}],
   tasks:[{date:"2026-10-10",section:"HALLS",text:"Verify air-wall setup"}]};
  expect((await api.rememberSchedule(schedule)).saved).toBe(false);
  await api.preferences({rememberTasks:true,rememberStages:true,rememberExports:true});
  expect((await api.rememberSchedule(schedule)).saved).toBe(true);
  expect((await api.status()).historicalCount).toBe(2);
  expect((await api.exportPack()).historicalEntries.every((e:any)=>!e.text.includes("Other venue"))).toBe(true);
 });
});

describe("human-readable ShowPilot memory notes",()=>{
 it("summarizes two stages including counted bridge decks",()=>{
  const stages=[{
    name:"Stage 1",width:92,length:8,heightIn:40,valid:true,
    decks:Array.from({length:23},(_,i)=>({isBridge:i<5})),
    holders:Array.from({length:6},()=>({capacity:3})),
  }];
  const doc=stageMemoryDraft("Exhibitor stage",{
    eventName:"Annual convention",showDate:"2026-11-04",buildByDate:"2026-11-03",
  },stages);
  expect(doc.category).toBe("Stage Setups");
  expect(doc.content).toContain("92 ft × 8 ft × 40 in high");
  expect(doc.content).toContain("Bridge decks (included above): 5");
  expect(doc.content).toContain("3-deck holders: 6");
 });
 it("remembers an approved task without implying it is a permanent instruction",()=>{
  const doc=approvedTaskMemoryDraft(
    {date:"2026-11-05",section:"BALLROOM",text:"Verify air-wall arrangement"},
    "Previous conference used divided spaces",["Conference - Ballroom ABCD"]);
  expect(doc.category).toBe("Approved Tasks");
  expect(doc.content).toContain("Verify air-wall arrangement");
  expect(doc.content).toContain("historical example");
 });
 it("bounds historical references so notebook text cannot dominate prompt context",()=>{
  const notes=Array.from({length:8},()=> "a".repeat(900));
  expect(safeMemoryReferences(notes)).toHaveLength(3);
  expect(safeMemoryReferences(notes)[0]).toHaveLength(650);
  expect(safeMemoryReferences(undefined)).toEqual([]);
 });
});


describe("per-show Post-Con reports in native ShowPilot memory",()=>{
 const review={
  eventId:"A100",showName:"Technology Expo",showDate:"2025-10-12",rooms:"Hall A, Hall B",
  rating:4,wentWell:"Early equipment delivery",issues:"Late booth numbers",
  staffing:"Verify closing coverage",stage:"12x8 stage supported",
  floor:"Double-check booth 102",followUp:"Confirm utility orders earlier"
 };
 it("saves, edits, searches and restores a CGC Post-Con through JSON backup",async()=>{
  const {api}=memory();
  const created=await api.postConSave(review);
  expect(created.saved).toBe(true);
  expect((await api.postConList()).length).toBe(1);
  expect((await api.status()).postConCount).toBe(1);
  expect((await api.search("Technology")).some((r:{title:string})=>r.title.includes("Post-Con"))).toBe(true);
  const updated=await api.postConSave({...review,id:created.id,issues:"New booth lesson"});
  expect(updated.id).toBe(created.id);
  expect((await api.postConList())[0].issues).toBe("New booth lesson");
  const json=await api.exportPack();
  expect(json.postConReports).toHaveLength(1);
  const second=memory();
  await second.api.importPack(json);
  expect((await second.api.postConList())[0].issues).toBe("New booth lesson");
  await api.postConArchive(created.id);
  expect(await api.postConList()).toHaveLength(0);
  expect((await api.exportPack()).postConReports[0].archived).toBe(1);
 });
 it("does not accept future, empty, or other-building Post-Con reports",async()=>{
  const {api}=memory();
  await expect(api.postConSave({...review,showDate:"2099-01-01"})).rejects.toThrow(/completed shows/);
  await expect(api.postConSave({...review,rooms:"CEPAC Ballroom"})).rejects.toThrow(/Cobb Galleria/);
  await expect(api.postConSave({...review,wentWell:"",issues:"",staffing:"",stage:"",floor:"",followUp:""})).rejects.toThrow(/observation/i);
  expect((await api.postConList())).toHaveLength(0);
 });
});


describe("read-only Native Memory support diagnostics",()=>{
 it("checks SQLite integrity, Post-Con schema and JSON backup without leaking private notes",async()=>{
  const {api,dir}=memory();
  await api.save({category:"Lessons Learned",title:"PRIVATE CUSTOMER RESTRICTED",content:"Private staff notes and schedule details"});
  const before=readFileSync(path.join(dir,"showpilot-memory.sqlite"));
  const summary=await api.diagnosticsSummary();
  const after=readFileSync(path.join(dir,"showpilot-memory.sqlite"));
  expect(summary.sqliteIntegrityOK).toBe(true);
  expect(summary.schemaOK).toBe(true);
  expect(summary.exportRoundtripOK).toBe(true);
  expect(summary.activeNoteCount).toBe(1);
  expect(summary.latestBackupValid).toBe(false);
  expect(after.equals(before)).toBe(true);
  expect(JSON.stringify(summary)).not.toMatch(/PRIVATE|staff notes|schedule details|\.sqlite|[A-Z]:\\\\/);
 });
 it("verifies JSON snapshots after actual historical import, without exporting their text",async()=>{
  const {api}=memory();
  await api.importPack({
   format:"showpilot-memory",version:1,
   notes:[{category:"Recurring Events",title:"PRIVATE SHOW",content:"Confidential event info"}],
   historicalEntries:[{date:"2025-01-06",kind:"CGC-room-or-task",room:"Hall A",text:"PRIVATE EVENT"}]
  });
  const summary=await api.diagnosticsSummary();
  expect(summary.sqliteIntegrityOK).toBe(true);
  expect(summary.backupCount).toBeGreaterThanOrEqual(1);
  expect(summary.backupFolderAccessible).toBe(true);
  expect(summary.latestBackupValid).toBe(true);
  expect(JSON.stringify(summary)).not.toContain("PRIVATE");
 });
});
