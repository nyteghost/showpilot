import {describe,expect,it} from "vitest";
import {matchEventZipToShow,normalizedEventId} from "@/lib/showpilot-event-match";
import type {PostConShow} from "@/lib/showpilot-postcon";
import type {EventMetadataResult} from "@/lib/showpilot-event-discovery";
const shows:PostConShow[]=[
 {key:"id:42389",eventId:"42389",showName:"Fall Expo",startDate:"2026-11-05",showDate:"2026-11-07",rooms:"Hall A"},
 {key:"id:53820",eventId:"53820",showName:"Fall Expo",startDate:"2026-11-05",showDate:"2026-11-07",rooms:"Hall B"}
];
const meta=(id:string,ids=[id]):Pick<EventMetadataResult,"eventId"|"evidence">=>({
 eventId:id,evidence:ids.filter(Boolean).map(value=>({field:"eventId" as const,value,source:"EOC.pdf"}))
});
describe("Event Schedule and ZIP Event ID linking",()=>{
 it("targets a saved schedule event by exact ID, not its shared show name or selected UI row",()=>{
  expect(matchEventZipToShow(meta("42389"),shows)).toEqual({status:"matched",show:shows[0]});
  expect(matchEventZipToShow(meta("53820"),shows)).toEqual({status:"matched",show:shows[1]});
  expect(matchEventZipToShow(meta("  #42389  "),shows)).toEqual({status:"matched",show:shows[0]});
 });
 it("does not guess a match for absent, unrelated or conflicting IDs",()=>{
  expect(matchEventZipToShow(meta(""),shows).status).toBe("missing-id");
  expect(matchEventZipToShow(meta("99999"),shows).status).toBe("no-match");
  expect(matchEventZipToShow(meta("42389",["42389","53820"]),shows).status).toBe("conflicting-ids");
  expect(normalizedEventId("001234")).toBe("001234"); // Do not discard leading zeroes.
 });
 it("rejects ambiguous catalog duplicates rather than choosing arbitrarily",()=>{
  expect(matchEventZipToShow(meta("42389"),[...shows,{...shows[0]!,key:"name:duplicate"}]).status).toBe("ambiguous");
 });
 it("can find an older ID-keyed show record that lacks the eventId field",()=>{
  const legacy=[{...shows[0]!,eventId:""}];
  expect(matchEventZipToShow(meta("42389"),legacy)).toEqual({status:"matched",show:legacy[0]});
 });
});
