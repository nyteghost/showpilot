import {describe,expect,it} from "vitest";
import {postConShows,postConShowsFromReportRows,POSTCON_CATALOG_KEY,completedShowsLastMonth,upcomingPreConShows,mergePostConShows} from "@/lib/showpilot-postcon";
import {encodePreCon,decodePreCon,preConNoteTitle,emptyPreCon} from "@/lib/showpilot-precon";
import type {EventEntry,EventRow} from "@/lib/work-tools";

const entry=(date:string,title:string,eventId:string,space="Hall AB"):EventEntry=>
 ({date,title,eventId,space,code:"S",start:600,end:960});

describe("Pre-Con and Post-Con 30-day show dropdowns",()=>{
 const today="2026-11-05";
 it("includes today through day 29, but excludes day 30 and earlier shows",()=>{
  const shows=postConShows([
   entry("2026-11-04","Yesterday","old"),entry("2026-11-05","Today","today"),
   entry("2026-12-04","Final included day","last"),entry("2026-12-05","Day 30","outside"),
   entry("2026-11-12","Cobb Energy event","other","Cobb Energy Performing Arts Centre")
  ]);
  expect(upcomingPreConShows(shows,today).map(s=>s.showName)).toEqual(["Today","Final included day"]);
  expect(upcomingPreConShows(shows,today).every(s=>s.rooms==="Hall A, Hall B")).toBe(true);
 });
 it("includes multi-day shows beginning inside 30 days even when they end later",()=>{
  const shows=postConShows([
   entry("2026-11-30","Long show","multi"),entry("2026-12-08","Long show","multi"),
   entry("2026-10-01","Old event","old")
  ]);
  expect(shows.find(s=>s.eventId==="multi")).toMatchObject({startDate:"2026-11-30",showDate:"2026-12-08"});
  expect(upcomingPreConShows(shows,today).map(s=>s.showName)).toEqual(["Long show"]);
 });
 it("shows only the previous 30 calendar days in Post-Con",()=>{
  const shows=postConShows([
   entry("2026-10-06","Too old","old"),
   entry("2026-10-07","First included day","first"),
   entry("2026-11-05","Last included day","last"),
   entry("2026-11-06","Tomorrow","future")
  ]);
  expect(completedShowsLastMonth(shows,today).map(s=>s.showName)).toEqual(["Last included day","First included day"]);
 });
 it("preserves date boundaries from older saved catalogs",()=>{
  const previous=postConShows([entry("2026-11-05","Week-long expo","42")]);
  const latest=postConShows([entry("2026-11-09","Week-long expo","42")]);
  const saved=mergePostConShows(previous,latest);
  expect(saved).toHaveLength(1);
  expect(saved[0]?.showDate).toBe("2026-11-09");
  expect(saved[0]?.startDate).toBe("2026-11-05");
 });
});
describe("Pre-Con notes in existing local memory",()=>{
 const draft={...emptyPreCon("2026-11-09"),showName:"Front Row Card Show",eventId:"43210",
  rooms:"Hall A, Hall B",overview:"Confirm load-in door and electrical needs.",
  staffing:"Verify required AM and PM coverage.",stage:"Confirm no stage needed.",
  floor:"Verify Hall AB map and utility placement.",followUp:"Contact event lead."};
 it("roundtrips all independent pre-show fields as structured SQLite note content",()=>{
  expect(decodePreCon(encodePreCon(draft))).toEqual(draft);
  expect(preConNoteTitle(draft)).toBe("Pre-Con: 2026-11-09 | 43210");
 });
 it("rejects CEPAC and notes with no content rather than creating records",()=>{
  expect(()=>encodePreCon({...draft,rooms:"CEPAC"})).toThrow(/Cobb Convention/);
  expect(()=>encodePreCon({...draft,overview:"",staffing:"",stage:"",floor:"",followUp:""})).toThrow(/at least one/);
  expect(()=>decodePreCon("not a Pre-Con note")).toThrow(/not a ShowPilot/);
 });
});


describe("Pre-Con and Post-Con group by real Event names, never function descriptions",()=>{
 const row=(date:string,event:string,description:string,eventId:string,space:string):EventRow=>({
  date,event,description,eventId,space,usage:"",level:2,start:"09:00 AM",end:"05:00 PM"
 });
 it("lists each actual show once across its function rows, rooms and dates",()=>{
  const rows=[
   row("2026-11-03","Coldwell Banker Realty Atlanta Unlocking Home Parties","Vendor Load-In/Marquee Letters drop-off","42389","Ballroom ABE (BRABE)"),
   row("2026-11-04","Coldwell Banker Realty Atlanta Unlocking Home Parties","Client Move-In","42389","Ballroom ABE (BRABE)"),
   row("2026-11-05","Coldwell Banker Realty Atlanta Unlocking Home Parties","Program","42389","Ballroom ABE (BRABE)"),
   row("2026-11-05","Coldwell Banker Realty Atlanta Unlocking Home Parties","Breakout Session","42389","Ballroom ABE (BRABE)"),
   row("2026-11-09","Front Row Card Show","Move In","42611","Exhibit Hall AB (EXAB)"),
   row("2026-11-10","Front Row Card Show","General Session","42611","Exhibit Hall AB (EXAB)"),
  ];
  const shows=postConShowsFromReportRows(rows);
  expect(shows).toHaveLength(2);
  expect(shows.find(s=>s.eventId==="42389")).toMatchObject({
    showName:"Coldwell Banker Realty Atlanta Unlocking Home Parties",
    startDate:"2026-11-03",showDate:"2026-11-05",rooms:"BallRoom A, BallRoom B, BallRoom E"
  });
  expect(shows.find(s=>s.eventId==="42611")).toMatchObject({
    showName:"Front Row Card Show",startDate:"2026-11-09",showDate:"2026-11-10",rooms:"Hall A, Hall B"
  });
  expect(shows.some(s=>["Program","Move In","Breakout Session"].includes(s.showName))).toBe(false);
 });
 it("does not convert unnamed functions into fake shows",()=>{
  const rows=[
   row("2026-11-05","","Move In","42389","Ballroom ABE (BRABE)"),
   row("2026-11-05","Program","Program","42389","Ballroom ABE (BRABE)"),
   row("2026-11-05","","General Session","42389","Ballroom ABE (BRABE)"),
   row("2026-11-08","Leadership Cobb","General Session","42421","Ballroom A (BRA)"),
   row("2026-11-08","Cobb Energy Show","Program","42422","Cobb Energy Performing Arts Centre"),
  ];
  expect(postConShowsFromReportRows(rows).map(s=>s.showName)).toEqual(["Leadership Cobb"]);
 });
 it("uses a clean v2 persistent catalog, not the old function-level v1 key",()=>{
   expect(POSTCON_CATALOG_KEY).toBe("showpilot:postcon:known-shows:v2");
 });
});
