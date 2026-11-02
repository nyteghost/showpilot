import { describe, expect, it } from "vitest";
import { buildEntries, cellAround, classify, drawFor, locate, mergeTexts, parseBooth, openOutlineBox, parseWorkOrderLines, parseShowPilotItemLines, planKey, resolve, type Prims, type TextBit } from "@/lib/floor-map";

const t = (s: string, x: number, y: number): TextBit => ({ s, x, y, w: s.length * 3, h: 5 });
/** A 3-booth plan drawn with plain lines: 101 | 102 on top, 103 below, each 20 x 20. */
const lines = (x: number, y: number) => [
  { x1: x, y1: y, x2: x + 20, y2: y }, { x1: x, y1: y + 20, x2: x + 20, y2: y + 20 },
  { x1: x, y1: y, x2: x, y2: y + 20 }, { x1: x + 20, y1: y, x2: x + 20, y2: y + 20 },
];
const plan = (): Prims => ({
  width: 400, height: 300,
  texts: [t("101", 102, 114), t("102", 122, 114), t("103", 102, 134), t("T", 200, 50), t("5", 205, 50)],
  segs: [...lines(100, 110), ...lines(120, 110), ...lines(100, 130)],
  boxes: [{ x: 200, y: 52, w: 9, h: 3 }],
});
const wo = (rows: string[]) => parseWorkOrderLines(rows.map((r) => `${r} 04/23/25 298243 Completed (C)`));

describe("floor map: booth names", () => {
  it("reads the odd ways booths get typed", () => {
    expect(parseBooth("803ASPIRE").ids).toEqual(["803"]);
    expect(parseBooth("D01").ids).toEqual(["D1"]);
    expect(parseBooth("Mo1").ids).toEqual(["M1"]);
    expect(parseBooth("H14H13").ids).toEqual(["H14", "H13"]);
    expect(parseBooth("N9and10").ids).toEqual(["N9", "N10"]);
    expect(parseBooth("m6-7").ids).toEqual(["M6", "M7"]);
    expect(parseBooth("Q08/09").ids).toEqual(["Q8", "Q9"]);
    expect(parseBooth("T-18").ids).toEqual(["T18"]);
    expect(parseBooth("336-A").ids).toEqual(["336A"]);
    expect(parseBooth("K905kitche").ids).toEqual(["K905"]);
    expect(parseBooth("TBD").ids).toEqual([]);
  });
  it("tells a small run from a block", () => {
    expect(parseBooth("412-414").ids).toEqual(["412", "413", "414"]);
    expect(parseBooth("823-5").ids).toEqual(["823", "824", "825"]);
    expect(parseBooth("929-1028").note).toBe("range");
  });
});

describe("floor map: work order", () => {
  it("sorts items into kinds", () => {
    expect(classify("10 amp - 120v: (25' Extension Cord)").kind).toBe("a10");
    expect(classify("20amp - 120v: Exhibit (Extension Cord & Tri Tap)").kind).toBe("a20");
    expect(classify("20 amp - 120v: BR/MR FIRST FREE").kind).toBe("a20");
    expect(classify("Power for (4) Showcases")).toEqual({ kind: "showcase", mult: 4 });
    expect(classify("Cobb Galleria Centre Package B: 4' Track with 3 Lights").kind).toBe("trackB");
    expect(classify("100amp - 208v Three Phase").kind).toBe("big");
    expect(classify("Sink Rental").kind).toBe("other");
  });
  it("adds up an exhibitor's lines and keeps blank booths apart by name", () => {
    const e = buildEntries(wo(["Acme Acme 101 2.00 10 amp - 120v: (x)", "Acme Acme 101 1.00 20amp - 120v: Exhibit (x)", "Bennett Events 3.00 10 amp - 120v: (x)", "Other Co Other Co TBD 1.00 10 amp - 120v: (x)"]));
    expect(e).toHaveLength(3);
    expect(e[0]!.counts).toMatchObject({ a10: 2, a20: 1 });
    expect(e[1]!.booth).toBe("");
  });
});

