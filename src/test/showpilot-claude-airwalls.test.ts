import {describe,it,expect} from "vitest";
import {detailedAirwallTask,type EventRow,type TaskNote} from "../lib/work-tools";
import {airwallHolds} from "../lib/staffing";
const row=(space:string,start:string):EventRow=>({
 level:2,date:"2026-11-16",event:"Fictional Lantern Gala",eventId:"99771",
 usage:"Event (Evt)",description:"Session",space,start,end:"10:00 PM"
});
describe("Claude C14: reviewed wall configuration detail",()=>{
 it("provides PM and complete verified section groups from source rows",()=>{
  const task:TaskNote={date:"2026-11-16",section:"BALLROOM",text:"Make ABE/CDFG"};
  const detailed=detailedAirwallTask(task,[row("BallRoom ABE","01:00 PM"),row("BallRoom CDFG","02:00 PM")]);
  expect(detailed.text).toMatch(/^PM: Make ABE\/CDFG/);
  expect(detailed.text).toContain("sections ABE/CDFG");
  expect(detailed.text).toContain("VERIFY EOC");
  expect(airwallHolds([detailed],[])).toEqual([expect.objectContaining({
   date:task.date,section:undefined,n:2,text:detailed.text
  })].map(x=>({date:x.date,start:480,end:570,n:2,text:x.text})));
 });
 it("does not invent the configuration of unobserved room sections",()=>{
  const task:TaskNote={date:"2026-11-16",section:"HALLS",text:"Make Hall AB"};
  const result=detailedAirwallTask(task,[row("Hall AB","09:00 AM")]);
  expect(result.text).toContain("C?/D?");
 });
});
