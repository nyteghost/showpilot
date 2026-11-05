import type {EventMetadataResult,EventMetadataSource} from "./showpilot-event-discovery";

export type ZipScheduleHint={source:string;text:string;topic:"Stage & Deck"|"Engineering"|"Utility"|"Move-in/out"|"Room Changes"};
export type ZipScheduleEvidence={
 version:1;eventKey:string;sourceZip:string;created:string;
 detected:EventMetadataResult;
 reviewed:{showName:string;eventId:string;startDate:string;showDate:string;rooms:string[]};
 documents:{path:string;kind:string}[];hints:ZipScheduleHint[];
};
/** Evidence for a human to reconcile with the approved engineering schedule.
 * No calendar entries or shifts are generated from unverified ZIP text.
 */
export function scheduleHintsFromSources(sources:readonly EventMetadataSource[]):ZipScheduleHint[]{
 const hints:ZipScheduleHint[]=[];
 for(const source of sources.slice(0,48)){
  for(const raw of source.text.split(/\r?\n/).slice(0,2000)){
   const line=raw.replace(/\s+/g," ").trim().slice(0,350);
   if(line.length<8)continue;
   const topic:ZipScheduleHint["topic"]|null=
    /\b(?:stage|deck|riser|platform|stage stairs|stage ramp)\b/i.test(line)?"Stage & Deck":
    /\b(?:utility|electric|power|208V|120V|water|compressed air|internet drop)\b/i.test(line)?"Utility":
    /\b(?:move[\s-]?in|move[\s-]?out|load[\s-]?in|load[\s-]?out|setup|set[\s-]?up|strike)\b/i.test(line)?"Move-in/out":
    /\b(?:air\s*wall|room turn|room flip|ballroom configuration)\b/i.test(line)?"Room Changes":
    /\b(?:engineering|technical requirements?|rigging)\b/i.test(line)?"Engineering":null;
   if(!topic)continue;
   if(!hints.some(h=>h.text===line&&h.topic===topic))hints.push({source:source.path,topic,text:line});
   if(hints.length>=40)return hints;
  }
 }
 return hints;
}
export const ZIP_SCHEDULE_PREFIX="ShowPilot ZIP Schedule Evidence v1\n";
export function serializeZipSchedule(evidence:ZipScheduleEvidence):string{
 return ZIP_SCHEDULE_PREFIX+JSON.stringify(evidence);
}
export function parseZipSchedule(content:string):ZipScheduleEvidence|null{
 if(!content.startsWith(ZIP_SCHEDULE_PREFIX))return null;
 try{
  const v=JSON.parse(content.slice(ZIP_SCHEDULE_PREFIX.length)) as ZipScheduleEvidence;
  if(v.version!==1||typeof v.eventKey!=="string"||!Array.isArray(v.hints)||!v.detected)return null;
  return v;
 }catch{return null;}
}
