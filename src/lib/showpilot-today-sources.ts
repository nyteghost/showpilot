import type {TaskNote} from "./work-tools";
import {summarizeEvents,isCancelledRow,isPendingRow,airwallTasks,formatMinutes,expandSpace} from "./work-tools";
import {scopeShowPilotRows} from "./showpilot-venue";
import {applyReview,parseReviewProject,type ReviewProject} from "./showpilot-review";
import {postConShowsFromReportRows} from "./showpilot-postcon";
import type {PostConShow} from "./showpilot-postcon";

/** Dated activity is not the same as a catalog start/end date. Catalog ranges
 * can be incomplete or historical, while the engineering schedule may include
 * preparation, show and teardown on separate days. Never replace an EOC record
 * or assign documents to an unverified show name. */
export type DailyActivity={
 date:string;eventId:string;showName:string;rooms:string[];
 source:"event-schedule"|"engineering-workbook";
 details:string[];
};
export type WorkbookWallTask={date:string;section:"HALLS"|"BALLROOM";text:string;source:"engineering-workbook"};
export type WorkbookActivityResult={activities:DailyActivity[];airwalls:WorkbookWallTask[];warnings:string[]};
export type TodayJoined={
 shows:PostConShow[];activeDates:Record<string,string[]>;
 origin:Record<string,DailyActivity["source"]>;
 daily:Record<string,Record<string,string[]>>;
 unlinkedKeys:string[];
 /** Schedule function lines without a verified event or unique same-day room
  * match. Never count these as standalone shows or silently assign EOCs. */
 unlinkedFunctions:DailyActivity[];
};
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const nonCgc=/\b(?:CEPAC|cobb energy|performing arts)\b/i;
const canonical=(s:string)=>s.normalize("NFKC").replace(/\s+/g," ").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
function safeDate(s:string):boolean{
 return ISO.test(s)&&!Number.isNaN(new Date(s+"T12:00:00Z").getTime());
}
function maybeRoom(s:string):string|null{
 const label=s.replace(/\s+/g," ").trim();
 const hall=/^Hall ([A-D])$/i.exec(label);
 const br=/^Ball\s*Room ([A-G])$/i.exec(label);
 if(hall)return "Hall "+hall[1]!.toUpperCase();
 if(br)return "BallRoom "+br[1]!.toUpperCase();
 return null;
}
function aggregate(items:readonly DailyActivity[]):DailyActivity[]{
 const merged=new Map<string,DailyActivity>();
 for(const row of items){
  if(!safeDate(row.date)||!row.showName.trim()||nonCgc.test(row.showName+" "+row.rooms.join(" ")))continue;
  const key=row.date+"|"+(row.eventId.trim()?"id:"+row.eventId.trim():"name:"+canonical(row.showName));
  const old=merged.get(key);
  if(old){
   for(const room of row.rooms)if(!old.rooms.includes(room))old.rooms.push(room);
   for(const detail of row.details)if(!old.details.includes(detail))old.details.push(detail);
   if(row.source==="event-schedule")old.source=row.source;
  }else merged.set(key,{...row,rooms:[...row.rooms],details:[...row.details]});
 }
 return [...merged.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.showName.localeCompare(b.showName));
}
export function activitiesFromReviewProject(project:ReviewProject):{activities:DailyActivity[];airwalls:TaskNote[]}{
 const parsed=parseReviewProject(JSON.stringify(project));
 const accepted=scopeShowPilotRows(parsed.originalRows.filter(r=>!isCancelledRow(r)),parsed.approvedSpaces).accepted
  .filter(r=>parsed.includePending||!isPendingRow(r));
 const proposed=summarizeEvents(accepted,true);
 const review=applyReview(proposed,[],parsed.draft);
 const originalShows=postConShowsFromReportRows(accepted);
 const names=new Map(originalShows.filter(x=>x.eventId).map(x=>[x.eventId,x.showName]));
 const dates=review.entries.filter(e=>e.code!=="MO?"&&safeDate(e.date)&&!nonCgc.test(e.space));
 const items:DailyActivity[]=[];
 for(const entry of dates){
  const label=names.get(entry.eventId??"")||entry.title;
  if(!label||/^(?:move\s?in|move\s?out|setup|teardown)$/i.test(label))continue;
  const rooms=entry.space.includes("BallRoom")||entry.space.includes("Hall")?
   [entry.space]:[];
  if(!rooms.length)continue;
  items.push({date:entry.date,eventId:entry.eventId??"",showName:label,rooms,
   source:"event-schedule",details:[entry.code+" "+formatMinutes(entry.start)+"–"+formatMinutes(entry.end)]});
 }
 // Include only actionable dated schedule-generated airwall suggestions.
 const airwalls=airwallTasks(accepted);
 return {activities:aggregate(items),airwalls};
}

