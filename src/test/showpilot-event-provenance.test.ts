import {describe,expect,it} from "vitest";
import {roomsFromAssignedLine,discoverEventMetadata} from "@/lib/showpilot-event-discovery";
import {eocSpaceEvidence,explainSavedRoom} from "@/lib/showpilot-event-provenance";

describe("EOC room assignment explainability and Hall C false-positive protection",()=>{
 it("uses the visible Function Space assignment rather than other hall mentions",()=>{
  expect(roomsFromAssignedLine("Function Space: No Space Assigned")).toEqual([]);
  expect(roomsFromAssignedLine("Function Space: Exhibit Hall D (EXD)")).toEqual(["Hall D"]);
  expect(roomsFromAssignedLine("Function Space:","Exhibit Hall D (EXD)")).toEqual(["Hall D"]);
  expect(roomsFromAssignedLine("Rooms: Hall C, Hall D")).toEqual(["Hall C","Hall D"]);
  expect(roomsFromAssignedLine("Exhibit Hall D")).toEqual(["Hall D"]);
  expect(roomsFromAssignedLine("Walk through Hall C after the event")).toEqual([]);
  expect(roomsFromAssignedLine("Food & Beverage: Hall C")).toEqual([]);
  expect(roomsFromAssignedLine("Function Space: No Space Assigned","Exhibit Hall C")).toEqual([]);
 });
 it("does not select Hall C based on an unrelated paragraph when the EOC says Hall D",()=>{
  const text=[
   "Event Order Confirmation",
   "Public Event (42389)",
   "Sun 11/15/2026 - Tue 11/17/2026",
   "Engineering",
   "Mon 11/16/2026 Engineering Service Desk",
   "Function Space: No Space Assigned",
   "Utilities",
   "Sun 11/15/2026 10 amp - 120v power strip",
   "Function Space: No Space Assigned",
   "Food & Beverage",
   "Tue 11/17/2026 Boxed Lunch",
   "Function Space: Exhibit Hall D",
   "Informational note: vendors may pass through Hall C"
  ].join("\n");
  const found=discoverEventMetadata([{path:"Event Order Confirmation - Internal.pdf",text}],null,
   "Event Order Confirmation Event ID#42389 11 15 2026.zip");
  expect(found.rooms).toEqual(["Hall D"]);
  expect(found.evidence.find(e=>e.field==="room"&&e.value==="Hall D"))
   .toMatchObject({confidence:"assigned",context:"Function Space: Exhibit Hall D"});
  expect(found.evidence.some(e=>e.field==="room"&&e.value==="Hall C"&&e.confidence==="mentioned")).toBe(true);
  expect(found.warnings.some(w=>w.includes("not added automatically"))).toBe(true);
 });
 it("cites the page and exact assignment and explains unverified catalog Hall C",()=>{
  const result=eocSpaceEvidence([{file:"Event Order Confirmation - Internal.pdf",pages:[
   "Engineering\nFunction Space: No Space Assigned\nService Desk",
   "Food & Beverage\nFunction Space: Exhibit Hall D\nBoxed Lunch"
  ]}]);
  expect(result.unassigned).toEqual([{file:"Event Order Confirmation - Internal.pdf",
   page:1,line:"Function Space: No Space Assigned"}]);
  expect(result.assigned).toEqual([{room:"Hall D",
   file:"Event Order Confirmation - Internal.pdf",page:2,line:"Function Space: Exhibit Hall D"}]);
  const hallD=explainSavedRoom("Hall D",[],result.assigned);
  expect(hallD.status).toBe("eoc-confirmed");
  expect(hallD.sources[0]?.source).toContain("page 2");
  const hallC=explainSavedRoom("Hall C",[],result.assigned);
  expect(hallC.status).toBe("not-traced");
  expect(hallC.reason).toContain("cannot determine");
 });
 it("retains a historical ZIP mention without calling it a verified assignment",()=>{
  const result=explainSavedRoom("Hall C",[{
   field:"room",value:"Hall C",source:"Internal EOC.pdf",
   context:"Walk through Hall C after move out",confidence:"mentioned"
  }],[]);
  expect(result.status).toBe("mention-only");
  expect(result.sources[0]?.context).toContain("Walk through");
 });
});
