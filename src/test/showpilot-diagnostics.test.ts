import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {fileURLToPath} from "node:url";
import {makeDiagnosticReport,diagnosticFailureCode,diagnosticReportText,diagnosticSteps} from "@/lib/showpilot-diagnostics";
import {checkStageRules,checkFloorRules,checkStaffingRules,checkPostConRules,checkPlanningValidation,checkWebGpuCompute,
 STAGE_FIXTURE,FLOOR_FIXTURE,staffingFixture} from "@/lib/showpilot-diagnostic-checks";

describe("one-click ShowPilot diagnostics (synthetic only)",()=>{
 it("executes stage, CGC staffing, floor map and Post-Con without real work data",()=>{
  expect(checkStageRules().count).toBeGreaterThan(0);
  expect(checkFloorRules().unresolved).toBeGreaterThan(0);
  expect(checkStaffingRules().assignments).toBeGreaterThan(0);
  expect(checkPostConRules().count).toBe(1);
  expect(checkPlanningValidation().count).toBe(4);
  expect(STAGE_FIXTURE.widthFt).toBe(8);
  expect(FLOOR_FIXTURE.unresolved).toHaveLength(1);
  expect((staffingFixture().events as {room:string}[]).every(e=>e.room==="Hall A")).toBe(true);
 });
 it("verifies a compute-shader roundtrip using a mocked GPU API",async()=>{
  let destroyed=0;
  const read={
   mapAsync:async()=>{},
   getMappedRange:()=>new Uint32Array([42]).buffer,
   unmap:()=>{},
   destroy:()=>{destroyed++;}
  };
  const adapter={requestDevice:async()=>({
   createBuffer:({usage}:{usage:number})=>usage===9?read:{destroy:()=>{destroyed++;}},
   createShaderModule:()=>({}),
   createComputePipeline:()=>({getBindGroupLayout:()=>({})}),
   createBindGroup:()=>({}),
   createCommandEncoder:()=>({
    beginComputePass:()=>({setPipeline:()=>{},setBindGroup:()=>{},dispatchWorkgroups:()=>{},end:()=>{}}),
    copyBufferToBuffer:()=>{},finish:()=>({})
   }),
   queue:{submit:()=>{}},destroy:()=>{destroyed++;}
  })};
  expect((await checkWebGpuCompute(adapter)).computedValue).toBe(42);
  expect(destroyed).toBe(3);
 });
 it("exports only allowlisted fields, never raw error content or unknown metrics",()=>{
  const pii="C:\\Users\\Somebody\\Confidential\\2026 Proprietary Event - PAT TOKEN";
  const report=makeDiagnosticReport({
   version:pii,platform:pii,architecture:pii,electronMajor:35,
   gpuVendor:pii,gpuArchitecture:pii,modelState:pii,modelId:pii,
   checks:[{
    id:"memory.sqlite",status:"fail",code:"CHECK_ERROR",durationMs:7,
    metrics:{count:2,localFilePath:pii,customer:pii,employeeName:pii,error:pii}
   }],
   manual:{stagePrint:true,employeeName:true}
  });
  const both=JSON.stringify(report)+diagnosticReportText(report);
  expect(both).not.toContain("Somebody");
  expect(both).not.toContain("PAT TOKEN");
  expect(both).not.toContain("Confidential");
  expect(report.checks[0]?.metrics).toEqual({count:2});
  expect(report.environment.gpuVendor).toBe("unknown");
  expect(report.environment.modelId).toBe("unknown");
  expect(report.manual).not.toHaveProperty("employeeName");
  expect(report.summary.fail).toBe(1);
 });
 it("classifies errors without returning any raw message",()=>{
  expect(diagnosticFailureCode(new Error("C:\\private\\GPU device lost"))).toBe("GPU_MEMORY");
  expect(diagnosticFailureCode(new Error("GrammarMatcherInitError C:\\Users\\Name"))).toBe("MODEL_FORMAT_ERROR");
  expect(diagnosticFailureCode(new Error("C:\\Users\\Name\\private.xls"))).toBe("CHECK_ERROR");
  expect(Object.keys(diagnosticSteps)).toContain("model.staffing");
  expect(Object.keys(diagnosticSteps)).toContain("memory.backup");
 });
 it("reports explicit skips, so an unloaded model cannot look like a passed test",()=>{
  const report=makeDiagnosticReport({version:"1.0-beta",platform:"Windows",architecture:"x64",
   electronMajor:35,gpuVendor:"nvidia",gpuArchitecture:"turing",modelState:"not-loaded",modelId:"",
   checks:[
    {id:"gpu.compute",status:"pass",code:"OK",durationMs:20,metrics:{computedValue:42}},
    {id:"model.inference",status:"skip",code:"NOT_LOADED",durationMs:0},
    {id:"memory.history",status:"warn",code:"NO_DATA",durationMs:3}
   ]});
  expect(report.summary).toEqual({pass:1,fail:0,warn:1,skip:1});
  expect(diagnosticReportText(report)).toContain("[SKIP] Actual on-device AI generation | NOT_LOADED");
 });
});

describe("desktop diagnostics IPC allowlisting",()=>{
 const content=readFileSync(fileURLToPath(new URL("../../desktop/showpilot-diagnostics.cjs",import.meta.url)),"utf8");
 const nativeRequire=createRequire(import.meta.url);
 it("does not return extra graphics keys or raw sensitive machine fields",async()=>{
  const module={exports:{} as Record<string,any>};
  const electron={
   app:{getVersion:()=>"2.0-beta",
    getGPUFeatureStatus:()=>({gpu_compositing:"enabled",webgpu:"enabled",
     userProfilePath:"C:\\Users\\Secret",driverInfo:"Proprietary",hardware_id:"SERIAL123"})},
   ipcMain:{handle:()=>{}}
  };
  runInNewContext(content,{module,exports:module.exports,
   require:(id:string)=>id==="electron"?electron:id==="./showpilot-memory.cjs"?{
    diagnosticsSummary:async()=>({sqliteIntegrityOK:true,activeNoteCount:1})
   }:nativeRequire(id),
   process:{platform:"win32",arch:"x64",versions:{electron:"35.1.0"}}
  });
  const summary=await module.exports.inspect();
  expect(summary.platform).toBe("Windows");
  expect(summary.memory.sqliteIntegrityOK).toBe(true);
  const json=JSON.stringify(summary);
  expect(json).not.toContain("SERIAL123");
  expect(json).not.toContain("C:\\Users");
  expect(json).not.toContain("Proprietary");
  expect(summary.gpuFeatures.webgpu).toBe("enabled");
 });
});
