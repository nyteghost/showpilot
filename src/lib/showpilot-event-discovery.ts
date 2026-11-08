export type EventMetadataSource={path:string;text:string};
export type Evidence={field:"eventId"|"showName"|"startDate"|"showDate"|"room";value:string;source:string;context?:string;confidence?:"assigned"|"mentioned"};
export type EventMetadataResult={eventId:string;showName:string;startDate:string;showDate:string;rooms:string[];evidence:Evidence[];warnings:string[]};
export const ROOMS=["Hall A","Hall B","Hall C","Hall D","BallRoom A","BallRoom B","BallRoom C","BallRoom D","BallRoom E","BallRoom F","BallRoom G"];
/** Ungerboeck EOC Event IDs are numeric. A free-text field such as
 * "Event ID: tes" is not an event ID and must never cause a false conflict.
 * Preserve leading zeros so matching remains exact. */
export function validCgcEventId(value:string):string{
 const cleaned=value.trim().replace(/^#\s*/,"").trim();
 return /^\d{3,12}$/.test(cleaned)?cleaned:"";
}
export function normalizeEventDate(value:string):string{
 const v=value.trim().replace(/,/g,"");
 const m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v),u=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(v);
 const monthNames=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
 const named=/^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})\s+(\d{4})$/i.exec(v);
 const y=m?+m[1]:u?(+u[3]<100?2000+(+u[3]):+u[3]):named?+named[3]:0;
 const mo=m?+m[2]:u?+u[1]:named?monthNames.indexOf(named[1].slice(0,3).toLowerCase())+1:0;
 const d=m?+m[3]:u?+u[2]:named?+named[2]:0;
 const t=new Date(Date.UTC(y,mo-1,d));
 return y>=2020&&y<=2100&&t.getUTCFullYear()===y&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d
  ?y+"-"+String(mo).padStart(2,"0")+"-"+String(d).padStart(2,"0"):"";
}
export function cgcRoomsFromText(text:string):string[]{
 const found=new Set<string>();
 const re=/\b(?:exhibit\s*)?(halls?|ball\s*rooms?)\s*(?:[:#-]\s*)?([A-G](?:[A-G]|\s*(?:[,/&+-]|\band\b|\bthrough\b|\bto\b)\s*[A-G](?![a-z]))*)/gi;
 for(const m of text.matchAll(re)){
  const hall=/hall/i.test(m[1]),letters=hall?"ABCD":"ABCDEFG",value=m[2].toUpperCase();
  const chars=(value.match(/[A-G]/g)||[]).filter(x=>letters.includes(x));
  const range=/[A-G]\s*-\s*[A-G]|\b(?:through|to)\b/i.test(value)&&chars.length===2;
  if(range){
   const a=letters.indexOf(chars[0]),b=letters.indexOf(chars[1]);
   for(let i=Math.min(a,b);i<=Math.max(a,b);i++)found.add((hall?"Hall ":"BallRoom ")+letters[i]);
  }else for(const ch of chars)found.add((hall?"Hall ":"BallRoom ")+ch);
 }
 return ROOMS.filter(x=>found.has(x));
}
/** Directly assigned event rooms, never a casual mention from the EOC body.
 * "Function Space: No Space Assigned" must not imply any hall.
 * Some EOC PDF readers place the room on the line after the label. */
export function roomsFromAssignedLine(line:string,nextLine=""):string[]{
 const cleaned=line.replace(/\s+/g," ").trim();
 const label=/^(?:function\s+space|assigned\s+space|event\s+space|rooms?|spaces?|location|event\s+location|venue)\s*[:：\-]\s*(.*)$/i.exec(cleaned);
 const value=label?(label[1]?.trim()||nextLine.replace(/\s+/g," ").trim()):cleaned;
 if(!value||/^(?:no\s+space\s+assigned|none|n\/?a|not\s+assigned|tbd|unknown)(?:\b|$)/i.test(value))return [];
 // If there's no assignment label, only an entire standalone room name is
 // sufficiently direct. "Walk through Hall C" is not evidence Hall C is booked.
 if(!label&&!/^(?:(?:exhibit|expo)\s+)?halls?\s+[A-D](?:[A-D\s,\/&+\-]|\band\b|\bthrough\b|\bto\b)*(?:\s*\([^)]{1,35}\))?$|^(?:ball\s*rooms?)\s+[A-G](?:[A-G\s,\/&+\-]|\band\b|\bthrough\b|\bto\b)*(?:\s*\([^)]{1,35}\))?$/i.test(cleaned))
  return [];
 return cgcRoomsFromText(value);
}
const stage=/^(?:program|move in|move out|general session|breakout session|eoc|event order confirmation|work order)$/i;
/** Read the actual show from the cover of an Ungerboeck Event Order
 * Confirmation. EOC cover values take priority over ZIP filenames.
 *
 * Typically:
 *   Event Order Confirmation
 *   Hospitality Industry Ministries (41622)
 *   Fri 11/6/2026 - Fri 11/6/2026
 *
 * PDF text extraction may combine the heading and name on one row or wrap the
 * ID/date range; only the top cover lines are considered, never random dates
 * later in the event's orders or work instructions.
 */
