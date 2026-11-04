/** Synthetic, side-effect-free operational probes for diagnostics. No user's
 * schedules, stage plans, PDF geometry or staffing data are read or modified.
 */
import {planStage,FULL_STOCK} from "./deck-solver";
import {buildEntries,parseBooth,resolve,classify,type Prims} from "./floor-map";
import {staffingPlanningContext,validatePlanningResponse} from "./showpilot-planning";
import {postConShows} from "./showpilot-postcon";
import type {EventEntry} from "./work-tools";

export const FIXTURE_DATE="2026-11-02";
export const STAGE_FIXTURE={
 eventName:"Diagnostic sample",showDate:FIXTURE_DATE,stageName:"Sample platform",
 widthFt:8,lengthFt:8,heightIn:32,
 stock:FULL_STOCK,
 preferences:{mostlyThree:false,allowTwo:true},
 currentSolver:{buildable:true,holders:2,bridges:0,decks:2}
};
export const FLOOR_FIXTURE={
 planName:"Diagnostic sample",eventId:"SAMPLE",placedCount:1,
 unresolved:[{id:"sample-question-1",kind:"not-found",booth:"101",exhibitor:"Sample Exhibitor",
 text:"Check sample booth 101 position",hints:["Sample 101"]}]
};
export function staffingFixture(){
 const entries=[{
  date:FIXTURE_DATE,space:"Hall A",title:"Diagnostic Sample",eventId:"SAMPLE",code:"S",start:600,end:1200
 },{date:FIXTURE_DATE,space:"CEPAC",title:"Excluded test case",eventId:"OTHER",code:"S",start:600,end:1200}] as EventEntry[];
 return staffingPlanningContext(entries,[FIXTURE_DATE]);
}
export function checkStageRules(){
 const valid=planStage(8,8,FULL_STOCK,{mostlyThree:false,allowTwo:true});
 const invalid=planStage(5,5,FULL_STOCK,{mostlyThree:false,allowTwo:true});
 if(!valid.ok||valid.decks.length<2||invalid.ok)throw Error("Stage safety fixture failed.");
 return {count:valid.decks.length};
}
export function checkFloorRules(){
 const entries=buildEntries([{pre:"Sample Exhibitor 101",units:1,desc:"20 amp utility",order:"TEST-101"}]);
 const tokens=parseBooth("101");
 const kind=classify("20 amp utility");
 if(entries.length!==1||!tokens.ids.includes("101")||kind.kind!=="a20")throw Error("Floor parser fixture failed.");
 // A synthetic PDF primitive set, without any customer floor map.
 const prims:Prims={width:300,height:200,texts:[],segs:[],boxes:[]};
 const solved=resolve(prims,entries);
 if(solved.questions.length<1)throw Error("Floor missing-question detection failed.");
 return {unresolved:solved.questions.length};
}
export function checkStaffingRules(){
 const ctx=staffingFixture();
 const events=ctx.events as Array<{title:string}>,assignments=ctx.assignments as Array<{name:string;date:string}>;
 if(events.length!==1||events[0]?.title!=="Diagnostic Sample"||assignments.length===0)throw Error("Staffing CGC fixture failed.");
 return {assignments:assignments.length,days:1};
}
export function checkPostConRules(){
 const shows=postConShows([{
  date:"2025-10-05",space:"Hall AB",title:"Sample Expo",eventId:"TEST1",code:"S",start:600,end:1200
 },{date:"2025-10-05",space:"Cobb Energy Performing Arts Centre",title:"Excluded",eventId:"OTHER",code:"S",start:600,end:1200}] as EventEntry[]);
 if(shows.length!==1||!shows[0]?.rooms.includes("Hall A")||!shows[0]?.rooms.includes("Hall B"))throw Error("Post-Con venue fixture failed.");
 return {count:shows.length};
}
export function checkPlanningValidation(){
 const validStage={
  recommendations:[{title:"8 by 8 staging sample",reason:"Matches current sample inventory.",evidence:["Synthetic solver"],
   stage:{widthFt:8,lengthFt:8,heightIn:32,mostlyThree:false,allowTwo:true}}]};
 const invalidStage={
  recommendations:[{title:"Invalid oversized sample",reason:"Not within stage constraints.",evidence:["Synthetic"],
   stage:{widthFt:200,lengthFt:200,heightIn:32,mostlyThree:false,allowTwo:true}}]};
 const floor={recommendations:[{title:"Check sample booth",reason:"Question already exists.",evidence:["Synthetic question"],targetId:"sample-question-1"}]};
 const staffing=staffingFixture();const first=(staffing.assignments as Array<{name:string;date:string}>)[0];
 if(!first)throw Error("No synthetic staffing output");
 const staff={recommendations:[{title:"Check synthetic coverage",reason:"A rule-based sample shift exists.",evidence:["Synthetic staffing"],staffName:first.name,date:first.date}]};
 if(validatePlanningResponse(validStage,"stage",STAGE_FIXTURE).length!==1||
   validatePlanningResponse(invalidStage,"stage",STAGE_FIXTURE).length!==0||
   validatePlanningResponse(floor,"floor",FLOOR_FIXTURE).length!==1||
   validatePlanningResponse(staff,"staffing",staffing).length!==1||
   validatePlanningResponse({...floor,recommendations:[{...floor.recommendations[0],targetId:"invented"}]},"floor",FLOOR_FIXTURE).length!==0)
  throw Error("AI safety validation fixture failed.");
 return {count:4};
}
/** Verify a real WebGPU compute shader and its readback, not just adapter presence.
 * Fully synthetic 4-byte workload; never uploads any work document.
 */
export async function checkWebGpuCompute(adapter:any){
 const device=await adapter.requestDevice();
 let work:any,readback:any;
 try{
  // GPUBufferUsage.STORAGE=128, COPY_SRC=4, MAP_READ=1, COPY_DST=8.
  work=device.createBuffer({size:4,usage:128|4});
  readback=device.createBuffer({size:4,usage:1|8});
  const shader=device.createShaderModule({code:"@group(0) @binding(0) var<storage, read_write> result: array<u32>; @compute @workgroup_size(1) fn main() { result[0] = 42u; }"});
  const pipeline=device.createComputePipeline({layout:"auto",compute:{module:shader,entryPoint:"main"}});
  const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:work}}]});
  const command=device.createCommandEncoder();
  const pass=command.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(1);pass.end();
  command.copyBufferToBuffer(work,0,readback,0,4);
  device.queue.submit([command.finish()]);
  await readback.mapAsync(1);
  const result=new Uint32Array(readback.getMappedRange().slice(0))[0];
  readback.unmap();
  if(result!==42)throw Error("GPU compute did not return the expected value.");
  return {computedValue:result};
 }finally{try{work?.destroy();readback?.destroy();device?.destroy();}catch{}}
}
