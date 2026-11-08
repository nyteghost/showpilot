import type {PostConShow} from "./showpilot-postcon";

/** Evidence-based routing for uploaded exhibitor work orders.
 * Numbers on invoices, booths, or work orders are NOT event IDs. */
export type OrderIdEvidence={value:string;source:"document"|"filename"};
export type ExhibitorOrderMatch={
 status:"matched"|"missing-id"|"unmatched-id"|"ambiguous-event"|"conflicting-ids";
 eventId:string;
 show?:PostConShow;
 evidence:OrderIdEvidence[];
};
const eventIdPattern=/\b(?:event|show)\s*(?:id|number|no\.?|#)\s*[:#=-]?\s*#?\s*(\d{3,12})\b/gi;
const parenthesizedEvent=/\b(?:event|show)\s*(?:name|title)\s*[:\-]\s*[^\r\n()]{3,120}\(\s*(\d{3,12})\s*\)/gi;
export function normalizedOrderEventId(value:string):string{
 return value.trim().replace(/^#/,"").trim();
}
export function extractOrderEventIdEvidence(name:string,text:string):OrderIdEvidence[]{
 const found:OrderIdEvidence[]=[];
 const add=(value:string,source:OrderIdEvidence["source"])=>{
  const id=normalizedOrderEventId(value);
  if(!/^\d{3,12}$/.test(id)||found.some(x=>x.value===id&&x.source===source))return;
  found.push({value:id,source});
 };
 for(const pattern of [eventIdPattern,parenthesizedEvent]){
  pattern.lastIndex=0;
  for(const match of text.slice(0,60000).matchAll(pattern))add(match[1]!,"document");
 }
 // Filename matching is intentionally strict. "WO-41622" alone may refer
 // to an order number and must never become an event association.
 eventIdPattern.lastIndex=0;
 for(const match of name.matchAll(eventIdPattern))add(match[1]!,"filename");
 return found;
}
/** An exact unique Event ID match is the only automatic association.
 * Missing IDs require explicit user selection and confirmation; conflicting
 * IDs are blocked until documents are separated or corrected. */
export function matchExhibitorOrder(
 name:string,text:string,shows:readonly PostConShow[]
):ExhibitorOrderMatch{
 const evidence=extractOrderEventIdEvidence(name,text);
 const documentIds=[...new Set(evidence.filter(e=>e.source==="document").map(e=>e.value))];
 const allIds=[...new Set(evidence.map(e=>e.value))];
 if(allIds.length>1)return {status:"conflicting-ids",eventId:"",evidence};
 const eventId=documentIds[0]??allIds[0]??"";
 if(!eventId)return {status:"missing-id",eventId:"",evidence};
 const matches=shows.filter(show=>
  !/\b(?:CEPAC|Cobb Energy|Performing Arts)\b/i.test(show.showName+" "+show.rooms)&&
  normalizedOrderEventId(show.eventId||"")===eventId);
 if(matches.length===0)return {status:"unmatched-id",eventId,evidence};
 if(matches.length>1)return {status:"ambiguous-event",eventId,evidence};
 return {status:"matched",eventId,show:matches[0],evidence};
}
