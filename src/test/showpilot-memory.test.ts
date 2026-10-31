import {describe,it,expect,afterEach} from "vitest";
import {readFileSync,mkdtempSync,existsSync,rmSync,mkdirSync,writeFileSync,symlinkSync} from "node:fs";
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
function memory() {
 const dir=mkdtempSync(path.join(tmpdir(),"showpilot-memory-test-"));
 dirs.push(dir);
 const module={exports:{} as Record<string,(...args:any[])=>any>};
 let selection=dir;
 const electron={
  app:{getPath:(type:string)=>type==="userData"?dir:path.join(dir,type)},
  dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[selection]})},
  ipcMain:{handle:()=>{}},
  shell:{openPath:async()=>""},
 };
 runInNewContext(code,{
  module,exports:module.exports,
  require:(id:string)=>id==="electron"?electron:nativeRequire(id),
  Buffer,Date,
 },{filename:"desktop/showpilot-memory.cjs"});
 return {api:module.exports,dir,choose:(newDir:string)=>{selection=newDir}};
}
afterEach(()=>{while(dirs.length){const dir=dirs.pop();if(dir)rmSync(dir,{recursive:true,force:true})}});

describe("Obsidian-compatible ShowPilot memory vault",()=>{
 it("requires deliberate notebook setup and defaults to remembering only approved actions",()=>{
  const {api}=memory();
  expect(api.status().configured).toBe(false);
  expect(api.list("")).toEqual([]);
  expect(()=>api.save({category:"Approved Tasks",title:"Test",content:"Some notes"})).toThrow(/notebook/);
  const status=api.connectDefault();
  expect(status.configured).toBe(true);
  expect(status.rememberTasks).toBe(true);
  expect(status.rememberStages).toBe(true);
  expect(status.vault).toContain("ShowPilot Memory");
 });
 it("writes standard Markdown, lets users search, edit, and archive without deleting",()=>{
  const {api,dir}=memory();api.connectDefault();
  const item=api.save({category:"Stage Setups",title:"Ballroom ABCD Stage",content:"Two 92ft platforms using bridges and holders."});
  expect(item.id.startsWith("Stage Setups/")).toBe(true);
  const file=path.join(dir,"ShowPilot Memory","ShowPilot",...item.id.split("/"));
  expect(existsSync(file)).toBe(true);
  expect(readFileSync(file,"utf8")).toContain("# Ballroom ABCD Stage");
  expect(api.list("Ballroom").map((x:any)=>x.id)).toEqual([item.id]);
  expect(api.search("ABCD stage").map((x:any)=>x.id)).toEqual([item.id]);
  api.edit(item.id,"# Edited ballroom\n\nUpdated bridges and holders");
  expect(api.read(item.id).content).toContain("Updated bridges");
  expect(api.archive(item.id).archived).toBe(true);
  expect(api.list("")).toEqual([]);
  expect(existsSync(path.join(dir,"ShowPilot Memory","ShowPilot","Trash"))).toBe(true);
 });
 it("allows selecting an existing Obsidian vault and preserves unrelated notes",async()=>{
  const {api,dir,choose}=memory();
  const vault=path.join(dir,"Existing Vault");
  mkdirSync(vault);
  writeFileSync(path.join(vault,"Personal.md"),"# Personal note\n", "utf8");
  choose(vault);
  const status=await api.choose();
  expect(status.vault).toBe(vault);
  api.save({category:"Lessons Learned",title:"Room turnover",content:"Verify air walls"});
  expect(readFileSync(path.join(vault,"Personal.md"),"utf8")).toBe("# Personal note\n");
  expect(api.list("Room")).toHaveLength(1);
 });
 it("rejects path traversal, unsupported categories, oversized content and symlinks",()=>{
  const {api,dir}=memory();api.connectDefault();
  for(const id of ["../x.md","Stage Setups/../escape.md","Stage Setups/a.md/../../x","Other/x.md"]){
   expect(()=>api.read(id)).toThrow();
   expect(()=>api.archive(id)).toThrow();
  }
  expect(()=>api.save({category:"../outside",title:"Bad",content:"test"})).toThrow();
  expect(()=>api.save({category:"Approved Tasks",title:"Long",content:"z".repeat(25_000)})).toThrow();
  const folder=path.join(dir,"ShowPilot Memory","ShowPilot","Lessons Learned");
  mkdirSync(folder);
  symlinkSync(path.join(dir,"secret"),path.join(folder,"fake.md"));
  expect(()=>api.read("Lessons Learned/fake.md")).toThrow(/regular files/);
 });
 it("keeps the opt-in switches persistent and restricts operations to a connected notebook",()=>{
  const {api}=memory();
  api.connectDefault();
  expect(api.preferences({rememberTasks:false,rememberStages:true}).rememberTasks).toBe(false);
  expect(api.status().rememberTasks).toBe(false);
  expect(()=>api.preferences({rememberTasks:"bad",rememberStages:true})).toThrow();
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
  expect(doc.content).toContain("The Stage & Deck Planner remains the source");
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
