import {describe,expect,it} from "vitest";
import {detectHallOverlaps,hallGroup,describeHallOverlap} from "../lib/showpilot-hall-inference";
import type {EventRow} from "../lib/work-tools";

const row=(date:string,name:string,space:string,id:string):EventRow=>({
 level:3,date,event:name,eventId:id,space,description:"Move In",usage:"Move In",
 start:"07:00 AM",end:"09:00 AM"
});
describe("Hall configuration review",()=>{
 it("recognizes Hall groupings and ignores Ballroom-only names",()=>{
  expect(hallGroup("Hall AB")).toBe("AB");
  expect(hallGroup("Hall C")).toBe("C");
  expect(hallGroup("Ballroom CDF")).toBeNull();
 });
 it("identifies same-event Hall changes without declaring different shows",()=>{
  const findings=detectHallOverlaps([
   row("2026-11-11","First function","Hall AB","5151"),
   row("2026-11-11","Second function","Hall BC","5151")
  ],[]);
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({shared:"B",sameEvent:true,firstGroup:"AB",secondGroup:"BC"});
  expect(describeHallOverlap(findings[0]!)).toContain("same Event ID");
 });
 it("identifies separate event bookings and the overlapping Hall sections",()=>{
  const findings=detectHallOverlaps([
   row("2026-11-11","Expo One","Hall AB","900"),
   row("2026-11-11","Expo Two","Hall BC","901")
  ],[]);
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({sameEvent:false,shared:"B"});
  expect(describeHallOverlap(findings[0]!)).toContain("Expo Two");
 });
 it("does not flag disjoint Hall partitions or excluded CEPAC functions",()=>{
  expect(detectHallOverlaps([
   row("2026-11-11","Show A","Hall AB","900"),
   row("2026-11-11","Show B","Hall CD","901"),
   row("2026-11-11","CEPAC Other Show","Hall BC","902")
  ],[])).toEqual([]);
 });
});
