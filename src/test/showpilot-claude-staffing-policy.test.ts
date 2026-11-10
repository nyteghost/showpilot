import {describe,it,expect} from "vitest";
import {dayNeed,readStaffBlockAvailability,planWeeks,planWeek,weekdayCombinations} from "../lib/staffing";
import {weekLayouts,type EventEntry} from "../lib/work-tools";
const show:EventEntry={date:"2026-11-16",space:"Hall A",code:"S",start:600,end:960,
 title:"Fictional Lantern Expo",showName:"Fictional Lantern Expo",
 eventId:"99001",bookingEnd:1439,attendance:700};
describe("Claude reviewed staffing evidence",()=>{
 it("covers only known booking end after the last function by default",()=>{
  const need=dayNeed([show],"2026-11-16");
  expect(need[40]).toBe(1); // 8pm
  expect(need[47]).toBe(1); // 11:30pm
  expect(need[48]).toBe(0); // past midnight, not invented
  expect(dayNeed([show],"2026-11-16",{coverBookingClose:false})[40]).toBe(0);
 });
 it("never invents an attendance threshold",()=>{
  expect(dayNeed([show],"2026-11-16")[22]).toBe(1);
  expect(dayNeed([show],"2026-11-16",{attendanceThreshold:600})[22]).toBe(2);
 });
 it("respects operator OFF and third-row holiday/PTO, including a paid-hours badge",()=>{
  expect(readStaffBlockAvailability("","OFF","").availability).toEqual({off:true});
  expect(readStaffBlockAvailability("","8","Holiday").availability).toEqual({off:true});
  expect(readStaffBlockAvailability("PTO requested 9.8.26","","").availability).toEqual({off:true});
  expect(readStaffBlockAvailability("","OFF","",false).availability).toBeNull();
 });
 it("keeps an operator-entered shift and service desk assignment",()=>{
  expect(readStaffBlockAvailability("7a-3:30p","","").availability).toEqual({
   off:false,fixed:{start:420,end:930}
  });
  expect(readStaffBlockAvailability("","","SD: 12p-5p").availability).toEqual({
   off:false,fixed:{start:720,end:1020}
  });
 });
 it("uses verified event booking hours for proposed building-hours text",()=>{
  const dates=weekLayouts([{...show,bookingStart:360,bookingEnd:1439}]);
  expect(dates[0]!.cgc[0]).toBe("6a-11:59p");
  expect(weekLayouts([],["2026-11-16"])[0]!.cgc[0]).toBe("DARK");
 });
 it("bounds combinatorial search at seven weekdays and preserves old tie order",()=>{
  expect(weekdayCombinations(["M","T","W","Th"],2)).toEqual([
   ["M","T"],["M","W"],["M","Th"],["T","W"],["T","Th"],["W","Th"]
  ]);
  expect(weekdayCombinations([1,2,3],0)).toEqual([[]]);
  expect(weekdayCombinations([1,2,3],4)).toEqual([]);
  expect(()=>weekdayCombinations(Array.from({length:8},(_,i)=>i),3)).toThrow(/at most seven days/);
 });
 it("suggests an on-call shift for an uncovered evening regardless of which regular staff worked",()=>{
  const evening={...show,start:1020,end:1320,bookingEnd:undefined};
  const onCall={name:"Fictional Backup",badge:"OC",title:"On-call",
   patterns:[{start:1020,end:1350}]};
  const [day]=planWeek(["2026-11-16"],[evening],[],{},onCall,[],{coverBookingClose:false});
  expect(day!.assignments).toHaveLength(0);
  expect(day!.notes).toEqual(expect.arrayContaining([
   expect.stringContaining("Suggestion: on-call Fictional Backup")
  ]));
  expect(day!.notes.join(" ")).toContain("operator approval required");
 });
 it("generates all seven dates for a selected week with zero event lines",()=>{
  const weeks=weekLayouts([],["2026-11-16"]);
  expect(weeks).toHaveLength(1);
  expect(weeks[0]!.dates).toHaveLength(7);
  expect(weeks[0]!.cgc).toEqual(Array(7).fill("DARK"));
  const plans=planWeeks(weeks[0]!.dates,[]);
  expect(plans).toHaveLength(7);
 });
});
