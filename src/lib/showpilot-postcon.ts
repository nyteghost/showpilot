import type {EventEntry} from "./work-tools";

/** Only CGC show/activity references are saved as a small, local dropdown catalog.
 * The full imported workbooks are NOT copied into this cache or GitHub. */
export type PostConShow={key:string;eventId:string;showName:string;showDate:string;rooms:string};
export const POSTCON_CATALOG_KEY="showpilot:postcon:known-shows:v1";
const allowed=/^(?:Hall [A-D]|BallRoom [A-G])$/i;
const excluded=/\b(?:cepac|cobb energy|performing arts)\b/i;
const phases=new Set(["S","MI","Exmi","MO"]);
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T12:00:00Z"));
export function postConShows(entries:readonly EventEntry[]):PostConShow[]{
 const grouped=new Map<string,{eventId:string;name:string;date:string;rooms:Set<string>}>();
 for(const entry of entries){
  if(!validDate(entry.date)||!phases.has(entry.code)||excluded.test(entry.space)||!allowed.test(entry.space)||!entry.title?.trim())continue;
  const eventId=entry.eventId?.trim()||"";
  const name=entry.title.trim().slice(0,140);
  const key=eventId?"id:"+eventId:"name:"+name.toLowerCase();
  let g=grouped.get(key);
  if(!g){g={eventId,name,date:entry.date,rooms:new Set()};grouped.set(key,g);}
  if(entry.date>g.date)g.date=entry.date;
  g.rooms.add(entry.space);
 }
 return [...grouped].map(([key,g])=>({key,eventId:g.eventId,showName:g.name,showDate:g.date,rooms:[...g.rooms].sort().join(", ")}))
  .sort((a,b)=>b.showDate.localeCompare(a.showDate)).slice(0,400);
}
export function mergePostConShows(previous:readonly PostConShow[],current:readonly PostConShow[]):PostConShow[]{
 const all=new Map<string,PostConShow>();
 for(const show of [...previous,...current]){
  if(!show||typeof show.key!=="string"||!validDate(show.showDate)||!show.showName||excluded.test(show.rooms))continue;
  const prior=all.get(show.key);
  if(!prior||show.showDate>=prior.showDate)all.set(show.key,{key:show.key.slice(0,180),eventId:String(show.eventId||"").slice(0,100),
   showName:show.showName.slice(0,140),showDate:show.showDate,rooms:show.rooms.slice(0,300)});
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
