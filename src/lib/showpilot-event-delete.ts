import type {ShowCatalogRecord} from "./showpilot-memory-bridge";
export type EventDeleteQuery=
 |{kind:"before";cutoff:string}
 |{kind:"event-id";eventId:string}
 |{kind:"name";name:string}
 |{kind:"need-date"}
 |{kind:"unrecognized"};
export type EventDeleteTarget=Pick<ShowCatalogRecord,"key"|"showName"|"showDate">;
export function parseEventDeleteRequest(message:string):EventDeleteQuery|null{
 const text=message.trim().replace(/\s+/g," ");
 if(!/^(?:please\s+)?(?:delete|remove|clear)\b/i.test(text))return null;
 const cutoff=/\b(?:before|older than|prior to)\s+(\d{4}-\d{2}-\d{2})\b/i.exec(text);
 if(cutoff){
  const date=cutoff[1]!;
  if(Number.isNaN(Date.parse(date+"T12:00:00Z")))return {kind:"unrecognized"};
  return {kind:"before",cutoff:date};
 }
 const id=/\b(?:event\s*(?:id|#)?\s*|show\s*#\s*)(\d{3,12})\b/i.exec(text);
 if(id)return {kind:"event-id",eventId:id[1]!};
 const named=/\b(?:event|show)\s+(?:called\s+|named\s+)?["“]?(.+?)["”]?\s*$/i.exec(text);
 if(named){
  const name=named[1]!.replace(/^["“]|["”]$/g,"").trim();
  if(name&&name.toLowerCase()!=="data")return {kind:"name",name};
 }
 if(/\b(?:old|older|past|historical|all)\s+(?:event|show)/i.test(text))
  return {kind:"need-date"};
 return {kind:"unrecognized"};
}
export function selectEventDeletionTargets(request:EventDeleteQuery,records:readonly ShowCatalogRecord[]):EventDeleteTarget[]{
 const matches=records.filter(record=>{
  if(request.kind==="before")return record.showDate<request.cutoff;
  if(request.kind==="event-id")return record.eventId===request.eventId||
   record.key==="id:"+request.eventId;
  if(request.kind==="name")return record.showName.trim().toLowerCase()===request.name.toLowerCase();
  return false;
 });
 return matches.map(record=>({key:record.key,showName:record.showName,showDate:record.showDate}));
}
export function isExactDeleteConfirmation(text:string):boolean{
 return text.trim().toLowerCase()==="yes";
}
