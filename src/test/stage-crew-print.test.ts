import {describe,it,expect} from "vitest";
import {crewPrintData,crewPrintDocument,type CrewPrintStage} from "@/lib/stage-crew-print";

const stage=(name:string):CrewPrintStage=>({
  name,width:16,length:8,heightIn:32,valid:true,
  decks:[{x:0,y:0,w:4,h:8},{x:4,y:0,w:4,h:8},{x:8,y:0,w:4,h:8},{x:12,y:0,w:4,h:8}],
  holders:[{x:0,y:0,w:12,h:8,capacity:3},{x:12,y:0,w:4,h:8,capacity:1}],
});
describe("ShowPilot short crew printouts",()=>{
  it("prints one sheet for every physical stage, with no global inventory or planner controls",()=>{
    const html=crewPrintDocument("Annual Event",[stage("Stage One"),stage("Stage Two")]);
    expect((html.match(/<article class="sheet"/g)||[])).toHaveLength(2);
    expect(html).toContain("STAGE 1 OF 2");
    expect(html).toContain("STAGE 2 OF 2");
    expect(html).not.toContain("Crew parts list vs. warehouse");
    expect(html).not.toContain("Saved plans");
    expect(html).not.toContain("Email crew");
    expect(html).toContain("page-break-after:always");
    expect(html).toContain("page-break-after:auto");
  });
  it("counts actual decks and holders independently for each stage",()=>{
    const a=stage("Main Stage"), b=stage("Side Stage");b.holders=[{x:0,y:0,w:4,h:8,capacity:1}];b.decks=b.decks.slice(0,1);
    expect(crewPrintData(a)).toEqual({decks:4,loose:0,holders:{1:1,2:0,3:1},holderTotal:2});
    const html=crewPrintDocument("Show",[a,b]);
    expect(html).toContain("3-DECK HOLDERS");
    expect(html).toContain("1-DECK HOLDERS");
    expect(html).toContain("DECK PLACEMENT");
    expect((html.match(/<svg /g)||[])).toHaveLength(2);
  });
  it("prints dimension units and provides a real per-stage SVG picture",()=>{
    const html=crewPrintDocument("Event",[stage("Main Stage")]);
    for(const text of ["16 ft","8 ft","32 in","4 × 8 DECKS","width","length"])expect(html).toContain(text);
    expect(html).toContain("viewBox=");
    expect(html).toContain("<rect ");
    expect(html).toContain("<text ");
    expect(html).toContain("color:#111827");
  });
  it("escapes event and stage names, and labels loose decks separately",()=>{
    const s={...stage("<Main> & Stage"),extraDecks:2};
    const html=crewPrintDocument("<script>alert(1)</script> & Workshop",[s]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;Main&gt;");
    expect(html).toContain("6</strong>");
    expect(html).toContain("2 extra loose decks not shown");
  });
  it("shows the build deadline and show date clearly on every stage page",()=>{
    const html=crewPrintDocument("Trade Show",[stage("Main"),stage("Side")],{
      buildByDate:"2026-11-02",showDate:"2026-11-04",
    });
    expect((html.match(/BUILD BY/g)||[])).toHaveLength(2);
    expect((html.match(/SHOW DATE/g)||[])).toHaveLength(2);
    expect((html.match(/Mon, Nov 2, 2026/g)||[])).toHaveLength(2);
    expect((html.match(/Wed, Nov 4, 2026/g)||[])).toHaveLength(2);
    expect((html.match(/<article class="sheet"/g)||[])).toHaveLength(2);
  });
  it("uses an explicit not-set date instead of guessing or shifting dates",()=>{
    const noDates=crewPrintDocument("Show",[stage("Main")]);
    expect((noDates.match(/Not set/g)||[])).toHaveLength(2);
    const bad=crewPrintDocument("Show",[stage("Main")],{showDate:"2026-02-31",buildByDate:"invalid"});
    expect((bad.match(/Not set/g)||[])).toHaveLength(2);
  });
  it("only states the standard 4x8 deck size in the parts summary, not on each deck",()=>{
    const html=crewPrintDocument("Show",[stage("Main")]);
    expect((html.match(/4 × 8 DECKS/g)||[])).toHaveLength(1);
    expect(html).toContain("Outlines show individual decks");
  });
  it("labels actual bridge decks on the printed diagram without changing the total count",()=>{
    const a=stage("Bridge Platform");
    a.decks[1]={...a.decks[1],isBridge:true};
    const html=crewPrintDocument("Demo",[a]);
    expect(html).toContain("Bridge decks:");
    expect(html).toContain("marked BRIDGE on diagram");
    expect(html).toContain("Verify approved bridge support");
    expect(html).toContain(">BRIDGE</text>");
    expect(crewPrintData(a).decks).toBe(4);
  });

  it("adds the current arranged Layout View after crew sheets only when selected",()=>{
    const physical=stage("Main");
    const layout=[
      {...physical,id:"s1",position:{x:13,y:7}},
      {...stage("Side"),id:"s2",position:{x:34,y:9},width:8,length:16},
      {id:"bridge-1",name:"Loose & <bridge>",width:4,length:8,heightIn:32,valid:true,
       decks:[{x:0,y:0,w:4,h:8,isBridge:true}],holders:[],position:{x:55,y:10}},
    ];
    const without=crewPrintDocument("Event",[physical]);
    expect(without).not.toContain('class="layout-sheet"');
    const html=crewPrintDocument("Event",[physical],{showDate:"2026-11-04"},layout);
    expect((html.match(/<article class="sheet"/g)||[])).toHaveLength(1);
    expect((html.match(/class="layout-sheet"/g)||[])).toHaveLength(1);
    expect(html.indexOf('class="layout-sheet"')).toBeGreaterThan(html.indexOf('class="sheet"'));
    expect(html).toContain('page:layout');
    expect(html).toContain('transform="translate(13 7)"');
    expect(html).toContain('transform="translate(34 9)"');
    expect(html).toContain('transform="translate(55 10)"');
    expect(html).toContain('8 × 16 ft');
    expect(html).toContain('Loose &amp; &lt;bridge&gt;');
    expect(html).toContain('Includes rotated stages, stage copies, and loose bridge tiles');
  });
  it("flags invalid stages rather than silently claiming they can be built",()=>{
    const html=crewPrintDocument("Event",[{...stage("Incomplete"),valid:false}]);
    expect(html).toContain("CHECK PLAN");
  });
});
