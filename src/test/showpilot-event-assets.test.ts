import {describe,expect,it} from "vitest";
import {extractEocFocus,guessEventFileKind,validateEventFile} from "@/lib/showpilot-event-assets";

describe("Event document classification",()=>{
 it("recognizes work orders, EOCs and event diagrams",()=>{
  expect(guessEventFileKind("Event_Order_Confirmation_2026.pdf")).toBe("eoc");
  expect(guessEventFileKind("EOC-42389.pdf")).toBe("eoc");
  expect(guessEventFileKind("WO 12345.pdf")).toBe("exhibitor-order");
  expect(guessEventFileKind("utility-order-543.xlsx")).toBe("exhibitor-order");
  expect(guessEventFileKind("Hall AB floor plan.pdf")).toBe("diagram");
  expect(guessEventFileKind("CGC-layout.dwg")).toBe("diagram");
  expect(guessEventFileKind("additional-contract.docx")).toBe("other");
 });
 it("refuses unknown extensions and oversized files before uploading",()=>{
  expect(()=>validateEventFile({name:"workorder.exe",size:50})).toThrow(/Unsupported/);
  expect(()=>validateEventFile({name:"event.pdf",size:26*1024*1024})).toThrow(/25 MB/);
  expect(()=>validateEventFile({name:"floorplan.png",size:1000})).not.toThrow();
 });
});
describe("EOC focused reader",()=>{
 it("only returns Event Notes, Engineering and Utility and cites document page",()=>{
  const pages=[
   "Event Order Confirmation\nEvent Notes\nPlease confirm move-in times.\nKeep service door clear.\nEngineering\nVerify stage legs and ramps.\nUtility\nBooth 104 needs 208V power.\nBilling\n$500 due",
   "Event Notes: Client requests early access.\nEngineering: Verify ballroom airwalls.\nCatering\nLunch order\nUtility\nConfirm electrical service at booth 220."
  ];
  const result=extractEocFocus(pages);
  expect(result.map(r=>[r.section,r.page])).toEqual([
   ["Event Notes",1],["Engineering",1],["Utility",1],
   ["Event Notes",2],["Engineering",2],["Utility",2]
  ]);
  expect(result.find(r=>r.section==="Engineering"&&r.page===2)?.text).toContain("airwalls");
  expect(JSON.stringify(result)).not.toContain("$500 due");
  expect(JSON.stringify(result)).not.toContain("Lunch order");
 });
 it("does not invent missing EOC sections for scanned or unrelated pages",()=>{
  expect(extractEocFocus(["Scanned page without any extractable section titles"])).toEqual([]);
 });
});
