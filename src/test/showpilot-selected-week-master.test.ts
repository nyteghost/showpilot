import {describe,expect,it} from "vitest";
import {Blob as NodeBlob,File as NodeFile} from "node:buffer";
import ExcelJS from "exceljs";
import {eventsWorkbook,validateApprovedTemplate} from "@/lib/work-files";
import type {EventEntry} from "@/lib/work-tools";
Object.defineProperty(globalThis,"Blob",{value:NodeBlob,configurable:true});
Object.defineProperty(globalThis,"File",{value:NodeFile,configurable:true});
const entry=(date:string,title:string):EventEntry=>({date,space:"Hall A",code:"S",start:480,end:1020,title,showName:title,eventId:"12345"});

describe("approved master with formula-only dates: selected week export",()=>{
 it("copies the original CGC layout, stamps selected dates, preserves PTO, and removes stale show text",async()=>{
  const base=await eventsWorkbook([entry("2026-11-02","Previous Week")],undefined,[],{singleWeek:"2026-11-02"});
  const master=new ExcelJS.Workbook();await master.xlsx.load(await base.arrayBuffer());
  const ws=master.worksheets[0]!;
  // A real user's approved master can have Excel formulas with NO cached result.
  for(let col=2;col<=8;col++)
   ws.getRow(5).getCell(col).value={formula:"Extra!B"+(col+4)};
  ws.getCell("B18").value="PTO";
  ws.getCell("B18").font={name:"Arial",size:12,bold:true};
  ws.getCell("B55").value="Old Week Event";
  ws.getCell("B55").border={top:{style:"dashed",color:{argb:"FF445566"}}};
  const original=new File([new Uint8Array(await master.xlsx.writeBuffer())],"approved-master.xlsx");
  const chosen=[entry("2026-11-09","Current Week")];
  await expect(validateApprovedTemplate(original,chosen)).rejects.toThrow(/recognizable weekly date/);
  await expect(validateApprovedTemplate(original,chosen,{retargetWeek:true})).resolves.toBeUndefined();
  const exported=await eventsWorkbook(chosen,original,[],{
   singleWeek:"2026-11-09",preserveTemplateLayout:true,retargetTemplateWeek:true
  });
  const result=new ExcelJS.Workbook();await result.xlsx.load(await exported.arrayBuffer());
  expect(result.worksheets).toHaveLength(1);
  const sheet=result.worksheets[0]!;
  expect((sheet.getCell("B5").value as Date).toISOString().slice(0,10)).toBe("2026-11-09");
  expect((sheet.getCell("H5").value as Date).toISOString().slice(0,10)).toBe("2026-11-15");
  expect(sheet.getCell("B18").value).toBe("PTO");
  expect(sheet.getCell("B18").font).toMatchObject({name:"Arial",size:12,bold:true});
  expect(sheet.getCell("B55").value).toContain("Current Week");
  expect(sheet.getCell("B55").value).not.toContain("Old Week Event");
  expect(sheet.getCell("B55").border.top?.style).toBe("dashed");
 });
});
