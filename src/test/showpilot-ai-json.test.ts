import {describe,it,expect} from "vitest";
import {TASK_JSON_SCHEMA,isGrammarInitFailure,parseTaskJson} from "@/lib/showpilot-ai-json";
import {taskContext,validateTaskResponse} from "@/lib/showpilot-ai-tasks";
import type {EventEntry} from "@/lib/work-tools";

const one:EventEntry={date:"2026-11-09",space:"Hall A",title:"Exhibitor move-in",code:"MI",start:540,end:780};
const suggestion={date:"2026-11-09",room:"Hall A",section:"HALLS",
  task:"Verify Hall A layout with the show manager before move-in",
  reason:"A show is scheduled for move-in; confirm the requested layout.",
  evidence:["Exhibitor move-in"]};

describe("ShowPilot local AI JSON compatibility",()=>{
 it("passes a proper string schema to WebLLM grammar matching",()=>{
   expect(typeof TASK_JSON_SCHEMA).toBe("string");
   const schema=JSON.parse(TASK_JSON_SCHEMA);
   expect(schema.type).toBe("object");
   expect(schema.required).toContain("suggestions");
   expect(schema.properties.suggestions.items.required).toContain("evidence");
 });
 it("recognizes only JSON grammar initialization errors for fallback",()=>{
   expect(isGrammarInitFailure(new Error("GrammarMatcherInitError: Cannot pass non-string to std::string"))).toBe(true);
   expect(isGrammarInitFailure(new Error("Failed to initialize the grammar matcher for response format json_object"))).toBe(true);
   expect(isGrammarInitFailure(new Error("Failed to download model"))).toBe(false);
   expect(isGrammarInitFailure(new Error("Device lost"))).toBe(false);
 });
 it("parses normal JSON, fenced JSON and short model narration safely",()=>{
   const data=JSON.stringify({suggestions:[suggestion]});
   const ctx=taskContext({date:one.date,entries:[one]});
   for(const output of [data,"\`\`\`json\n"+data+"\n\`\`\`","Here are checks:\n"+data]){
     const parsed=parseTaskJson(output);
     expect(validateTaskResponse(parsed,ctx,"local").map(s=>s.task.text)).toEqual([suggestion.task]);
   }
 });
 it("does not accept malformed, empty or out-of-scope generated suggestions",()=>{
   expect(()=>parseTaskJson("")).toThrow(/empty response/);
   expect(()=>parseTaskJson("{not json}")).toThrow(/malformed JSON/);
   const ctx=taskContext({date:one.date,entries:[one]});
   const parsed=parseTaskJson(JSON.stringify({suggestions:[suggestion,{...suggestion,date:"2026-11-16"}]}));
   expect(validateTaskResponse(parsed,ctx,"local")).toHaveLength(1);
 });
});
