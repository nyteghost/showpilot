import {describe,expect,it} from "vitest";
import ExcelJS from "exceljs";
import type {PostConShow} from "@/lib/showpilot-postcon";
import {combineTodaySources,readEngineeringWeekWorkbook,showHasActivityOnDay,
 isUnlinkedTodayShow,activitiesFromReviewProject,isOperationalFunctionTitle} from "@/lib/showpilot-today-sources";
import {emptyReviewDraft,type ReviewProject} from "@/lib/showpilot-review";

async function workbook(withDates=true){
 const wb=new ExcelJS.Workbook();
 const extra=wb.addWorksheet("Extra");
 const ws=wb.addWorksheet("Week #1");
 ws.getCell("A54").value="HALLS";ws.getCell("A55").value="Hall A";ws.getCell("A56").value="Hall B";
 ws.getCell("A59").value="TASKS";ws.getCell("A60").value="BALLROOM";
 ws.getCell("A61").value="BallRoom A";ws.getCell("A62").value="BallRoom B";
 ws.getCell("A68").value="TASKS";
 const labels=["MON","TUE","WED","THU","FRI","SAT","SUN"];
 for(let c=2;c<=8;c++){
  ws.getRow(4).getCell(c).value=labels[c-2]!;
  if(withDates){
   const day=new Date(Date.UTC(2026,10,c)); // 2-Nov for column B; 8-Nov for H
   extra.getRow(5).getCell(c).value=day;
   ws.getRow(5).getCell(c).value={formula:"Extra!"+String.fromCharCode(64+c)+"5"};
  }else ws.getRow(5).getCell(c).value={formula:"Extra!"+String.fromCharCode(64+c)+"5"};
 }
 ws.mergeCells("H55:H56");
 ws.getCell("H55").value="Front Row Card Show\nMI 7a-9:15a\nS 9:15a-7p\nMO 7p-10p";
 ws.getCell("G55").value="Front Row Card Show\nMI 7a-9:15a\nS 9:15a-7p";
 ws.getCell("C61").value="Coldwell Banker Real\nMI 7:30a\nS 9a-1p";
 ws.getCell("C68").value="Make ABE";
 const data=await wb.xlsx.writeBuffer();
 return new Uint8Array(data);
}
const catalog:PostConShow[]=[
 {key:"id:4711",eventId:"4711",showName:"Front Row Card Show",rooms:"Hall A, Hall B",
  startDate:"2026-11-05",showDate:"2026-11-07"},
 {key:"id:5201",eventId:"5201",showName:"Saturday Other Event",rooms:"Hall C",
  startDate:"2026-11-07",showDate:"2026-11-07"}
];

