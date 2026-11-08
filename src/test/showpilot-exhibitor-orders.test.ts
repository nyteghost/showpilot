import {describe,expect,it} from "vitest";
import type {PostConShow} from "@/lib/showpilot-postcon";
import {extractOrderEventIdEvidence,matchExhibitorOrder} from "@/lib/showpilot-exhibitor-orders";

const catalog:PostConShow[]=[
 {key:"id:41622",eventId:"41622",showName:"Hospitality Industry Ministries",
  startDate:"2026-11-06",showDate:"2026-11-06",rooms:"BallRoom A, BallRoom B, BallRoom E"},
 {key:"id:51000",eventId:"51000",showName:"Front Row Card Show",
  startDate:"2026-11-07",showDate:"2026-11-08",rooms:"Hall A, Hall B"},
 {key:"id:99999",eventId:"99999",showName:"CEPAC Concert",
  startDate:"2026-11-08",showDate:"2026-11-08",rooms:"Cobb Energy Performing Arts Centre"}
];

describe("Work Orders import into individual Exhibitor Orders event folders",()=>{
 it("routes each document in a mixed-event upload using its own Event ID",()=>{
  const a=matchExhibitorOrder("Work Order 8762.pdf",
   "Work Order #8762\nBooth #307\nEvent ID: 41622\nHospitality Industry Ministries",catalog);
  const b=matchExhibitorOrder("Work Order 3921.pdf",
   "Order #: 3921\nEvent Number 51000\nBooth #12",catalog);
  expect(a).toMatchObject({status:"matched",eventId:"41622",show:{key:"id:41622"}});
  expect(b).toMatchObject({status:"matched",eventId:"51000",show:{key:"id:51000"}});
 });
 it("never treats a work order or booth number as the event ID",()=>{
  const found=matchExhibitorOrder("WO 41622.pdf",
   "Work Order #41622\nBooth 9999\nExhibitor Account #7777",catalog);
  expect(found.status).toBe("missing-id");
  expect(extractOrderEventIdEvidence("Order-41622.pdf","Order #41622")).toEqual([]);
 });
 it("allows explicit filename Event ID evidence, but keeps the source identifiable",()=>{
  const found=matchExhibitorOrder("Work Order Event ID#41622.pdf","",catalog);
  expect(found.status).toBe("matched");
  expect(found.evidence).toEqual([{value:"41622",source:"filename"}]);
 });
 it("does not silently assign conflicting event references to any show",()=>{
  const result=matchExhibitorOrder("Event ID 41622.pdf",
   "Event ID: 41622\nEvent ID: 51000",catalog);
  expect(result.status).toBe("conflicting-ids");
  expect(result.show).toBeUndefined();
 });
 it("does not redirect an unknown Event ID to the selected or similarly named show",()=>{
  const missing=matchExhibitorOrder("Work Order.pdf","Event #: 77777",catalog);
  expect(missing.status).toBe("unmatched-id");
  expect(missing.show).toBeUndefined();
 });
 it("refuses ambiguous duplicated catalog IDs and non-CGC event IDs",()=>{
  expect(matchExhibitorOrder("Order.pdf","Show ID 41622",
   [...catalog,{...catalog[0]!,key:"name:copy"}]).status).toBe("ambiguous-event");
  expect(matchExhibitorOrder("Order.pdf","Event ID 99999",catalog).status).toBe("unmatched-id");
 });
 it("recognizes event name and bracketed ID without using an invoice number",()=>{
  const match=matchExhibitorOrder("order.pdf",
   "Event Name: Hospitality Industry Ministries (41622)\nInvoice #98765",catalog);
  expect(match).toMatchObject({status:"matched",eventId:"41622"});
 });
});
