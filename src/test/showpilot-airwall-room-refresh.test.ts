import {describe,expect,it} from "vitest";
import {reconcileAirwallDay} from "../lib/showpilot-today-checklist";

describe("airwall room refresh and room change review",()=>{
 it("does not treat two dated ballroom configurations as simultaneous work orders",()=>{
  const day="2026-11-12";
  const plan=reconcileAirwallDay(day,[
   {date:day,section:"BALLROOM",text:"Make ABEG",source:"engineering-workbook"},
   {date:day,section:"BALLROOM",text:"Make CDF",source:"engineering-workbook"}
  ],[]);
  expect(plan.tasks).toHaveLength(0);
  expect(plan.review).toHaveLength(2);
  expect(plan.review.every(item=>item.kind==="conflict")).toBe(true);
  expect(plan.review[0]?.reason).toMatch(/room refreshes or room changes/i);
  expect(plan.review[0]?.reason).toMatch(/handoff times/i);
 });
 it("retains a single dated setup as a work item requiring EOC verification",()=>{
  const day="2026-11-12";
  const plan=reconcileAirwallDay(day,[
   {date:day,section:"BALLROOM",text:"Make ABEG",source:"engineering-workbook"}
  ],[]);
  expect(plan.review).toHaveLength(0);
  expect(plan.tasks.some(task=>task.text.includes("Make ABEG"))).toBe(true);
  expect(plan.tasks[0]?.detail).toMatch(/Verify approved EOC/);
 });
});
