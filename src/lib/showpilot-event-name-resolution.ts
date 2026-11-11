import {expandSpace,isFunctionOnlyTitle,type EventEntry,type EventRow} from "./work-tools";
import type {PostConShow} from "./showpilot-postcon";

/** Event ID is the primary join key. Room/date is only an exact unique fallback.
 * Never substitute a function description or an unrelated booking for a show. */
function realShowName(raw:string|undefined):string{
 const name=(raw??"").replace(/\s+/g," ").trim();
 if(!name||isFunctionOnlyTitle(name)||
   /^(?:program\s+start|registration\s+open|exhibitor\s+access|client\s+(?:arrival|check[ -]?in)|general\s+session|doors?\s+open|room\s+(?:setup|turn|flip)|rehearsals?|vendor\s+load[ -]?in)$/i.test(name)||
   /^(?:unknown|untitled|unassigned|event\s*#?\d+|no event|not available)$/i.test(name))return "";
 return name;
}

function normalizedRoom(room:string):string[]{
 return expandSpace(room).filter(value=>/^(?:Hall [A-D]|BallRoom [A-G])$/i.test(value));
}
function topName(names:readonly string[]):string{
 const counts=new Map<string,{name:string;count:number}>();
 for(const name of names){
  const key=name.toLocaleLowerCase();
  const existing=counts.get(key);
  counts.set(key,{name,count:(existing?.count??0)+1});
 }
 return [...counts.values()].sort((a,b)=>b.count-a.count||b.name.length-a.name.length)[0]?.name??"";
}

/** Give Today rule checks the same verified parent event names as the
 * reviewed weekly export. Exact Event ID only; never infer ownership from
 * an overlapping room or arbitrary function title. */
export function resolveEventRowNames(
 rows:readonly EventRow[],shows:readonly PostConShow[]
):EventRow[]{
 const byId=new Map<string,string[]>();
 for(const show of shows){
  const name=realShowName(show.showName),id=show.eventId?.trim();
  if(id&&name)byId.set(id,[...(byId.get(id)??[]),name]);
 }
 for(const row of rows){
  const name=realShowName(row.event),id=row.eventId?.trim();
  if(id&&name)byId.set(id,[...(byId.get(id)??[]),name]);
 }
 return rows.map(row=>{
  const current=realShowName(row.event),id=row.eventId?.trim();
  if(current||!id)return {...row};
  const match=topName(byId.get(id)??[]);
  return match?{...row,event:match}:{...row};
 });
}

export type NamedScheduleResult={entries:EventEntry[];restored:number;unresolved:number};
/** Restore the booked parent show in imported, restored, and reviewed entries.
 * The verified local event catalog is consulted for exact Event IDs even if
 * the source workbook omitted an Event column or a grouped heading. */
export function resolveScheduleEventNames(
 entries:readonly EventEntry[],
 rows:readonly EventRow[],
 shows:readonly PostConShow[]=[]
):NamedScheduleResult{
 const sourceById=new Map<string,string[]>();
 const sourceByRoomDay=new Map<string,string[]>();
 for(const row of rows){
  const name=realShowName(row.event);
  if(!name)continue;
  // Grouped schedule exports may show the parent Event ID and name on a
  // header row with NO function date. Preserve that authoritative join.
  if(row.eventId?.trim()){
   const id=row.eventId.trim();
   sourceById.set(id,[...(sourceById.get(id)??[]),name]);
  }
  if(!row.date)continue;
  for(const room of normalizedRoom(row.space))
   sourceByRoomDay.set(row.date+"|"+room,[...(sourceByRoomDay.get(row.date+"|"+room)??[]),name]);
 }
 const catalogById=new Map<string,string[]>();
 for(const show of shows){
  const name=realShowName(show.showName);
  const id=show.eventId?.trim();
  if(id&&name)catalogById.set(id,[...(catalogById.get(id)??[]),name]);
 }
 let restored=0,unresolved=0;
 const named=entries.map(entry=>{
  const id=entry.eventId?.trim();
  const source=id?topName(sourceById.get(id)??[]):"";
  const catalog=id?topName(catalogById.get(id)??[]):"";
  // With an Event ID, an unverified title could be a function (e.g.
  // "Exhibitor Move-In"). Never promote it to a confirmed show name.
  const existing=realShowName(entry.showName)||(id?"":realShowName(entry.title));
  let match=source||catalog||existing;
  if(!match&&!id){
   const candidates=new Set<string>();
   for(const room of normalizedRoom(entry.space)){
    for(const name of sourceByRoomDay.get(entry.date+"|"+room)??[])candidates.add(name);
    for(const show of shows){
     const known=realShowName(show.showName);
     if(!known||show.eventId||show.startDate&&show.startDate>entry.date||show.showDate<entry.date)continue;
     if(!normalizedRoom(show.rooms).includes(room))continue;
     candidates.add(known);
    }
   }
   if(candidates.size===1)match=[...candidates][0]!;
  }
  if(!match){
   unresolved++;
   // Clear an unverified name rather than letting exports present an
   // activity as a confirmed event.
   return {...entry,showName:undefined};
  }
  if(match!==(entry.showName||"")||match!==entry.title)restored++;
  return {...entry,title:match,showName:match};
 });
 return {entries:named,restored,unresolved};
}
