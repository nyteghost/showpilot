import {describe,it,expect} from "vitest";
import {
 FINDING_ACK_KEY,findingKey,acknowledgeFinding,readFindingAcknowledgements
} from "../lib/showpilot-finding-ack";

describe("Today rule finding acknowledgements",()=>{
 it("makes the same finding stable but shows changed dates or evidence again",()=>{
  const first="2026-11-14 Reception and Tower Summit overlap in Ballroom A";
  const key=findingKey("rule",first);
  expect(findingKey("rule",first)).toBe(key);
  expect(findingKey("rule",first+" (new EOC evidence)")).not.toBe(key);
  expect(findingKey("rule",first.replace("11-14","11-15"))).not.toBe(key);
  expect(findingKey("source",first)).not.toBe(key);
 });
 it("acknowledges individual entries without modifying the source list",()=>{
  const findings=["first","second"];
  const ack=acknowledgeFinding([],findingKey("rule",findings[0]!),"2026-11-08T21:00:00.000Z");
  const seen=new Set(ack.map(x=>x.key));
  expect(findings.filter(x=>!seen.has(findingKey("rule",x)))).toEqual(["second"]);
  expect(findings).toEqual(["first","second"]);
  expect(acknowledgeFinding(ack,ack[0]!.key,ack[0]!.at)).toHaveLength(1);
 });
 it("recovers only valid acknowledgements from storage",()=>{
  const rows=acknowledgeFinding([],findingKey("rule","ok"),"2026-11-08T21:00:00.000Z");
  expect(readFindingAcknowledgements({getItem:key=>key===FINDING_ACK_KEY?JSON.stringify(rows):null})).toEqual(rows);
  expect(readFindingAcknowledgements({getItem:()=>"{not-json"})).toEqual([]);
  expect(readFindingAcknowledgements({getItem:()=>JSON.stringify([{key:"__proto__",at:"invalid"}])})).toEqual([]);
 });
});
