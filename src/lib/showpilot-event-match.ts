import type {PostConShow} from "./showpilot-postcon";
import type {EventMetadataResult} from "./showpilot-event-discovery";

/** Match document archives to saved CGC shows by their actual Event ID.
 * Never use show names, dates, the highlighted UI row or inferred titles as
 * automatic attachment targets: multiple events can share those details. */
export type EventZipMatch =
 | {status:"matched";show:PostConShow}
 | {status:"missing-id"|"conflicting-ids"|"no-match"|"ambiguous"};

export function normalizedEventId(value:string):string {
 return value.trim().replace(/^#\s*/,"").toLowerCase();
}

export function matchEventZipToShow(metadata:Pick<EventMetadataResult,"eventId"|"evidence">,shows:readonly PostConShow[]):EventZipMatch{
 const id=normalizedEventId(metadata.eventId);
 const evidenceIds=new Set(metadata.evidence.filter(e=>e.field==="eventId")
  .map(e=>normalizedEventId(e.value)).filter(Boolean));
 if(id)evidenceIds.add(id);
 if(evidenceIds.size>1)return {status:"conflicting-ids"};
 if(!id)return {status:"missing-id"};
 const matches=shows.filter(show=>normalizedEventId(show.eventId||(/^id:/i.test(show.key)?show.key.slice(3):""))===id);
 if(matches.length===0)return {status:"no-match"};
 if(matches.length>1)return {status:"ambiguous"};
 return {status:"matched",show:matches[0]!};
}
