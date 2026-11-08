import {describe,expect,it} from "vitest";
import {cgcRoomsFromText,discoverEventMetadata,normalizeEventDate,parseEocCoverHeader,parseEventZipFilename} from "@/lib/showpilot-event-discovery";
import {scheduleHintsFromSources,serializeZipSchedule,parseZipSchedule} from "@/lib/showpilot-zip-schedule";
describe("event ZIP metadata and scheduling evidence",()=>{
 it("prefills ID, real show name, event date range and ALL specified CGC locations from EOCs and work orders",()=>{
  const sources=[
   {path:"EOC/Event Order Confirmation.pdf",text:
     "Event ID: 42389\nEvent Name: Coldwell Banker Realty Atlanta\nStart Date: 11/05/2026\nEnd Date: 11/07/2026\nLocation: Ballroom ABE\nExhibit Hall AB\nEngineering\nStage build 16 x 12"},
   {path:"Work Orders/Engineering Order.txt",text:
     "Show Number: 42389\nEvent Title: Coldwell Banker Realty Atlanta\nRooms: Hall C, Hall D\nUtility: Booth 243 needs 208V power"}
  ];
  const meta=discoverEventMetadata(sources,null,"unimportant.zip");
  expect(meta.eventId).toBe("42389");
  expect(meta.showName).toBe("Coldwell Banker Realty Atlanta");
  expect(meta.startDate).toBe("2026-11-05");
  expect(meta.showDate).toBe("2026-11-07");
  expect(meta.rooms).toEqual(["Hall A","Hall B","Hall C","Hall D","BallRoom A","BallRoom B","BallRoom E"]);
  expect(meta.evidence.some(e=>e.source.includes("EOC"))).toBe(true);
  expect(scheduleHintsFromSources(sources).map(h=>h.topic)).toContain("Utility");
  expect(scheduleHintsFromSources(sources).map(h=>h.topic)).toContain("Stage & Deck");
 });
 it("reads EOC cover name, numeric ID and third-line date range instead of the email ZIP prefix",()=>{
  const page="Event Order Confirmation\nARMAC Luncheon (40566)\nThu 11/5/2026 - Thu 11/5/2026\nLocation: Ballroom ABE";
  expect(parseEocCoverHeader(page)).toEqual({showName:"ARMAC Luncheon",eventId:"40566",
   startDate:"2026-11-05",showDate:"2026-11-05"});
  const name="Event Order Confirmation + Supporting Documents Hospitality Industry Ministries Event ID#41622 11 06 2026.zip";
  expect(parseEventZipFilename(name)).toEqual({showName:"Hospitality Industry Ministries",
   eventId:"41622",date:"2026-11-06"});
  const meta=discoverEventMetadata([{path:"documents/EOC.pdf",text:page}],null,name);
  expect(meta.showName).toBe("ARMAC Luncheon");
  expect(meta.eventId).toBe("40566");
  expect(meta.startDate).toBe("2026-11-05");
  expect(meta.showDate).toBe("2026-11-05");
  expect(meta.evidence.some(v=>v.field==="eventId"&&v.value==="41622")).toBe(true);
  expect(meta.warnings.some(w=>w.startsWith("Conflicting eventId"))).toBe(true);
 });
 it("uses filename Event ID and cleaned title when no readable EOC cover exists",()=>{
  const file="Event Order Confirmation + Supporting Documents Hospitality Industry Ministries Event ID#41622 11 06 2026.zip";
  const m=discoverEventMetadata([],null,file);
  expect(m.showName).toBe("Hospitality Industry Ministries");
  expect(m.eventId).toBe("41622");
  expect(m.startDate).toBe("2026-11-06");
  expect(m.showDate).toBe("2026-11-06");
  expect(m.showName).not.toContain("Event Order Confirmation");
 });
 it("handles room groups, date validation, and does not treat functions as show names",()=>{
  expect(cgcRoomsFromText("Halls A-C and Ballroom C/D")).toEqual(["Hall A","Hall B","Hall C","BallRoom C","BallRoom D"]);
  expect(normalizeEventDate("2/29/2026")).toBe("");
  expect(normalizeEventDate("11/5/2026")).toBe("2026-11-05");
  const m=discoverEventMetadata([{path:"EOC.pdf",text:"Event Name: Program\nEvent ID: 50012\nStart Date: 2026-11-05\nEnd Date: 2026-11-06"}]);
  expect(m.showName).toBe("");
  expect(m.warnings).toContain("No showName found in documents.");
 });
 it("honors explicit manifest, retains conflicting source evidence, and never silently edits schedules",()=>{
  const sources=[{path:"EOC 1.pdf",text:"Event ID: 12345\nStart Date: 11/07/2026\nEnd Date: 11/08/2026\nHall A"},
   {path:"EOC 2.pdf",text:"Event ID: 78910\nStart Date: 11/09/2026\nEnd Date: 11/10/2026\nHall B"}];
  const result=discoverEventMetadata(sources,{eventId:"12345",showName:"Annual Expo",startDate:"2026-11-07",
   showDate:"2026-11-08",rooms:"Hall A"},"random.zip");
  expect(result.eventId).toBe("12345");
  expect(result.rooms).toEqual(["Hall A","Hall B"]);
  expect(result.warnings.some(x=>x.includes("Conflicting eventId"))).toBe(true);
  const payload={version:1 as const,eventKey:"id:12345",sourceZip:"Expo.zip",created:"2026-11-05",
   detected:result,reviewed:{eventId:"12345",showName:"Annual Expo",startDate:"2026-11-07",
    showDate:"2026-11-08",rooms:result.rooms},hints:[],documents:[]};
  expect(parseZipSchedule(serializeZipSchedule(payload))).toEqual(payload);
 });
});
