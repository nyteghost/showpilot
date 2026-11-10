import {describe,it,expect} from "vitest";
import ExcelJS from "exceljs";
import {parseShift,shiftNeedsReview,parsePastedShiftsWithReview} from "../lib/work-tools";
import {readScheduleWorkbook} from "../lib/work-files";
import {workedHours} from "../lib/staffing";

function datesWithSpacer(){
 const book=new ExcelJS.Workbook(),ws=book.addWorksheet("Week #1");
 for(let i=0;i<7;i++)ws.getRow(4).getCell(i+2).value=
  ["MON","TUE","WED","THU","FRI","SAT","SUN"][i]!;
 ws.getRow(5).getCell(2).value=1500;
 ws.getRow(5).getCell(3).value=5500;
 for(let i=0;i<7;i++)ws.getRow(6).getCell(i+2).value=25569+Date.UTC(2026,10,16+i)/86400000;
 ws.getRow(7).getCell(1).value="Sample Operator";
 ws.getRow(8).getCell(1).value="999";
 return book;
}
describe("Claude shift-date and parsing audit",()=>{
 it("parses supported annotations and punctuation without inventing times",()=>{
  expect(parseShift("3pm-11:30pm+")).toMatchObject({start:900,end:1410});
  expect(parseShift("8am-5pm(TBD)")).toMatchObject({start:480,end:1020});
  expect(parseShift("9a—7p")).toMatchObject({start:540,end:1140});
  expect(parseShift("7a-3;30p")).toMatchObject({start:420,end:930});
  expect(parseShift("3p-1130p")).toMatchObject({start:900,end:1410});
  expect(parseShift("7am-TBD")).toBeNull();
 });
 it("reports unreadable pasted shifts instead of dropping them silently",()=>{
  const pasted="MON  TUE  WED  THU  FRI  SAT  SUN\nSample Operator  9a-6p  7am-TBD  OFF  3pm-11:30pm+  OFF  OFF  OFF";
  const result=parsePastedShiftsWithReview(pasted,"2026-11-16","Sample Operator");
  expect(result.shifts).toHaveLength(2);
  expect(result.unreadable).toEqual(expect.arrayContaining([
   expect.objectContaining({date:"2026-11-17",raw:"7am-TBD"})
  ]));
 });
 it("does not silently lose unreadable user shift cells",async()=>{
  const book=datesWithSpacer(),ws=book.getWorksheet("Week #1")!;
  ws.getCell("B7").value="3pm-11:30pm+";
  ws.getCell("C7").value="7am-TBD";
  ws.getCell("D7").value="OFF";
  const bytes=await book.xlsx.writeBuffer();
  const file=new File([new Uint8Array(bytes)],"synthetic-schedule.xlsx");
  const result=await readScheduleWorkbook(file,"Sample Operator");
  expect(result.shifts[0]?.date).toBe("2026-11-16");
  expect(result.shifts[0]?.note).toMatch(/\+/);
  expect(result.unreadable).toEqual(expect.arrayContaining([
   expect.objectContaining({sheet:"Week #1",date:"2026-11-17",raw:"7am-TBD"})
  ]));
  expect(result.shifts.some(s=>s.date.startsWith("1904"))).toBe(false);
 });
 it("warns on FROM/TO disagreement and requires an explicit Monday override",async()=>{
  const book=datesWithSpacer(),ws=book.getWorksheet("Week #1")!;
  ws.getCell("C3").value="FROM:";
  ws.getCell("D3").value=new Date(Date.UTC(2025,10,17));
  ws.getCell("B7").value="7a-3:30p";
  const file=new File([new Uint8Array(await book.xlsx.writeBuffer())],"synthetic.xlsx");
  const original=await readScheduleWorkbook(file,"Sample Operator");
  expect(original.warnings.join(" ")).toContain("FROM header");
  expect(original.shifts[0]?.date).toBe("2026-11-16");
  const corrected=await readScheduleWorkbook(file,"Sample Operator",{"Week #1":"2026-11-23"});
  expect(corrected.shifts[0]?.date).toBe("2026-11-23");
  expect(corrected.warnings.join(" ")).toContain("manually corrected");
  expect((await readScheduleWorkbook(file,"Sample Operator",{"Week #1":"2026-11-24"})).shifts).toEqual([]);
 });
 it("recognizes on-call and blank-badge staff blocks as people",async()=>{
  const book=datesWithSpacer(),ws=book.getWorksheet("Week #1")!;
  ws.getCell("A10").value="Sample On Call";
  ws.getCell("A11").value="On-Call";
  ws.getCell("A12").value="Show Service Engineer";
  ws.getCell("A13").value="Sample New Operator";
  ws.getCell("A15").value="Show Service Engineer";
  ws.getCell("A17").value="HALLS";
  const file=new File([new Uint8Array(await book.xlsx.writeBuffer())],"synthetic.xlsx");
  const result=await readScheduleWorkbook(file,"Sample Operator");
  expect(result.people).toContain("Sample On Call");
  expect(result.people).toContain("Sample New Operator");
 });
 it("counts the standard 3:30p–11:59p closing line as eight paid hours",()=>{
  expect(workedHours({start:930,end:1439})).toBe(8);
 });
 it("marks implausible shifts for explicit confirmation before calendar output",()=>{
  expect(shiftNeedsReview({date:"2026-11-16",start:1200,end:2580,raw:"8pm-7pm"})).toBe(true);
  expect(shiftNeedsReview({date:"2026-11-16",start:480,end:1020,raw:"8a-5p"})).toBe(false);
 });
});
