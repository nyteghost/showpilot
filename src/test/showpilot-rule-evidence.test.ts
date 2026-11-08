import {describe,expect,it} from "vitest";
import {boundedEvidence,shiftRuleEvidence,calendarRuleEvidence,vendorRuleEvidence,
 eventScheduleRuleEvidence,exportRuleEvidence} from "../lib/showpilot-rule-evidence";

describe("bounded rule evidence for Local AI",()=>{
 it("limits length, control characters and number of findings",()=>{
  const x=boundedEvidence({domain:"imports",label:"Test\nname",
   findings:Array.from({length:50},(_,i)=>"row "+i+"x".repeat(600))});
  expect(x.findings).toHaveLength(18);
  expect(x.findings.every(y=>y.length<=300)).toBe(true);
  expect(x.label).not.toContain("\n");
 });
 it("highlights shift duration issues without changing shifts",()=>{
  const shifts=[{date:"2026-11-08",start:8*60,end:26*60,raw:"8a-2a",id:"example"}];
  const result=shiftRuleEvidence(shifts);
  expect(result.findings.some(x=>x.includes("Unusually long"))).toBe(true);
  expect(shifts[0]!.end).toBe(26*60);
  expect(calendarRuleEvidence(shifts,"Work","ics").findings.join(" ")).toContain("duplicate");
 });
 it("provides vendor ranking evidence from landed cost without changing quotes",()=>{
  const store={items:[{id:"i",name:"Cable",kind:"buy" as const,offers:[
   {id:"a",vendor:"Vendor A",price:100,shipping:25},
   {id:"b",vendor:"Vendor B",price:110,shipping:0}]}],vendors:[]};
  const review=vendorRuleEvidence(store);
  expect(review.findings.join(" ")).toContain("Vendor B");
  expect(store.items[0]!.offers[0]!.price).toBe(100);
 });
 it("retains CGC and original-template restrictions for import/export opinions",()=>{
  expect(eventScheduleRuleEvidence([],[],"Imported").findings.join(" ")).toContain("CEPAC");
  expect(exportRuleEvidence("reviewed",0,0,"ready").findings.join(" ")).toContain("Original Excel");
 });
});
