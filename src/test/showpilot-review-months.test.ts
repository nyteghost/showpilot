import {describe,it,expect} from "vitest";
import {availableReviewMonths,availableReviewWeeks,reviewMatchesMonth,reviewMatchesWeek,reviewMatchesDay,reviewMonthLabel,reviewWeekLabel,reviewWeekStart,shiftReviewWeek,selectedReviewMonth,selectedReviewWeek} from "@/lib/showpilot-review-months";

describe("ShowPilot Event Schedule month, week and day views",()=>{
 it("identifies months from source and final dates and picks the current month where present",()=>{
  const months=availableReviewMonths([{date:"2026-10-31"},{date:"2026-11-02"}],[{date:"2026-11-30"}]);
  expect(months).toEqual(["2026-10","2026-11"]);
  expect(selectedReviewMonth(months,"",new Date(2026,9,30))).toBe("2026-10");
  expect(selectedReviewMonth(months,"",new Date(2027,2,1))).toBe("2026-10");
  expect(selectedReviewMonth(months,"2026-11")).toBe("2026-11");
  expect(reviewMonthLabel("2026-11")).toBe("November 2026");
 });
 it("uses Monday-start weeks that cross month and year boundaries",()=>{
  expect(reviewWeekStart("2026-11-01")).toBe("2026-10-26");
  expect(reviewWeekStart("2026-11-02")).toBe("2026-11-02");
  expect(reviewWeekStart("2027-01-01")).toBe("2026-12-28");
  expect(shiftReviewWeek("2026-12-28",1)).toBe("2027-01-04");
  expect(shiftReviewWeek("2026-11-02",-1)).toBe("2026-10-26");
  expect(reviewWeekLabel("2026-10-26")).toBe("Oct 26, 2026 – Nov 1, 2026");
 });
 it("permits empty weeks through next/previous while preserving chosen filter",()=>{
  const weeks=availableReviewWeeks([{date:"2026-10-30"},{date:"2026-11-15"}]);
  expect(weeks).toEqual(["2026-10-26","2026-11-09"]);
  expect(selectedReviewWeek(weeks,"2026-11-02")).toBe("2026-11-02");
  expect(selectedReviewWeek(weeks,"",new Date(2026,9,30))).toBe("2026-10-26");
 });
 it("includes moved entries in both their original and edited views",()=>{
  const edited={source:{date:"2026-10-31"},final:{date:"2026-11-02"}};
  expect(reviewMatchesMonth(edited,"2026-10")).toBe(true);
  expect(reviewMatchesMonth(edited,"2026-11")).toBe(true);
  expect(reviewMatchesWeek(edited,"2026-10-26")).toBe(true);
  expect(reviewMatchesWeek(edited,"2026-11-02")).toBe(true);
  expect(reviewMatchesDay(edited,"2026-10-31")).toBe(true);
  expect(reviewMatchesDay(edited,"2026-11-02")).toBe(true);
  expect(reviewMatchesMonth(edited,"2026-12")).toBe(false);
 });
 it("rejects nonexistent dates and derives no calendar view from them",()=>{
  expect(reviewWeekStart("2026-02-31")).toBeNull();
  expect(reviewWeekStart("2026-13-01")).toBeNull();
  expect(reviewWeekStart("invalid")).toBeNull();
  expect(availableReviewWeeks([{date:"invalid"}])).toEqual([]);
 });
});