export function parseEocCoverHeader(text:string):{
 showName:string;eventId:string;startDate:string;showDate:string;
}|null{
 const lines=text.slice(0,24000).split(/\r?\n/).map(x=>
  x.replace(/[\u00a0\u202f]/g," ").replace(/\s+/g," ").trim()
 ).filter(Boolean);
 const dateRe=/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/g;
 for(let i=0;i<Math.min(lines.length,40);i++){
  const heading=/^event\s+order\s+confirmation\b\s*[:\-]?\s*(.*)$/i.exec(lines[i]!);
  if(!heading)continue;
  const inline=heading[1]?.trim()??"";
  // Usually the show is the next line. Some PDF engines put the cover
  // title and event name together even though Excel/Acrobat show two rows.
  const second=inline||lines[i+1]||"";
  let match=/^(.{3,140}?)\s*\(\s*(\d{3,12})\s*\)\s*$/.exec(second);
  let nameEnd=i+(inline?0:1);
  if(!match&&!inline&&/^\(\s*\d{3,12}\s*\)$/.test(lines[i+2]??"")){
   match=/^(.{3,140}?)\s*\(\s*(\d{3,12})\s*\)\s*$/.exec(second+" "+lines[i+2]);
   nameEnd=i+2;
  }
  if(!match)continue;
  const showName=match[1]!.trim();
  if(/^(?:event order confirmation|supporting documents|work order|program|move in|move out)$/i.test(showName))continue;
  const dateText=[lines[nameEnd+1]??"",lines[nameEnd+2]??""].join(" ");
  const raw=dateText.match(dateRe)??[];
  const startDate=raw.length?normalizeEventDate(raw[0]!):"";
  const showDate=raw.length>=2?normalizeEventDate(raw[1]!):startDate;
  if(startDate&&showDate&&startDate>showDate)continue;
  return {showName,eventId:match[2]!,startDate,showDate};
 }
 return null;
}
/** EOC ZIP names contain mail attachment prefixes: never save those
 * prefixes as the show name. The filename is fallback evidence ONLY. */
export function parseEventZipFilename(filename:string):{
 showName:string;eventId:string;date:string;
}{
 const raw=filename.replace(/\.zip$/i,"").replace(/[_]+/g," ").replace(/\s+/g," ").trim();
 const withoutPrefix=raw.replace(/^(?:(?:event\s+order\s+confirmation|eoc)(?:\s*\+\s*supporting\s+documents?)?\s*[-–:+]?\s*)+/i,"").trim();
 const idMatch=/\bevent\s*id\s*#?\s*[:\-]?\s*(\d{3,12})\b/i.exec(withoutPrefix);
 const eventId=idMatch?.[1]??"";
 const name=idMatch?withoutPrefix.slice(0,idMatch.index).replace(/[\s\-–:+]+$/g,"").trim():"";
 const trailing=idMatch?withoutPrefix.slice(idMatch.index+idMatch[0].length).trim():"";
 const dateParts=/^(\d{1,2})[\s_-]+(\d{1,2})[\s_-]+(\d{4})$/.exec(trailing);
 const date=dateParts?normalizeEventDate(dateParts[1]+"/"+dateParts[2]+"/"+dateParts[3]):"";
 return {showName:name.length>=3&&name.length<=140?name:"",eventId,date};
}

