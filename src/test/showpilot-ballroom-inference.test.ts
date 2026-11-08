import {describe,it,expect} from "vitest";
import type {EventRow} from "@/lib/work-tools";
import type {DailyActivity} from "@/lib/showpilot-today-sources";
import {inferBallroomTransitions,ballroomGroup} from "@/lib/showpilot-ballroom-inference";
import {buildingChecklistTasks} from "@/lib/showpilot-today-checklist";

const row=(date:string,show:string,space:string,description="Meeting",id="42389"):EventRow=>({
 level:3,date,event:show,eventId:id,description,space,usage:
 /move.?in/i.test(description)?"Move In":"Event (Evt)",
 start:"09:00 AM",end:"05:00 PM"
});
describe("Airwall intelligence compares actual ballroom layouts across event days",()=>{
 it("parses real Ungerboeck split room codes and full ballroom",()=>{
  expect(ballroomGroup("Ballroom CDF (BRCDF)")).toBe("CDF");
  expect(ballroomGroup("Ballroom ABEG (BRABEG)")).toBe("ABEG");
  expect(ballroomGroup("Chattahoochee Ballroom (BRFULL)")).toBe("ABCDEFG");
  expect(ballroomGroup("Hall AB")).toBeNull();
 });
 it("creates full-ballroom handoff between Thursday split setup and Sunday full room",()=>{
  const rows=[
   row("2026-10-01","TSPMG Town Hall","Ballroom CDF (BRCDF)","AM Buffet Breakfast"),
   row("2026-10-01","TSPMG Town Hall","Ballroom ABEG (BRABEG)","AM Meeting"),
   row("2026-10-04","Home Depot Supplier Meeting","Chattahoochee Ballroom (BRFULL)","Move In","50001")
  ];
  const result=inferBallroomTransitions([],rows);
  expect(result.configurations).toMatchObject([
   {date:"2026-10-01",groups:["ABEG","CDF"]},
   {date:"2026-10-04",groups:["ABCDEFG"]}
  ]);
  expect(result.transitions).toHaveLength(1);
  const t=result.transitions[0]!;
  expect(t).toMatchObject({afterDate:"2026-10-01",needByDate:"2026-10-04",
   toGroups:["ABCDEFG"],target:"Full Ballroom",confidence:"confirmed-layout"});
  for(const date of ["2026-10-01","2026-10-02","2026-10-03","2026-10-04"]){
   const tasks=buildingChecklistTasks(date,[],[],[t]);
   const inferred=tasks.filter(t=>t.source==="inferred");
   expect(inferred).toHaveLength(2);
   expect(inferred[0]?.text).toContain("Make Full Ballroom");
   expect(inferred[1]?.text).toContain("Verify lighting zones");
   expect(inferred[0]?.storageDay).toBe("2026-10-01");
  }
  expect(buildingChecklistTasks("2026-10-05",[],[],[t]).filter(t=>t.source==="inferred")).toEqual([]);
 });
 it("detects full-to-ABE room change even with no written Make instruction",()=>{
  const rows=[
   row("2026-11-04","Previous Show","Chattahoochee Ballroom (BRFULL)","General Session","40001"),
   row("2026-11-05","Next Show","Ballroom ABE (BRABE)","Client Move-In","40002")
  ];
  const transitions=inferBallroomTransitions([],rows).transitions;
  expect(transitions).toHaveLength(1);
  expect(transitions[0]?.target).toBe("Ballroom ABE");
  expect(buildingChecklistTasks("2026-11-05",[],[],transitions)
   .some(t=>t.text.includes("Make Ballroom ABE"))).toBe(true);
 });
 it("does not infer change from unrelated hall areas or unchanged ballroom layout",()=>{
  const rows=[
   row("2026-10-01","One","Ballroom CDF"),
   row("2026-10-02","Two","Ballroom CDF","Meeting","40002"),
   row("2026-10-03","Hall Show","Hall AB","Move In","40003")
  ];
  expect(inferBallroomTransitions([],rows).transitions).toEqual([]);
 });
 it("does not guess a physical layout from overlapping same-day configurations",()=>{
  const rows=[
   row("2026-10-01","Split","Ballroom CDF"),
   row("2026-10-01","Split","Ballroom ABEG"),
   row("2026-10-01","Later","Ballroom ABCDEFG","General Session","50002"),
   row("2026-10-04","Next","Ballroom ABE")
  ];
  const result=inferBallroomTransitions([],rows);
  expect(result.warnings.some(w=>w.includes("Split")&&w.includes("Later")&&w.includes("Ballroom ABCDEFG"))).toBe(true);
  expect(result.warnings.some(w=>w.includes("ballroom section")&&w.includes("room refresh"))).toBe(true);
  expect(result.transitions).toHaveLength(0);
 });
});
