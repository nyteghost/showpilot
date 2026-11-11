import {describe,it,expect} from "vitest";
import {currentNoticeEntries,localNoticeDate} from "../lib/showpilot-notice-dates";

describe("current room-notice dates",()=>{
  it("removes past dates, retains today/future and preserves source history",()=>{
    const entries=[{date:"2026-11-05"},{date:"2026-11-10"},{date:"2026-11-11"},{date:"2026-11-12"}];
    expect(currentNoticeEntries(entries,"2026-11-11")).toEqual(entries.slice(2));
    expect(entries).toHaveLength(4);
    expect(currentNoticeEntries(entries,"2026-11-12")).toEqual(entries.slice(3));
    expect(currentNoticeEntries(entries,"2027-01-01")).toEqual([]);
  });
  it("uses local calendar components on both sides of midnight",()=>{
    expect(localNoticeDate(new Date(2026,10,11,23,59))).toBe("2026-11-11");
    expect(localNoticeDate(new Date(2026,10,12,0,0))).toBe("2026-11-12");
  });
});
