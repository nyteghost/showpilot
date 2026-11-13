import {describe,expect,it} from "vitest";
import type {PostConShow} from "@/lib/showpilot-postcon";
import {combineTodaySources,showHasActivityOnDay} from "@/lib/showpilot-today-sources";
import {
 cgcVenueClock,parseShowTimeWindows,showPhaseForToday,
 scopeDatedRuleFindings,showHasOvernightActivity
} from "@/lib/showpilot-today-visibility";

const shows:PostConShow[]=[
 {key:"id:nov13",eventId:"41001",showName:"Morning Banquet",
  rooms:"BallRoom A",startDate:"2026-11-12",showDate:"2026-11-13"},
 {key:"id:nov13evening",eventId:"41002",showName:"Evening Gala",
  rooms:"BallRoom B",startDate:"2026-11-13",showDate:"2026-11-13"},
 {key:"id:dateonly",eventId:"41003",showName:"Unknown Schedule",
  rooms:"Hall C",startDate:"2026-11-13",showDate:"2026-11-13"}
];
const activity=(id:string,name:string,details:string[],date="2026-11-13")=>({
 date,eventId:id,showName:name,rooms:["BallRoom A"],
 source:"event-schedule" as const,details
});
describe("Today separates active, upcoming, finished and date-only CGC shows",()=>{
 it("never counts morning-ended functions as active in the afternoon",()=>{
  const joined=combineTodaySources(shows,[
   activity("41001","Morning Banquet",["MI 6a–7a","S 9a–11a","MO 11a–12p"])
  ]);
  const show=joined.shows.find(s=>s.eventId==="41001")!;
  expect(showHasActivityOnDay(show,"2026-11-13",joined)).toBe(true);
  expect(showPhaseForToday(show,"2026-11-13",13*60,joined)).toBe("finished");
  expect(showPhaseForToday(show,"2026-11-13",10*60,joined)).toBe("in-progress");
  expect(showPhaseForToday(show,"2026-11-13",7*60+30,joined)).toBe("upcoming");
 });
 it("keeps tonight's bookings upcoming rather than currently active",()=>{
  const joined=combineTodaySources(shows,[
   activity("41002","Evening Gala",["S 6:30p–10:30p"])
  ]);
  const show=joined.shows.find(s=>s.eventId==="41002")!;
  expect(showPhaseForToday(show,"2026-11-13",13*60,joined)).toBe("upcoming");
  expect(showPhaseForToday(show,"2026-11-13",20*60,joined)).toBe("in-progress");
 });
 it("never infers present occupancy from a catalog booking range or a start-only activity",()=>{
  const joined=combineTodaySources(shows,[
   activity("41003","Unknown Schedule",["MI 7:30a"])
  ]);
  const show=joined.shows.find(s=>s.eventId==="41003")!;
  expect(showPhaseForToday(show,"2026-11-13",13*60,joined)).toBe("time-unverified");
  expect(showPhaseForToday(shows[1]!,"2026-11-13",13*60,joined)).toBe("time-unverified");
 });
 it("keeps last night's overnight work active before its actual end",()=>{
  const joined=combineTodaySources(shows,[
   activity("41001","Morning Banquet",["MO 11p–2a"],"2026-11-12")
  ]);
  const show=joined.shows.find(s=>s.eventId==="41001")!;
  expect(showHasOvernightActivity(show,"2026-11-13",90,joined)).toBe(true);
  expect(showPhaseForToday(show,"2026-11-13",90,joined)).toBe("in-progress");
  expect(showHasOvernightActivity(show,"2026-11-13",180,joined)).toBe(false);
 });
 it("recognizes the approved CGC time zone near a UTC date rollover",()=>{
  const clock=cgcVenueClock(new Date("2026-11-14T03:15:00Z"));
  expect(clock).toEqual({date:"2026-11-13",minute:22*60+15});
 });
 it("rejects unbounded, missing, or malformed time intervals",()=>{
  expect(parseShowTimeWindows(["MI 7a","S 9a–1p","MO 2p–5p"])).toEqual([
   {start:540,end:780},{start:840,end:1020}
  ]);
  expect(parseShowTimeWindows(["MI 25a–4p","S 9:77a–4p","MI 4p–4p"]))
   .toEqual([{start:960,end:2400}]); // Explicit same-clock end = overnight, NOT instantaneous.
 });
});

describe("Today excludes past and future planning warnings by default",()=>{
 it("keeps Nov 5 historical and Nov 20 future notices out of Nov 13 live rules",()=>{
  const historical="2026-11-05 (engineering-workbook): ARMAC Luncheon and another booking share rooms";
  const today="2026-11-13 (engineering-workbook): Tower Leadership Dental overlapping configurations";
  const future="2026-11-20 (event-schedule): AKA Sorority Conference hall change";
  const transitionDue="Inferred ballroom change: After 2026-11-12 ends; before 2026-11-13 next setup";
  const transitionLater="Inferred ballroom change: After 2026-11-19 ends; before 2026-11-20 next setup";
  expect(scopeDatedRuleFindings([historical,today,future,transitionDue,transitionLater],
   "2026-11-13")).toEqual({
    today:[today,transitionDue],
    past:[historical],
    future:[future,transitionLater]
  });
 });
 it("retains undated warnings in Today because their applicability is unknown",()=>{
  expect(scopeDatedRuleFindings(["Saved workbook has missing date cells"],"2026-11-13"))
   .toEqual({today:["Saved workbook has missing date cells"],past:[],future:[]});
 });
});