describe("floor map: finding booths", () => {
  it("draws the booth around its number", () => {
    const p = plan();
    expect(cellAround(p, 110, 120)).toMatchObject({ x: 100, y: 110, w: 20, h: 20 });
    expect(locate(p, mergeTexts(p.texts), "103")).toMatchObject({ x: 100, y: 130 });
  });
  it("joins a letter and its number, and finds thin tables beside them", () => {
    const p = plan();
    expect(locate(p, mergeTexts(p.texts), "T5")).toMatchObject({ w: 9, h: 3 });
  });
  it("colors what it can and asks about the rest", () => {
    const p = plan();
    const e = buildEntries(wo(["Acme Acme 101 2.00 10 amp - 120v: (x)", "Zed Zed 999 1.00 20amp - 120v: Exhibit (x)", "Nobody Nobody TBD 1.00 10 amp - 120v: (x)", "Big Co Big Co 102 1.00 100amp - 208v Three Phase"]));
    const r = resolve(p, e);
    expect(r.placed.map((x) => x.entry.booth)).toEqual(["101"]);
    expect(r.questions.map((q) => q.kind).sort()).toEqual(["no-booth", "not-found", "other-lines"]);
  });
  it("uses an answer you gave before", () => {
    const p = plan();
    const e = buildEntries(wo(["Zed Zed 999 1.00 20amp - 120v: Exhibit (x)"]));
    const r = resolve(p, e, { [e[0]!.key]: { cells: [{ x: 100, y: 130, w: 20, h: 20 }] } });
    expect(r.placed).toHaveLength(1);
    expect(r.questions).toHaveLength(0);
    expect(resolve(p, e, { [e[0]!.key]: { skip: true } }).placed).toHaveLength(0);
  });
});

describe("floor map: what gets drawn", () => {
  it("follows the rules", () => {
    const p = plan();
    const e = buildEntries(wo(["A A 101 3.00 10 amp - 120v: (x)", "A A 101 1.00 20amp - 120v: Exhibit (x)", "A A 101 1.00 30 amp - 208v", "A A 101 2.00 Cobb Galleria Centre Package B: 4' Track", "A A 101 1.00 Power for (4) Showcases"]));
    const d = drawFor(resolve(p, e).placed[0]!);
    expect(d.fill).toBe("yo");
    expect(d.squares).toEqual(["red"]);
    expect(d.tag).toEqual(["x3", "SCase x4", "B x2"]);
  });
  it("remembers answers per plan file", () => expect(planKey("ASM.pdf", plan())).toBe("asm|400x300|5"));
});

describe("wide ShowPilot work order export",()=>{
 it("extracts event, booth and CGC venue without silently applying note hints",()=>{
  const data=parseShowPilotItemLines([
   "Bose Bose 405 1.00 10 amp - 120v: (25' Extension Cord & 6-Outlet Power Strip) 11/16/26 307405 Open (O) 39702 Paradies Lagardere 11/17/26 Utility (POWER) POWER CGC (10)",
   "Trans-World Eve 2.00 10 amp - 120v: extension 10/28/26 306666 Completed (C) 41160 Critical Minerals 10/28/26 Utility (POWER) Booth 928 CGC (10)",
   "Example Co 1.00 20amp - 120v 11/17/26 307628 Completed (C) 41844 Different Venue 11/18/26 Utility (POWER) CEPAC (20)"
  ]);
  expect(data).toHaveLength(3);
  expect(data[0]).toMatchObject({eventId:"39702",venue:"CGC"});
  expect(data[0]!.line.pre).toContain("405");
  expect(data[1]!.noteBooth).toBe("928");
  expect(data[1]!.line.pre).not.toContain("928");
  expect(data[2]!.venue).toBe("CEPAC");
 });
});


