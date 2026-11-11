import {describe,it,expect} from "vitest";
import {overlappingRoomBookings} from "../lib/showpilot-booking-conflicts";
import type {EventEntry,EventCode} from "../lib/work-tools";

const entry=(date:string,space:string,title:string,eventId:string,code:EventCode,
  start:number,end:number,extras:Partial<EventEntry>={}):EventEntry=>({
 date,space,title,showName:title,eventId,code,start,end,...extras
});

describe("ShowPilot double-booking detection by actual function time",()=>{
 it("does not warn about CW Matthews morning setup/show and Sigma Nu evening dinner on December 5",()=>{
  const date="2026-12-05",room="BallRoom ABCDEFG";
  const cw="CW Matthews Contracting Co., Inc.";
  const sigma="Sigma NU Fraternity 50th Anniversary";
  const events=[
   entry(date,room,cw,"40100","MI",360,435,{bookingEnd:630}),
   entry(date,room,cw,"40100","S",450,645,{bookingEnd:630}),
   entry(date,room,cw,"40100","MO",645,660,{bookingEnd:630}),
   entry(date,room,sigma,"40200","Dinner",1110,1230,{bookingStart:1080,bookingEnd:1439})
  ];
  expect(overlappingRoomBookings(events)).toEqual([]);
 });
 it("does not flag simultaneous Sneaker Con banner hanging and exhibitor load-in from the same Event ID",()=>{
  const date="2026-12-04",room="Hall CD",name="Sneaker Con";
  const entries=[
   entry(date,room,name,"40300","MI",360,840),
   entry(date,room,name,"40300","MI",540,840),
   entry(date,room,name,"40300","Exmi",840,1020)
  ];
  expect(overlappingRoomBookings(entries)).toEqual([]);
 });
 it("detects two distinct Event IDs occupying the same physical room at the same time",()=>{
  const date="2026-12-05";
  const overlap=overlappingRoomBookings([
   entry(date,"BallRoom ABCDEFG","First Show","40001","S",540,780),
   entry(date,"BallRoom A","Second Show","40002","MI",720,840)
  ]);
  expect(overlap).toHaveLength(1);
  expect(overlap[0]).toMatchObject({date,space:"BallRoom A",pairs:[{
   start:720,end:780,first:{eventId:"40001"},second:{eventId:"40002"}
  }]});
 });
 it("back-to-back functions with equal end/start are not overlapping",()=>{
  expect(overlappingRoomBookings([
   entry("2026-12-05","Hall CD","Show One","1","S",360,840),
   entry("2026-12-05","Hall C","Show Two","2","MI",840,1140)
  ])).toEqual([]);
 });
 it("a prior evening function crossing midnight can conflict on the following date",()=>{
  const r=overlappingRoomBookings([
   entry("2026-12-05","Hall D","Night Show","1","S",1380,1500),
   entry("2026-12-06","Hall D","Morning Show","2","MI",30,120)
  ]);
  expect(r).toMatchObject([{date:"2026-12-06",space:"Hall D",pairs:[{start:30,end:60}]}]);
 });
 it("ignores unverified auto-inferred MO? and separate CEPAC functions",()=>{
  expect(overlappingRoomBookings([
   entry("2026-12-05","Hall A","Show One","1","MO?",360,700),
   entry("2026-12-05","Hall A","Show Two","2","S",420,600),
   entry("2026-12-05","CEPAC Stage","Show Three","3","S",420,600)
  ])).toEqual([]);
 });
});
