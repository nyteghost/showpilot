import type {PostConShow} from "./showpilot-postcon";

/** Stage data belongs to a confirmed Events record, never to the current tab.
 * Event IDs unify setup, show and strike phases even if the catalog name
 * changes. Older unscoped stage-planner keys are deliberately left untouched. */
export type LinkedStageEvent=Pick<PostConShow,"key"|"eventId"|"showName"|"showDate"|"startDate">;
export type StageStoragePart="stages"|"app"|"extras"|"plans"|"layout";
const ISO=/^\d{4}-\d{2}-\d{2}$/;
export function stageEventIdentity(show:LinkedStageEvent):string{
 const id=show.eventId.trim();
 if(/^\d{3,12}$/.test(id))return "event-id:"+id;
 const key=show.key.trim();
 // Only an actual record key may identify an event with no confirmed ID.
 // Never fall back to a shared title such as "Stage" or "Unknown event".
 if(!key||key.length>180||key==="__proto__"||key==="constructor")
  throw new Error("Select a saved Events record before editing its stage.");
 return "event-key:"+encodeURIComponent(key);
}
export function eventStageKey(show:LinkedStageEvent,part:StageStoragePart):string{
 return "showpilot:deck-planner:v2:"+stageEventIdentity(show)+":"+part;
}
export type StageEventHeader={eventName:string;showDate:string;buildByDate:string};
export function stageHeaderForEvent(show:LinkedStageEvent):StageEventHeader{
 const eventName=show.showName.trim().slice(0,180);
 const showDate=ISO.test(show.showDate)?show.showDate:"";
 // The first event day is the earliest of its saved booking start and
 // actual show date; don't generate a date from today's clock.
 const start=show.startDate&&ISO.test(show.startDate)?show.startDate:"";
 const buildByDate=start&&(!showDate||start<=showDate)?start:showDate;
 return {eventName,showDate,buildByDate};
}
