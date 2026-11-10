import {describe,it,expect} from "vitest";
import ExcelJS from "exceljs";
import {Readable} from "node:stream";
import {isExactCgcEngineeringTemplate,findWeekDateRow,eventsWorkbook} from "../lib/work-files";

const labels=[
 "HALLS","HALL A","HALL B","HALL C","HALL D","TASKS","BALLROOM",
 "BALLROOM A","BALLROOM B","BALLROOM E","BALLROOM G",
 "BALLROOM C","BALLROOM D","BALLROOM F","TASKS","LOCATION"
];
function week(hallsAt:number){
 const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet("Week #1");
 sheet.getCell("A4").value="DAY";
 for(let col=2;col<=8;col++)sheet.getRow(4).getCell(col).value=["MON","TUE","WED","THU","FRI","SAT","SUN"][col-2]!;
 for(let n=0;n<labels.length;n++)sheet.getRow(hallsAt+n).getCell(1).value=labels[n]!;
 return sheet;
}
describe("Claude D16: real CGC template sections may move when staff rows are inserted",()=>{
 it("accepts the old fixed layout",()=>{
  expect(isExactCgcEngineeringTemplate(week(54))).toBe(true);
 });
 it("accepts the same structural sequence shifted three rows",()=>{
  expect(isExactCgcEngineeringTemplate(week(57))).toBe(true);
 });
 it("rejects reordered Hall/Ballroom rows, even if all labels exist",()=>{
  const ws=week(57);
  ws.getRow(59).getCell(1).value="HALL C";
  ws.getRow(60).getCell(1).value="HALL B";
  expect(isExactCgcEngineeringTemplate(ws)).toBe(false);
 });
 it("does not mistake a separate venue block for the CGC sequence",()=>{
  const ws=week(57);
  ws.getRow(60).getCell(1).value="OTHER VENUE";
  expect(isExactCgcEngineeringTemplate(ws)).toBe(false);
 });
});

describe("Claude D17: week dates may be below a spacer row",()=>{
 const sample=(dateRow:number)=>{
  const ws=week(57);
  for(let i=0;i<7;i++)ws.getRow(dateRow).getCell(i+2).value=
   new Date(Date.UTC(2026,10,16+i));
  return ws;
 };
 it("finds seven consecutive weekday-aligned dates after a blank spacer",()=>{
  const ws=sample(6);
  expect(findWeekDateRow(ws,4)).toMatchObject({row:6,dates:[
   "2026-11-16","2026-11-17","2026-11-18","2026-11-19",
   "2026-11-20","2026-11-21","2026-11-22"
  ]});
 });
 it("does not read numeric spacer values as 1904 dates",()=>{
  const ws=sample(7);
  ws.getRow(5).getCell(2).value=1500;
  ws.getRow(5).getCell(3).value=5500;
  expect(findWeekDateRow(ws,4)?.row).toBe(7);
 });
 it("rejects rows whose Monday column is really Sunday",()=>{
  const ws=week(57);
  for(let i=0;i<7;i++)ws.getRow(5).getCell(i+2).value=
   new Date(Date.UTC(2025,10,16+i));
  expect(findWeekDateRow(ws,4)).toBeNull();
 });
});

describe("Claude CGC-only safety during template re-dating",()=>{
 it("preserves a same-named Ballroom row below the separate-venue boundary",async()=>{
  const ws=week(57);
  for(let i=0;i<7;i++)ws.getRow(5).getCell(i+2).value=
   new Date(Date.UTC(2026,10,16+i));
  ws.getCell("B58").value="Old CGC Hall A event";
  ws.getCell("A74").value="BallRoom A";
  ws.getCell("B74").value="Other venue entry must remain unchanged";
  const file=new File([new Uint8Array(await ws.workbook.xlsx.writeBuffer())],"template.xlsx");
  const blob=await eventsWorkbook([],file,[],{
   singleWeek:"2026-11-23",preserveTemplateLayout:true,retargetTemplateWeek:true
  });
  const output=new ExcelJS.Workbook();
  await output.xlsx.read(Readable.from([new Uint8Array(await blob.arrayBuffer())]));
  const sheet=output.getWorksheet("Week #1")!;
  expect(sheet.getCell("B58").value).toBeNull();
  expect(sheet.getCell("B74").value).toBe("Other venue entry must remain unchanged");
 });
});
