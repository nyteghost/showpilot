import {describe,expect,it} from "vitest";
import {extractEocFocus} from "@/lib/showpilot-event-assets";
import {eocAttendance,hallLayoutAttached,stageMentionedInEoc} from "@/lib/showpilot-event-highlights";
describe("EOC quick reference — attendance and contextual tools",()=>{
 it("finds labeled attendance on its original PDF page",()=>{
  const rows=extractEocFocus([
   "Event Order Confirmation\nExpected Attendance: 1,250\nEvent Notes\nClient needs a stage.\nEngineering\nBuild a 16 x 12 stage.\nUtility\nProvide 208V electrical.",
   "Attendance: 1250\nEngineering\nVerify steps and rails.",
   "Billing\n1,000.00\nRegistration\nAttendee names are confidential."
  ]);
  expect(rows.filter(r=>r.section==="Attendance")).toEqual([
   {section:"Attendance",page:1,text:"1,250"},
   {section:"Attendance",page:2,text:"1,250"}
  ]);
  const report=eocAttendance([{name:"EOC.pdf",eocExcerpts:rows}]);
  expect(report.conflicting).toBe(false);
  expect(report.readings).toHaveLength(2);
  expect(stageMentionedInEoc(rows)).toBe(true);
  expect(rows.filter(r=>r.section==="Utility")).toHaveLength(1);
 });
 it("highlights conflicting attendance instead of guessing and ignores unrelated counts",()=>{
  const one=extractEocFocus(["Attendance\n650\nEngineering\nNo stage required"]);
  const two=extractEocFocus(["Actual attendance: 700\nEvent Notes\nGuest registration only"]);
  const details=eocAttendance([{name:"Initial EOC.pdf",eocExcerpts:one},{name:"Revised EOC.pdf",eocExcerpts:two}]);
  expect(details.conflicting).toBe(true);
  expect(details.readings.map(x=>x.value)).toEqual(["650","700"]);
  expect(stageMentionedInEoc(one)).toBe(false);
  expect(extractEocFocus(["Work Order #: 32050\nBooth # 88\nBilling: $800"])).toEqual([]);
 });
 it("offers Floor Maps only when a usable hall layout was imported",()=>{
  expect(hallLayoutAttached([{name:"Exhibit Hall AB Layout.pdf",kind:"diagram",extension:"pdf"}])).toBe(true);
  expect(hallLayoutAttached([{name:"Stage Diagram.pdf",kind:"diagram",extension:"pdf"}])).toBe(false);
  expect(hallLayoutAttached([{name:"Hall D CAD drawing.dwg",kind:"diagram",extension:"dwg"}])).toBe(false);
  expect(hallLayoutAttached([{name:"Hall B Work Order.pdf",kind:"work-order",extension:"pdf"}])).toBe(false);
 });
});
