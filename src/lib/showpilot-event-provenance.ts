import {roomsFromAssignedLine} from "./showpilot-event-discovery";
import type {Evidence} from "./showpilot-event-discovery";

export type EocRoomCitation={room:string;file:string;page:number;line:string};
export type UnassignedSpaceCitation={file:string;page:number;line:string};

/** Read only a printed Function Space label as an EOC room assignment.
 * In particular, "No Space Assigned" does not infer a hall from a nearby
 * department's function, an unrelated paragraph or a diagram filename.
 * Includes page and original text so every statement is auditable. */
export function eocSpaceEvidence(
 sources:readonly {file:string;pages:readonly string[]}[]
):{assigned:EocRoomCitation[];unassigned:UnassignedSpaceCitation[]}{
 const assigned:EocRoomCitation[]=[];
 const unassigned:UnassignedSpaceCitation[]=[];
 for(const source of sources){
  for(let p=0;p<Math.min(source.pages.length,80);p++){
   const lines=source.pages[p]!.split(/\r?\n/).map(v=>v.replace(/\s+/g," ").trim()).filter(Boolean);
   for(let i=0;i<Math.min(lines.length,1500);i++){
    const line=lines[i]!;
    const match=/^function\s+space\s*[:：-]\s*(.*)$/i.exec(line);
    if(!match)continue;
    const value=match[1]!.trim()||lines[i+1]||"";
    const excerpt=("Function Space: "+value).slice(0,260);
    if(/^no\s+space\s+assigned\b/i.test(value)){
     if(!unassigned.some(x=>x.file===source.file&&x.page===p+1&&x.line===excerpt))
      unassigned.push({file:source.file,page:p+1,line:excerpt});
     continue;
    }
    for(const room of roomsFromAssignedLine("Function Space: "+value)){
     if(!assigned.some(x=>x.room===room&&x.file===source.file&&x.page===p+1&&x.line===excerpt))
      assigned.push({room,file:source.file,page:p+1,line:excerpt});
    }
   }
  }
 }
 return {assigned:assigned.slice(0,75),unassigned:unassigned.slice(0,30)};
}
export type RoomOrigin={
 status:"eoc-confirmed"|"zip-assigned"|"mention-only"|"not-traced";
 reason:string;
 sources:{source:string;context:string;certainty:"assigned"|"mentioned"|"unknown"}[];
};
export function explainSavedRoom(
 room:string,zipEvidence:readonly Evidence[],eoc:readonly EocRoomCitation[]
):RoomOrigin{
 const eocFound=eoc.filter(x=>x.room===room);
 const zip=zipEvidence.filter(x=>x.field==="room"&&x.value===room);
 const sources=zip.map(x=>({
  source:x.source,
  context:x.context??"The original matching text was not retained when this ZIP was imported.",
  certainty:x.confidence??"unknown" as const
 }));
 if(eocFound.length)return {
  status:"eoc-confirmed",
  reason:"The EOC directly assigns this room under a Function Space heading.",
  sources:[...eocFound.map(x=>({source:x.file+" · page "+x.page,context:x.line,certainty:"assigned" as const})),...sources]
 };
 if(zip.some(x=>x.confidence==="assigned"))return {
  status:"zip-assigned",
  reason:"A ZIP document or manifest contains a direct room assignment, but the currently inspected EOC Function Space lines do not independently confirm it.",
  sources
 };
 if(zip.length)return {
  status:"mention-only",
  reason:"This room was mentioned in the ZIP, but no direct assignment was verified here. A text mention or filename alone should not establish where this event operates.",
  sources
 };
 return {
  status:"not-traced",
  reason:"This room exists in the saved Events catalog, but there is no traceable direct EOC assignment or ZIP room evidence available. It may originate from an earlier Event Schedule import or manual review. ShowPilot cannot determine its original source from these records.",
  sources:[]
 };
}