export function discoverEventMetadata(sources:readonly EventMetadataSource[],manifest?:{showName?:string;eventId?:string;startDate?:string;showDate?:string;rooms?:string}|null,filename=""):EventMetadataResult{
 const evidence:Evidence[]=[],warnings:string[]=[];
 const add=(field:Evidence["field"],value:string,source:string,
  details?:Pick<Evidence,"context"|"confidence">)=>{
  // A nonnumeric placeholder from an EOC body or test field must not be
  // displayed as an event ID, selected as the destination, or counted as
  // conflicting evidence against the numeric EOC cover.
  const normalized=field==="eventId"?validCgcEventId(value):value;
  if(!normalized)return;
  const existing=evidence.find(x=>x.field===field&&x.value===normalized&&x.source===source);
  if(existing){
   // A later direct Function Space assignment supersedes a casual mention.
   if(field==="room"&&details?.confidence==="assigned"&&existing.confidence!=="assigned"){
    existing.confidence="assigned";existing.context=details.context;
   }
  }else evidence.push({field,value:normalized,source,...details});
 };
 if(manifest){
  add("showName",manifest.showName?.trim()||"","ZIP manifest");
  add("eventId",manifest.eventId?.trim()||"","ZIP manifest");
  add("startDate",normalizeEventDate(manifest.startDate||""),"ZIP manifest");
  add("showDate",normalizeEventDate(manifest.showDate||""),"ZIP manifest");
  for(const room of cgcRoomsFromText(manifest.rooms||""))add("room",room,"ZIP manifest",{confidence:"assigned",context:"Manifest rooms: "+(manifest.rooms||"").slice(0,260)});
 }
 for(const source of sources.slice(0,50)){
  if(/cobb energy|cepac|performing arts/i.test(source.path))continue;
  const cover=parseEocCoverHeader(source.text);
  if(cover){
   add("showName",cover.showName,"EOC cover page: "+source.path);
   add("eventId",cover.eventId,"EOC cover page: "+source.path);
   add("startDate",cover.startDate,"EOC cover page: "+source.path);
   add("showDate",cover.showDate,"EOC cover page: "+source.path);
  }
  const rows=source.text.slice(0,120000).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<rows.length;i++){
   const line=rows[i];
   const next=rows[i+1]||"";
   const field=(re:RegExp)=>{const m=re.exec(line);return m?(m[1]||next).trim():"";};
   const id=field(/^(?:event|show)\s*(?:id|number|no\.?|#)\s*[:#-]?\s*([\w-]{3,100})?$/i);
   if(/^[\w-]{3,100}$/.test(id))add("eventId",id,source.path);
   const name=field(/^(?:event|show)\s*(?:name|title)\s*[:-]?\s*(.*?)$/i);
   if(name.length>=3&&!stage.test(name)&&!/^(?:ID|Date|Time|Room)\b/i.test(name))
    add("showName",name.slice(0,140),source.path);
   for(const [key,re] of [["startDate",/^(?:event\s*)?(?:start|begin|first)\s*date\s*[:-]?\s*(.*?)$/i],
    ["showDate",/^(?:event\s*)?(?:end|last)\s*date\s*[:-]?\s*(.*?)$/i]] as const)
    add(key,normalizeEventDate(field(re)),source.path);
   const range=/^(?:event\s*dates?|date\s*range)\s*[:-]?\s*(.*)$/i.exec(line);
   if(range){
    const dates=range[1].match(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}/gi)||[];
    if(dates.length>=2){add("startDate",normalizeEventDate(dates[0]!),source.path);add("showDate",normalizeEventDate(dates[1]!),source.path);}
   }
   const assigned=roomsFromAssignedLine(line,next);
   const mentioned=cgcRoomsFromText(line);
   // Direct Function Space / Rooms assignment is reliable; casual mentions
   // and diagram filenames remain evidence for review but cannot auto-select
   // additional halls. Keep the exact PDF text line for the Why? panel.
   const directContext=mentioned.length?line:line+" "+next;
   for(const room of assigned)add("room",room,source.path,{
    confidence:"assigned",context:directContext.trim().slice(0,320)});
   for(const room of mentioned.filter(r=>!assigned.includes(r)))
    add("room",room,source.path,{confidence:"mentioned",context:line.slice(0,320)});
  }
  if(/hall|layout|diagram|floor/i.test(source.path))
   for(const room of cgcRoomsFromText(source.path))
    add("room",room,source.path+" (filename)",{confidence:"mentioned",context:"ZIP entry name: "+source.path.slice(0,250)});
 }
 const choose=(field:"eventId"|"showName"|"startDate"|"showDate")=>{
  const vals=evidence.filter(x=>x.field===field);
  if(!vals.length)return "";
  return vals.find(x=>x.source.startsWith("EOC cover page:"))?.value||vals.find(x=>x.source==="ZIP manifest")?.value||vals[0].value;
 };
 const data={eventId:choose("eventId"),showName:choose("showName"),
  startDate:choose("startDate"),showDate:choose("showDate"),rooms:ROOMS.filter(r=>evidence.some(x=>x.field==="room"&&x.value===r&&x.confidence==="assigned")),
  evidence,warnings};
 if(filename){
  const parsed=parseEventZipFilename(filename);
  if(parsed.eventId){
   add("eventId",parsed.eventId,"ZIP filename (fallback)");
   if(!data.eventId)data.eventId=parsed.eventId;
  }
  if(parsed.showName){
   add("showName",parsed.showName,"ZIP filename (fallback)");
   if(!data.showName){
    data.showName=parsed.showName;
    warnings.push("Show name suggested from ZIP filename only. Verify against the EOC before saving.");
   }
  }
  if(parsed.date&&!data.startDate&&!data.showDate){
   data.startDate=parsed.date;data.showDate=parsed.date;
   add("startDate",parsed.date,"ZIP filename (fallback)");
   add("showDate",parsed.date,"ZIP filename (fallback)");
   warnings.push("Date suggested from ZIP filename only. Verify against the EOC before saving.");
  }
 }
 for(const field of ["eventId","showName","startDate","showDate"] as const){
  const values=new Set(evidence.filter(x=>x.field===field).map(x=>x.value));
  if(values.size>1)warnings.push("Conflicting "+field+" values in documents; review before saving.");
  if(!data[field])warnings.push("No "+field+" found in documents.");
 }
 if(!data.rooms.length)warnings.push("No directly assigned CGC rooms found. Review the EOC Function Space fields or choose locations manually.");
 if(evidence.some(x=>x.field==="room"&&x.confidence==="mentioned"&&!data.rooms.includes(x.value)))
  warnings.push("Some halls were mentioned in document text or filenames without a direct room assignment. They were not added automatically; inspect the room evidence.");
 if(data.startDate&&data.showDate&&data.startDate>data.showDate)warnings.push("Start date is after end date.");
 return data;
}
