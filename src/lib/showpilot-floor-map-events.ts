import type {PostConShow} from "./showpilot-postcon";
import type {EventFileRecord} from "./showpilot-event-assets";

/** A typed Event ID is a lookup, not permission to create a new event.
 * The layout can be linked only when exactly one existing CGC show matches. */
export function findFloorMapShowById(
 id:string,shows:readonly PostConShow[]
):{status:"matched"|"missing"|"unknown"|"ambiguous";show?:PostConShow}{
 const eventId=id.trim().replace(/^#/,"");
 if(!eventId)return {status:"missing"};
 if(!/^\d{3,12}$/.test(eventId))return {status:"unknown"};
 const matched=shows.filter(s=>
  s.eventId.trim()===eventId&&!/\b(?:CEPAC|Cobb Energy|Performing Arts)\b/i.test(s.showName+" "+s.rooms));
 if(!matched.length)return {status:"unknown"};
 if(matched.length>1)return {status:"ambiguous"};
 return {status:"matched",show:matched[0]};
}
/** A Better Work Order Items report is distinct from the "Better Work
 * Orders" summary, which cannot identify ordered utility quantities. */
export function isBetterWorkOrderItems(name:string):boolean{
 const clean=name.replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
 return /\bbetter\s+work\s+order\s+items?\b/i.test(clean)||
  /\bitemi[sz]ed\s+(?:better\s+)?work\s+order\s+items?\b/i.test(clean);
}
export function linkedMapDocuments(
 files:readonly (EventFileRecord&{available:boolean})[]
):{layouts:(EventFileRecord&{available:boolean})[];reports:(EventFileRecord&{available:boolean})[]}{
 const active=files.filter(f=>f.available&&!f.archived);
 const layouts=active.filter(f=>f.kind==="diagram"&&
  ["pdf","png","jpg","jpeg","webp"].includes(f.extension)&&
  /(?:exhibit|floor|hall|booth|layout|plan|map|diagram)/i.test(f.name))
  .sort((a,b)=>Number(a.extension==="pdf")-Number(b.extension==="pdf")||b.created.localeCompare(a.created));
 const reports=active.filter(f=>
  ["exhibitor-order","work-order","other"].includes(f.kind)&&f.extension==="pdf"&&isBetterWorkOrderItems(f.name))
  .sort((a,b)=>b.created.localeCompare(a.created));
 return {layouts,reports};
}