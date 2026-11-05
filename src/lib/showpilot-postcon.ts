import {expandSpace,type EventEntry,type EventRow} from "./work-tools";

/** Only real CGC show names (not function descriptions) are saved locally.
 * The full imported workbooks are NOT copied into this cache or GitHub. */
export type PostConShow={key:string;eventId:string;showName:string;showDate:string;rooms:string;startDate?:string};
// v2 intentionally does not import the old v1 function-description catalog.
// The old cache stays untouched; loading a source report rebuilds valid show names.
export const POSTCON_CATALOG_KEY="showpilot:postcon:known-shows:v2";
const allowed=/^(?:Hall [A-D]|BallRoom [A-G])$/i;
const excluded=/\b(?:cepac|cobb energy|performing arts)\b/i;
const phases=new Set(["S","MI","Exmi","MO"]);
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T12:00:00Z"));
/** A show comes ONLY from the report's Event field. Function descriptions
 * are never acceptable fallbacks here (unlike in the engineering editor).
 * An event ID unifies its setup, show, meal and teardown functions.
 */
export function postConShowsFromReportRows(rows:readonly EventRow[]):PostConShow[]{
 const grouped=new Map<string,{eventId:string;name:string;first:string;last:string;rooms:Set<string>;names:Map<string,number>}>();
 const functionName=/^(?:(?:client|exhibitor|vendor|decorator|sponsor|av|a\/v|advanced expo services)\s+)?(?:move[ -]?in|move[ -]?out|load[ -]?in|load[ -]?out|set[ -]?up|program|general session|breakout session|registration|decorator day|rehearsal|meeting|certification room)(?:$|\s*[-/:]\s*.*$)/i;
 const genericFunction=/(?:^|\b)(?:move[ -]?in|move[ -]?out|load[ -]?in|load[ -]?out)(?:$|\b)/i;
 const tableFunction=/^tables?\s*(?:&|and)\s*chairs?(?:\s+inc\.)?\s+move[ -]?in(?:$|\b)/i;
 for(const row of rows){
  const name=(row.event??"").replace(/\s+/g," ").trim().slice(0,140);
  if(!name||functionName.test(name)||tableFunction.test(name)||(/^(?:av|decorator day|client|vendor|exhibitor|sponsor)\b/i.test(name)&&genericFunction.test(name))||!validDate(row.date)||excluded.test(row.space+" "+name))continue;
  const rooms=expandSpace(row.space).filter(room=>allowed.test(room));
  if(!rooms.length)continue;
  const eventId=(row.eventId??"").trim();
  // Avoid merging unrelated shows whose source does not contain an ID.
  const key=eventId?"id:"+eventId:"name:"+name.toLowerCase();
  let show=grouped.get(key);
  if(!show){
   show={eventId,name,first:row.date,last:row.date,rooms:new Set<string>(),names:new Map<string,number>()};
   grouped.set(key,show);
  }
  show.first=row.date<show.first?row.date:show.first;
  show.last=row.date>show.last?row.date:show.last;
  show.names.set(name,(show.names.get(name)??0)+1);
  for(const room of rooms)show.rooms.add(room);
 }
 return [...grouped].map(([key,g])=>{
  // Prefer the most frequent Event-field name when different rows have
  // abbreviated or truncated variants. Do not use the Description column.
  const showName=[...g.names].sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length)[0]?.[0]??g.name;
  return {key,eventId:g.eventId,showName,showDate:g.last,startDate:g.first,rooms:[...g.rooms].sort().join(", ")};
 }).sort((a,b)=>b.showDate.localeCompare(a.showDate)).slice(0,400);
}
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
/** Retain a browser cache only as a migration/fallback, not the authority. */
export function loadPostConShows():PostConShow[]{
 try{const raw=localStorage.getItem(POSTCON_CATALOG_KEY);const all=raw?JSON.parse(raw):[];
  return Array.isArray(all)?mergePostConShows([],all):[];}
 catch{return [];}
}
/** On every launch load the persistent app database. Bring forward v2 cached
 * show names once if still available; never import the old polluted v1 cache.
 */
export async function loadDurableShowCatalog():Promise<PostConShow[]>{
 const cached=loadPostConShows();
 const bridge=typeof window==="undefined"?undefined:window.showpilotMemory;
 if(!bridge?.showCatalogList||!bridge?.showCatalogSave)return cached;
 if(cached.length){
  try{await bridge.showCatalogSave(cached);}catch{
   // A malformed old cache must not prevent loading valid database records.
  }
 }
 const durable=mergePostConShows([],await bridge.showCatalogList());
 try{localStorage.setItem(POSTCON_CATALOG_KEY,JSON.stringify(durable));}catch{/* SQLite is authoritative. */}
 return durable;
}
/** Populate both dropdowns with real report Event names and persist immediately
 * to SQLite. The user can close/reopen ShowPilot or replace the portable build.
 */
export async function rememberPostConShowsFromReportRows(rows:readonly EventRow[]):Promise<{shows:number;unnamedRows:number;storage:"sqlite"|"browser"|"none"}>{
 const unnamedRows=rows.filter(row=>validDate(row.date)&&!row.event?.trim()).length;
 const found=postConShowsFromReportRows(rows);
 if(!found.length)return {shows:0,unnamedRows,storage:"none"};
 const bridge=typeof window==="undefined"?undefined:window.showpilotMemory;
 if(bridge?.showCatalogSave&&bridge.showCatalogList){
  await bridge.showCatalogSave(found); // Database fsync/atomic replace confirmed by main process.
  const all=await bridge.showCatalogList();
  try{localStorage.setItem(POSTCON_CATALOG_KEY,JSON.stringify(mergePostConShows([],all)))}catch{}
  window.dispatchEvent(new Event("showpilot:postcon-catalog"));
  return {shows:found.length,unnamedRows,storage:"sqlite"};
 }
 try{
  localStorage.setItem(POSTCON_CATALOG_KEY,JSON.stringify(mergePostConShows(loadPostConShows(),found)));
  window.dispatchEvent(new Event("showpilot:postcon-catalog"));
  return {shows:found.length,unnamedRows,storage:"browser"};
 }catch{
  return {shows:found.length,unnamedRows,storage:"none"};
 }
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
