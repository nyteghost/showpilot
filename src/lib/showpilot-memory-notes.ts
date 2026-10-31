import type {TaskNote} from "./work-tools";
import type {MemoryDraft} from "./showpilot-memory-bridge";

function safe(value:unknown):string{return typeof value==="string" ? value.replace(/[\r\n]+/g," ").trim().slice(0,220) : "";}
function size(value:unknown):string{return typeof value==="number"&&Number.isFinite(value)&&value>=0?String(value):"Not recorded";}
function quantity(value:unknown):number{return typeof value==="number"&&Number.isInteger(value)&&value>=0?value:0;}
type StageNote={
 name:string;width:number;length:number;heightIn:number;valid:boolean;
 decks:readonly {isBridge?:boolean}[];
 holders:readonly {capacity:number}[];
};
export function stageMemoryDraft(planName:string,app:{eventName?:string;showDate?:string;buildByDate?:string},stages:readonly StageNote[]):MemoryDraft {
 const title=safe(planName)||"Stage configuration";
 const lines=[
  "## Event",safe(app.eventName)||"Not specified",
  "- Show date: "+(safe(app.showDate)||"Not specified"),
  "- Build by: "+(safe(app.buildByDate)||"Not specified"),
  "","## Stage setup summary"
 ];
 for(const [i,st] of stages.entries()){
  const holders=[1,2,3].map(c=>c+"-deck holders: "+st.holders.filter(h=>h.capacity===c).length);
  const bridges=st.decks.filter(d=>d.isBridge).length;
  lines.push("### "+safe(st.name||"Stage "+(i+1)),
    "- Dimensions: "+size(st.width)+" ft × "+size(st.length)+" ft × "+size(st.heightIn)+" in high",
    "- Total 4×8 decks: "+st.decks.length,
    "- Bridge decks (included above): "+bridges,
    "- "+holders.join(" · "),
    "- Planner status: "+(st.valid?"buildable in planning rules":"requires review"),"");
 }
 if(!stages.length)lines.push("No current stage layout available; consult the saved plan in ShowPilot.");
 lines.push("## Before reusing","Verify actual equipment stock, manufacturer-approved bridge spans and loading, room requirements, stage access and local safety practices. The Stage & Deck Planner remains the source for reopening its saved plan; this Markdown is a reference note, not a stage-layout import file.");
 return {category:"Stage Setups",title,content:lines.join("\n")};
}
export function approvedTaskMemoryDraft(task:TaskNote,reason:string,evidence:readonly string[]):MemoryDraft {
 const date=safe(task.date);
 const section=safe(task.section);
 const description=safe(task.text);
 return {
  category:"Approved Tasks",
  title:(date+" "+section+" — "+description).slice(0,140),
  content:[
   "## Approved engineering task",
   "- Date: "+date,
   "- Area: "+section,
   "- Task: "+description,
   "","## Why it was suggested",
   safe(reason)||"Approved by the user.",
   "","## Source evidence",
   ...evidence.slice(0,5).map(e=>"- "+safe(e)),
   "","This is a historical example, not a standing instruction. Recheck the current event, room and building requirements."
  ].join("\n")
 };
}