/** Ungerboeck / engineering workbook operation names are NOT show names.
 * The strict, anchored patterns intentionally do not classify a title merely
 * because it contains "program" or "show" somewhere in a real event name.
 * The Event ID still takes precedence when a source explicitly provides it. */
export function isOperationalFunctionTitle(title:string):boolean{
 const t=title.replace(/\s+/g," ").trim();
 return /^(?:MO\??|MI|Exmi|Arr|client\s+(?:arrival|move[\s-]?in|move[\s-]?out|load[\s-]?in|load[\s-]?out)|(?:vendor|exhibitor|decorator|contractor|advanced expo services)\s+(?:arrival|move[\s-]?in|move[\s-]?out|load[\s-]?in|load[\s-]?out)|move[\s-]?in|move[\s-]?out|load[\s-]?in|load[\s-]?out|program(?:\s+start)?|general\s+session|breakout\s+session|registration|client\s+check[\s-]?in|tables?\s*(?:&|and)\s*chairs?(?:\s+inc\.?)?\s+move[\s-]?in|setup(?:\s*[-:]\s*|\s+)|set[\s-]?up(?:\s*[-:]\s*|\s+)|strike(?:\s*[-:]\s*|\s+)|trade\s+night|room\s+turn|room\s+flip|rehearsal|vendor\s+load[\s-]?in)\b/i.test(t);
}
function roomSet(names:readonly string[]):Set<string>{
 return new Set(names.flatMap(name=>expandSpace(name)).map(maybeRoom).filter((r):r is string=>r!==null));
}
function coverRooms(activityRooms:readonly string[],showRooms:string):boolean{
 const required=roomSet(activityRooms);
 const available=roomSet(showRooms.split(","));
 return required.size>0&&[...required].every(r=>available.has(r));
}
function dayInShow(date:string,show:PostConShow):boolean{
 const first=show.startDate??show.showDate;
 return safeDate(first)&&safeDate(show.showDate)&&date>=first&&date<=show.showDate;
}
/** Join actual show records first and THEN the functions. A function may be
 * linked to a confirmed Event ID, or to a single same-day show occupying all
 * of the function's rooms. Multiple candidates => no guess.
 *
 * The return value is read-only; no SQLite catalog or EOC files are altered. */
