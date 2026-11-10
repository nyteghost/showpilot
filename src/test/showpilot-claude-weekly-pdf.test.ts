import {describe,it,expect} from "vitest";
import {parseWeeklyShiftText,type PdfShiftFragment} from "../lib/showpilot-shift-pdf";
const days=["MON","TUE","WED","THU","FRI","SAT","SUN"];
const dates=["11/16/26","11/17/26","11/18/26","11/19/26","11/20/26","11/21/26","11/22/26"];
const base:PdfShiftFragment[]=[
 ...days.map((text,i)=>({text,x:130+i*70,y:670})),
 ...dates.map((text,i)=>({text,x:130+i*70,y:650})),
 {text:"Fictional Person",x:20,y:610},
 {text:"7a-3:30p",x:130,y:610},
 {text:"OFF",x:200,y:610},
 {text:"3p-11:30p+",x:270,y:610},
 {text:"7a-TBD",x:340,y:610},
 {text:"8pm-5pm",x:410,y:610}
];
describe("Claude weekly PDF My Shifts import",()=>{
 it("maps weekday positions and dates without assuming fixed font or y row",()=>{
  const result=parseWeeklyShiftText(base,"Fictional Person","Week #1 PDF");
  expect(result.shifts.map(x=>x.date)).toEqual(["2026-11-16","2026-11-18","2026-11-20"]);
  expect(result.unreadable).toEqual([{sheet:"Week #1 PDF",date:"2026-11-19",raw:"7a-TBD"}]);
  expect(result.shifts[1]!.note).toContain("+");
  expect(result.warnings).toEqual([]);
 });
 it("reports an image-only PDF without silently making blank shifts",()=>{
  const result=parseWeeklyShiftText([],"Fictional Person","scanned page");
  expect(result.shifts).toEqual([]);
  expect(result.warnings[0]).toMatch(/no selectable text/);
 });
 it("rejects a misaligned date row instead of adding wrong calendar shifts",()=>{
  const shifted=base.map(item=>item.text==="11/16/26"?{...item,text:"11/15/26"}:item);
  const result=parseWeeklyShiftText(shifted,"Fictional Person");
  expect(result.shifts).toEqual([]);
  expect(result.warnings).toHaveLength(1);
 });
});
