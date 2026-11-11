import {describe,it,expect} from "vitest";
import {googleSyncDisplay} from "../lib/showpilot-google-sync-feedback";

describe("Google Calendar sync feedback: show verified API outcomes",()=>{
 it("shows added/updated counts only after Google confirms the update",()=>{
  expect(googleSyncDisplay({created:2,updated:5,failed:0,remaining:0,errors:[],message:"ok"}))
   .toEqual({kind:"success",message:"Google Calendar confirmed: 2 added, 5 updated, 0 failed. Check your connected Google Calendar for the updated shifts."});
 });
 it("does not present partially failed syncs as successful",()=>{
  const result=googleSyncDisplay({created:1,updated:2,failed:1,remaining:4,
   errors:["2026-11-15: Permission denied"],message:"Google Calendar: 1 added, 2 updated · 1 failed"});
  expect(result.kind).toBe("warning");
  expect(result.message).toContain("4 not processed");
  expect(result.message).toContain("Permission denied");
  expect(result.message).not.toContain("confirmed");
 });
 it("reports no result as confirmed only when Google returns zero errors and no remainder",()=>{
  expect(googleSyncDisplay({created:0,updated:0,failed:0,remaining:0,
   errors:[],message:""}).kind).toBe("success");
  expect(googleSyncDisplay({created:0,updated:0,failed:0,remaining:1,
   errors:[],message:""}).kind).toBe("warning");
 });
});
