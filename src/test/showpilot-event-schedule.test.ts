import {describe,it,expect} from "vitest";
import {File as NodeFile} from "node:buffer";
import ExcelJS from "exceljs";
import {readShowPilotEventSchedulePages,eventScheduleDate,type ScheduleTextItem} from "@/lib/showpilot-event-schedule";
import {readEventSheet} from "@/lib/work-files";
import {summarizeEvents} from "@/lib/work-tools";
import {postConShowsFromReportRows} from "@/lib/showpilot-postcon";

const line=(...values:[number,string][]):ScheduleTextItem[]=>
 values.map(([x,str])=>({str,x,y:500}));
const header=line([80,"Start Time"],[170,"End Time"],[250,"Description"],[390,"Space"],
 [600,"Start Time - Event"],[700,"End Time - Event"],[800,"Event ID"],[880,"Status - Event"],[1010,"Contracted Attendance"]);
describe("ShowPilot - Event Schedule PDF",()=>{
 it("preserves date, event group, individual functions, combined space, event ID and wrapped descriptions",()=>{
  const pages=[
   [line([300,"ShowPilot - Event Schedule"]),header,
    line([18,"Monday, November 2, 2026"]),
    line([18,"Coldwell Banker Realty Atlanta Unlocking Home Parties"],[1030,"300"]),
    line([98,"05:00 PM"],[185,"06:00 PM"],[250,"Vendor"],[397,"Ballroom ABE (BRABE)"],[613,"06:00 AM"],[705,"01:00 PM"],[804,"42389"],[884,"Definite (30)"],[1030,"0"]),
    line([255,"Load-In/Marquee Letters drop-off"])],
   [header,line([18,"Tuesday, November 3, 2026"]),
    line([18,"Coldwell Banker Realty Atlanta Unlocking Home Parties"],[1030,"300"]),
    line([98,"07:30 AM"],[185,"07:30 AM"],[255,"Client Move-In"],[397,"Ballroom ABE (BRABE)"],[613,"06:00 AM"],[705,"01:00 PM"],[804,"42389"],[884,"Definite (30)"],[1030,"0"]),
    line([98,"10:00 AM"],[185,"01:00 PM"],[255,"General Session"],[397,"Ballroom ABE (BRABE)"],[613,"06:00 AM"],[705,"01:00 PM"],[804,"42389"],[884,"Definite (30)"],[1030,"0"]),
    line([18,"Wednesday, November 4, 2026"]),
    line([18,"Leadership Cobb"],[1030,"120"]),
    line([98,"02:00 PM"],[185,"02:00 PM"],[255,"Move In"],[397,"Ballroom A (BRA)"],[613,"02:00 PM"],[705,"05:00 PM"],[804,"42421"],[884,"Definite (30)"],[1030,"0"])]
  ];
  const rows=readShowPilotEventSchedulePages(pages);
  expect(rows).toHaveLength(4);
  expect(rows[0]).toMatchObject({date:"2026-11-02",event:"Coldwell Banker Realty Atlanta Unlocking Home Parties",
   description:"Vendor Load-In/Marquee Letters drop-off",space:"Ballroom ABE (BRABE)",eventId:"42389",status:"Definite (30)"});
  expect(rows[1]).toMatchObject({date:"2026-11-03",start:"07:30 AM",end:"07:30 AM",eventId:"42389"});
  expect(rows[3]).toMatchObject({date:"2026-11-04",event:"Leadership Cobb",eventId:"42421",space:"Ballroom A (BRA)"});
  const proposals=summarizeEvents(rows,true);
  expect(proposals.some(e=>e.title==="Coldwell Banker Realty Atlanta Unlocking Home Parties")).toBe(true);
 });
 it("accepts real calendar dates and rejects impossible dates",()=>{
   expect(eventScheduleDate("Monday, November 2, 2026")).toBe("2026-11-02");
   expect(eventScheduleDate("Tuesday, February 31, 2026")).toBe("");
 });
});
describe("ShowPilot - Event Schedule Excel",()=>{
 it("accepts grouped report and keeps original event names, IDs and statuses",async()=>{
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Sheet 1");
  ws.getCell("A1").value="ShowPilot - Event Schedule";
  ws.getRow(2).values=["Start Time","End Time","Description","Space","Start Time - Event","End Time - Event","Event ID","Status - Event","Contracted Attendance"];
  ws.getCell("A3").value="Monday, November 2, 2026";
  ws.getCell("A4").value="Coldwell Banker Realty Atlanta Unlocking Home Parties";
  ws.getCell("I4").value=300;
  ws.getRow(5).values=["05:00 PM","06:00 PM","Vendor Load-In","Ballroom ABE (BRABE)","06:00 AM","01:00 PM",42389,"Definite (30)",0];
  ws.getCell("A6").value="Tuesday, November 3, 2026";
  ws.getCell("A7").value="Coldwell Banker Realty Atlanta Unlocking Home Parties";
  ws.getRow(8).values=["07:30 AM","07:30 AM","Client Move-In","Ballroom ABE (BRABE)","06:00 AM","01:00 PM",42389,"Definite (30)",0];
  const file=new NodeFile([new Uint8Array(await wb.xlsx.writeBuffer())],"ShowPilot Event Schedule.xlsx") as unknown as File;
  expect(await readEventSheet(file)).toMatchObject([
    {date:"2026-11-02",event:"Coldwell Banker Realty Atlanta Unlocking Home Parties",eventId:"42389",status:"Definite (30)",description:"Vendor Load-In"},
    {date:"2026-11-03",event:"Coldwell Banker Realty Atlanta Unlocking Home Parties",eventId:"42389"}
  ]);
 });
 it("imports flat per-row Start Date cells, show names, Event IDs and native Excel times",async()=>{
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Sheet1");
  ws.getCell("A1").value="ShowPilot - Event Schedule";
  ws.getRow(2).values=["Start Date","Start Time","End Time","Event","Description","Space",
    "Start Time - Event","End Time - Event","Event ID","Status - Event","Contracted Attendance"];
  // One real Excel date formatted with weekday plus one 1900-date serial.
  ws.getRow(3).values=[new Date(Date.UTC(2026,10,10)),0.3125,0.5,
   "Atlanta Convention","Client Move-In","Exhibit Hall A (EXA)",0.25,0.75,42389,"Definite (30)",0];
  ws.getCell("A3").numFmt="dddd, mmmm d, yyyy";
  ws.getRow(4).values=[46337,0.4166666666666667,0.5416666666666667,
   "Atlanta Convention","General Session","Exhibit Hall B (EXB)",0.25,0.75,42389,"Definite (30)",300];
  ws.getCell("A4").numFmt="mm/dd/yyyy";
  ws.getRow(5).values=[46337,0.5,0.75,
   "Atlanta Convention","General Session","Exhibit Hall C (EXC)",0.5,0.75,53820,"Pending Contract (32)",150];
  // A missing function date is NOT silently borrowed from the previous row.
  ws.getRow(6).values=[null,0.5,0.75,
   "Atlanta Convention","General Session","Exhibit Hall D (EXD)",0.5,0.75,53820,"Definite (30)",150];
  const uploaded=new NodeFile([new Uint8Array(await wb.xlsx.writeBuffer())],"ShowPilotEventSchedule.xlsx") as unknown as File;
  const rows=await readEventSheet(uploaded);
  expect(rows).toHaveLength(3);
  expect(rows).toMatchObject([
   {date:"2026-11-10",start:"07:30 AM",end:"12:00 PM",event:"Atlanta Convention",eventId:"42389",
    description:"Client Move-In",space:"Exhibit Hall A (EXA)",bookingStart:"06:00 AM",status:"Definite (30)"},
   {date:"2026-11-11",start:"10:00 AM",event:"Atlanta Convention",eventId:"42389",
    description:"General Session",space:"Exhibit Hall B (EXB)",attendance:300},
   {date:"2026-11-11",event:"Atlanta Convention",eventId:"53820",
    space:"Exhibit Hall C (EXC)",status:"Pending Contract (32)",attendance:150}
  ]);
  const shows=postConShowsFromReportRows(rows??[]);
  expect(shows).toHaveLength(2);
  expect(new Set(shows.map(show=>show.key))).toEqual(new Set(["id:42389","id:53820"]));
  expect(shows.every(show=>show.showName==="Atlanta Convention")).toBe(true);
 });
 it("supports Start Date - Event and literal weekday date text on each activity row",async()=>{
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Sheet1");
  ws.getCell("A1").value="ShowPilot - Event Schedule";
  ws.getRow(2).values=["Start Date - Event","Start Time","End Time","Event","Description","Space",
   "Start Time - Event","End Time - Event","Event ID","Status - Event","Contracted Attendance"];
  ws.getRow(3).values=["Wednesday, November 11, 2026","09:00 AM","03:00 PM",
   "Leadership Cobb","PROGRAM START","Ballroom A (BRA)","08:00 AM","04:00 PM",42421,"Definite (30)",60];
  const uploaded=new NodeFile([new Uint8Array(await wb.xlsx.writeBuffer())],"event-schedule.xlsx") as unknown as File;
  expect(await readEventSheet(uploaded)).toMatchObject([
   {date:"2026-11-11",event:"Leadership Cobb",eventId:"42421",description:"PROGRAM START",bookingStart:"08:00 AM"}
  ]);
 });
 it("does not mistake a normal monthly staffing workbook for an event report",async()=>{
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Week #1");
  ws.getCell("A1").value="COBB CONVENTION CENTER-ATLANTA";
  ws.getCell("A4").value="DAY";
  const file=new NodeFile([new Uint8Array(await wb.xlsx.writeBuffer())],"monthly.xlsx") as unknown as File;
  expect(await readEventSheet(file)).toBeNull();
 });
});