export function combineTodaySources(
 catalog:readonly PostConShow[], activities:readonly DailyActivity[]
):TodayJoined{
 // Do not promote old polluted SQLite entries whose "show name" is actually
 // a workbook function (e.g. "Client Arrival", "Program Start", "MO?").
 const shows=catalog.filter(s=>!nonCgc.test(s.showName+" "+s.rooms)&&
  !isOperationalFunctionTitle(s.showName)).map(s=>({...s}));
 const activeDates:Record<string,string[]>={};
 const origin:Record<string,DailyActivity["source"]>={};
 const daily:Record<string,Record<string,string[]>>={};
 const unlinkedKeys:string[]=[];
 const unlinkedFunctions:DailyActivity[]=[];
 const byId=new Map<string,PostConShow[]>();
 const byName=new Map<string,PostConShow[]>();
 for(const show of shows){
  if(show.eventId)(byId.get(show.eventId.trim())??byId.set(show.eventId.trim(),[]).get(show.eventId.trim())!).push(show);
  const key=canonical(show.showName);
  (byName.get(key)??byName.set(key,[]).get(key)!).push(show);
 }
 const merged=new Map<string,PostConShow>();
 const records=aggregate(activities);
 // Show records and event-ID linked rows must be processed before functions,
 // so "Client Arrival" can find the Front Row Card Show on the same date.
 const ordered=[...records.filter(a=>!isOperationalFunctionTitle(a.showName)),
  ...records.filter(a=>isOperationalFunctionTitle(a.showName))];
 const attach=(key:string,activity:DailyActivity,inferred=false)=>{
  (activeDates[key]??=[]).push(activity.date);
  const day=(daily[key]??={})[activity.date]??=[];
  const details=isOperationalFunctionTitle(activity.showName)?
   [activity.showName+(inferred?" (room/day match — verify)":"")+" · "+activity.details.join(" · ")]:
   activity.details;
  for(const d of details)if(d&&!day.includes(d))day.push(d);
  if(activity.source==="event-schedule"||!origin[key])origin[key]=activity.source;
 };
 for(const activity of ordered){
  const functional=isOperationalFunctionTitle(activity.showName);
  const matches=activity.eventId.trim()?
   (byId.get(activity.eventId.trim())??[]):
   (byName.get(canonical(activity.showName))??[]);
  let matched=matches.length===1?matches[0]:undefined;
  let inferred=false;
  // A truncated Excel label can be matched to one unique named catalog
  // show, but ONLY when it is long enough and the dates/rooms agree.
  if(!matched&&!functional&&!activity.eventId&&canonical(activity.showName).length>=16){
   const prefix=canonical(activity.showName);
   const possibilities=shows.filter(s=>s.eventId&&
    (canonical(s.showName).startsWith(prefix)||prefix.startsWith(canonical(s.showName)))&&
    dayInShow(activity.date,s)&&coverRooms(activity.rooms,s.rooms));
   if(possibilities.length===1)matched=possibilities[0];
  }
  if(!matched&&functional&&!activity.eventId){
   // Prefer an actual show ALREADY observed on this date in the source
   // workbook/report. Fallback to a unique same-day ID-bearing catalog show.
   const observed=shows.filter(s=>
    !!activeDates[s.key]?.includes(activity.date)&&coverRooms(activity.rooms,s.rooms));
   if(observed.length===1){matched=observed[0];inferred=true;}
   else if(observed.length===0){
    const catalogCandidates=shows.filter(s=>s.eventId&&
     dayInShow(activity.date,s)&&coverRooms(activity.rooms,s.rooms));
    if(catalogCandidates.length===1){matched=catalogCandidates[0];inferred=true;}
   }
  }
  if(matched){
   merged.set(matched.key,matched);
   attach(matched.key,activity,inferred);
   continue;
  }
  if(functional){
   // A date and a room alone aren't sufficient when shows overlap. Keep
   // these visible separately for a human to match, never as "new shows".
   unlinkedFunctions.push(activity);
   continue;
  }
  const key="schedule:"+canonical(activity.showName)+":"+(activity.eventId||"no-id");
  let stub=merged.get(key);
  if(!stub){
   stub={key,eventId:activity.eventId,showName:activity.showName,
    startDate:activity.date,showDate:activity.date,rooms:activity.rooms.join(", ")};
   merged.set(key,stub);shows.push(stub);unlinkedKeys.push(key);
  }else{
   stub.startDate=[stub.startDate??stub.showDate,activity.date].sort()[0]!;
   stub.showDate=[stub.showDate,activity.date].sort()[1]!;
   stub.rooms=[...new Set([...stub.rooms.split(", ").filter(Boolean),...activity.rooms])].join(", ");
  }
  attach(key,activity);
 }
 for(const key of Object.keys(activeDates))activeDates[key]=[...new Set(activeDates[key])].sort();
 return {shows,activeDates,origin,daily,unlinkedKeys,unlinkedFunctions};
}
export function showHasActivityOnDay(show:PostConShow,date:string,joined:TodayJoined):boolean{
 // If actual dated rows exist, prefer those over potentially stale range
 // bounds. Otherwise keep displaying the saved catalog's inclusive span.
 return joined.activeDates[show.key]?.includes(date)??(
  safeDate(date)&&safeDate(show.startDate??show.showDate)&&safeDate(show.showDate)&&
  date>=(show.startDate??show.showDate)&&date<=show.showDate
 );
}
/** Resolve a one-day show to its original event record only on a unique ID
 * match or unique normalized name, never by event date proximity. */
export function isUnlinkedTodayShow(show:PostConShow,joined:TodayJoined):boolean{
 return joined.unlinkedKeys.includes(show.key);
}

