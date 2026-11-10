import {describe,it,expect} from "vitest";
import {resolveScheduleEventNames} from "../lib/showpilot-event-name-resolution";
import {weekLayouts,assertNamedScheduleEntries,type EventRow,type EventEntry} from "../lib/work-tools";
import type {PostConShow} from "../lib/showpilot-postcon";

const row=(id:string,name:string,date:string,space="Hall D"):EventRow=>({
 level:2,date,space,eventId:id,event:name,
 description:"Exhibitor Move-In",usage:"Move In",start:"12:00 PM",end:"07:00 PM"
});
const entry=(id:string,title:string,date:string):EventEntry=>({
 eventId:id,title,date,space:"Hall D",code:"Exmi",start:720,end:1140
});
const show=(id:string,name:string):PostConShow=>({
 key:"id:"+id,eventId:id,showName:name,startDate:"2026-11-16",
 showDate:"2026-11-20",rooms:"Hall D"
});

describe("event name attribution in reviewed engineering schedules",()=>{
 it("restores a grouped source show name instead of the function label",()=>{
  const old=entry("99002","Exhibitor Move-In","2026-11-16");
  const source=[row("99002","Fictional Lantern Conference 2026","2026-11-16")];
  const result=resolveScheduleEventNames([old],source);
  expect(result.entries[0]).toMatchObject({
   showName:"Fictional Lantern Conference 2026",
   title:"Fictional Lantern Conference 2026"
  });
  const text=weekLayouts(result.entries)[0]!.rows["Hall D"]![0]!.text;
  expect(text).toContain("Fictional Lantern Conference 2026");
  expect(text).not.toMatch(/^Exhibitor Move-In/);
  expect(()=>assertNamedScheduleEntries(result.entries)).not.toThrow();
 });
 it("finds the attached show from an exact Event ID when the group heading is missing",()=>{
  const old=entry("99002","Move In Exhibitors","2026-11-20");
  const result=resolveScheduleEventNames([old],[row("99002","","2026-11-20")],
   [show("99002","Fictional Lantern Conference 2026")]);
  expect(result.entries[0]?.showName).toBe("Fictional Lantern Conference 2026");
  expect(result.unresolved).toBe(0);
 });
 it("never guesses a different show or converts a function into a verified name",()=>{
  const old=entry("99002","Vendor Load-In","2026-11-20");
  const result=resolveScheduleEventNames([old],[],[show("99111","Unrelated Event")]);
  expect(result.unresolved).toBe(1);
  expect(result.entries[0]?.showName).toBeUndefined();
  expect(()=>assertNamedScheduleEntries(result.entries)).toThrow(/Cannot export unnamed/);
 });
 it("does not match ambiguous room/date-only activities to an unrelated show",()=>{
  const missingId={...entry("","Move In Exhibitors","2026-11-16"),eventId:undefined};
  const catalog=[
   show("99001","Fictional Lantern Conference 2026"),
   show("99002","Fictional Heritage Expo")
  ];
  const result=resolveScheduleEventNames([missingId],[],catalog);
  expect(result.unresolved).toBe(1);
 });
 it("keeps independently verified show names when restored without source records",()=>{
  const original={...entry("99002","Fictional Lantern Conference 2026","2026-11-16"),
   showName:"Fictional Lantern Conference 2026"};
  const result=resolveScheduleEventNames([original],[]);
  expect(result.entries).toEqual([original]);
 });
});
