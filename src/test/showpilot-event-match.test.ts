import {describe,expect,it} from "vitest";
import {canAcknowledgeZipIdConflict,matchEventZipToShow,normalizedEventId} from "@/lib/showpilot-event-match";
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
 it("does not let #tes or other alphabetic placeholders block a real numeric EOC ID",()=>{
  const metadata={
   eventId:"42389",
   evidence:[
    {field:"eventId" as const,value:"42389",source:"EOC cover page: Event Order Confirmation - Internal (2).pdf"},
    {field:"eventId" as const,value:"tes",source:"Event Order Confirmation - Internal (2).pdf"},
    {field:"eventId" as const,value:"42389",source:"ZIP filename (fallback)"}
   ]
  };
  expect(matchEventZipToShow(metadata,shows)).toEqual({status:"matched",show:shows[0]});
  expect(canAcknowledgeZipIdConflict(metadata,shows[0])).toBe(false);
  expect(matchEventZipToShow(meta("tes",["tes"]),shows).status).toBe("missing-id");
  expect(matchEventZipToShow(meta("42389",["42389","53820"]),shows).status)
   .toBe("conflicting-ids");
 });
 it("rejects ambiguous catalog duplicates rather than choosing arbitrarily",()=>{
  expect(matchEventZipToShow(meta("42389"),[...shows,{...shows[0]!,key:"name:duplicate"}]).status).toBe("ambiguous");
 });
 it("can find an older ID-keyed show record that lacks the eventId field",()=>{
  const legacy=[{...shows[0]!,eventId:""}];
  expect(matchEventZipToShow(meta("42389"),legacy)).toEqual({status:"matched",show:legacy[0]});
 });
});

describe("Explicit review of conflicting ZIP document IDs",()=>{
 const eoc="EOC cover page: Hospitality Industry Ministries EOC.pdf";
 const event={key:"id:41622",eventId:"41622",showName:"Hospitality Industry Ministries",
  showDate:"2026-11-06",startDate:"2026-11-06",rooms:"BallRoom A, BallRoom B, BallRoom E"};
 const header={eventId:"41622",evidence:[
  {field:"eventId" as const,value:"41622",source:eoc},
  {field:"eventId" as const,value:"41622",source:"ZIP filename (fallback)"},
  {field:"eventId" as const,value:"55555",source:"Work Orders/secondary.txt"}
 ]};
 it("permits review only against the exact existing EOC-cover ID",()=>{
  expect(matchEventZipToShow(header,[event]).status).toBe("conflicting-ids");
  expect(canAcknowledgeZipIdConflict(header,event)).toBe(true);
  expect(canAcknowledgeZipIdConflict(header,{...event,eventId:"55555",key:"id:55555"})).toBe(false);
  expect(canAcknowledgeZipIdConflict(header,null)).toBe(false);
 });
 it("never bypasses ambiguity between multiple different EOC cover IDs",()=>{
  expect(canAcknowledgeZipIdConflict({...header,evidence:[
   ...header.evidence,{field:"eventId" as const,value:"55555",source:"EOC cover page: other.pdf"}
  ]},event)).toBe(false);
 });
 it("requires a readable EOC cover and genuine conflicting secondary evidence",()=>{
  expect(canAcknowledgeZipIdConflict({
   ...header,evidence:header.evidence.filter(x=>!x.source.startsWith("EOC cover page:"))
  },event)).toBe(false);
  expect(canAcknowledgeZipIdConflict({
   ...header,evidence:header.evidence.filter(x=>x.value==="41622")
  },event)).toBe(false);
 });
});
