import {describe,it,expect} from "vitest";
import {Readable} from "node:stream";
import ExcelJS from "exceljs";
import {planWeeks,SHOW_STAFF,MARK_FLEX} from "../lib/staffing";
import {CustomSchedulePersonSchema,ScheduleDayOverrideSchema,ClaudeStaffingSettingsSchema,
 DEFAULT_CLAUDE_SETTINGS,saveClaudeSettings,readClaudeSettings} from "../lib/showpilot-claude-settings";
import {scheduleDisplayRoster,eventsWorkbook} from "../lib/work-files";
import type {EventEntry} from "../lib/work-tools";

const extra={name:"Fictional Example Engineer",badge:"XYZ",title:"Show Engineer",
 start:480,end:990,usualWeekdays:[0,1,2,3,4],notAlone:true};
const monday="2026-11-16";
const event:EventEntry={date:monday,space:"Hall A",code:"S",
 start:600,end:960,title:"Fictional Lantern Convention",showName:"Fictional Lantern Convention",eventId:"99901"};

describe("Schedule People: roster + reviewed daily changes",()=>{
 it("migrates prior settings, validates additions and persists only local user choices",()=>{
  const oldJson=JSON.stringify({coverBookingClose:false,attendanceThreshold:null,
   respectExistingOff:true,managerRegularLine:false,managerMayWorkAlone:false,
   preferredDaysOffByName:{},usualWeekdaysByName:{},aliasesByName:{}});
  const old=readClaudeSettings({getItem:()=>oldJson});
  expect(old).toMatchObject({extraPeople:[],excludedPeople:[],dayOverrides:[]});
  const next={...old,extraPeople:[extra],
   dayOverrides:[{date:monday,name:extra.name,action:"shift" as const,start:540,end:1080}]};
  let stored="";
  expect(saveClaudeSettings(next,{setItem:(_,value)=>{stored=value}})).toMatchObject(next);
  expect(readClaudeSettings({getItem:()=>stored})).toMatchObject(next);
  expect(CustomSchedulePersonSchema.safeParse({...extra,start:480,end:480}).success).toBe(false);
  expect(ScheduleDayOverrideSchema.safeParse({date:"2026-02-30",name:extra.name,action:"off"}).success).toBe(false);
  expect(ClaudeStaffingSettingsSchema.safeParse({...next,dayOverrides:[next.dayOverrides[0],next.dayOverrides[0]]}).success).toBe(false);
 });
 it("adds an engineer to generated roster, can remove and restore without editing the default list",()=>{
  const first={...DEFAULT_CLAUDE_SETTINGS,extraPeople:[extra]};
  expect(scheduleDisplayRoster(first).some(p=>p.name===extra.name)).toBe(true);
  expect(scheduleDisplayRoster({...first,excludedPeople:[extra.name,SHOW_STAFF[0]!.name]})
   .some(p=>p.name===extra.name||p.name===SHOW_STAFF[0]!.name)).toBe(false);
  expect(scheduleDisplayRoster(first).some(p=>p.name===SHOW_STAFF[0]!.name)).toBe(true);
  expect(scheduleDisplayRoster().length).toBeGreaterThan(8);
 });
 it("manually adds or removes one person's day without rewriting saved shifts",()=>{
  const setting={...DEFAULT_CLAUDE_SETTINGS,extraPeople:[extra],
   dayOverrides:[{date:monday,name:extra.name,action:"shift" as const,start:540,end:1080}]};
  const added=planWeeks([monday],[event],{},SHOW_STAFF,[],setting);
  const day=added.find(p=>p.date===monday)!;
  expect(day.assignments).toEqual(expect.arrayContaining([
   expect.objectContaining({name:extra.name,start:540,end:1080,fixed:true})
  ]));
  expect(day.notes.join(" ")).toContain("manual shift");
  const removed=planWeeks([monday],[event],{},SHOW_STAFF,[],
   {...setting,dayOverrides:[{date:monday,name:extra.name,action:"off" as const}]});
  expect(removed.find(p=>p.date===monday)!.assignments.some(a=>a.name===extra.name)).toBe(false);
  expect(removed.find(p=>p.date===monday)!.notes.join(" ")).toContain("manual OFF");
 });
 it("will not override an OFF/PTO or an existing human-entered shift from the workbook",()=>{
  const setting={...DEFAULT_CLAUDE_SETTINGS,extraPeople:[extra],
   dayOverrides:[{date:monday,name:extra.name,action:"shift" as const,start:540,end:1080}]};
  const unavailable=planWeeks([monday],[event],{[extra.name]:{[monday]:{off:true}}},SHOW_STAFF,[],setting);
  expect(unavailable.find(p=>p.date===monday)!.assignments.some(a=>a.name===extra.name)).toBe(false);
  expect(unavailable.find(p=>p.date===monday)!.notes.join(" ")).toMatch(/NOT applied/);
  const fixed=planWeeks([monday],[event],{[extra.name]:{[monday]:{off:false,fixed:{start:420,end:930}}}},SHOW_STAFF,[],setting);
  expect(fixed.find(p=>p.date===monday)!.assignments.find(a=>a.name===extra.name)?.start).toBe(420);
 });
 it("fresh-layout export shows added staff, while a removed default person disappears from its new roster",async()=>{
  const policy={...DEFAULT_CLAUDE_SETTINGS,extraPeople:[extra],excludedPeople:[SHOW_STAFF[0]!.name],
   dayOverrides:[{date:monday,name:extra.name,action:"shift" as const,start:480,end:990}]};
  const blob=await eventsWorkbook([event],undefined,[],{singleWeek:monday,planning:policy});
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.read(Readable.from([new Uint8Array(await blob.arrayBuffer())]));
  const sheet=wb.worksheets.find(x=>x.name.startsWith("Week"));
  expect(sheet).toBeTruthy();
  const labels:string[]=[];
  sheet!.eachRow(row=>labels.push(String(row.getCell(1).value??"")));
  expect(labels).toContain(extra.name);
  expect(labels).not.toContain(SHOW_STAFF[0]!.name);
  expect(labels).toContain(MARK_FLEX.name);
  const staffRow=labels.indexOf(extra.name)+1;
  expect(sheet!.getRow(staffRow).getCell(2).text).not.toBe("");
 });
});