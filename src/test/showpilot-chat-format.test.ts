import {describe,it,expect} from "vitest";
import {conciseChatAnswer,conciseChatReference} from "../lib/showpilot-chat-format";
describe("local ShowPilot chat stays conversational",()=>{
 it("filters raw ZIP schedule references",()=>{
  expect(conciseChatReference('ZIP Schedule: id:41557 {"eventId":"41557"}')).toBe("");
  expect(conciseChatReference("Reception belongs to the conference event.")).toContain("Reception");
 });
 it("renders a short answer from structured replies",()=>{
  expect(conciseChatAnswer('{"answer":"Yes, that reception is part of the event."}')).toBe("Yes, that reception is part of the event.");
 });
 it("rejects machine metadata and bounds long replies",()=>{
  expect(conciseChatAnswer('ZIP Schedule: {"eventId":"1234"}')).toContain("metadata");
  expect(conciseChatAnswer(Array.from({length:80},()=> "This is a long sentence").join(" ")).length).toBeLessThanOrEqual(320);
 });
});
