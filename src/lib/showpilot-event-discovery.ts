export type EventMetadataSource={path:string;text:string};
export type Evidence={field:"eventId"|"showName"|"startDate"|"showDate"|"room";value:string;source:string};
export type EventMetadataResult={eventId:string;showName:string;startDate:string;showDate:string;rooms:string[];evidence:Evidence[];warnings:string[]};
export const ROOMS=["Hall A","Hall B","Hall C","Hall D","BallRoom A","BallRoom B","BallRoom C","BallRoom D","BallRoom E","BallRoom F","BallRoom G"];
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
 const add=(field:Evidence["field"],value:string,source:string)=>{
  if(value&&!evidence.some(x=>x.field===field&&x.value===value&&x.source===source))evidence.push({field,value,source});
 };
 if(manifest){
  add("showName",manifest.showName?.trim()||"","ZIP manifest");
  add("eventId",manifest.eventId?.trim()||"","ZIP manifest");
  add("startDate",normalizeEventDate(manifest.startDate||""),"ZIP manifest");
  add("showDate",normalizeEventDate(manifest.showDate||""),"ZIP manifest");
  for(const room of cgcRoomsFromText(manifest.rooms||""))add("room",room,"ZIP manifest");
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
   for(const room of cgcRoomsFromText(line))add("room",room,source.path);
  }
  if(/hall|layout|diagram|floor/i.test(source.path))
   for(const room of cgcRoomsFromText(source.path))add("room",room,source.path+" (filename)");
 }
 const choose=(field:"eventId"|"showName"|"startDate"|"showDate")=>{
  const vals=evidence.filter(x=>x.field===field);
  if(!vals.length)return "";
  return vals.find(x=>x.source.startsWith("EOC cover page:"))?.value||vals.find(x=>x.source==="ZIP manifest")?.value||vals[0].value;
 };
 const data={eventId:choose("eventId"),showName:choose("showName"),
  startDate:choose("startDate"),showDate:choose("showDate"),rooms:ROOMS.filter(r=>evidence.some(x=>x.field==="room"&&x.value===r)),
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
 if(!data.rooms.length)warnings.push("No CGC rooms found. Choose locations manually.");
 if(data.startDate&&data.showDate&&data.startDate>data.showDate)warnings.push("Start date is after end date.");
 return data;
}
