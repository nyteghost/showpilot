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
