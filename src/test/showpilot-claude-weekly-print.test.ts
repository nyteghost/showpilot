import {describe,it,expect} from "vitest";
import {sharedSpaces,weekLayouts,type EventEntry} from "../lib/work-tools";
import {printableWeek} from "../lib/showpilot-week-print";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const entry=(changes:Partial<EventEntry>={}):EventEntry=>({
 date:"2026-11-16",space:"Hall D",eventId:"991",showName:"Fictional Lantern Conference",
 title:"Fictional Lantern Conference",code:"MI",start:720,end:1020,...changes
});
describe("Claude shared-room notices and CGC weekly print",()=>{
 it("does not flag setup, function and move-out of the same Event ID as competing shows",()=>{
  const entries=[
   entry({title:"Exhibitor Move-In",code:"MI"}),
   entry({title:"Doors Open",code:"S",start:1050,end:1200}),
   entry({title:"Vendor Move Out",code:"MO",start:1210,end:1320})
  ];
  expect(sharedSpaces(entries)).toEqual([]);
  const printed=printableWeek(entries,[],"2026-11-16");
  expect(printed.layout.rows["Hall D"]?.[0]?.text).toContain("Fictional Lantern Conference");
  expect(printed.layout.rows["Hall D"]?.[0]?.text).not.toContain("Doors Open");
  expect(printed.unverifiedNames).toBe(0);
 });
 it("flags truly separate Event IDs by show name, not by activity",()=>{
  const found=sharedSpaces([
   entry({eventId:"991",title:"Load In"}),
   entry({eventId:"992",showName:"Fictional Harvest Expo",title:"General Session"})
  ]);
  expect(found).toHaveLength(1);
  expect(found[0]).toContain("Fictional Lantern Conference");
  expect(found[0]).toContain("Fictional Harvest Expo");
  expect(found[0]).not.toContain("General Session");
 });
 it("keeps unverified names printable only as explicit VERIFY placeholders",()=>{
  const unknown=entry({eventId:"993",showName:undefined,title:"Vendor Load-In"});
  const preview=printableWeek([unknown],[],"2026-11-16");
  expect(preview.unverifiedNames).toBe(1);
  expect(preview.layout.rows["Hall D"]?.[0]?.text).toContain("VERIFY parent event name (Event ID 993)");
  expect(sharedSpaces([unknown,entry()])).toHaveLength(0);
 });
 it("prevents printing a different week or an unmapped other-venue room",()=>{
  expect(()=>printableWeek([entry({date:"2026-11-23"})],[],"2026-11-16")).toThrow(/selected week/);
  expect(()=>printableWeek([entry({space:"CEPAC Hall A"})],[],"2026-11-16")).toThrow(/Unverified CGC room/);
  expect(()=>printableWeek([entry()],[],"2026-11-17")).toThrow(/Monday/);
 });
 it("hides the duplicate stage SVG on screen and gives print diagrams explicit colors",()=>{
  const css=readFileSync(resolve(process.cwd(),"src/styles.css"),"utf8");
  expect(css).toContain(".deck-planner .print-only { display:none !important; }");
  expect(css).toContain(".deck-planner .print-layout-outline { fill:#ffffff");
  expect(css).toContain("body:has(> .sp-week-print-sheet) > #root");
 });
});
