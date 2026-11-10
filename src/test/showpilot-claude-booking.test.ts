import {describe,it,expect} from "vitest";
import ExcelJS from "exceljs";
import {readEventSheet} from "../lib/work-files";
import {summarizeEvents} from "../lib/work-tools";
describe("Claude A1/A13: event-booking metadata is retained without changing staffing defaults",()=>{
 it("reads booking hours and contracted attendance from grouped Event Schedule",async()=>{
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Sheet1");
  ws.getCell("A1").value="ShowPilot - Event Schedule";
  const headers:{[col:string]:string}={
   D:"Start Time",E:"End Time",F:"Description",G:"Space",
   H:"Start Time - Event",I:"End Time - Event",J:"Event ID",
   K:"Status - Event",L:"Contracted Attendance"
  };
  for(const [col,name] of Object.entries(headers))ws.getCell(col+"2").value=name;
  ws.getCell("A3").value="Monday, November 16, 2026";
  ws.getCell("B4").value="Sample Exhibitor Conference";
  ws.getCell("L4").value=350;
  ws.getCell("D5").value=0.5;
  ws.getCell("E5").value=0.75;
  ws.getCell("F5").value="General Session";
  ws.getCell("G5").value="Hall D";
  ws.getCell("H5").value=0.25;
  ws.getCell("I5").value=1439/1440;
  ws.getCell("J5").value="55501";
  ws.getCell("K5").value="Definite (30)";
  ws.getCell("L5").value=350;
  const bytes=await wb.xlsx.writeBuffer();
  const file=new File([new Uint8Array(bytes)],"events.xlsx");
  const rows=await readEventSheet(file);
  expect(rows).toHaveLength(1);
  expect(rows![0]).toMatchObject({
   eventId:"55501",event:"Sample Exhibitor Conference",
   bookingStart:"06:00 AM",bookingEnd:"11:59 PM",attendance:350
  });
  const entries=summarizeEvents(rows!);
  expect(entries[0]?.bookingEnd).toBe(1439);
  expect(entries[0]?.attendance).toBe(350);
 });
});
