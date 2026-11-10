#!/usr/bin/env bun
/** Offline-only, developer-run comparison. Supply private paths; NEVER copy
 * source workbooks into the repository or print guest/employee names. 
 * Usage: bun run scripts/claude-agreement.ts --report /outside/report.xlsx --published /outside/monthly
 */
import {readFile,readdir} from "node:fs/promises";
import {join,resolve} from "node:path";
import ExcelJS from "exceljs";
import {readEventSheet,findWeekDateRow} from "../src/lib/work-files";
import {summarizeEvents,expandSpace,weekLayouts,parseShift,type EventEntry} from "../src/lib/work-tools";
import {planWeeks,SHOW_STAFF,MARK_FLEX,type DayPlan} from "../src/lib/staffing";
import {scopeShowPilotRows} from "../src/lib/showpilot-venue";

function arg(flag:string){const i=process.argv.indexOf(flag);return i<0?"":process.argv[i+1]??"";}
const report=arg("--report"),folder=arg("--published");
if(!report||!folder){console.error("Supply --report /local/path.xlsx and --published /local/folder");process.exit(2);}
const raw=await readFile(resolve(report));
const parsed=await readEventSheet(new File([new Uint8Array(raw)],"synthetic-source.xlsx"));
if(!parsed)throw new Error("This script currently requires a grouped Event Schedule XLSX, not PDF.");
const accepted=scopeShowPilotRows(parsed.filter(r=>r.level>1),[]).accepted;
const entries=summarizeEvents(accepted,true);
const expanded=entries.flatMap(e=>expandSpace(e.space).map(space=>({...e,space})));
const layouts=weekLayouts(expanded);
const byRoom=new Map<string,EventEntry[]>();
for(const e of expanded){const key=e.date+"|"+e.space;byRoom.set(key,[...(byRoom.get(key)??[]),e]);}
const days=[...new Set(layouts.flatMap(x=>x.dates))].sort();
const planned=new Map(planWeeks(days,expanded).map(p=>[p.date,p]));
const files=(await readdir(resolve(folder))).filter(x=>x.toLowerCase().endsWith(".xlsx")&&!x.startsWith("~$")).sort();
const totals={
 files:0,weeks:0,roomDaysPublished:0,roomDaysFound:0,roomDaysMissed:0,roomDaysExtra:0,
 comparableShowStart:0,showStartExact:0,showStartWithin60:0,showStartOver60:0,
 comparableShowEnd:0,showEndExact:0,showEndWithin60:0,showEndOver60:0,
 comparableClosingDays:0,lastPersonLeavesOver60Early:0,
 staffDaysCompared:0,staffDaysOffAgreements:0
};
const byRole=new Map<string,{compared:number;agreed:number}>();
const read=(value:unknown):string=>{
 if(value===null||value===undefined)return "";
 if(value&&typeof value==="object"){
  if("result" in value)return read((value as {result:unknown}).result);
  if("richText" in value&&Array.isArray((value as {richText:unknown[]}).richText))
   return ((value as {richText:{text:string}[]}).richText).map(x=>x.text).join("");
 }
 return String(value).trim();
};
const timeRe=/\bS\s+(\d{1,2}(?::\d{2})?[ap])\s*-\s*(\d{1,2}(?::\d{2})?[ap])\b/i;
const diff=(a:number,b:number)=>Math.abs(a-b);
const track=(group:"showStart"|"showEnd",gap:number)=>{
 const key=group==="showStart"?"showStart":"showEnd";
 if(group==="showStart")totals.comparableShowStart++;else totals.comparableShowEnd++;
 if(gap===0)totals[(key+"Exact") as "showStartExact"|"showEndExact"]++;
 else if(gap<=60)totals[(key+"Within60") as "showStartWithin60"|"showEndWithin60"]++;
 else totals[(key+"Over60") as "showStartOver60"|"showEndOver60"]++;
};
for(const filename of files){
 const wb=new ExcelJS.Workbook();
 try{await wb.xlsx.load(await readFile(join(resolve(folder),filename)));totals.files++;}
 catch(e){console.error("Skipping unreadable XLSX:",filename,String(e));continue;}
 for(const ws of wb.worksheets.filter(x=>/^Week\s*#\d+$/i.test(x.name))){
  const header=Array.from({length:Math.min(15,ws.rowCount)},(_,i)=>i+1)
   .find(n=>read(ws.getRow(n).getCell(2).value).toUpperCase()==="MON");
  const dateRow=header?findWeekDateRow(ws,header):null;
  if(!dateRow)continue;
  totals.weeks++;
  const rooms=new Map<string,number>();
  for(const [heading,labels] of [["HALLS",["HALL A","HALL B","HALL C","HALL D"]],
    ["BALLROOM",["BALLROOM A","BALLROOM B","BALLROOM E","BALLROOM G","BALLROOM C","BALLROOM D","BALLROOM F"]]] as const){
   let start=0;
   ws.eachRow((row,n)=>{if(!start&&read(row.getCell(1).value).toUpperCase()===heading)start=n;});
   if(!start)continue;
   let row=start+1;
   for(const label of labels){
    if(read(ws.getRow(row).getCell(1).value).toUpperCase()!==label)break;
    rooms.set(label.startsWith("HALL")?"Hall "+label.slice(5):"BallRoom "+label.slice(9),row++);
   }
  }
  for(let c=2;c<=8;c++){
   const date=dateRow.dates[c-2]!;
   for(const [space,row] of rooms){
    const published=read(ws.getRow(row).getCell(c).value);
    const expected=byRoom.get(date+"|"+space)??[];
    const present=published.length>0;
    const have=expected.length>0;
    if(present)totals.roomDaysPublished++;
    if(present&&have)totals.roomDaysFound++;
    if(present&&!have)totals.roomDaysMissed++;
    if(!present&&have)totals.roomDaysExtra++;
    const publishedShow=timeRe.exec(published);
    const predicted=expected.filter(x=>x.code==="S");
    if(!publishedShow||!predicted.length)continue;
    const observed=parseShift(publishedShow[1]+"-"+publishedShow[2]);
    if(!observed)continue;
    track("showStart",diff(observed.start,Math.min(...predicted.map(e=>e.start))));
    track("showEnd",diff(observed.end,Math.max(...predicted.map(e=>e.end))));
   }
   const shiftRows=new Map<string,number>();
   for(let r=dateRow.row+1;r<=Math.min(ws.rowCount,dateRow.row+55);r++){
    const label=read(ws.getRow(r).getCell(1).value);
    if(/^HALLS$/i.test(label))break;
    if([...SHOW_STAFF,MARK_FLEX].some(s=>s.name.toLowerCase()===label.toLowerCase()))shiftRows.set(label,r);
   }
   const publishedEnds:number[]=[];
   for(const [name,row] of shiftRows){
    const raw=read(ws.getRow(row).getCell(c).value);
    const shift=parseShift(raw);
    if(shift)publishedEnds.push(shift.end);
    const expected=planned.get(date)?.assignments.some(a=>a.name===name)??false;
    const actual=Boolean(shift);
    const role=[...SHOW_STAFF,MARK_FLEX].find(s=>s.name===name)?.title??"Other";
    const record=byRole.get(role)??{compared:0,agreed:0};
    record.compared++;if(actual===expected)record.agreed++;
    byRole.set(role,record);
    totals.staffDaysCompared++;if(actual===expected)totals.staffDaysOffAgreements++;
   }
   if(publishedEnds.length){
    const expected=planned.get(date);
    const plannedClose=Math.max(0,...(expected?.assignments.map(a=>a.end)??[]));
    totals.comparableClosingDays++;
    if(Math.max(...publishedEnds)-plannedClose>60)totals.lastPersonLeavesOver60Early++;
   }
  }
 }
}
console.log(JSON.stringify({
 note:"Experimental CGC-only comparison; file reading is local and no personal source data is uploaded.",
 sourceRows:accepted.length,plannedEntries:entries.length,
 ...totals,daysOffByRole:Object.fromEntries([...byRole].map(([role,x])=>[role,x]))
},null,2));
