import {describe,it,expect} from "vitest";
import {selectShowPilotLocalModels,DEFAULT_SHOWPILOT_LOCAL_MODEL,
 LLAMA_3_2_3B_Q4F16_MODEL} from "../lib/showpilot-ai-models";

describe("WebLLM local model dropdown",()=>{
 const supported=[
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  LLAMA_3_2_3B_Q4F16_MODEL,
  DEFAULT_SHOWPILOT_LOCAL_MODEL,
  "SmolLM2-1.7B-Instruct-q4f16_1-MLC"
 ];
 it("offers supported 3B Llama and retains Qwen default",()=>{
  const models=selectShowPilotLocalModels(supported);
  expect(models[0]).toBe(DEFAULT_SHOWPILOT_LOCAL_MODEL);
  expect(models).toContain(LLAMA_3_2_3B_Q4F16_MODEL);
  expect(models).toContain("Llama-3.2-1B-Instruct-q4f16_1-MLC");
  expect(models).toEqual([...new Set(models)]);
 });
 it("never offers a model that is not supported by the installed WebLLM catalog",()=>{
  expect(selectShowPilotLocalModels([DEFAULT_SHOWPILOT_LOCAL_MODEL]))
   .toEqual([DEFAULT_SHOWPILOT_LOCAL_MODEL]);
  expect(selectShowPilotLocalModels([])).toEqual([]);
 });
});
