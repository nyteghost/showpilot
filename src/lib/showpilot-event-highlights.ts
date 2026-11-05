import type {EocExcerpt,EventFileRecord} from "./showpilot-event-assets";

export function stageMentionedInEoc(excerpts:readonly EocExcerpt[]):boolean{
 return excerpts.some(x=>
  (x.section==="Engineering"||x.section==="Event Notes")&&
  /\b(?:stage|staging|deck(?:ing)?|risers?|platforms?|stage\s*stairs?|stage\s*ramps?)\b/i.test(x.text)&&
  !/^\s*(?:no|not\s+requiring|without)\s+(?:stage|staging|deck|riser)\b/i.test(x.text.trim())
 );
}
export function hallLayoutAttached(files:readonly Pick<EventFileRecord,"kind"|"name"|"extension">[]):boolean{
 return files.some(f=>f.kind==="diagram"&&
  ["pdf","png","jpg","jpeg","webp"].includes(f.extension.toLowerCase())&&
  /(?:hall|exhibit|floor[\s_-]*(?:map|plan)|event[\s_-]*layout)/i.test(f.name));
}
export type AttendanceReading={value:string;page:number;file:string};
export function eocAttendance(files:readonly {name:string;eocExcerpts:EocExcerpt[]}[]):{
 readings:AttendanceReading[];conflicting:boolean;
}{
 const collected:AttendanceReading[]=[];
 for(const file of files){
  for(const row of file.eocExcerpts){
   if(row.section!=="Attendance")continue;
   const n=Number(row.text.replace(/,/g,"").trim());
   if(!Number.isSafeInteger(n)||n<1||n>1000000)continue;
   const value=n.toLocaleString("en-US");
   if(!collected.some(x=>x.value===value&&x.page===row.page&&x.file===file.name))
    collected.push({value,page:row.page,file:file.name});
  }
 }
 return {readings:collected,conflicting:new Set(collected.map(x=>x.value)).size>1};
}
