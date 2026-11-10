import {describe,it,expect} from "vitest";
import {possibleRoomHolds,summarizeEvents,type EventRow} from "../lib/work-tools";
const line=(date:string,space:string,id:string,show:string):EventRow=>({
 date,space,eventId:id,event:show,level:2,description:"Main Session",usage:"Event (Evt)",
 start:"08:00 AM",end:"04:00 PM"
});
describe("Claude B8: possible room holds are review-only",()=>{
 it("flags an internal gap between two same-booking days, not an unrelated booking",()=>{
  const rows=[
   line("2026-11-16","Hall D","77889","Fictional Lantern Expo"),
   line("2026-11-18","Hall D","77889","Fictional Lantern Expo"),
   line("2026-11-17","Hall A","77777","Another Fictional Event")
  ];
  expect(possibleRoomHolds(rows)).toEqual([expect.objectContaining({
   date:"2026-11-17",space:"Hall D",eventId:"77889",showName:"Fictional Lantern Expo",
   reason:expect.stringContaining("VERIFY")
  })]);
  // Source events are not silently rewritten or assigned an MI/hold.
  expect(summarizeEvents(rows).filter(e=>e.date==="2026-11-17").map(e=>e.space))
   .toEqual(["Hall A"]);
 });
 it("never suggests a lower other-venue space",()=>{
  const rows=[
   line("2026-11-16","CEPAC Ballroom A","77889","Fictional Lantern Expo"),
   line("2026-11-18","CEPAC Ballroom A","77889","Fictional Lantern Expo")
  ];
  expect(possibleRoomHolds(rows)).toEqual([]);
 });
});
