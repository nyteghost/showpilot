import {describe,it,expect} from "vitest";
import {attachShowNames,assertNamedScheduleEntries,summarizeEvents,weekLayouts,
 type EventRow,type EventEntry} from "../lib/work-tools";

const row=(day:string,event:string,id:string,description:string,space:string):EventRow=>({
 level:2,date:day,event,eventId:id,description,space,
 usage:/move[\s-]*in/i.test(description)?"Move In":/move[\s-]*out/i.test(description)?"Move Out":"Event (Evt)",
 start:"08:00 AM",end:"04:00 PM"
});
describe("every engineering schedule cell has the parent show name",()=>{
 it("uses booked show instead of move-in or exhibitor function labels",()=>{
  const rows=[
   row("2026-11-16","Paradies Lagardere Annual Management Seminar 2026","39702","Exhibitor Move-In","Exhibit Hall D (EXD)"),
   row("2026-11-17","Paradies Lagardere Annual Management Seminar 2026","39702","Exhibitor Move-Out","Exhibit Hall D (EXD)"),
   row("2026-11-20","AKA Sorority Cluster Conference","38174","Move In Exhibitors","Exhibit Hall D (EXD)")
  ];
  const entries=summarizeEvents(rows);
  assertNamedScheduleEntries(entries);
  const weeks=weekLayouts(entries);
  expect(weeks).toHaveLength(1);
  expect(weeks[0]!.rows["Hall D"]![0]!.text).toContain("Paradies Lagardere Annual Management Seminar 2026");
  expect(weeks[0]!.rows["Hall D"]![1]!.text).toContain("Paradies Lagardere Annual Management Seminar 2026");
  expect(weeks[0]!.rows["Hall D"]![4]!.text).toContain("AKA Sorority Cluster Conference");
  expect(weeks[0]!.rows["Hall D"]![4]!.text).not.toMatch(/^Move In Exhibitors/);
 });
 it("repairs older function-named entries from the original event ID",()=>{
  const old:EventEntry={date:"2026-11-16",space:"Hall D",code:"Exmi",
   start:480,end:960,title:"Exhibitor Move-In",eventId:"39702"};
  expect(()=>assertNamedScheduleEntries([old])).toThrow(/parent show/);
  const fixed=attachShowNames([old],[
   row("2026-11-16","Paradies Lagardere Annual Management Seminar 2026","39702","Exhibitor Move-In","Hall D")
  ]);
  expect(fixed[0]!.showName).toBe("Paradies Lagardere Annual Management Seminar 2026");
  expect(fixed[0]!.title).toBe(fixed[0]!.showName);
  expect(()=>assertNamedScheduleEntries(fixed)).not.toThrow();
 });
 it("refuses an unresolved anonymous activity instead of printing a function title",()=>{
  const unknown:EventEntry={date:"2026-11-20",space:"Hall D",code:"MI",
   start:480,end:960,title:"Move In Exhibitors",eventId:"99999"};
  expect(()=>assertNamedScheduleEntries([unknown])).toThrow(/Event ID 99999/);
 });
});
