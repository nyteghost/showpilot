import {expandSpace,type EventEntry} from "./work-tools";

/** Only CGC show/activity references are saved as a small, local dropdown catalog.
 * The full imported workbooks are NOT copied into this cache or GitHub. */
export type PostConShow={key:string;eventId:string;showName:string;showDate:string;rooms:string;startDate?:string};
export const POSTCON_CATALOG_KEY="showpilot:postcon:known-shows:v1";
const allowed=/^(?:Hall [A-D]|BallRoom [A-G])$/i;
const excluded=/\b(?:cepac|cobb energy|performing arts)\b/i;
const phases=new Set(["S","MI","Exmi","MO"]);
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T12:00:00Z"));
export function postConShows(entries:readonly EventEntry[]):PostConShow[]{
 const grouped=new Map<string,{eventId:string;name:string;date:string;startDate:string;rooms:Set<string>}>();
 for(const entry of entries){
  if(!validDate(entry.date)||!phases.has(entry.code)||excluded.test(entry.space)||!entry.title?.trim())continue;
  const cgcRooms=expandSpace(entry.space).filter(room=>allowed.test(room));
  if(!cgcRooms.length)continue;
  const eventId=entry.eventId?.trim()||"";
  const name=entry.title.trim().slice(0,140);
  const key=eventId?"id:"+eventId:"name:"+name.toLowerCase();
  let g=grouped.get(key);
  if(!g){g={eventId,name,date:entry.date,startDate:entry.date,rooms:new Set()};grouped.set(key,g);}
  if(entry.date>g.date)g.date=entry.date;
  if(entry.date<g.startDate)g.startDate=entry.date;
  for(const room of cgcRooms)g.rooms.add(room);
 }
 return [...grouped].map(([key,g])=>({key,eventId:g.eventId,showName:g.name,showDate:g.date,startDate:g.startDate,rooms:[...g.rooms].sort().join(", ")}))
  .sort((a,b)=>b.showDate.localeCompare(a.showDate)).slice(0,400);
}
export function mergePostConShows(previous:readonly PostConShow[],current:readonly PostConShow[]):PostConShow[]{
 const all=new Map<string,PostConShow>();
 for(const show of [...previous,...current]){
  if(!show||typeof show.key!=="string"||!validDate(show.showDate)||!show.showName||excluded.test(show.rooms))continue;
  const prior=all.get(show.key);
  const start=validDate(show.startDate??"")?show.startDate!:show.showDate;
  const earliest=prior?[prior.startDate??prior.showDate,start].sort()[0]!:start;
  if(!prior||show.showDate>=prior.showDate)all.set(show.key,{key:show.key.slice(0,180),eventId:String(show.eventId||"").slice(0,100),
   showName:show.showName.slice(0,140),showDate:show.showDate,startDate:earliest,rooms:show.rooms.slice(0,300)});
  else if(earliest!==(prior.startDate??prior.showDate))all.set(show.key,{...prior,startDate:earliest});
 }
 return [...all.values()].sort((a,b)=>b.showDate.localeCompare(a.showDate)).slice(0,400);
}
export function loadPostConShows():PostConShow[]{
 try{const raw=localStorage.getItem(POSTCON_CATALOG_KEY);const all=raw?JSON.parse(raw):[];return Array.isArray(all)?mergePostConShows([],all):[];}
 catch{return [];}
}
export function rememberPostConShows(entries:readonly EventEntry[]):void{
 try{
  const found=postConShows(entries);
  if(!found.length)return;
  localStorage.setItem(POSTCON_CATALOG_KEY,JSON.stringify(mergePostConShows(loadPostConShows(),found)));
  window.dispatchEvent(new Event("showpilot:postcon-catalog"));
 }catch{/* Browser storage may be unavailable. The Post-Con form still supports manual shows. */}
}

/** Use local work-PC calendar dates, never UTC time-of-day boundaries, to avoid
 * a completed show dropping off the list near midnight.
 */
export function localIsoDate(date=new Date()):string{
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
export function shiftedIsoDay(day:string,amount:number):string{
 const dt=new Date(day+"T12:00:00Z");
 if(Number.isNaN(dt.getTime()))return "";
 dt.setUTCDate(dt.getUTCDate()+amount);
 return dt.toISOString().slice(0,10);
}
/** Last 30 complete calendar days including today, with recent shows first. */
export function completedShowsLastMonth(shows:readonly PostConShow[],today=localIsoDate()):PostConShow[]{
 const start=shiftedIsoDay(today,-29);
 return shows.filter(s=>s.showDate>=start&&s.showDate<=today).sort((a,b)=>b.showDate.localeCompare(a.showDate));
}
/** Upcoming and currently scheduled CGC events for pre-show planning. */
export function upcomingPreConShows(shows:readonly PostConShow[],today=localIsoDate(),days=30):PostConShow[]{
 const until=shiftedIsoDay(today,Math.max(1,days)-1);
 // A multi-day show belongs in Pre-Con if any scheduled day overlaps the period.
 return shows.filter(s=>s.showDate>=today&&(s.startDate??s.showDate)<=until)
  .sort((a,b)=>(a.startDate??a.showDate).localeCompare(b.startDate??b.showDate));
}
/** Read-only SQLite reviewed-event rows and imported catalog refer to the same
 * local CGC show list. Don't invent show metadata from unrelated shift history.
 */
export type ShowHistoryRow={date:string;room:string;title:string;phase:string};
export function historyToShowCatalog(rows:readonly ShowHistoryRow[]):PostConShow[]{
 return postConShows(rows.map(r=>({
  date:r.date,space:r.room,title:r.title,code:r.phase as EventEntry["code"],
  start:0,end:0,eventId:""
 })) as EventEntry[]);
}
