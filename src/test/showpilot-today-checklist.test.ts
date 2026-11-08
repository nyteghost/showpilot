import {describe,it,expect} from "vitest";
import {readFileSync,mkdtempSync,existsSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {runInNewContext} from "node:vm";
import type {PostConShow} from "@/lib/showpilot-postcon";
import {
 buildingChecklistTasks,reconcileAirwallDay,checklistKey,doneCount,STANDARD_BUILDING_TASKS,STANDARD_SHOW_TASKS,
 scheduledAirwallInstruction,tasksForShow
} from "@/lib/showpilot-today-checklist";
const nodeRequire=createRequire(new URL("../../desktop/today-checklist.cjs",import.meta.url));
const script=readFileSync(fileURLToPath(new URL("../../desktop/today-checklist.cjs",import.meta.url)),"utf8");
type Native={
 load:(day:string)=>{date:string;done:Record<string,string>;custom:{id:string;scope:string;text:string}[]};
 change:(day:string,scope:string,id:string,done:boolean)=>ReturnType<Native["load"]>;
 add:(day:string,scope:string,text:string)=>ReturnType<Native["load"]>;
 remove:(day:string,scope:string,id:string)=>ReturnType<Native["load"]>;
};
function fixture(){
 const folder=mkdtempSync(join(tmpdir(),"showpilot-today-checklist-"));
 const module={exports:{} as Native};
 runInNewContext(script,{
  module,exports:module.exports,require:(name:string)=>name==="electron"?
   {app:{getPath:()=>folder},ipcMain:{handle:()=>{}}}:nodeRequire(name),
  Buffer,Date,process
 },{filename:"desktop/today-checklist.cjs"});
 return {store:module.exports,folder,close:()=>rmSync(folder,{recursive:true,force:true})};
}
const day="2026-11-08";
const show:PostConShow={key:"id:41622",eventId:"41622",showName:"Hospitality Industry Ministries",
 rooms:"BallRoom A, BallRoom B, BallRoom E",startDate:day,showDate:day};

describe("Today operations checklist templates",()=>{
 it("always includes airwall setup before checking the matching lighting zones",()=>{
  const tasks=tasksForShow(show,{state:"unknown",findings:[]});
  expect(tasks.findIndex(t=>t.id==="airwalls")).toBeLessThan(tasks.findIndex(t=>t.id==="lighting"));
  expect(tasks.find(t=>t.id==="lighting")?.text).toMatch(/lighting zones.+airwall/i);
  expect(tasks.find(t=>t.id==="airwalls")?.text).toMatch(/airwall/i);
  expect(tasks.find(t=>t.id==="review-eoc")).toBeTruthy();
 });
 it("adds an EOC-review task when the EOC references airwalls without claiming today's move is confirmed",()=>{
  const tasks=tasksForShow(show,{state:"action",findings:[{kind:"action",text:"Move airwall",
   source:"EOC.pdf",page:2}]});
  expect(tasks.find(t=>t.id==="eoc-airwall-review")).toMatchObject({source:"eoc"});
  expect(tasks.find(t=>t.id==="eoc-airwall-review")?.detail).toMatch(/may refer to another day/);
  expect(tasksForShow(show,{state:"explicit-none",findings:[]})).toHaveLength(STANDARD_SHOW_TASKS.length);
 });
 it("creates an airwall check and an AFTER-wall lighting check from the dated engineering workbook",()=>{
  const workbook=[{date:day,section:"BALLROOM" as const,text:"Make ABE",source:"engineering-workbook" as const}];
  const tasks=buildingChecklistTasks(day,workbook,[]);
  expect(tasks).toHaveLength(STANDARD_BUILDING_TASKS.length+2);
  const scheduled=tasks.filter(t=>t.source==="schedule");
  expect(scheduled).toHaveLength(2);
  expect(scheduled[0]?.text).toContain("Set / verify airwalls: Ballrooms — Make ABE");
  expect(scheduled[0]?.detail).toContain("Dated engineering workbook");
  expect(scheduled[1]?.text).toContain("Verify lighting settings after airwall setup");
  expect(scheduled[1]?.text).toContain("Make ABE");
  expect(scheduled[0]?.id+"-lighting").toBe(scheduled[1]?.id);
 });
 it("uses reviewed Event Schedule Make commands, full ballroom and multiple setups",()=>{
  const tasks=buildingChecklistTasks(day,[],[
   {date:day,section:"BALLROOM",text:"Make full ballroom"},
   {date:day,section:"HALLS",text:"Make Hall AB"},
   {date:"2026-11-09",section:"BALLROOM",text:"Make ABE"}
  ]);
  expect(tasks.filter(t=>t.source==="schedule")).toHaveLength(4);
  expect(tasks.some(t=>t.text.includes("Ballrooms — Make full ballroom"))).toBe(true);
  expect(tasks.some(t=>t.text.includes("Halls — Make Hall AB"))).toBe(true);
  expect(tasks.some(t=>t.text.includes("Verify lighting settings after airwall setup: Halls"))).toBe(true);
  expect(tasks.some(t=>t.text.includes("Make ABE"))).toBe(false);
 });
 it("deduplicates matching workbook and reviewed-schedule moves without losing stable checkbox IDs",()=>{
  const workbook=[{date:day,section:"BALLROOM" as const,text:"Make ABE",source:"engineering-workbook" as const}];
  const suggestion=[{date:day,section:"BALLROOM" as const,text:"ABE"}];
  const first=buildingChecklistTasks(day,workbook,suggestion).filter(t=>t.source==="schedule");
  const again=buildingChecklistTasks(day,[],suggestion).filter(t=>t.source==="schedule");
  expect(first).toHaveLength(2);
  expect(again).toHaveLength(2);
  expect(first.map(t=>t.id)).toEqual(again.map(t=>t.id));
  expect(first[0]?.detail).toContain("Dated engineering workbook");
 });
 it("does not create scheduled airwall or lighting tasks when no dated move exists",()=>{
  const tasks=buildingChecklistTasks(day,[],[]);
  expect(tasks).toHaveLength(2);
  expect(tasks.map(t=>t.id)).toEqual(["review-requests","handoff"]);
  expect(buildingChecklistTasks("2026-11-09",[
   {date:day,section:"BALLROOM",text:"Make ABE",source:"engineering-workbook"}
  ],[{date:day,section:"BALLROOM",text:"Make full ballroom"}])).toHaveLength(2);
  expect(scheduledAirwallInstruction("BALLROOM","Airwalls listed in EOC")).toBeNull();
  expect(scheduledAirwallInstruction("BALLROOM","No airwall changes")).toBeNull();
  expect(scheduledAirwallInstruction("BALLROOM","Do not move airwalls")).toBeNull();
  expect(scheduledAirwallInstruction("BALLROOM","Airwalls remain unchanged")).toBeNull();
  expect(scheduledAirwallInstruction("BALLROOM","Move airwall between B and C")).toBeTruthy();
 });
 it("does not consider anything completed without an explicit checkoff",()=>{
  expect(doneCount(STANDARD_SHOW_TASKS,{},"id:41622")).toBe(0);
  expect(doneCount(STANDARD_SHOW_TASKS,{[checklistKey("id:41622","airwalls")]:new Date().toISOString()},"id:41622")).toBe(1);
 });
});

describe("private offline daily checklist storage",()=>{
 it("saves both building-wide and event checkoffs across restart, isolated by day",()=>{
  const {store,close}=fixture();
  try{
   expect(store.load(day).done).toEqual({});
   store.change(day,"id:41622","airwalls",true);
   store.change(day,"id:41622","lighting",true);
   store.change(day,"building","handoff",true);
   const again=store.load(day);
   expect(Object.keys(again.done)).toHaveLength(3);
   expect(again.done["id:41622::lighting"]).toBeTruthy();
   expect(store.load("2026-11-09").done).toEqual({});
   store.change(day,"id:41622","lighting",false);
   expect(store.load(day).done["id:41622::lighting"]).toBeUndefined();
   expect(store.load(day).done["building::handoff"]).toBeTruthy();
  }finally{close();}
 });
 it("adds and removes a custom task without affecting other tasks or saved backup",()=>{
  const {store,folder,close}=fixture();
  try{
   store.change(day,"building","review-requests",true);
   const result=store.add(day,"id:41622","Check lighting scene after wall move");
   expect(result.custom).toHaveLength(1);
   const task=result.custom[0]!;
   store.change(day,"id:41622",task.id,true);
   const loaded=store.load(day);
   expect(loaded.done["id:41622::"+task.id]).toBeTruthy();
   const backup=join(folder,"Today Checklists","checklists.json.bak");
   expect(existsSync(backup)).toBe(true);
   store.remove(day,"id:41622",task.id);
   expect(store.load(day).custom).toEqual([]);
   expect(store.load(day).done["building::review-requests"]).toBeTruthy();
   expect(store.load(day).done["id:41622::"+task.id]).toBeUndefined();
  }finally{close();}
 });
 it("rejects invalid or oversized edits without silently overwriting the saved day",()=>{
  const {store,folder,close}=fixture();
  try{
   store.change(day,"building","handoff",true);
   expect(()=>store.add(day,"building","")).toThrow();
   expect(()=>store.add(day,"building","a".repeat(161))).toThrow();
   expect(()=>store.change(day,"../other","handoff",true)).toThrow();
   expect(()=>store.change("invalid","building","handoff",true)).toThrow();
   expect(store.load(day).done["building::handoff"]).toBeTruthy();
   const f=join(folder,"Today Checklists","checklists.json");
   writeFileSync(f,'{"version":100,"days":{}}');
   expect(()=>store.change(day,"building","handoff",false)).toThrow();
   expect(readFileSync(f,"utf8")).toContain('"version":100');
  }finally{close();}
 });
});

describe("Today reconciles three possible airwall setups without three immediate moves",()=>{
 const transition=(id:string,afterDate:string,needByDate:string,toGroups:string[])=>({
  id,section:"BALLROOM" as const,afterDate,needByDate,
  fromGroups:["ABEG","CDF"],toGroups,
  target:toGroups.length===1&&toGroups[0]==="ABCDEFG"?"Full Ballroom":
   toGroups.map(x=>"Ballroom "+x).join(" + "),
  fromEvents:["Previous Event"],toEvents:["Next Event "+id],
  source:"inferred" as const,confidence:"confirmed-layout" as const,
  explanation:"Previous Event occupies ABEG + CDF through "+afterDate+
   "; next Event "+id+" needs "+toGroups.join(" + ")+" by "+needByDate+"."
 });
 it("displays the earliest required arrangement as today's next task, with two later setups for review",()=>{
  const windows=[
   transition("a","2026-11-06","2026-11-08",["ABE"]),
   transition("b","2026-11-07","2026-11-09",["ABCDEFG"]),
   transition("c","2026-11-07","2026-11-10",["CDF"])
  ];
  const plan=reconcileAirwallDay("2026-11-08",[],[],windows);
  expect(plan.tasks).toHaveLength(2);
  expect(plan.tasks[0]?.text).toContain("Ballroom ABE");
  expect(plan.tasks[0]?.storageDay).toBe("2026-11-06");
  expect(plan.review).toHaveLength(2);
  expect(plan.review.every(x=>x.kind==="upcoming")).toBe(true);
  expect(plan.review.map(x=>x.target)).toEqual(["Full Ballroom","Ballroom CDF"]);
  expect(buildingChecklistTasks("2026-11-08",[],[],windows)).toHaveLength(STANDARD_BUILDING_TASKS.length+2);
 });
 it("unifies a workbook instruction, Event Schedule suggestion, and inferred handoff of the same arrangement",()=>{
  const t=transition("matched","2026-11-06","2026-11-08",["ABE"]);
  const plan=reconcileAirwallDay("2026-11-08",[
   {date:"2026-11-08",section:"BALLROOM",text:"Make ABE",source:"engineering-workbook"}
  ],[{date:"2026-11-08",section:"BALLROOM",text:"ABE"}],[t]);
  expect(plan.tasks).toHaveLength(2);
  expect(plan.tasks[0]?.source).toBe("inferred");
  expect(plan.tasks[0]?.detail).toContain("Dated engineering workbook");
  expect(plan.tasks[0]?.detail).toContain("Event Schedule");
  expect(plan.review).toHaveLength(0);
 });
 it("does not choose between conflicting ballroom arrangements dated today",()=>{
  const plan=reconcileAirwallDay("2026-11-08",[
   {date:"2026-11-08",section:"BALLROOM",text:"Make ABE",source:"engineering-workbook"}
  ],[{date:"2026-11-08",section:"BALLROOM",text:"Make full ballroom"}],[]);
  expect(plan.tasks).toEqual([]);
  expect(plan.review).toHaveLength(2);
  expect(plan.review.every(x=>x.kind==="conflict")).toBe(true);
  expect(plan.review[0]?.reason).toMatch(/room refreshes or room changes/i);
  expect(plan.review[0]?.reason).toMatch(/sequence or handoff times/i);
 });
 it("flags an urgent EOC/workbook disagreement instead of creating two incompatible checkboxes",()=>{
  const t=transition("urgent","2026-11-07","2026-11-08",["ABCDEFG"]);
  const plan=reconcileAirwallDay("2026-11-08",[
   {date:"2026-11-08",section:"BALLROOM",text:"Make ABE",source:"engineering-workbook"}
  ],[],[t]);
  expect(plan.tasks).toHaveLength(0);
  expect(plan.review.filter(x=>x.kind==="conflict")).toHaveLength(2);
  expect(plan.review.some(x=>x.sources.some(y=>y.includes("Next Event")))).toBe(true);
 });
 it("a hall change remains its own task even when a ballroom conflict needs review",()=>{
  const plan=reconcileAirwallDay("2026-11-08",[],[
   {date:"2026-11-08",section:"HALLS",text:"Make Hall AB"},
   {date:"2026-11-08",section:"BALLROOM",text:"Make ABE"},
   {date:"2026-11-08",section:"BALLROOM",text:"Make full ballroom"}
  ],[]);
  expect(plan.tasks).toHaveLength(2);
  expect(plan.tasks[0]?.text).toContain("Halls");
  expect(plan.review).toHaveLength(2);
 });
});
