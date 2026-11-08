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

/** Controlled resolution for a ZIP with conflicting secondary document IDs.
 * Only an unambiguous EOC cover ID and an EXACT matching existing CGC show
 * can be accepted after a human has reviewed the documents. Multiple EOCs
 * with different IDs can never be overridden here; split the ZIP instead. */
export function canAcknowledgeZipIdConflict(
 metadata:Pick<EventMetadataResult,"eventId"|"evidence">,
 show:PostConShow|null|undefined
):boolean{
 if(!show)return false;
 const wanted=normalizedEventId(metadata.eventId);
 if(!wanted)return false;
 const eocIds=new Set(metadata.evidence
  .filter(x=>x.field==="eventId"&&x.source.startsWith("EOC cover page:"))
  .map(x=>normalizedEventId(x.value)).filter(Boolean));
 if(eocIds.size!==1||!eocIds.has(wanted))return false;
 const target=normalizedEventId(show.eventId||(/^id:/i.test(show.key)?show.key.slice(3):""));
 if(target!==wanted)return false;
 const all=new Set(metadata.evidence.filter(x=>x.field==="eventId")
  .map(x=>normalizedEventId(x.value)).filter(Boolean));
 return all.size>1; // This option is ONLY for genuine conflicting evidence.
}
