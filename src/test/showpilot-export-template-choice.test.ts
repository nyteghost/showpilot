import {describe,it,expect} from "vitest";
import {activeExportMaster,canUseExportMaster} from "../lib/showpilot-export-template-choice";

describe("Event Schedule approved-master export readiness",()=>{
 it("uses an uploaded original workbook when explicitly selected",()=>{
  expect(activeExportMaster("original",true)).toBe("original");
  expect(canUseExportMaster("original",true,"missing")).toBe(true);
  expect(canUseExportMaster("original",false,"saved")).toBe(false);
 });
 it("does not claim a missing saved template is export-ready",()=>{
  expect(activeExportMaster("original",false)).toBe("approved");
  expect(canUseExportMaster("approved",false,"missing")).toBe(false);
  expect(canUseExportMaster("approved",false,"checking")).toBe(false);
  expect(canUseExportMaster("approved",false,"error")).toBe(false);
  expect(canUseExportMaster("approved",false,"unavailable")).toBe(false);
  expect(canUseExportMaster("approved",false,"saved")).toBe(true);
 });
 it("does not silently switch from explicitly chosen approved master to uploaded original",()=>{
  expect(activeExportMaster("approved",true)).toBe("approved");
  expect(canUseExportMaster("approved",true,"missing")).toBe(false);
 });
});
