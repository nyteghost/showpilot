import {describe,expect,it} from "vitest";
import type {PostConShow} from "@/lib/showpilot-postcon";
import type {EventFileRecord} from "@/lib/showpilot-event-assets";
import {findFloorMapShowById,isBetterWorkOrderItems,linkedMapDocuments} from "@/lib/showpilot-floor-map-events";
const shows:PostConShow[]=[
 {key:"id:41622",eventId:"41622",showName:"Hospitality Industry Ministries",
  startDate:"2026-11-06",showDate:"2026-11-06",rooms:"BallRoom A, BallRoom B, BallRoom E"},
 {key:"id:70001",eventId:"70001",showName:"CEPAC Performance",
  startDate:"2026-11-06",showDate:"2026-11-06",rooms:"Cobb Energy Performing Arts Centre"}
];
const base=(kind:EventFileRecord["kind"],name:string,id:string,available=true)=>({
 id,eventKey:"id:41622",kind,name,extension:name.split(".").pop()!.toLowerCase(),
 bytes:200,created:"2026-11-08",sha256:"a".repeat(64),available,eocExcerpts:[] as EventFileRecord["eocExcerpts"]
});
describe("Floor Maps Event ID linkage and saved itemized orders",()=>{
 it("links a separately uploaded floor plan only to one exact CGC Event ID",()=>{
  expect(findFloorMapShowById("41622",shows)).toMatchObject({status:"matched",show:{key:"id:41622"}});
  expect(findFloorMapShowById("#41622",shows).status).toBe("matched");
  expect(findFloorMapShowById("70001",shows).status).toBe("unknown");
  expect(findFloorMapShowById("99999",shows).status).toBe("unknown");
  expect(findFloorMapShowById("41622",[...shows,{...shows[0]!,key:"copy"}]).status).toBe("ambiguous");
  expect(findFloorMapShowById("",shows).status).toBe("missing");
 });
 it("identifies itemized Better Work Order Items and rejects unitemized summary",()=>{
  expect(isBetterWorkOrderItems("Better Work Order Items 11-06-2026.pdf")).toBe(true);
  expect(isBetterWorkOrderItems("Itemized Better Work Order Items.pdf")).toBe(true);
  expect(isBetterWorkOrderItems("Better_Work_Order_Items_Event_ID41622.pdf")).toBe(true);
  expect(isBetterWorkOrderItems("Better Work Orders Summary.pdf")).toBe(false);
  expect(isBetterWorkOrderItems("Work Order 8765.pdf")).toBe(false);
 });
 it("automatically locates a saved EOC ZIP layout and corresponding itemized utility report",()=>{
  const files=[
   base("eoc","Event Order Confirmation.pdf","eoc"),
   base("diagram","Hall AB Floor Layout.pdf","layout"),
   base("exhibitor-order","Better Work Order Items Event ID 41622.pdf","items"),
   base("exhibitor-order","Better Work Orders Summary.pdf","summary"),
   base("work-order","Better Work Order Items legacy.pdf","legacy"),
   base("exhibitor-order","Work Order 8765.pdf","individual"),
   {...base("exhibitor-order","Better Work Order Items archived.pdf","archived"),archived:true},
   base("exhibitor-order","Better Work Order Items unavailable.pdf","missing",false)
  ];
  const selected=linkedMapDocuments(files);
  expect(selected.layouts.map(f=>f.id)).toEqual(["layout"]);
  expect(selected.reports.map(f=>f.id)).toEqual(["items","legacy"]);
  expect(selected.reports.some(f=>f.id==="summary")).toBe(false);
 });
});
