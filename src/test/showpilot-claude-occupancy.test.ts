import {describe,it,expect} from "vitest";
import {summarizeEvents,entryLabel,type EventRow} from "../lib/work-tools";
const row=(description:string,start:string,end:string,codeUsage=""):EventRow=>({
 level:2,date:"2026-11-17",event:"Example Technology Expo",eventId:"55501",
 space:"Hall D",description,start,end,usage:codeUsage
});
describe("Claude B9/B10: occupied spans and zero-length time markers",()=>{
 it("uses a rehearsal and exhibitor access to extend the real occupied show span",()=>{
  const rows=[
   row("Rehearsals","01:30 PM","06:30 PM"),
   row("Exhibitor Access","06:30 PM","09:30 PM"),
   row("Doors Open","09:30 PM","09:30 PM","Event (Evt)"),
   row("Evening Competition","10:00 PM","11:00 PM")
  ];
  const show=summarizeEvents(rows).find(e=>e.code==="S");
  expect(show?.start).toBe(810);
  expect(show?.end).toBe(1380);
  expect(show?.title).toBe("Example Technology Expo");
 });
 it("does not generate a fictitious time range for a lone instant marker",()=>{
  const list=summarizeEvents([row("Doors Open","09:30 PM","09:30 PM","Event (Evt)")]);
  const marker=list.find(e=>e.code==="S");
  expect(marker).toBeTruthy();
  expect(entryLabel(marker!)).not.toContain("9:30p-9:30p");
  expect(entryLabel(marker!)).toMatch(/VERIFY|marker/i);
 });
 it("does not turn an event access-only day into a confirmed show automatically",()=>{
  const list=summarizeEvents([row("Exhibitor Access","08:00 AM","11:00 AM")]);
  expect(list).toEqual([]);
 });
});