describe("Today reads the user's actual weekly engineering workbook",()=>{
 it("restores the Sunday 8-Nov Front Row Card Show even with uncached Extra-sheet date formulas",async()=>{
  const parsed=await readEngineeringWeekWorkbook(await workbook());
  const sunday=parsed.activities.filter(x=>x.date==="2026-11-08");
  expect(sunday).toHaveLength(1);
  expect(sunday[0]).toMatchObject({date:"2026-11-08",showName:"Front Row Card Show",
   rooms:["Hall A","Hall B"],source:"engineering-workbook"});
  expect(sunday[0]!.details).toEqual(["MI 7a-9:15a","S 9:15a-7p","MO 7p-10p"]);
  const joined=combineTodaySources(catalog,parsed.activities);
  expect(joined.shows.filter(s=>showHasActivityOnDay(s,"2026-11-08",joined)).map(s=>s.showName))
   .toEqual(["Front Row Card Show"]);
  expect(joined.unlinkedKeys).toContain("schedule:coldwellbankerreal:no-id");
  expect(isUnlinkedTodayShow(joined.shows.find(s=>s.key==="id:4711")!,joined)).toBe(false);
  expect(joined.daily["id:4711"]?.["2026-11-08"]).toContain("S 9:15a-7p");
  expect(parsed.airwalls).toContainEqual({date:"2026-11-03",section:"BALLROOM",
   text:"Make ABE",source:"engineering-workbook"});
 });
 it("does not assign Excel events an invented date when source cells cannot be resolved",async()=>{
  const parsed=await readEngineeringWeekWorkbook(await workbook(false));
  expect(parsed.activities).toEqual([]);
  expect(parsed.warnings.join(" ")).toMatch(/date cells/i);
 });
 it("never links EOC records by an ambiguous name or a different Event ID",()=>{
  const cloned=[...catalog,{...catalog[0]!,key:"id:other",eventId:"2222"}];
  const joined=combineTodaySources(cloned,[{
   date:"2026-11-08",eventId:"",showName:"Front Row Card Show",rooms:["Hall A"],
   source:"engineering-workbook",details:["S 9a–5p"]
  }]);
  const synthetic=joined.shows.find(s=>s.key.startsWith("schedule:"));
  expect(synthetic).toBeDefined();
  expect(isUnlinkedTodayShow(synthetic!,joined)).toBe(true);
 });
 it("takes dated reviewed Event Schedule functions without requiring an EOC",()=>{
  const project:ReviewProject={
   kind:"showpilot-review-project",version:1,templateSaved:false,
   originalRows:[{
    level:2,date:"2026-11-08",space:"Exhibit Hall AB",event:"Front Row Card Show",
    eventId:"4711",description:"Show Open",start:"09:15 AM",end:"07:00 PM",
    usage:"Event (EVT)"
   }],draft:emptyReviewDraft(),approvedSpaces:[],includePending:false,note:""
  };
  const result=activitiesFromReviewProject(project);
  expect(result.activities).toHaveLength(1);
  expect(result.activities[0]).toMatchObject({date:"2026-11-08",eventId:"4711",
   showName:"Front Row Card Show",source:"event-schedule"});
  const joined=combineTodaySources(catalog,result.activities);
  expect(showHasActivityOnDay(catalog[0]!,"2026-11-08",joined)).toBe(true);
 });
});


