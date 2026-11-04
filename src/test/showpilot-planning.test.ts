import {describe,it,expect} from "vitest";
import {validatePlanningResponse,staffingPlanningContext} from "@/lib/showpilot-planning";
import {postConShows,mergePostConShows} from "@/lib/showpilot-postcon";
import type {EventEntry} from "@/lib/work-tools";

const stock={decks:72,one:4,two:8,three:8};
const suggestion=(extra:Record<string,unknown>={})=>({title:"Valid operational proposal",reason:"Verified against the supplied current constraints.",evidence:["Current reference"],...extra});
describe("validated local AI planning suggestions",()=>{
 it("accepts only stage dimensions the deterministic solver can build",()=>{
  const raw={recommendations:[
   suggestion({stage:{widthFt:8,lengthFt:8,heightIn:32,mostlyThree:false,allowTwo:true}}),
   suggestion({title:"Bad width",stage:{widthFt:5,lengthFt:5,heightIn:32}}),
   suggestion({title:"Unsafe height",stage:{widthFt:8,lengthFt:8,heightIn:70}}),
   suggestion({title:"Beyond inventory",stage:{widthFt:200,lengthFt:200,heightIn:32}})
  ]};
  const got=validatePlanningResponse(raw,"stage",{stock});
  expect(got).toHaveLength(1);
  expect(got[0]?.stage).toMatchObject({widthFt:8,lengthFt:8,heightIn:32});
 });
 it("floor recommendations may only point to existing unresolved booth questions",()=>{
  const input={recommendations:[
   suggestion({targetId:"q-123"}),
   suggestion({title:"Invented booth",targetId:"booth-not-in-report"})
  ]};
  const got=validatePlanningResponse(input,"floor",{unresolved:[{id:"q-123",booth:"101"}]});
  expect(got.map(s=>s.targetId)).toEqual(["q-123"]);
  expect(got[0]?.stage).toBeUndefined();
 });
 it("staff recommendations are limited to current rule-generated assignments",()=>{
  const context={assignments:[{date:"2026-11-02",name:"Alexis Albert"}]};
  const found=validatePlanningResponse({recommendations:[
   suggestion({staffName:"Alexis Albert",date:"2026-11-02"}),
   suggestion({title:"Unsupported person",staffName:"Outside contractor",date:"2026-11-02"}),
   suggestion({title:"Wrong day",staffName:"Alexis Albert",date:"2026-11-03"})
  ]},"staffing",context);
  expect(found).toHaveLength(1);
  expect(found[0]?.staffName).toBe("Alexis Albert");
 });
 it("rejects untrusted or inappropriate model responses",()=>{
  expect(()=>validatePlanningResponse({recommendations:"unknown"},"floor",{})).toThrow(/no valid/i);
  const found=validatePlanningResponse({recommendations:[suggestion({title:"Work in CEPAC",targetId:"q1"})]},"floor",{unresolved:[{id:"q1"}]});
  expect(found).toHaveLength(0);
 });
 it("uses CGC-only events for deterministic staffing context",()=>{
  const entries=[
   {date:"2026-11-02",space:"Hall A",title:"Annual expo",eventId:"100",code:"S",start:600,end:1200},
   {date:"2026-11-02",space:"Cobb Energy Performing Arts Centre",title:"Concert",eventId:"200",code:"S",start:600,end:1200}
  ] as EventEntry[];
  const context=staffingPlanningContext(entries,["2026-11-02"]);
  expect((context.events as Array<{title:string}>).some(e=>e.title==="Annual expo")).toBe(true);
  expect((context.events as Array<{title:string}>).some(e=>e.title==="Concert")).toBe(false);
  expect(Array.isArray(context.assignments)).toBe(true);
 });
});
describe("CGC post-con show catalog",()=>{
 it("selects final show date and rooms without including CEPAC",()=>{
  const events=[
   {date:"2025-10-10",space:"Hall A",eventId:"A1",title:"Technology Expo",code:"MI"},
   {date:"2025-10-12",space:"Hall B",eventId:"A1",title:"Technology Expo",code:"S"},
   {date:"2025-10-13",space:"Hall A",eventId:"A1",title:"Technology Expo",code:"MO"},
   {date:"2025-10-11",space:"CEPAC",eventId:"B2",title:"Concert",code:"S"},
  ] as EventEntry[];
  const shows=postConShows(events);
  expect(shows).toHaveLength(1);
  expect(shows[0]).toMatchObject({eventId:"A1",showDate:"2025-10-13",showName:"Technology Expo"});
  expect(shows[0]?.rooms).toContain("Hall A");
  expect(shows[0]?.rooms).toContain("Hall B");
 });
 it("deduplicates imported shows and keeps the most recent observed final date",()=>{
  const past=[{key:"id:A1",eventId:"A1",showName:"Expo",showDate:"2025-10-10",rooms:"Hall A"}];
  const next=[{key:"id:A1",eventId:"A1",showName:"Expo",showDate:"2025-10-12",rooms:"Hall A, Hall B"}];
  const both=mergePostConShows(past,next);
  expect(both).toHaveLength(1);
  expect(both[0]?.showDate).toBe("2025-10-12");
 });
});
