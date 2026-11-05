import {describe,expect,it} from "vitest";
import {postConShowsFromReportRows} from "@/lib/showpilot-postcon";
import {matchEventZipToShow} from "@/lib/showpilot-event-match";
import type {EventRow} from "@/lib/work-tools";

const row=(patch:Partial<EventRow>):EventRow=>({
 level:2,usage:"",start:"08:00 AM",end:"05:00 PM",
 description:"General Session",space:"Hall A",date:"2026-11-05",
 event:"Atlanta Annual Expo",eventId:"42389",...patch
});

describe("Event Schedule import creates one Events record per CGC Event ID",()=>{
 it("groups move-in, show, teardown and rooms under the SAME ID and maintains its date span",()=>{
  const events=postConShowsFromReportRows([
   row({description:"Client Move In",date:"2026-11-04",space:"Hall A"}),
   row({description:"Show Open",date:"2026-11-05",space:"Hall B"}),
   row({description:"Lunch",date:"2026-11-05",space:"Hall A"}),
   row({description:"Move Out",date:"2026-11-07",space:"Hall B"})
  ]);
  expect(events).toHaveLength(1);
  expect(events[0]).toEqual({
   key:"id:42389",eventId:"42389",showName:"Atlanta Annual Expo",
   startDate:"2026-11-04",showDate:"2026-11-07",rooms:"Hall A, Hall B"
  });
 });
 it("does not merge different Event IDs even when their display names are identical",()=>{
  const events=postConShowsFromReportRows([row({eventId:"42389"}),row({eventId:"53820",space:"Hall C"})]);
  expect(events).toHaveLength(2);
  expect(new Set(events.map(x=>x.key))).toEqual(new Set(["id:42389","id:53820"]));
  expect(events.every(x=>x.showName==="Atlanta Annual Expo")).toBe(true);
 });
 it("does not create Events records for CEPAC or function-only rows",()=>{
  const events=postConShowsFromReportRows([
   row({space:"CEPAC Mainstage",event:"Energy Show",eventId:"99111"}),
   row({event:"Move In",eventId:"99222"}),
   row({event:"",eventId:"99333"}),
   row({event:"Real CGC Show",eventId:"99444",space:"Ballroom ABE (BRABE)"})
  ]);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({key:"id:99444",eventId:"99444",rooms:"BallRoom A, BallRoom B, BallRoom E"});
 });
 it("links a later ZIP to the correct schedule-created Events record by ID, not show name",()=>{
  const events=postConShowsFromReportRows([row({eventId:"42389"}),row({eventId:"53820",space:"Hall C"})]);
  const matched=matchEventZipToShow({
   eventId:"53820",evidence:[{field:"eventId",value:"53820",source:"EOC.pdf"}]
  },events);
  expect(matched.status).toBe("matched");
  if(matched.status==="matched")expect(matched.show.key).toBe("id:53820");
 });
});
