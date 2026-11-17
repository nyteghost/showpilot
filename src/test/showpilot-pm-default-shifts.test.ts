import {describe,expect,it} from "vitest";
import {PM_DEFAULT_SHIFT,SHOW_STAFF,planWeeks,shiftText,workedHours} from "@/lib/staffing";

const dates=["2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13","2026-11-14","2026-11-15"];
const eveningNames=["Edison Dunkley","Franck Pierre-Louis"];

describe("CGC evening staff default 2p–10:30p",()=>{
 it("uses the new 8.5-hour PM default for Edison and Franck in tie-breaks and top-ups",()=>{
  expect(PM_DEFAULT_SHIFT).toEqual({start:840,end:1350});
  expect(shiftText(PM_DEFAULT_SHIFT)).toBe("2p-10:30p");
  expect(workedHours(PM_DEFAULT_SHIFT)).toBe(8.5);
  for(const name of eveningNames){
   const staff=SHOW_STAFF.find(s=>s.name===name);
   expect(staff?.patterns?.[0]).toEqual(PM_DEFAULT_SHIFT);
   // Earlier shifts stay possible for unusually early event coverage, but are not default.
   expect(staff?.patterns).toContainEqual({start:720,end:1230});
  }
 });
 it("suggests the default PM shift on an ordinary no-coverage weekday, not noon",()=>{
  const plans=planWeeks(dates,[]);
  for(const name of eveningNames){
   const suggested=plans.flatMap(p=>p.assignments.filter(a=>a.name===name&&!a.fixed));
   expect(suggested.length).toBeGreaterThan(0);
   expect(suggested.every(a=>a.start===840&&a.end===1350)).toBe(true);
  }
 });
 it("respects previously approved noon shifts without rewriting them",()=>{
  const existing={
   "Edison Dunkley":{"2026-11-12":{off:false,fixed:{start:720,end:1230}}},
   "Franck Pierre-Louis":{"2026-11-12":{off:false,fixed:{start:720,end:1230}}}
  };
  const plans=planWeeks(dates,[],existing);
  const thursday=plans.find(p=>p.date==="2026-11-12")!;
  for(const name of eveningNames){
   expect(thursday.assignments.find(a=>a.name===name)).toMatchObject({
    start:720,end:1230,fixed:true
   });
  }
 });
 it("still keeps an event-free CGC weekend free of automatically assigned engineering shifts",()=>{
  const plans=planWeeks(dates,[]);
  for(const weekend of ["2026-11-14","2026-11-15"]){
   const p=plans.find(x=>x.date===weekend)!;
   expect(p.assignments.some(a=>eveningNames.includes(a.name))).toBe(false);
  }
 });
});
