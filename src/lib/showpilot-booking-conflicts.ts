import {BALLROOM_ROWS,HALL_ROWS,expandSpace,type EventEntry} from "./work-tools";

/** A verified overlap between activities belonging to two distinct bookings.
 * Intervals are half-open: 10:00–11:00 and 11:00–12:00 do not overlap.
 * Event-wide booking close is NOT a per-room hold; only actual activity
 * start/end times establish conflicts in this view. */
export type RoomBookingOverlap={
 date:string;
 space:string;
 pairs:{first:EventEntry;second:EventEntry;start:number;end:number}[];
};

type RoomInterval={entry:EventEntry;identity:string;start:number;end:number};
const PHYSICAL_CGC_ROOMS=new Set([...HALL_ROWS,...BALLROOM_ROWS]);
const bookingIdentity=(entry:EventEntry)=>{
 const id=entry.eventId?.trim();
 return id?"id:"+id:"title:"+(entry.showName||entry.title).trim().toLocaleLowerCase("en-US");
};
const nextDay=(iso:string,days:number)=>{
 const d=new Date(iso+"T00:00:00Z");
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
};

/** Flags real-time intersections, not simply multiple shows on the same date.
 * Expand combined halls/ballrooms to their physical rooms. Preserve the
 * original entry for the existing "jump to review" links. */
export function overlappingRoomBookings(entries:readonly EventEntry[]):RoomBookingOverlap[]{
 const byDayAndRoom=new Map<string,RoomInterval[]>();
 for(const entry of entries){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
   Number.isNaN(Date.parse(entry.date+"T00:00:00Z")) ||
   !Number.isFinite(entry.start)||!Number.isFinite(entry.end)||
   entry.start<0||entry.end<=entry.start||entry.end>2880 ||
   /cepac|cobb energy|performing arts/i.test(entry.space))continue;
  const identity=bookingIdentity(entry);
  if(!identity||identity==="title:")continue;
  const fromDay=Math.floor(entry.start/1440);
  const throughDay=Math.floor((entry.end-1)/1440);
  for(const room of new Set(expandSpace(entry.space))){
   if(!PHYSICAL_CGC_ROOMS.has(room))continue;
   for(let n=fromDay;n<=throughDay;n++){
    const start=Math.max(entry.start,n*1440)-n*1440;
    const end=Math.min(entry.end,(n+1)*1440)-n*1440;
    if(end<=start)continue;
    const date=nextDay(entry.date,n),key=date+"|"+room;
    byDayAndRoom.set(key,[...(byDayAndRoom.get(key)??[]),{entry,identity,start,end}]);
   }
  }
 }
 const result:RoomBookingOverlap[]=[];
 for(const [key,items] of byDayAndRoom){
  const [date,space]=key.split("|");
  if(!date||!space)continue;
  items.sort((a,b)=>a.start-b.start||a.end-b.end);
  const pairs:RoomBookingOverlap["pairs"]=[];
  for(let i=0;i<items.length;i++){
   const a=items[i]!;
   for(let j=i+1;j<items.length && items[j]!.start<a.end;j++){
    const b=items[j]!;
    if(a.identity===b.identity)continue;
    const start=Math.max(a.start,b.start),end=Math.min(a.end,b.end);
    if(start<end)pairs.push({first:a.entry,second:b.entry,start,end});
   }
  }
  if(pairs.length)result.push({date,space,pairs});
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||a.space.localeCompare(b.space));
}