describe("floor map: full booth footprint with openings", () => {
  const rect = (x:number,y:number,w:number,h:number) => [
    {x1:x,y1:y,x2:x+w,y2:y}, {x1:x+w,y1:y,x2:x+w,y2:y+h},
    {x1:x+w,y1:y+h,x2:x,y2:y+h}, {x1:x,y1:y+h,x2:x,y2:y},
  ];
  it("fills the outer square rather than an inner bottom strip", () => {
    const outer={x:100,y:100,w:60,h:60}, strip={x:100,y:145,w:60,h:15};
    const p:Prims={width:500,height:400,texts:[t("243",151,150)],boxes:[strip,outer],
      segs:[...rect(100,100,60,60),{x1:100,y1:145,x2:160,y2:145}]};
    expect(cellAround(p,155,153)).toEqual(outer);
    expect(locate(p,mergeTexts(p.texts),"243")).toEqual(outer);
  });
  it("reconstructs the square when a short top-edge gap prevents a closed box", () => {
    const strip={x:100,y:145,w:60,h:15};
    const p:Prims={width:500,height:400,texts:[t("343",151,150)],boxes:[strip],
      segs:[
        {x1:100,y1:100,x2:126,y2:100},{x1:132,y1:100,x2:160,y2:100},
        {x1:100,y1:160,x2:160,y2:160},
        {x1:100,y1:100,x2:100,y2:160},{x1:160,y1:100,x2:160,y2:160},
        {x1:100,y1:145,x2:160,y2:145},
      ]};
    expect(cellAround(p,155,153)).toEqual({x:100,y:100,w:60,h:60});
  });
  it("accepts a small gap in a vertical wall, but does not absorb a neighbor", () => {
    const strip={x:100,y:145,w:60,h:15};
    const p:Prims={width:500,height:400,texts:[],boxes:[strip,{x:160,y:100,w:60,h:60}],
      segs:[
        {x1:100,y1:100,x2:160,y2:100},{x1:100,y1:160,x2:160,y2:160},
        {x1:100,y1:100,x2:100,y2:128},{x1:100,y1:134,x2:100,y2:160},
        {x1:160,y1:100,x2:160,y2:160},{x1:100,y1:145,x2:160,y2:145},
        ...rect(160,100,60,60),
      ]};
    expect(cellAround(p,155,153)).toEqual({x:100,y:100,w:60,h:60});
    expect(cellAround(p,185,130)).toEqual({x:160,y:100,w:60,h:60});
  });
  it("keeps genuinely narrow shapes when a full square is not supported", () => {
    const strip={x:100,y:145,w:60,h:15};
    const p:Prims={width:500,height:400,texts:[],boxes:[strip],segs:rect(100,145,60,15)};
    expect(cellAround(p,155,153)).toEqual(strip);
  });
});

describe("CAD floor plan: open doorway booth geometry", () => {
  it("recognizes actual booth 111 outer edges despite doorway in its bottom side", () => {
    const pts: [number,number][]=[
      [786.01245,508.09680],[791.95679,508.09680],
      [791.95679,478.37521],[762.23517,478.37521],
      [762.23517,508.09680],[768.17950,508.09680]
    ];
    const b=openOutlineBox(pts);
    expect(b).not.toBeNull();
    expect(b!.x).toBeCloseTo(762.23517,3);
    expect(b!.y).toBeCloseTo(478.37521,3);
    expect(b!.w).toBeCloseTo(29.72162,3);
    expect(b!.h).toBeCloseTo(29.72159,3);
    const p:Prims={width:1224,height:792,texts:[t("111",782,490)],
      boxes:[b!,{x:762.23517,y:500,w:29.72162,h:8.0968}],segs:[]};
    expect(cellAround(p,786,501)).toEqual(b);
  });
  it("recognizes the same booth when the opening is on the opposite edge", () => {
    const pts: [number,number][]=[
      [768.17950,418.93201],[762.23517,418.93201],
      [762.23517,389.20267],[791.95679,389.20267],
      [791.95679,418.93201],[786.01245,418.93201]
    ];
    expect(openOutlineBox(pts)).toMatchObject({
      x:762.23517,y:389.20267
    });
  });
  it("rejects two or fewer intact walls and arbitrary interior lines", () => {
    const openU:[number,number][]=[[100,100],[100,130],[130,130],[130,100]];
    expect(openOutlineBox(openU)).toBeNull();
    const diagonal:[number,number][]=[[100,100],[130,100],[130,130],[100,130],[120,110]];
    expect(openOutlineBox(diagonal)).toBeNull();
  });
});