function rawDate(v:unknown):string|null{
 if(v instanceof Date)return v.toISOString().slice(0,10);
 if(typeof v==="number"&&v>20000&&v<100000)return new Date(Math.round((v-25569)*86400000)).toISOString().slice(0,10);
 if(typeof v==="string"){
  const s=v.trim();
  if(safeDate(s))return s;
  const slash=/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if(slash){
   const year=Number(slash[3]!.length===2?"20"+slash[3]:slash[3]);
   const iso=[year,Number(slash[1]),Number(slash[2])].map((x,i)=>i?String(x).padStart(2,"0"):String(x)).join("-");
   return safeDate(iso)?iso:null;
  }
 }
 return null;
}
function dateFromCell(wb:import("exceljs").Workbook,cell:import("exceljs").Cell):string|null{
 const value=cell.value;
 const result=value&&typeof value==="object"&&"result" in value?(value as {result:unknown}).result:value;
 const direct=rawDate(result);
 if(direct)return direct;
 const formula=value&&typeof value==="object"&&"formula" in value?
  (value as {formula:string}).formula:"";
 // Often B5:H5 in the actual master are uncached references to Extra.
 const match=/^(?:'([^']+)'|([A-Za-z_][\w ]*))!\$?([A-Z]+)\$?(\d+)$/.exec(formula);
 if(!match)return null;
 const source=wb.getWorksheet(match[1]||match[2]!);
 if(!source)return null;
 const referenced=source.getCell(match[3]!+match[4]!);
 if(referenced.address===cell.address&&source===cell.worksheet)return null;
 return rawDate(referenced.value&&typeof referenced.value==="object"&&"result" in referenced.value?
  (referenced.value as {result:unknown}).result:referenced.value);
}
function parseActivityCell(value:unknown):{title:string;details:string[]}[]{
 if(typeof value!=="string")return [];
 const lines=value.replace(/\r/g,"").split("\n").map(v=>v.trim()).filter(Boolean);
 const result:{title:string;details:string[]}[]=[];
 const isCode=(line:string)=>/^(?:MI|MO\??|S|Exmi|Arr|MTG|Food|Breakfast|Lunch|Dinner)\b[\s:.-]/i.test(line);
 for(const line of lines){
  if(isCode(line)){if(result.length)result[result.length-1]!.details.push(line.slice(0,130));continue;}
  if(/^(?:DARK|OFF|ON CALL|TBD|N\/A|TASKS?|CGC|HALLS|BALLROOM)$/i.test(line))continue;
  if(/^(?:\d{1,2}(?::\d{2})?[ap]\s*[-–]\s*\d{1,2}(?::\d{2})?[ap])$/i.test(line))continue;
  if(line.length>140)continue;
  result.push({title:line,details:[]});
 }
 return result;
}
/** Read what actually appears in the original CGC engineering weekly XLSX
 * without modifying dates or templates. If the workbook only has uncached
 * formulas and no resolvable Extra dates, return a warning rather than
 * putting real events on invented dates. */
export async function readEngineeringWeekWorkbook(bytes:ArrayBuffer|Uint8Array):Promise<WorkbookActivityResult>{
 const module=await import("exceljs");const ExcelJS=module.default??module;
 const wb=new ExcelJS.Workbook();
 const data:ArrayBuffer=bytes instanceof Uint8Array?(()=>{const copy=new ArrayBuffer(bytes.byteLength);new Uint8Array(copy).set(bytes);return copy;})():bytes;
 await wb.xlsx.load(data);
 const activities:DailyActivity[]=[],airwalls:WorkbookWallTask[]=[],warnings:string[]=[];
 let recognized=0;
 for(const ws of wb.worksheets){
  if(!/^Week\b/i.test(ws.name))continue;
  let header=0;
  ws.eachRow((row,i)=>{
   if(!header&&String(row.getCell(2).value??"").trim().toUpperCase()==="MON")header=i;
  });
  if(!header)continue;
  const dates=Array.from({length:7},(_,i)=>dateFromCell(wb,ws.getCell(header+1,i+2)));
  if(dates.some(d=>!d)){
   warnings.push(ws.name+" has uncached or missing date cells. Save the workbook in Excel with date values and reopen it.");
   continue;
  }
  const labels=new Map<number,string>();
  ws.eachRow((row,i)=>{labels.set(i,String(row.getCell(1).value??"").trim())});
  if(![...labels.values()].some(l=>/^HALLS$/i.test(l))||
     ![...labels.values()].some(l=>/^BALLROOM$/i.test(l)))continue;
  recognized++;
  let section:"HALLS"|"BALLROOM"|null=null;
  for(let row=header+2;row<=Math.min(ws.rowCount,160);row++){
   const label=labels.get(row)??"";
   if(/^HALLS$/i.test(label)){section="HALLS";continue;}
   if(/^BALLROOM$/i.test(label)){section="BALLROOM";continue;}
   const room=maybeRoom(label);
   if(room){
    for(let c=2;c<=8;c++){
     const date=dates[c-2]!;
     const text=ws.getCell(row,c).master.value;
     for(const activity of parseActivityCell(text))
      activities.push({date,eventId:"",showName:activity.title,rooms:[room],
       source:"engineering-workbook",details:activity.details});
    }
   }else if(/^TASKS?$/i.test(label)&&section){
    for(let c=2;c<=8;c++){
     const text=String(ws.getCell(row,c).master.value??"").trim();
     const date=dates[c-2]!;
     for(const line of text.split(/\r?\n/)){
      const note=line.replace(/\s+/g," ").trim();
      if(/\b(?:air[\s-]?wall|(?:make|reset|change|move|open|close)\s+(?:full\s+)?(?:[A-G]{1,7}|ballroom|hall))\b/i.test(note))
       airwalls.push({date,section,text:note.slice(0,150),source:"engineering-workbook"});
     }
    }
   }
  }
 }
 if(!recognized&&!warnings.length)warnings.push("No recognized, dated CGC engineering Week sheets were found.");
 return {activities:aggregate(activities),airwalls:airwalls.filter((t,i,a)=>
  a.findIndex(x=>x.date===t.date&&x.section===t.section&&x.text===t.text)===i),warnings};
}