describe("Week at a glance: real show records versus function descriptions",()=>{
 const shows:PostConShow[]=[
  {key:"id:4711",eventId:"4711",showName:"Front Row Card Show",startDate:"2026-11-05",showDate:"2026-11-08",rooms:"Hall A, Hall B, BallRoom E"},
  {key:"id:5588",eventId:"5588",showName:"Coldwell Banker Realty Atlanta Unlocking Home Parties",startDate:"2026-11-02",showDate:"2026-11-03",rooms:"BallRoom A, BallRoom B, BallRoom E"},
  {key:"id:40566",eventId:"40566",showName:"ARMAC Luncheon",startDate:"2026-11-05",showDate:"2026-11-05",rooms:"BallRoom A, BallRoom B, BallRoom C, BallRoom D, BallRoom E, BallRoom F, BallRoom G"},
  {key:"id:55666",eventId:"55666",showName:"Georgia DECA 2026",startDate:"2026-11-05",showDate:"2026-11-07",rooms:"Hall D"}
 ];
 const item=(date:string,showName:string,rooms:string[],eventId="")=>({
  date,eventId,showName,rooms,source:"engineering-workbook" as const,details:["S 8a–5p"]
 });
 it("identifies the screenshot's operating functions without classifying real show names",()=>{
  for(const title of [
   "Client Arrival","Vendor Load-In/Marquee Letters drop-off",
   "Client Move-In","MO?","Program Start","Move-In (Tables & Chairs)",
   "Tables & Chairs Inc. Move-In","General Session","Program","Setup - FRCS Team"
  ])expect(isOperationalFunctionTitle(title),title).toBe(true);
  for(const title of [
   "Front Row Card Show","Hospitality Industry Ministries",
   "ARMAC Luncheon","Georgia DECA 2026",
   "Coldwell Banker Realty Atlanta Unlocking Home Parties"
  ])expect(isOperationalFunctionTitle(title),title).toBe(false);
 });
 it("attaches Sunday Client Arrival Hall AB to Front Row Card Show, not a second show",()=>{
  const joined=combineTodaySources(shows,[
   item("2026-11-08","Front Row Card Show",["Hall A","Hall B"]),
   item("2026-11-08","Client Arrival",["Hall A","Hall B"])
  ]);
  expect(joined.shows.filter(s=>showHasActivityOnDay(s,"2026-11-08",joined)).map(s=>s.showName))
   .toEqual(["Front Row Card Show"]);
  expect(joined.daily["id:4711"]?.["2026-11-08"]?.some(
   text=>text.includes("Client Arrival (room/day match — verify)")
  )).toBe(true);
  expect(joined.unlinkedFunctions).toHaveLength(0);
 });
 it("groups Monday vendor load-in, Tuesday client move-in and Friday event support under actual shows",()=>{
  const joined=combineTodaySources(shows,[
   item("2026-11-02","Coldwell Banker Realty Atlanta Unlocking Home Parties",
    ["BallRoom A","BallRoom B","BallRoom E"]),
   item("2026-11-02","Vendor Load-In/Marquee Letters drop-off",
    ["BallRoom A","BallRoom B","BallRoom E"]),
   item("2026-11-03","Coldwell Banker Realty Atlanta Unlocking Home Parties",
    ["BallRoom A","BallRoom B","BallRoom E"]),
   item("2026-11-03","Client Move-In",["BallRoom A","BallRoom B","BallRoom E"]),
   item("2026-11-03","MO?",["BallRoom A","BallRoom B","BallRoom E"]),
   item("2026-11-05","ARMAC Luncheon",["BallRoom A","BallRoom B","BallRoom C",
    "BallRoom D","BallRoom E","BallRoom F","BallRoom G"]),
   item("2026-11-05","Program",["BallRoom A","BallRoom B","BallRoom C",
    "BallRoom D","BallRoom E","BallRoom F","BallRoom G"]),
   item("2026-11-05","Georgia DECA 2026",["Hall D"]),
   item("2026-11-05","Tables & Chairs Inc. Move-In",["Hall D"])
  ]);
  expect(joined.unlinkedFunctions).toHaveLength(0);
  expect(joined.shows.filter(s=>s.key.startsWith("schedule:"))).toHaveLength(0);
  expect(joined.daily["id:5588"]?.["2026-11-02"]?.join(" ")).toContain("Vendor Load-In");
  expect(joined.daily["id:5588"]?.["2026-11-03"]?.join(" ")).toContain("Client Move-In");
  expect(joined.daily["id:40566"]?.["2026-11-05"]?.join(" ")).toContain("Program");
  expect(joined.daily["id:55666"]?.["2026-11-05"]?.join(" ")).toContain("Tables & Chairs");
 });
 it("does not invent a match when two same-day shows use the same rooms",()=>{
  const overlap:PostConShow={key:"id:another",eventId:"99999",showName:"Another Event",
   startDate:"2026-11-08",showDate:"2026-11-08",rooms:"Hall A, Hall B"};
  const joined=combineTodaySources([...shows,overlap],[
   item("2026-11-08","Front Row Card Show",["Hall A","Hall B"]),
   item("2026-11-08","Another Event",["Hall A","Hall B"]),
   item("2026-11-08","Client Arrival",["Hall A","Hall B"])
  ]);
  expect(joined.unlinkedFunctions.map(x=>x.showName)).toEqual(["Client Arrival"]);
  expect(joined.shows.some(x=>x.showName==="Client Arrival")).toBe(false);
 });
 it("keeps a function with explicit Event ID attached to its own event despite overlapping room use",()=>{
  const joined=combineTodaySources(shows,[item("2026-11-08","Client Arrival",["Hall A","Hall B"],"4711")]);
  expect(joined.unlinkedFunctions).toEqual([]);
  expect(joined.daily["id:4711"]?.["2026-11-08"]?.join(" ")).toContain("Client Arrival");
 });
 it("never counts a legacy catalog function as an additional show",()=>{
  const polluted:PostConShow={key:"name:client-arrival",eventId:"",showName:"Client Arrival",
   startDate:"2026-11-08",showDate:"2026-11-08",rooms:"Hall A, Hall B"};
  const joined=combineTodaySources([...shows,polluted],[]);
  expect(joined.shows.map(x=>x.showName)).not.toContain("Client Arrival");
 });
});
