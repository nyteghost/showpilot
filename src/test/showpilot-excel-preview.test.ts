import {describe,expect,it} from "vitest";
import ExcelJS from "exceljs";
import {readWorkbookPreview} from "@/lib/showpilot-excel-preview";

describe("read-only Excel preview",()=>{
 it("reads the real generated XLSX with color, text, merged titles and sheet names",async()=>{
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet("Week #1");
  ws.getColumn(1).width=23;
  ws.mergeCells("A1:C1");
  ws.getCell("A1").value="COBB CONVENTION CENTER-ATLANTA";
  ws.getCell("B2").value=new Date("2026-11-09T00:00:00Z");
  ws.getCell("B2").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFFF99"}};
  ws.getCell("C3").value="Show time";
  ws.getCell("C3").font={bold:true,color:{argb:"FF112233"}};
  const bytes=await wb.xlsx.writeBuffer();
  const result=await readWorkbookPreview(new Blob([new Uint8Array(bytes)]));
  expect(result.sheets.map(s=>s.name)).toEqual(["Week #1"]);
  const sh=result.sheets[0]!;
  expect(sh.rows[0]!.cells[0]).toMatchObject({text:"COBB CONVENTION CENTER-ATLANTA",colSpan:3});
  expect(sh.rows[0]!.cells[1]?.hidden).toBe(true);
  expect(sh.rows[1]!.cells[1]).toMatchObject({text:"11/9/26",fill:"#FFFF99"});
  expect(sh.rows[2]!.cells[2]).toMatchObject({text:"Show time",ink:"#112233",bold:true});
 });
 it("avoids displaying raw formulas as executed output",async()=>{
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Week #1");
  ws.getCell("A1").value={formula:"2+2"};
  const blob=new Blob([new Uint8Array(await wb.xlsx.writeBuffer())]);
  const output=await readWorkbookPreview(blob);
  expect(output.sheets[0]!.rows[0]!.cells[0]!.text).toBe("=2+2");
 });
});
