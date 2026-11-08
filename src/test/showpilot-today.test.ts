import {describe,expect,it} from "vitest";
import type {PostConShow} from "@/lib/showpilot-postcon";
import {airwallsForEvent,addIsoDays,cgcShowOnDay,cgcShowsForWeek,daysOfWeek,findAirwallPhrases,
 mondayFor,scheduledWallChanges,todayIso,wallTaskLabel} from "@/lib/showpilot-today";

const shows:PostConShow[]=[
 {key:"id:50011",eventId:"50011",showName:"Convention Expo",startDate:"2026-11-06",showDate:"2026-11-09",rooms:"Hall A, Hall B"},
 {key:"id:50012",eventId:"50012",showName:"Sunday Awards",startDate:"2026-11-08",showDate:"2026-11-08",rooms:"BallRoom A"},
 {key:"id:99999",eventId:"99999",showName:"CEPAC Concert",startDate:"2026-11-08",showDate:"2026-11-08",rooms:"CEPAC"}
];

describe("Today local CGC event calendar",()=>{
 it("shows Sunday as part of its Monday–Sunday week, independent of DST",()=>{
  expect(mondayFor("2026-11-08")).toBe("2026-11-02");
  expect(daysOfWeek("2026-11-02")).toEqual([
   "2026-11-02","2026-11-03","2026-11-04","2026-11-05",
   "2026-11-06","2026-11-07","2026-11-08"
  ]);
  expect(mondayFor("2026-03-08")).toBe("2026-03-02");
  expect(addIsoDays("2026-12-28",7)).toBe("2027-01-04");
 });
 it("uses the work PC's local calendar date, not a UTC conversion",()=>{
  expect(todayIso(new Date(2026,10,8,0,20))).toBe("2026-11-08");
 });
 it("uses saved inclusive show date ranges without mixing in CEPAC",()=>{
  expect(cgcShowsForWeek(shows,"2026-11-02").map(s=>s.eventId)).toEqual(["50011","50012"]);
  expect(shows.filter(s=>cgcShowOnDay(s,"2026-11-08")).map(s=>s.eventId)).toEqual(["50011","50012"]);
  expect(shows.filter(s=>cgcShowOnDay(s,"2026-11-09")).map(s=>s.eventId)).toEqual(["50011"]);
  expect(cgcShowOnDay(shows[0]!,"2026-11-05")).toBe(false);
 });
});

describe("Today airwall evidence requires a real source",()=>{
 it("surfaces EOC airwall move instructions with source filename and PDF page",()=>{
  const result=airwallsForEvent([{id:"eoc-01",name:"Expo-EOC.pdf",eocExcerpts:[
   {section:"Engineering",page:3,text:"Move airwall between Ballroom A and B before Friday setup."}
  ]}]);
  expect(result.state).toBe("action");
  expect(result.findings).toMatchObject([{kind:"action",source:"Expo-EOC.pdf",page:3,fileId:"eoc-01"}]);
 });
 it("can show room-change hints from a ZIP even when no EOC text was indexed",()=>{
  const result=airwallsForEvent([],[{topic:"Room Changes",source:"EOC Notes.txt",text:"Airwall between Ballroom C and D: open for awards"}]);
  expect(result.state).toBe("action");
  expect(result.findings[0]?.source).toBe("EOC Notes.txt");
 });
 it("does not equate missing text with no required wall movements",()=>{
  expect(airwallsForEvent([]).state).toBe("unknown");
  expect(airwallsForEvent([{id:"1",name:"scanned.pdf",eocExcerpts:[]}]).state).toBe("unknown");
  expect(airwallsForEvent([{id:"2",name:"eoc.pdf",eocExcerpts:[
   {section:"Event Notes",page:1,text:"Airwalls are shown on the floor plan."}
  ]}]).state).toBe("review");
 });
 it("distinguishes an explicit negative EOC note from a requested movement",()=>{
  const result=airwallsForEvent([{id:"1",name:"eoc.pdf",eocExcerpts:[
   {section:"Engineering",page:2,text:"No airwall movement is required for this setup."}
  ]}]);
  expect(result.state).toBe("explicit-none");
  expect(result.findings[0]?.kind).toBe("no-change");
  const conflicts=airwallsForEvent([{id:"1",name:"eoc.pdf",eocExcerpts:[
   {section:"Engineering",page:2,text:"No airwall movement is required for Friday.\nMove airwall for Saturday."}
  ]}]);
  expect(conflicts.state).toBe("action");
  expect(findAirwallPhrases("No airwall movement is required","EOC").map(f=>f.kind)).toEqual(["no-change"]);
 });
 it("recognizes actual dated Make instructions generated from the Event Schedule",()=>{
  const tasks=[
   {date:"2026-11-08",section:"BALLROOM" as const,text:"Make ABE/CDFG"},
   {date:"2026-11-08",section:"BALLROOM" as const,text:"Make full ballroom"},
   {date:"2026-11-08",section:"HALLS" as const,text:"Make Hall AB"},
   {date:"2026-11-07",section:"BALLROOM" as const,text:"Make ABE"},
   {date:"2026-11-08",section:"BALLROOM" as const,text:"Airwalls shown on plan"}
  ];
  expect(scheduledWallChanges(tasks,"2026-11-08").map(t=>t.text))
   .toEqual(["Make ABE/CDFG","Make full ballroom","Make Hall AB"]);
  expect(wallTaskLabel(tasks[0]!)).toBe("Ballrooms — Make ABE/CDFG");
 });
 it("does not invent a dated move from an undated ZIP note",()=>{
  const tasks=[{date:"2026-11-08",section:"BALLROOM" as const,text:"ABE"},
   {date:"2026-11-09",section:"HALLS" as const,text:"AB"},
   {date:"2026-11-08",section:"HALLS" as const,text:"Stage build"}];
  expect(scheduledWallChanges(tasks,"2026-11-08")).toHaveLength(1);
  expect(wallTaskLabel(tasks[0]!)).toBe("Ballrooms A + B + E");
 });
});
