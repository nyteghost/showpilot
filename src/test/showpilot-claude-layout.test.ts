import {describe,it,expect} from "vitest";
import ExcelJS from "exceljs";
import {isExactCgcEngineeringTemplate} from "../lib/work-files";

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
