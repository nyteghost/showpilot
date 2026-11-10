import {parseShift,shiftAnnotations,reportDateToIso,type Shift} from "./work-tools";
export type PdfShiftFragment={text:string;x:number;y:number};
export type PdfShiftResult={shifts:Shift[];people:string[];unreadable:{sheet:string;date:string;raw:string}[];warnings:string[]};
const weekdays=["MON","TUE","WED","THU","FRI","SAT","SUN"];
const dateRe=/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;
const dayIndex=(value:string)=>weekdays.indexOf(value.trim().toUpperCase());

/** The weekly PDF's actual text positions determine day columns.
 * No OCR, made-up dates, or guessing from unlabelled graphics. */
export function parseWeeklyShiftText(
 fragments:readonly PdfShiftFragment[],name:string,page="PDF"
):PdfShiftResult{
 const result:PdfShiftResult={shifts:[],people:[],unreadable:[],warnings:[]};
 const items=fragments.filter(x=>x.text.trim()&&Number.isFinite(x.x)&&Number.isFinite(x.y));
 if(!items.length){result.warnings.push(page+": no selectable text. Use the XLSX schedule or a text-layer PDF.");return result;}
 const lines:PdfShiftFragment[][]=[];
 for(const item of [...items].sort((a,b)=>b.y-a.y||a.x-b.x)){
  const found=lines.find(line=>Math.abs(line[0]!.y-item.y)<=3);
  if(found)found.push(item);else lines.push([item]);
 }
 for(const line of lines)line.sort((a,b)=>a.x-b.x);
 const header=lines.find(line=>new Set(line.map(x=>dayIndex(x.text)).filter(x=>x>=0)).size>=5);
 if(!header){result.warnings.push(page+": weekday header was not found.");return result;}
 const days=header.map(item=>({x:item.x,day:dayIndex(item.text)})).filter(x=>x.day>=0).sort((a,b)=>a.day-b.day);
 if(days.length!==7||days.some((d,i)=>d.day!==i)){
  result.warnings.push(page+": seven distinct weekday columns were not detected.");return result;
 }
 const dayXs=days.map(d=>d.x);
 const dateCandidates=lines.filter(line=>line[0]!.y<header[0]!.y&&header[0]!.y-line[0]!.y<85);
 let dates:string[]=[];
 let dateY=0;
 for(const row of dateCandidates){
  const found:{x:number;iso:string}[]=[];
  for(const part of row){
   const match=part.text.match(dateRe)??[];
   for(const m of match)found.push({x:part.x,iso:reportDateToIso(m)});
  }
  if(found.length!==7)continue;
  const arranged=found.sort((a,b)=>a.x-b.x).map(x=>x.iso);
  const start=new Date(arranged[0]+"T12:00:00Z");
  if(Number.isNaN(start.getTime())||start.getUTCDay()!==1)continue;
  if(arranged.some((day,i)=>{
   const next=new Date(start);next.setUTCDate(start.getUTCDate()+i);
   return next.toISOString().slice(0,10)!==day;
  }))continue;
  dates=arranged;dateY=row[0]!.y;break;
 }
 if(!dates.length){result.warnings.push(page+": a consecutive Monday–Sunday date row was not found.");return result;}
 const firstX=dayXs[0]!;
 const people=new Set<string>();
 const target=name.trim().toLowerCase().replace(/\s+/g," ");
 for(const line of lines){
  if(line[0]!.y>=dateY)continue;
  const left=line.filter(x=>x.x<firstX-12).map(x=>x.text).join(" ").trim();
  if(left&&/^[A-Za-z][A-Za-z.' -]{3,64}$/.test(left) && !/halls|ballroom|escalator|service desk|engineering schedule/i.test(left))
   people.add(left);
  if(!target||left.toLowerCase().replace(/\s+/g," ")!==target)continue;
  for(let i=0;i<7;i++){
   const leftBound=i===0?firstX-8:(dayXs[i-1]!+dayXs[i]!)/2;
   const rightBound=i===6?Infinity:(dayXs[i]!+dayXs[i+1]!)/2;
   const raw=line.filter(x=>x.x>=leftBound&&x.x<rightBound).map(x=>x.text).join(" ").trim();
   if(!raw||/^(?:off|pto|holiday|vacation|sick|fmla|bereavement|leave)(?:\s|$|[:(])/i.test(raw))continue;
   const parsed=parseShift(raw);
   if(parsed){
    const notes=shiftAnnotations(raw);
    result.shifts.push({date:dates[i]!,...parsed,raw,...(notes.length?{note:notes.join("; ")}:{})});
   }else result.unreadable.push({sheet:page,date:dates[i]!,raw:raw.slice(0,180)});
  }
 }
 result.people=[...people].sort();
 return result;
}

/** Text-layer PDF import. A scanned PDF fails visibly, never silently. */
export async function readWeeklyShiftPdf(file:File,name:string):Promise<PdfShiftResult>{
 const pdfjs=await import("pdfjs-dist");
 const worker=(await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
 pdfjs.GlobalWorkerOptions.workerSrc=worker;
 const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
 const all:PdfShiftResult={shifts:[],people:[],unreadable:[],warnings:[]};
 const people=new Set<string>(),dates=new Set<string>();
 for(let pageNumber=1;pageNumber<=Math.min(pdf.numPages,25);pageNumber++){
  const page=await pdf.getPage(pageNumber);
  const content=await page.getTextContent();
  const items:PdfShiftFragment[]=content.items.flatMap(item=>{
   if(!("str" in item)||!("transform" in item))return [];
   const trans=item.transform;
   return typeof item.str==="string"&&Array.isArray(trans)
    ?[{text:item.str,x:Number(trans[4]),y:Number(trans[5])}]:[];
  });
  const parsed=parseWeeklyShiftText(items,name,file.name+" page "+pageNumber);
  for(const shift of parsed.shifts)if(!dates.has(shift.date)){all.shifts.push(shift);dates.add(shift.date);}
  for(const person of parsed.people)people.add(person);
  all.unreadable.push(...parsed.unreadable);all.warnings.push(...parsed.warnings);
 }
 all.people=[...people].sort();
 return all;
}
