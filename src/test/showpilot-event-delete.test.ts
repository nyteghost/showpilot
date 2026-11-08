import {describe,expect,it} from "vitest";
import {parseEventDeleteRequest,selectEventDeletionTargets,isExactDeleteConfirmation} from "../lib/showpilot-event-delete";
const records=[
 {key:"id:41562",eventId:"41562",showName:"Tower Impact Summit",showDate:"2026-11-14",startDate:"2026-11-12",rooms:"BallRoom A"},
 {key:"id:41557",eventId:"41557",showName:"Front Row Car Show",showDate:"2026-11-05",rooms:"Hall B"},
 {key:"name:oldshow",eventId:"",showName:"Old Expo",showDate:"2024-08-12",rooms:"Hall A"}
];
describe("explicit event catalog deletion review",()=>{
 it("requires exact yes before deleting",()=>{
  expect(isExactDeleteConfirmation("yes")).toBe(true);
  expect(isExactDeleteConfirmation(" YES ")).toBe(true);
  for(const response of ["yes, delete","yes please","y","sure","cancel"])
   expect(isExactDeleteConfirmation(response)).toBe(false);
 });
 it("requires a specific date for vague requests",()=>{
  expect(parseEventDeleteRequest("delete old event data")).toEqual({kind:"need-date"});
 });
 it("selects only event IDs or exact show names",()=>{
  expect(selectEventDeletionTargets(parseEventDeleteRequest("delete event 41562")!,records))
   .toEqual([{key:"id:41562",showName:"Tower Impact Summit",showDate:"2026-11-14"}]);
  expect(selectEventDeletionTargets(parseEventDeleteRequest("delete show named Old Expo")!,records)
   .map(x=>x.key)).toEqual(["name:oldshow"]);
  expect(selectEventDeletionTargets(parseEventDeleteRequest("delete show Tower")!,records)).toEqual([]);
 });
 it("deletes only events whose END date is strictly before cutoff",()=>{
  const q=parseEventDeleteRequest("delete events before 2026-11-14");
  expect(q).toEqual({kind:"before",cutoff:"2026-11-14"});
  expect(selectEventDeletionTargets(q!,records).map(x=>x.key))
   .toEqual(["id:41557","name:oldshow"]);
 });
 it("does not treat ordinary conversational questions as deletion commands",()=>{
  expect(parseEventDeleteRequest("Why did it delete that event?")).toBeNull();
  expect(parseEventDeleteRequest("What if I remove an event?")).toBeNull();
 });
});
