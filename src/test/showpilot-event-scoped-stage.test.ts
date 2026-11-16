import {describe,expect,it} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
 stageEventIdentity,eventStageKey,stageHeaderForEvent,
 type LinkedStageEvent
} from "@/lib/showpilot-event-stage";
import {DeckPlanner} from "@/components/deck-planner/planner";

const aka:LinkedStageEvent={
 key:"event:38174",eventId:"38174",showName:"AKA Sorority Cluster Conference",
 showDate:"2026-11-21",startDate:"2026-11-20"
};
const sneaker:LinkedStageEvent={
 key:"event:41193",eventId:"41193",showName:"Sneaker Con",
 showDate:"2026-12-04",startDate:"2026-12-03"
};

describe("Stage & Deck Planner is isolated to the selected Event ID",()=>{
 it("gives distinct events non-overlapping keys for all persisted stage assets",()=>{
  for(const part of ["stages","app","extras","plans","layout"] as const){
   expect(eventStageKey(aka,part)).not.toBe(eventStageKey(sneaker,part));
   expect(eventStageKey(aka,part)).toContain("38174");
   expect(eventStageKey(sneaker,part)).toContain("41193");
  }
 });
 it("uses stable numeric event identity if the title or catalog key is revised",()=>{
  const altered={...aka,key:"new-catalog-key",showName:"AKA Cluster 2026 (revised)"};
  expect(stageEventIdentity(aka)).toBe(stageEventIdentity(altered));
  expect(eventStageKey(aka,"stages")).toBe(eventStageKey(altered,"stages"));
 });
 it("uses distinct real record keys for ID-less saved shows and refuses missing identity",()=>{
  const first={...aka,eventId:"",key:"imported:show-one"};
  const second={...aka,eventId:"",key:"imported:show-two"};
  expect(eventStageKey(first,"stages")).not.toBe(eventStageKey(second,"stages"));
  expect(()=>eventStageKey({...first,key:""},"stages")).toThrow(/Select a saved Events record/);
  expect(()=>eventStageKey({...first,key:"__proto__"},"stages")).toThrow();
 });
 it("pre-populates event name, show date, and first event date as Build By",()=>{
  expect(stageHeaderForEvent(aka)).toEqual({
   eventName:"AKA Sorority Cluster Conference",
   showDate:"2026-11-21",buildByDate:"2026-11-20"
  });
  expect(stageHeaderForEvent(sneaker)).toEqual({
   eventName:"Sneaker Con",showDate:"2026-12-04",buildByDate:"2026-12-03"
  });
  expect(stageHeaderForEvent({...aka,startDate:undefined}).buildByDate).toBe("2026-11-21");
 });
 it("separates stage settings, placements and named plans across event switches/restarts",()=>{
  const storage=new Map<string,string>();
  const save=(event:LinkedStageEvent,part:"stages"|"plans"|"layout"|"app",value:unknown)=>
   storage.set(eventStageKey(event,part),JSON.stringify(value));
  const load=(event:LinkedStageEvent,part:"stages"|"plans"|"layout"|"app")=>
   JSON.parse(storage.get(eventStageKey(event,part))??"null");
  save(aka,"stages",{s1:{width:24,length:16,manual:true,
   manualPieces:[{id:"p0",kind:"holder",capacity:3,axis:"x",x:0,y:0,w:12,h:8}]}});
  save(aka,"plans",[{name:"Main stage 2026"}]);
  save(aka,"layout",{positions:{s1:{x:36,y:20}},rotations:{s1:true}});
  save(aka,"app",{eventName:aka.showName,showDate:aka.showDate,buildByDate:aka.startDate});
  expect(load(sneaker,"stages")).toBeNull();
  expect(load(sneaker,"plans")).toBeNull();
  save(sneaker,"stages",{s1:{width:16,length:8,stageName:"Sneaker main"}});
  expect(load(aka,"stages").s1.width).toBe(24);
  expect(load(aka,"stages").s1.manualPieces[0].id).toBe("p0");
  expect(load(aka,"layout").positions.s1).toEqual({x:36,y:20});
  expect(load(sneaker,"stages").s1.width).toBe(16);
  expect(load(sneaker,"app")).toBeNull();
 });
 it("renders selected event header and first-day build date in the real planner",()=>{
  const html=renderToStaticMarkup(createElement(DeckPlanner,{event:aka}));
  expect(html).toContain("AKA Sorority Cluster Conference");
  expect(html).toContain("38174");
  expect(html).toContain("2026-11-21");
  expect(html).toContain("2026-11-20");
  expect(html).toContain("Stage layouts and named plans are saved for this event only");
 });
 it("guards persistence wiring against accidental global keys in active event code",()=>{
  const file=readFileSync(resolve(process.cwd(),"src/components/deck-planner/planner.tsx"),"utf8");
  const events=readFileSync(resolve(process.cwd(),"src/components/showpilot-events-panel.tsx"),"utf8");
  const link=readFileSync(resolve(process.cwd(),"src/components/work-tools.tsx"),"utf8");
  expect(file).toContain("writeSavedStage(stageStoreKey,stageId");
  expect(file).toContain("manualPieces:manual?pieces:[]");
  expect(file).toContain("if(s.manual===true){"); // even when all pieces were removed
  expect(file).not.toContain("if(s.manual===true&&restored.length)");
  expect(file).toContain("writeStored(keys.app");
  expect(file).toContain("writeStored(keys.plans");
  expect(file).toContain("takeSnapshot(keys)");
  expect(file).toContain("localStorage.removeItem(keys.stages)");
  expect(file).not.toContain("localStorage.removeItem(STAGE_STORE_KEY)");
  expect(events).toContain("show?stagePlanner?.(show)");
  expect(link).toContain("<DeckPlanner event={show}/>");
 });
});
