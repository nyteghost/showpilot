import { describe,it,expect } from "vitest";
import {detectAiProvider} from "@/lib/showpilot-ai-providers";
import {taskContext,validateTaskResponse} from "@/lib/showpilot-ai-tasks";
import type {EventEntry} from "@/lib/work-tools";
const events:EventEntry[]=[
 {date:"2026-10-12",space:"Hall A",title:"Bridal Expo",code:"S",start:480,end:1020},
 {date:"2026-10-12",space:"BallRoom A",title:"Company Dinner",code:"MI",start:600,end:1200},
 {date:"2026-10-13",space:"Hall A",title:"Tuesday Event",code:"S",start:480,end:1020},
 {date:"2026-10-12",space:"CEPAC Theatre",title:"Not our venue",code:"S",start:600,end:800},
];
describe("ShowPilot AI provider identification",()=>{
 it("identifies clear provider prefixes without contacting services",()=>{
  expect(detectAiProvider("sk-ant-api03-FAKE").provider).toBe("anthropic");
  expect(detectAiProvider("gsk_FAKE").provider).toBe("groq");
  expect(detectAiProvider("sk-or-FAKE").provider).toBe("openrouter");
  expect(detectAiProvider("sk-proj-FAKE").provider).toBe("openai");
  expect(detectAiProvider("AIzaFAKE").provider).toBe("google");
 });
 it("does not guess a generic sk- key",()=>expect(detectAiProvider("sk-ambiguous").certainty).toBe("ambiguous"));
});
describe("ShowPilot local/online AI safety",()=>{
 it("sends only one day of scoped venue events without employees",()=>{
  const c=taskContext({date:"2026-10-12",entries:events});
  expect(c.events).toHaveLength(2);
  expect(JSON.stringify(c)).not.toContain("CEPAC");
  expect(c.surroundingEvents.currentWeekOtherDates.map(e=>e.title)).toContain("Tuesday Event");
 });
 it("requires valid room/day/section and a supported explanation",()=>{
  const c=taskContext({date:"2026-10-12",entries:events});
  const ok={date:c.date,room:"Hall A",section:"HALLS",task:"Verify stage riser layout",reason:"Stage needs could vary; confirm with show manager.",evidence:["Bridal Expo"]};
  const accepted=validateTaskResponse({suggestions:[ok,{...ok,room:"CEPAC Theatre"},{...ok,date:"2026-10-13"},{...ok,section:"BALLROOM"}]},c,"local");
  expect(accepted).toHaveLength(1);expect(accepted[0]?.task.text).toBe("Verify stage riser layout");
 });
 it("rejects malformed provider output rather than adding tasks",()=>{
  const c=taskContext({date:"2026-10-12",entries:events});
  expect(()=>validateTaskResponse({suggestions:"bad"},c,"online")).toThrow();
 });
});


describe("ShowPilot AI selected period with adjacent-week context",()=>{
 const schedule:EventEntry[]=[
   {date:"2026-11-02",space:"Hall A",title:"Previous Show",code:"MO",start:540,end:660},
   {date:"2026-11-09",space:"Hall A",title:"Current Setup",code:"MI",start:480,end:600},
   {date:"2026-11-10",space:"BallRoom ABE",title:"Current Ballroom",code:"S",start:620,end:820},
   {date:"2026-11-16",space:"Hall A",title:"Next Show",code:"MI",start:600,end:900},
   {date:"2026-11-18",space:"CEPAC Theatre",title:"Other Venue",code:"S",start:600,end:900},
   {date:"2026-11-25",space:"Hall A",title:"Too Far Away",code:"S",start:600,end:900},
 ];
 it("includes one week before and after a selected week, excluding the other venue and distant dates",()=>{
   const ctx=taskContext({date:"2026-11-09",dates:["2026-11-09","2026-11-10"],entries:schedule});
   expect(ctx.events.map(e=>e.title)).toEqual(["Current Setup","Current Ballroom"]);
   expect(ctx.surroundingEvents.previousWeek.map(e=>e.title)).toEqual(["Previous Show"]);
   expect(ctx.surroundingEvents.followingWeek.map(e=>e.title)).toEqual(["Next Show"]);
   expect(JSON.stringify(ctx)).not.toContain("Other Venue");
   expect(JSON.stringify(ctx)).not.toContain("Too Far Away");
 });
 it("refuses suggestions dated in adjacent weeks or assigned to a room only booked on another day",()=>{
   const ctx=taskContext({date:"2026-11-09",dates:["2026-11-09","2026-11-10"],entries:schedule});
   const raw=(date:string,room:string)=>({date,room,section:"HALLS",task:"Verify equipment before move in",
     reason:"Incoming show needs verification of available work areas.",evidence:["Current Setup"]});
   const good=raw("2026-11-09","Hall A");
   const invalid=raw("2026-11-16","Hall A");
   const wrongDay=raw("2026-11-10","Hall A");
   expect(validateTaskResponse({suggestions:[invalid,wrongDay,good]},ctx,"local").map(s=>s.task.date)).toEqual(["2026-11-09"]);
 });
});
