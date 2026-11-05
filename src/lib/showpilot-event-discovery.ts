export type EventMetadataSource={path:string;text:string};
export type Evidence={field:"eventId"|"showName"|"startDate"|"showDate"|"room";value:string;source:string};
export type EventMetadataResult={eventId:string;showName:string;startDate:string;showDate:string;rooms:string[];evidence:Evidence[];warnings:string[]};
export const ROOMS=["Hall A","Hall B","Hall C","Hall D","BallRoom A","BallRoom B","BallRoom C","BallRoom D","BallRoom E","BallRoom F","BallRoom G"];
export function normalizeEventDate(value:string):string{
 const v=value.trim().replace(/,/g,"");
 const m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v),u=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(v);
 const y=m?+m[1]:u?(+u[3]<100?2000+(+u[3]):+u[3]):0;
 const mo=m?+m[2]:u?+u[1]:0,d=m?+m[3]:u?+u[2]:0;
 const t=new Date(Date.UTC(y,mo-1,d));
 return y>=2020&&y<=2100&&t.getUTCFullYear()===y&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d
  ?y+"-"+String(mo).padStart(2,"0")+"-"+String(d).padStart(2,"0"):"";
}
export function cgcRoomsFromText(text:string):string[]{
 const found=new Set<string>();
 const re=/\b(?:exhibit\s*)?(halls?|ball\s*rooms?)\s*(?:[:#-]\s*)?([A-G](?:\s*(?:[,/&+]|-|\band\b|\bthrough\b|\bto\b)\s*[A-G])*)/gi;
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
    const dates=range[1].match(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/g)||[];
    if(dates.length>=2){add("startDate",normalizeEventDate(dates[0]),source.path);add("showDate",normalizeEventDate(dates[1]),source.path);}
   }
   for(const room of cgcRoomsFromText(line))add("room",room,source.path);
  }
  if(/hall|layout|diagram|floor/i.test(source.path))
   for(const room of cgcRoomsFromText(source.path))add("room",room,source.path+" (filename)");
 }
 const choose=(field:"eventId"|"showName"|"startDate"|"showDate")=>{
  const vals=evidence.filter(x=>x.field===field);
  if(!vals.length)return "";
  return vals.find(x=>x.source==="ZIP manifest")?.value||vals[0].value;
 };
 const data={eventId:choose("eventId"),showName:choose("showName"),
  startDate:choose("startDate"),showDate:choose("showDate"),rooms:ROOMS.filter(r=>evidence.some(x=>x.field==="room"&&x.value===r)),
  evidence,warnings};
 if(!data.showName&&filename){
  data.showName=filename.replace(/\.zip$/i,"").replace(/[_-]+/g," ").trim().slice(0,140);
  warnings.push("Name suggested from ZIP filename only. Verify before saving.");
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
