import {describe,it,expect} from "vitest";
import {Blob as NodeBlob,File as NodeFile} from "node:buffer";
import ExcelJS from "exceljs";
import {approvedMonthWeeks,eventsWorkbook,validateApprovedTemplate} from "@/lib/work-files";
import type {EventEntry} from "@/lib/work-tools";

Object.defineProperty(globalThis,"Blob",{value:NodeBlob,configurable:true});
Object.defineProperty(globalThis,"File",{value:NodeFile,configurable:true});
const entry=(date:string,title:string):EventEntry=>({
 date,space:"Hall A",code:"MI",start:480,end:1020,
 title,showName:title,eventId:title==="New December Event"?"41093":"42389"
});
const originalWeeks=["2026-11-02","2026-11-09","2026-11-16","2026-11-23","2026-11-30"];
async function novemberMaster(){
 const src=originalWeeks.map((date,i)=>entry(date,"Old November Event "+i));
 const original=await eventsWorkbook(src);
 const book=new ExcelJS.Workbook();
 await book.xlsx.load(await original.arrayBuffer());
 const ws=book.getWorksheet("Week #1")!;
 ws.getCell("B12").value="PTO";
 ws.getCell("B12").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFCC00"}};
 ws.getCell("C8").value="5000";
 ws.getCell("C8").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFF0000"}};
 ws.getCell("B55").value="OLD NOVEMBER HALL BOOKING";
 ws.getCell("B55").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF00FF00"}};
 ws.getCell("B59").value="OLD NOVEMBER TASK";
 const bytes=await book.xlsx.writeBuffer();
 return new File([new Uint8Array(bytes)],"Nov-approved-master.xlsx");
}
describe("Create December from approved November CGC master",()=>{
 it("selects every week overlapping the calendar month, not just weeks with event functions",()=>{
  expect(approvedMonthWeeks("2026-12")).toEqual([
   "2026-11-30","2026-12-07","2026-12-14","2026-12-21","2026-12-28"
  ]);
  expect(approvedMonthWeeks("2027-02")).toHaveLength(4);
  expect(()=>approvedMonthWeeks("2026-13")).toThrow(/valid/);
 });
 it("copies five weekly layouts, dates them in December, clears old shifts/PTO/attendance/events, preserves section styling",async()=>{
  const master=await novemberMaster();
  const next=[entry("2026-12-11","New December Event")];
  await expect(validateApprovedTemplate(master,next)).rejects.toThrow(/does not contain/);
  await expect(validateApprovedTemplate(master,next,{retargetMonth:"2026-12"})).resolves.toBeUndefined();
  const output=await eventsWorkbook(next,master,[],{
   preserveTemplateLayout:true,retargetTemplateMonth:"2026-12"
  });
  const book=new ExcelJS.Workbook();
  await book.xlsx.load(await output.arrayBuffer());
  expect(book.worksheets.map(ws=>ws.name)).toEqual([
   "Week #1","Week #2","Week #3","Week #4","Week #5"
  ]);
  const first=book.getWorksheet("Week #1")!;
  const second=book.getWorksheet("Week #2")!;
  const last=book.getWorksheet("Week #5")!;
  expect((first.getCell("B5").value as Date).toISOString().slice(0,10)).toBe("2026-11-30");
  expect((second.getCell("B5").value as Date).toISOString().slice(0,10)).toBe("2026-12-07");
  expect((last.getCell("H5").value as Date).toISOString().slice(0,10)).toBe("2027-01-03");
  expect(first.getCell("B12").value).not.toBe("PTO");
  expect(first.getCell("C8").value).toBeNull();
  expect(first.getCell("C8").fill).toMatchObject({type:"pattern",fgColor:{argb:"FFFFFFFF"}});
  expect(first.getCell("B55").value).toBeNull();
  expect(first.getCell("B59").value).toBeNull();
  expect(first.getCell("A54").fill).toMatchObject({fgColor:{argb:"FF000000"}});
  expect(first.getCell("A60").fill).toMatchObject({fgColor:{argb:"FF000000"}});
  const firstWorkbook=await master.arrayBuffer();
  const untouched=new ExcelJS.Workbook();await untouched.xlsx.load(firstWorkbook);
  expect(untouched.getWorksheet("Week #1")!.getCell("B12").value).toBe("PTO");
  expect(untouched.getWorksheet("Week #1")!.getCell("C8").value).toBe("5000");
  const dateCol=6; // Friday Dec 11
  expect(String(second.getCell(55,dateCol).value??"")).toContain("New December Event");
  const cells=book.worksheets.flatMap(ws=>Array.from({length:ws.rowCount-5},(_,i)=>
   Array.from({length:7},(_,j)=>String(ws.getRow(i+6).getCell(j+2).value??""))).flat());
  expect(cells.join("\n")).not.toContain("OLD NOVEMBER");
  expect(cells.join("\n")).not.toContain("Old November Event");
 });
 it("does not re-date an insufficient or incompatible source master",async()=>{
  const oneWeek=await eventsWorkbook([entry("2026-11-02","Old November Event 0")],undefined,[],{singleWeek:"2026-11-02"});
  const input=new File([new Uint8Array(await oneWeek.arrayBuffer())],"too-short.xlsx");
  await expect(validateApprovedTemplate(input,[entry("2026-12-11","New December Event")],
   {retargetMonth:"2026-12"})).rejects.toThrow(/needs 5 weekly sheets/);
  await expect(eventsWorkbook([entry("2026-12-11","New December Event")],input,[],{
   preserveTemplateLayout:true,retargetTemplateMonth:"2026-12"
  })).rejects.toThrow(/need 5 CGC weekly sheets/);
 });
 it("refuses mixing another month's event activity into a new month",async()=>{
  const master=await novemberMaster();
  await expect(eventsWorkbook([entry("2026-11-15","Old November Event 0")],master,[],{
   preserveTemplateLayout:true,retargetTemplateMonth:"2026-12"
  })).rejects.toThrow(/outside 2026-12/);
 });
});
