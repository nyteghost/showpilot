import type {GoogleCalendarSyncResult} from "./showpilot-calendar-bridge";

export type GoogleSyncDisplay={
  kind:"success"|"warning";
  message:string;
};

/** The Google API returned a result per shift. Show actual writes and any
 * unprocessed remainder; a partial sync must not be called "successful". */
export function googleSyncDisplay(result:GoogleCalendarSyncResult):GoogleSyncDisplay{
  const created=Math.max(0,result.created);
  const updated=Math.max(0,result.updated);
  const failed=Math.max(0,result.failed);
  const remaining=Math.max(0,result.remaining);
  const problems=[...result.errors].slice(0,3);
  const counts=`${created} added, ${updated} updated, ${failed} failed`+
    (remaining?`, ${remaining} not processed`:"");
  if(failed||remaining){
    return {
      kind:"warning",
      message:"Google Calendar update incomplete: "+counts+"."+
        (problems.length?" Problems: "+problems.join(" · "):"")+
        " Review failed shifts before retrying."
    };
  }
  return {kind:"success",message:"Google Calendar confirmed: "+counts+
    ". Check your connected Google Calendar for the updated shifts."};
}
