import {describe,it,expect} from "vitest";
import {RULE_REVIEW_JSON_SCHEMA,validateRuleReviewResponse}
 from "../lib/showpilot-ai-rule-response";
import {parseTaskJson} from "../lib/showpilot-ai-json";

describe("ShowPilot Local AI optional rule review validation",()=>{
 it("provides a proper JSON grammar schema for WebLLM",()=>{
  const schema=JSON.parse(RULE_REVIEW_JSON_SCHEMA);
  expect(schema.required).toEqual(["opinion","checks"]);
  expect(schema.properties.checks.items.type).toBe("string");
 });
 it("accepts short opinions and up to three checked recommendations",()=>{
  const data=parseTaskJson('```json\n{"opinion":"  Verify dates. ","checks":["Check EOC","Check schedule"]}\n```');
  expect(validateRuleReviewResponse(data)).toEqual({
   opinion:"Verify dates.",checks:["Check EOC","Check schedule"]
  });
  expect(validateRuleReviewResponse({opinion:"Okay",checks:[]})).toEqual({opinion:"Okay",checks:[]});
 });
 it("explains which property was malformed without including untrusted model output",()=>{
  expect(()=>validateRuleReviewResponse({checks:[]})).toThrow(/omitted its written opinion/);
  expect(()=>validateRuleReviewResponse({opinion:"Test"})).toThrow(/required checks list/);
  expect(()=>validateRuleReviewResponse({opinion:"Test",checks:[10]})).toThrow(/non-text values/);
  expect(()=>validateRuleReviewResponse({opinion:"x".repeat(901),checks:[]})).toThrow(/900 characters/);
  expect(()=>validateRuleReviewResponse({opinion:"Test",checks:["a".repeat(241)]})).toThrow(/240 characters/);
  expect(()=>validateRuleReviewResponse({opinion:"Test",checks:Array(6).fill("check")})).toThrow(/maximum five/);
  expect(()=>validateRuleReviewResponse([1,2])).toThrow(/valid review object/);
 });
 it("never treats an AI review as export authorization",()=>{
  const result=validateRuleReviewResponse({opinion:"Looks okay",checks:[]});
  expect(Object.keys(result).sort()).toEqual(["checks","opinion"]);
  expect(result).not.toHaveProperty("approved");
 });
});
