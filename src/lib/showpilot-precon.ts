/** Pre-Con notes use the existing private SQLite memory-note API.
 * No schema migration or separate AI server is required. JSON backups already
 * capture these "Recurring Events" notes, including their structured fields.
 */
export type PreConDraft={
  eventId:string;showName:string;showDate:string;rooms:string;
  overview:string;staffing:string;stage:string;floor:string;followUp:string;
};
export const PRECON_PREFIX="ShowPilot Pre-Con v1\n";
export const emptyPreCon=(date:string):PreConDraft=>({
  eventId:"",showName:"",showDate:date,rooms:"",
  overview:"",staffing:"",stage:"",floor:"",followUp:""
});
const iso=/^\d{4}-\d{2}-\d{2}$/;
export function preConNoteTitle(draft:PreConDraft):string{
 const identity=draft.eventId.trim()||draft.showName.trim();
 return ("Pre-Con: "+draft.showDate+" | "+identity).slice(0,140);
}
export function encodePreCon(draft:PreConDraft):string{
 if(!iso.test(draft.showDate)||Number.isNaN(Date.parse(draft.showDate+"T12:00:00Z"))||
   !draft.showName.trim()||/\b(?:cepac|cobb energy|performing arts)\b/i.test(draft.showName+" "+draft.rooms))
  throw new Error("Select a valid Cobb Convention Center-Atlanta show.");
 if(![draft.overview,draft.staffing,draft.stage,draft.floor,draft.followUp].some(x=>x.trim()))
  throw new Error("Add at least one Pre-Con note before saving.");
 return PRECON_PREFIX+JSON.stringify({
  eventId:draft.eventId.slice(0,100),showName:draft.showName.slice(0,140),
  showDate:draft.showDate,rooms:draft.rooms.slice(0,300),
  overview:draft.overview.slice(0,4000),staffing:draft.staffing.slice(0,4000),
  stage:draft.stage.slice(0,4000),floor:draft.floor.slice(0,4000),
  followUp:draft.followUp.slice(0,4000)
 });
}
export function decodePreCon(content:string):PreConDraft{
 if(!content.startsWith(PRECON_PREFIX))throw new Error("This is not a ShowPilot Pre-Con note.");
 let raw:unknown;
 try{raw=JSON.parse(content.slice(PRECON_PREFIX.length))}catch{throw new Error("Pre-Con note data is damaged.");}
 if(!raw||typeof raw!=="object")throw new Error("Invalid Pre-Con note.");
 const v=raw as Record<string,unknown>;
 const value=(key:keyof PreConDraft,max:number)=>typeof v[key]==="string"?(v[key] as string).slice(0,max):"";
 const result={
  eventId:value("eventId",100),showName:value("showName",140),
  showDate:value("showDate",10),rooms:value("rooms",300),
  overview:value("overview",4000),staffing:value("staffing",4000),
  stage:value("stage",4000),floor:value("floor",4000),followUp:value("followUp",4000)
 };
 if(!result.showName||!iso.test(result.showDate)||/\b(?:cepac|cobb energy|performing arts)\b/i.test(result.showName+" "+result.rooms))
  throw new Error("Saved Pre-Con note contains invalid show information.");
 return result;
}
