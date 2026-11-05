// Browser-only file readers for work tools. Libraries load on demand.
import { planWeeks, airwallHolds, needText, shiftText, workedHours, readAvail, SHOW_STAFF, ON_CALL, type Avail, type DayPlan } from "./staffing";
import { BALLROOM_ROWS, ENGINEER_ROSTER, HALL_ROWS, weekLayouts, mondayOf as mondayIso, expandSpace, type WeekLayout, type TaskNote, DEFAULT_SCHEDULE_NAME, parseShift, reportDateToIso, type EventEntry, type EventRow, type Shift } from "./work-tools";

import {readShowPilotEventSchedulePages, eventScheduleDate, type SchedulePdfPage} from "./showpilot-event-schedule";

type Item = { str: string; x: number; y: number };

export async function readEventPdf(file: File): Promise<EventRow[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  // The user's newer export is a grouped Event Schedule, NOT "For Scheduling".
  // Identify it from its title or dedicated Status - Event / event-hours headers.
  const firstPage=await pdf.getPage(1);
  const firstContent=await firstPage.getTextContent();
  const firstText=(firstContent.items as {str?:string}[]).map(i=>i.str??"").join(" ");
  if(/ShowPilot\s*-\s*Event Schedule/i.test(firstText) ||
     (/Status\s*-\s*Event/i.test(firstText)&&/Event ID/i.test(firstText)&&/Start Time\s*-\s*Event/i.test(firstText))){
    const pages:SchedulePdfPage[]=[];
    for(let p=1;p<=pdf.numPages;p++){
      const page=p===1?firstPage:await pdf.getPage(p);
      const content=p===1?firstContent:await page.getTextContent();
      const lines=new Map<number,Item[]>();
      for(const item of content.items as {str?:string;transform?:number[]}[]){
        if(!item.str?.trim()||!item.transform)continue;
        const x=item.transform[4]??0,y=Math.round(item.transform[5]??0);
        const found=[...lines.keys()].find(k=>Math.abs(k-y)<=2)??y;
        lines.set(found,[...(lines.get(found)??[]),{str:item.str,x,y}]);
      }
      pages.push([...lines.entries()].sort((a,b)=>b[0]-a[0]).map(([,l])=>l.sort((a,b)=>a.x-b.x)));
    }
    return readShowPilotEventSchedulePages(pages);
  }
  const rows: EventRow[] = [];
  type Cols = { usage: number; start: number; end: number; desc: number; reader: number; space: number; notes: number };
  let cols: Cols | null = null;
  // "For Scheduling" layout: Start | End | Event | Description | Space | Usage | Usage Category | Level, under weekday date headings.
  let sched: { name: string; x: number }[] | null = null;
  let day = "";
  let last: EventRow | null = null;
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const it of content.items as { str?: string; transform?: number[] }[])
      if (it.str?.trim() && it.transform) items.push({ str: it.str, x: it.transform[4] ?? 0, y: Math.round(it.transform[5] ?? 0) });
    const lines = new Map<number, Item[]>();
    for (const it of items) {
      const key = [...lines.keys()].find((k) => Math.abs(k - it.y) <= 2) ?? it.y;
      lines.set(key, [...(lines.get(key) ?? []), it]);
    }
    const sorted = [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, l]) => l.sort((a, b) => a.x - b.x));
    for (const line of sorted) {
      const text = line.map((i) => i.str).join(" ");
      if (/^\s*Start Time\b/.test(text) && /\bEvent\b/.test(text) && (/\bLevel\b/.test(text) || (/\bDescription\b/.test(text) && /\bSpace\b/.test(text)))) {
        // The newer report adds an "Event ID" column at the far right: keep it apart from the Event column.
        const heads: { name: string; x: number }[] = [];
        for (const i of line) {
          const name = i.str.trim();
          if (/^ID$/i.test(name)) continue;
          heads.push({ name: name === "Event" && heads.some((h) => h.name === "Event") ? "Event ID" : name, x: i.x });
        }
        sched = heads;
        continue;
      }
      if (sched) {
        const dm = text.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
        if (dm) {
          const mo = months.indexOf((dm[1] ?? "").toLowerCase()) + 1;
          day = `${dm[3]}-${String(mo).padStart(2, "0")}-${(dm[2] ?? "").padStart(2, "0")}`;
          last = null;
          continue;
        }
        if (!day || /^Page \d+ of/.test(text)) continue;
        const cell: Record<string, string> = {};
        for (const it of line) {
          const col = [...sched].reverse().find((h) => it.x >= h.x - 6) ?? sched[0]!;
          cell[col.name] = `${cell[col.name] ?? ""} ${it.str.trim()}`.trim();
        }
        const start = cell["Start Time"] ?? "";
        if (!/\d{1,2}:\d{2}\s*[AP]M/i.test(start)) {
          if (last && cell["Description"]) last.description += ` ${cell["Description"]}`;
          if (last && cell["Space"] && !/^\d/.test(cell["Space"])) last.space += ` ${cell["Space"]}`;
          continue;
        }
        last = {
          level: Number(cell["Level"] ?? 2) || 2,
          usage: cell["Usage"] ?? "",
          start,
          end: cell["End Time"] ?? "",
          description: cell["Description"] ?? "",
          space: cell["Space"] ?? "",
          event: cell["Event"] ?? "",
          ...((cell["Event ID"] ?? "").match(/\d{3,}/) ? { eventId: (cell["Event ID"] ?? "").match(/\d{3,}/)![0] } : {}),
          date: day,
        };
        rows.push(last);
        continue;
      }
      if (/\bUsage\b/.test(text) && /\bSpace\b/.test(text)) {
        const find = (re: RegExp) => line.find((i) => re.test(i.str))?.x ?? 0;
        cols = { usage: find(/^Usage/), start: find(/^Start Time|^Start$/), end: find(/^End Time|^End$/), desc: find(/^Description/), reader: find(/^Reader/), space: find(/^Space/), notes: find(/^Notes/) };
        continue;
      }
      if (!cols) continue;
      const date = text.match(/\b\d{2}\/\d{2}\/\d{2}\b/)?.[0];
      const level = Number(line[0]?.str.trim());
      if (!date || !Number.isFinite(level) || (line[0]?.x ?? 0) > cols.usage) continue;
      const c = cols;
      const between = (lo: number, hi: number) => line.filter((i) => i.x >= lo - 2 && i.x < hi - 2).map((i) => i.str.trim()).join(" ").trim();
      const times = text.match(/\d{2}:\d{2}\s*[AP]M/gi) ?? [];
      rows.push({
        level,
        usage: between(c.usage, c.start),
        start: times[0] ?? "",
        end: times[1] ?? "",
        description: between(c.reader, c.space) || between(c.desc, c.reader),
        space: between(c.space, c.notes).replace(/\s+/g, " "),
        date: reportDateToIso(date),
      });
    }
  }
  return rows;
}

const clock = (v: unknown): string => {
  let min: number | null = null;
  if (v instanceof Date) min = v.getUTCHours() * 60 + v.getUTCMinutes();
  else if (typeof v === "number") min = Math.round((v % 1) * 1440);
  else if (typeof v === "string" && /\d{1,2}:\d{2}\s*[AP]M/i.test(v)) return v.trim();
  if (min === null) return "";
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

/** Recognizes either the legacy For Scheduling workbook or the newer grouped
 * "ShowPilot - Event Schedule" export, without mistaking staffing sheets for events.
 */
export async function readEventSheet(file: File): Promise<EventRow[] | null> {
  const module = await import("exceljs");
  const ExcelJS = module.default ?? module;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return null;
  const text = (v: unknown):string => {
    if(v&&typeof v==="object"){
      if("result" in v)return text((v as {result:unknown}).result);
      if("richText" in v&&Array.isArray((v as {richText:unknown[]}).richText))
        return (v as {richText:{text:string}[]}).richText.map(x=>x.text).join("").trim();
      if("text" in v)return String((v as {text:unknown}).text??"").trim();
    }
    return v===null||v===undefined?"":String(v).trim();
  };
  const firstRows=Array.from({length:Math.min(10,ws.rowCount)},(_,r)=>
    Array.from({length:Math.min(20,ws.columnCount||20)},(_,c)=>text(ws.getRow(r+1).getCell(c+1).value)));
  const legacy=firstRows.slice(0,3).some(row=>row.some(v=>/^for scheduling$/i.test(v)));
  const newer=firstRows.slice(0,5).some(row=>row.some(v=>/^showpilot\s*-\s*event schedule$/i.test(v)));
  const headerRow=firstRows.findIndex(row=>["Start Time","End Time","Description","Space"]
    .every(heading=>row.some(v=>v.toLowerCase()===heading.toLowerCase())));
  if(headerRow<0)return null;
  const header=firstRows[headerRow]!;
  const col=(name:string)=>header.findIndex(v=>v.toLowerCase()===name.toLowerCase())+1;
  const cStart=col("Start Time"),cEnd=col("End Time"),cDesc=col("Description"),cSpace=col("Space"),
    cId=col("Event ID"),cStatus=col("Status - Event"),cEvent=col("Event");
  const grouped=newer||(!legacy&&cId>0&&cStatus>0&&col("Start Time - Event")>0);
  if(!legacy&&!grouped)return null;
  if(!cStart||!cEnd||!cDesc||!cSpace)return null;
  const rows:EventRow[]=[];
  let day="",eventName="";
  ws.eachRow((row,n)=>{
    if(n<=headerRow+1)return;
    const left=[1,2,3].map(c=>text(row.getCell(c).value)).filter(Boolean);
    const parsed=left.map(eventScheduleDate).find(Boolean)??"";
    if(parsed){day=parsed;eventName="";return;}
    const start=clock(row.getCell(cStart).value);
    if(!start) {
      // A group title is generally in A or B; its attendance summary is at
      // the far right. Wrapped text inside Description is not a group title.
      const first=text(row.getCell(1).value)||text(row.getCell(2).value);
      if(first&&first!==day&&!eventScheduleDate(first)&&!text(row.getCell(cDesc).value)&&!text(row.getCell(cSpace).value))
        eventName=first;
      return;
    }
    if(!day)return;
    const id=cId?text(row.getCell(cId).value).match(/\b\d{4,7}\b/)?.[0]:undefined;
    const status=cStatus?text(row.getCell(cStatus).value):"";
    rows.push({level:2,usage:"",start,end:clock(row.getCell(cEnd).value),
      description:text(row.getCell(cDesc).value),space:text(row.getCell(cSpace).value),
      event:(cEvent?text(row.getCell(cEvent).value):"")||eventName,
      ...(id?{eventId:id}:{}),...(status?{status}:{}),date:day});
  });
  return rows;
}

/** A plain-text description of an uploaded workbook, for pasting into a bug report when the Events tab finds nothing. */
export async function describeSheet(file: File): Promise<string> {
  const out = [`file: ${file.name} (${file.size} bytes, ${file.type || "no type"})`];
  try {
    const module = await import("exceljs");
    const ExcelJS = module.default ?? module;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    out.push(`sheets: ${wb.worksheets.map((w) => `${w.name} (${w.rowCount} rows)`).join(", ") || "none"}`);
    const ws = wb.worksheets[0];
    if (ws) {
      const show = (v: unknown) => { const t = v && typeof v === "object" ? JSON.stringify(v) : String(v ?? ""); return t.length > 40 ? `${t.slice(0, 40)}…` : t; };
      out.push(`A1: ${show(ws.getRow(1).getCell(1).value)}`);
      out.push(`row 2: ${Array.from({ length: 12 }, (_, i) => show(ws.getRow(2).getCell(i + 1).value)).join(" | ")}`);
      out.push(`row 3: ${Array.from({ length: 12 }, (_, i) => show(ws.getRow(3).getCell(i + 1).value)).join(" | ")}`);
      out.push(`row 4: ${Array.from({ length: 12 }, (_, i) => show(ws.getRow(4).getCell(i + 1).value)).join(" | ")}`);
    }
  } catch (e) { out.push(`could not open as a workbook: ${(e as Error).message}`); }
  return out.join("\n");
}

const serialToIso = (n: number) => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);

/** Reads every "Week #" sheet and returns the shifts in the named person's row. */
export async function readScheduleWorkbook(file: File, name = DEFAULT_SCHEDULE_NAME): Promise<{ shifts: Shift[]; people: string[] }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const shifts: Shift[] = [];
  const people = new Set<string>();
  const target = name.trim().toLowerCase();
  for (const sheetName of wb.SheetNames) {
    if (!/week/i.test(sheetName)) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName]!, { header: 1, raw: true, defval: "" });
    const dayRow = grid.findIndex((r) => String(r[1]).trim().toUpperCase() === "MON");
    if (dayRow < 0) continue;
    const dates = grid[dayRow + 1] ?? [];
    for (let r = dayRow + 2; r < grid.length; r++) {
      const cells = grid[r] ?? [];
      const label = String(cells[0] ?? "").trim();
      const next = String(grid[r + 1]?.[0] ?? "").trim();
      if (label && /^\d{3}$/.test(next)) people.add(label);
      if (label.toLowerCase() !== target) continue;
      for (let c = 1; c <= 7; c++) {
        const raw = String(cells[c] ?? "").trim();
        const time = parseShift(raw);
        const d = dates[c];
        if (!time || typeof d !== "number") continue;
        shifts.push({ date: serialToIso(d), ...time, raw });
      }
    }
  }
  const seen = new Set<string>();
  return { shifts: shifts.filter((s) => !seen.has(s.date) && seen.add(s.date)).sort((a, b) => a.date.localeCompare(b.date)), people: [...people] };
}

type XWorkbook = import("exceljs").Workbook;
type XSheet = import("exceljs").Worksheet;
/** The schedule legend: Move In green, Move In + Show light cyan, Show + Move Out orange, Move Out red, all three blue, non-show event purple. A show day alone is bold with no fill. */
export const LEGEND_FILL = { moveIn: "FF92D050", moveInShow: "FF75FFFF", showMoveOut: "FFFFC000", moveOut: "FFFF0000", allThree: "FF00B0F0", nonShow: "FF7030A0" } as const;
/** Which legend colour (if any) a cell with these activity codes gets. */
export function legendFill(codes: string[]): string | undefined {
  const show = codes.includes("S"), moveIn = codes.includes("MI") || codes.includes("Exmi"), moveOut = codes.includes("MO") || codes.includes("MO?");
  if (show && moveIn && moveOut) return LEGEND_FILL.allThree;
  if (show && moveOut) return LEGEND_FILL.showMoveOut;
  if (show && moveIn) return LEGEND_FILL.moveInShow;
  if (show) return undefined;
  if (moveIn) return LEGEND_FILL.moveIn;
  if (moveOut) return LEGEND_FILL.moveOut;
  return codes.length ? LEGEND_FILL.nonShow : undefined;
}
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

function paint(cell: import("exceljs").Cell, codes: string[]) {
  const color = legendFill(codes);
  cell.fill = color ? { type: "pattern", pattern: "solid", fgColor: { argb: color } } : { type: "pattern", pattern: "none" };
  // Preserve the source workbook's font size, weight and layout when using an
  // approved template; a painted event must not suddenly become 20-point text.
  cell.font = { ...cell.font, name: cell.font?.name || "Calibri", size: cell.font?.size || 9,
    bold: codes.includes("S"), ...(color === LEGEND_FILL.nonShow ? { color: { argb: "FFFFFFFF" } } : {}) };
}

const THICK = { style: "thick" as const, color: { argb: "FF000000" } };
/** A thick black outline around every cell in the block, merged cells included. */
function outline(ws: XSheet, fromRow: number, toRow: number, fromCol: number, toCol: number) {
  for (let r = fromRow; r <= toRow; r++) for (let c = fromCol; c <= toCol; c++) ws.getCell(r, c).border = { top: THICK, left: THICK, bottom: THICK, right: THICK };
}

/** Merge only adjacent space rows with identical shows, activities and times. */
function mergeEventSpaces(ws: XSheet, w: WeekLayout, byLabel: Map<string, number>, cols: Map<string, number>) {
  for (const labels of [HALL_ROWS, BALLROOM_ROWS]) {
    const positions = labels.flatMap((label) => {
      const row = byLabel.get(label.toLowerCase());
      return row ? [{ label, row }] : [];
    }).sort((a, b) => a.row - b.row);
    w.dates.forEach((date, i) => {
      const col = cols.get(date);
      if (!col) return;
      let start = 0;
      while (start < positions.length) {
        const first = positions[start];
        if (!first) break;
        const data = w.rows[first.label]?.[i];
        let end = start;
        if (data?.signature) {
          while (end + 1 < positions.length) {
            const next = positions[end + 1], prev = positions[end];
            if (!next || !prev || next.row !== prev.row + 1 || w.rows[next.label]?.[i]?.signature !== data.signature) break;
            end++;
          }
        }
        const last = positions[end];
        if (last && end > start) {
          ws.mergeCells(first.row, col, last.row, col);
          ws.getCell(first.row, col).alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
        }
        start = end + 1;
      }
    });
  }
}

/** Release old vertical space merges before updating, preserving untouched entries. */
function unmergeEventSpaces(ws: XSheet, w: WeekLayout, byLabel: Map<string, number>, cols: Map<string, number>) {
  const roomRows = new Set([...HALL_ROWS, ...BALLROOM_ROWS].map((label) => byLabel.get(label.toLowerCase())).filter((r): r is number => r !== undefined));
  for (const range of [...(ws.model.merges ?? [])]) {
    const [from, to] = range.split(":");
    if (!from || !to) continue;
    const first = ws.getCell(from), last = ws.getCell(to);
    const top = Number(first.row), bottom = Number(last.row), col = Number(first.col);
    if (col !== Number(last.col) || top === bottom) continue;
    const rows = Array.from({ length: bottom - top + 1 }, (_, i) => top + i);
    if (!rows.every((r) => roomRows.has(r))) continue;
    const touched = w.dates.some((date, i) => cols.get(date) === col && Object.entries(w.rows).some(([label, cells]) => cells[i]?.text && rows.includes(byLabel.get(label.toLowerCase()) ?? -1)));
    if (!touched) continue;
    const value = first.value, style = structuredClone(first.style);
    ws.unMergeCells(range);
    for (const row of rows) { const cell = ws.getCell(row, col); cell.value = value; cell.style = structuredClone(style); }
  }
}

function writeWeekSheet(ws: XSheet, w: WeekLayout, tasks: TaskNote[] = [], plans: Map<string, DayPlan> = new Map()) {
  const font = { name: "Calibri", size: 9, bold: true };
  const wrap = { wrapText: true, vertical: "middle" as const, horizontal: "center" as const };
  // Match the compact CGC engineering roster instead of the old poster-width
  // export. Keep seven date columns B–H and the totals/legend column I.
  ws.columns = [{width:25},...DAYS.map(()=>({width:21})),{width:16}];
  ws.views = [{state:"frozen",xSplit:1,ySplit:5}];
  ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, paperSize:9};
  const put = (r: number, vals: (string | number | Date | { formula: string } | null)[], bold = true) => {
    const row = ws.getRow(r);
    vals.forEach((v, c) => { if (v === null) return; const cell = row.getCell(c + 1); cell.value = v as never; cell.font = { ...font, bold: c === 0 || bold }; cell.alignment = wrap; });
    return row;
  };
  ws.mergeCells("A1:I1"); ws.mergeCells("A2:I2");
  put(1, ["COBB CONVENTION CENTER-ATLANTA"]);
  put(2, ["Engineering Schedule (Subject to Change)"]);
  put(3, [null, null, "FROM:", { formula: "B5" }, "TO:", { formula: "H5" }]);
  put(4, ["DAY", ...DAYS, "TOTAL"]);
  put(5, [null, ...w.dates.map(toDate)]);
  for (let c = 2; c <= 8; c++) ws.getRow(5).getCell(c).numFmt = "m/d/yy";
  ws.getRow(3).getCell(4).numFmt = "m/d/yy"; ws.getRow(3).getCell(6).numFmt = "m/d/yy";
  put(6, ["CGC", ...w.cgc], false);
  // Row 7 is intentionally blank: the reference schedule has a separate
  // performing-arts row here, but ShowPilot must never export CEPAC events.
  put(8, ["CGC BARS", null, null, null, null, null, null, null, "CGC BARS"]);
  let r = 9;
  for (const p of ENGINEER_ROSTER) {
    put(r, [p.name, ...w.dates.map((d) => engineerCell(plans, p.name, d)?.top || null)]);
    put(r + 1, [/^\d+$/.test(p.badge) ? Number(p.badge) : p.badge, ...w.dates.map((d) => engineerCell(plans, p.name, d)?.mid ?? null), { formula: `SUM(B${r + 1}:H${r + 1})` }]);
    put(r + 2, [p.title]);
    r += 3;
  }
  // Reference template places the CGC service section on row 51.
  while (r < 50) r++;
  put(r++, ["Temps"]);
  put(r++, ["CGC Escalator and SD", ...DAYS]);
  put(r++, ["Escalator", ...w.escalator], false);
  put(r, ["Service Desk", ...w.serviceDesk], false);
  w.serviceDesk.forEach((t, i) => { if (t) paint(ws.getRow(r).getCell(i + 2), ["MI"]); });
  r++;
  const byLabel = new Map<string, number>();
  const section = (title: string, labels: string[]) => {
    put(r++, [title, ...DAYS]);
    for (const label of labels) {
      put(r, [label]);
      byLabel.set(label.toLowerCase(), r);
      (w.rows[label] ?? []).forEach((c, i) => { const cell = ws.getRow(r).getCell(i + 2); cell.value = c.text || null; cell.alignment = wrap; paint(cell, c.codes); });
      r++;
    }
    const notes = tasks.filter((t) => t.section === title);
    put(r, ["Tasks", ...w.dates.map((d) => notes.filter((t) => t.date === d).map((t) => t.text).join("\n") || null)], false);
    r++;
  };
  section("HALLS", HALL_ROWS);
  section("BALLROOM", BALLROOM_ROWS);
  // Keep the owner's existing LOCATION heading at row 69. No invented room area.
  put(r++, ["LOCATION", ...DAYS]);
  // Compact reference-sheet styling: three short rows per employee, dark
  // section bands, highlighted dates and distinct hall/ballroom band colors.
  const edge = {style:"thin" as const,color:{argb:"FF1C1C1C"}};
  const baseBorder={top:edge,left:edge,right:edge,bottom:edge};
  for(let i=1;i<r;i++){
    const row=ws.getRow(i);
    row.height=i===1?21:i===2?17:i===3?16:i===5?19:15;
    for(let c=1;c<=9;c++){
      const cell=row.getCell(c);
      cell.border=baseBorder;
      cell.font={name:"Calibri",size:9,bold:c===1};
      cell.alignment={horizontal:"center",vertical:"middle",wrapText:true};
    }
  }
  // Branding remains the venue's official new name.
  ws.getCell("A1").font={name:"Calibri",size:12,bold:true};
  ws.getCell("A2").font={name:"Calibri",size:10,bold:true};
  const band=(row:number,color:string,fg="FFFFFFFF")=>{
    for(let c=1;c<=9;c++){
      const cell=ws.getRow(row).getCell(c);
      cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:color}};
      cell.font={name:"Calibri",size:9,bold:true,color:{argb:fg}};
    }
    ws.getRow(row).height=18;
  };
  band(4,"FF131313");band(6,"FF131313");band(8,"FF131313");
  for(let c=2;c<=8;c++){
    const cell=ws.getRow(5).getCell(c);
    cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFFF99"}};
    cell.font={name:"Calibri",size:9,bold:true,color:{argb:"FF111111"}};
  }
  // Three-row roster: name, badge/worked hours, job title.
  for(let er=9;er<9+ENGINEER_ROSTER.length*3;er+=3){
    ws.getRow(er).height=17;
    ws.getRow(er+1).height=15;
    ws.getRow(er+2).height=14;
    ws.getRow(er+2).getCell(1).font={name:"Calibri",size:8,italic:true};
    ws.getRow(er+1).getCell(1).font={name:"Calibri",size:8,bold:true};
  }
  for(const [label,idx] of byLabel){
    const row=ws.getRow(idx);
    row.height=label.startsWith("ballroom")?54:44;
    row.getCell(1).font={name:"Calibri",size:9,bold:true};
    const activity=Object.entries(w.rows).find(([room])=>room.toLowerCase()===label)?.[1];
    for(let c=2;c<=8;c++){
      const cell=row.getCell(c);
      const codes=activity?.[c-2]?.codes??[];
      const fill=legendFill(codes);
      cell.font={...cell.font,name:"Calibri",size:9,bold:codes.includes("S"),
        ...(fill===LEGEND_FILL.nonShow?{color:{argb:"FFFFFFFF"}}:{})};
      cell.alignment={vertical:"middle",horizontal:"center",wrapText:true};
    }
  }
  // Section headers use the established CGC convention: green halls and
  // pale-salmon ballrooms; no CEPAC block is created.
  for(let i=9+ENGINEER_ROSTER.length*3;i<r;i++){
    const name=String(ws.getRow(i).getCell(1).value??"").trim().toUpperCase();
    if(name==="CGC ESCALATOR AND SD")band(i,"FF131313");
    else if(name==="HALLS")band(i,"FF92D050","FF111111");
    else if(name==="BALLROOM")band(i,"FFF5B79F","FF111111");
    else if(name==="OTHER SPACES")band(i,"FF131313");
    else if(name==="TASKS")ws.getRow(i).height=38;
  }
  mergeEventSpaces(ws, w, byLabel, new Map(w.dates.map((d, i) => [d, i + 2])));
  fitRows(ws);
  outline(ws, 4, r - 1, 1, 9);
}

/** Grows row heights so wrapped event text is never cut off (merged cells share their height across the rows they cover). Heights only grow. */
export function fitRows(ws: XSheet) {
  let start = 0;
  ws.eachRow((row, n) => { if (!start && String(row.getCell(1).value ?? "").trim().toLowerCase() === "halls") start = n; });
  if (!start) return;
  const px = (c: number) => (ws.getColumn(c).width ?? 13) * 7 + 5;
  const merges = new Map<string, { top: number; bottom: number }>();
  const covered = new Set<string>();
  for (const range of ws.model.merges ?? []) {
    const [a, b] = range.split(":");
    if (!a || !b) continue;
    const from = ws.getCell(a), to = ws.getCell(b);
    if (Number(from.col) !== Number(to.col) || Number(from.row) < start) continue;
    merges.set(`${from.row},${from.col}`, { top: Number(from.row), bottom: Number(to.row) });
    for (let r = Number(from.row) + 1; r <= Number(to.row); r++) covered.add(`${r},${from.col}`);
  }
  const last = ws.rowCount;
  const height = new Map<number, number>();
  for (let r = start; r <= last; r++) height.set(r, ws.getRow(r).height ?? 15);
  // Word-wrap estimate (generous: wide letters, bold wider) so text is never cut off.
  const lines = (text: string, size: number, width: number, bold: boolean) => {
    const ch = size * (bold ? 0.72 : 0.64);
    const avail = Math.max(40, width - 14);
    let total = 0;
    for (const par of text.split("\n")) {
      let cur = 0, n = 1;
      for (const word of par.split(" ")) {
        const w = word.length * ch;
        if (cur && cur + ch + w > avail) { n++; cur = w; } else cur += (cur ? ch : 0) + w;
        while (cur > avail) { n++; cur -= avail; }
      }
      total += n;
    }
    return total;
  };
  for (let r = start; r <= last; r++) {
    for (let c = 2; c <= 8; c++) {
      if (covered.has(`${r},${c}`)) continue;
      const v = ws.getCell(r, c).value;
      if (typeof v !== "string" || !v) continue;
      const size = ws.getCell(r, c).font?.size ?? 11;
      const need = lines(v, size, px(c), !!ws.getCell(r, c).font?.bold) * size * 1.4 + size * 0.7 + 8;
      const m = merges.get(`${r},${c}`);
      const rows = Array.from({ length: (m ? m.bottom : r) - r + 1 }, (_, i) => r + i);
      const have = rows.reduce((t, x) => t + (height.get(x) ?? 15), 0);
      if (need > have) for (const x of rows) height.set(x, (height.get(x) ?? 15) + (need - have) / rows.length);
    }
  }
  for (const [r, h] of height) if (h > (ws.getRow(r).height ?? 15)) ws.getRow(r).height = Math.round(h * 10) / 10;
}

function cellDate(v: unknown): string | null {
  const x = v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v;
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  if (typeof x === "number") return serialToIso(x);
  if (typeof x === "string") {
    const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(x.trim());
    if(iso&&!Number.isNaN(Date.parse(x+"T12:00:00Z")))return x.trim();
  }
  return null;
}

/** The approved CGC workbook sometimes stores its Week dates as formulas
 * referring to Extra, without Excel's cached results. The physical layout
 * still fixes the day-of-week row at 4 and the dates at row 5. */
function scheduleDayHeaderRow(ws:XSheet):number {
 let dayRow=0;
 ws.eachRow((row,n)=>{if(!dayRow&&String(row.getCell(2).value??"").trim().toUpperCase()==="MON")dayRow=n;});
 return dayRow|| (isExactCgcEngineeringTemplate(ws)?4:0);
}
function weekDates(monday:string):string[]{
 const d=new Date(monday+"T12:00:00Z");
 if(Number.isNaN(d.getTime()))throw new Error("Invalid selected week.");
 return Array.from({length:7},(_,i)=>{const next=new Date(d);next.setUTCDate(d.getUTCDate()+i);return next.toISOString().slice(0,10);});
}

/** A reusable master may contain event text from a DIFFERENT week. Clear only
 * the event grid in the exported copy before writing reviewed CGC events.
 * Engineer shifts, PTO, titles, borders, fills, formulas and user data in the
 * original saved XLSX remain untouched. */
function clearRetargetedEventGrid(ws:XSheet){
 const allowed=new Set([...HALL_ROWS,...BALLROOM_ROWS].map(s=>s.toLowerCase()));
 const roots=new Set<string>();
 ws.eachRow((row,n)=>{
  if(!allowed.has(String(row.getCell(1).value??"").trim().toLowerCase()))return;
  for(let c=2;c<=8;c++)roots.add(ws.getCell(n,c).master.address);
 });
 for(const address of roots)ws.getCell(address).value=null;
}

/** Writes event rows into an existing weekly sheet, keeping engineer shifts untouched. Returns false if the week is not on this sheet. */
/** An engineer's day, as in your sheets: shift on the name row, worked hours (or OFF) on the badge row below it. */
function engineerCell(plans: Map<string, DayPlan>, name: string, date: string): { top: string; mid: string | number } | null {
  const p = plans.get(date);
  if (!p) return null;
  const a = p.assignments.find((x) => x.name === name) ?? (p.desk?.name === name ? p.desk : undefined);
  if (a) return { top: shiftText(a), mid: workedHours(a) };
  const managed = name === "Jacquline Dixon" || [...SHOW_STAFF, ON_CALL].some((s) => s.name === name);
  return managed ? { top: "", mid: "OFF" } : null;
}

function mergeWeekSheet(ws: XSheet, w: WeekLayout, tasks: TaskNote[] = [], plans: Map<string, DayPlan> = new Map(), preserveTemplateLayout = false): boolean {
  const dayRow=scheduleDayHeaderRow(ws);
  if (!dayRow) return false;
  const cols = new Map<string, number>();
  for (let c = 2; c <= 8; c++) { const d = cellDate(ws.getRow(dayRow + 1).getCell(c).value); if (d) cols.set(d, c); }
  if (!w.dates.some((d) => cols.has(d))) return false;
  const byLabel = new Map<string, number>();
  ws.eachRow((row, n) => { const l = String(row.getCell(1).value ?? "").trim().toLowerCase(); if (l && !byLabel.has(l)) byLabel.set(l, n); });
  if(preserveTemplateLayout){
    // Read-only merge geometry: two distinct shows may not share one master cell.
    // The caller must update the source workbook or resolve the room conflict.
    const owned=new Map<string,string>();
    for(const [label,dayCells] of Object.entries(w.rows)){
      const roomRow=byLabel.get(label.toLowerCase());
      if(!roomRow)continue;
      for(let i=0;i<w.dates.length;i++){
        const day=w.dates[i]!;
        const col=cols.get(day);
        const event=dayCells[i];
        if(!col||!event?.text)continue;
        const address=ws.getCell(roomRow,col).master.address;
        const previous=owned.get(address);
        if(previous&&previous!==event.signature)
          throw new Error("Source workbook merged-room conflict on "+day+" at "+address+
            ". Different shows occupy the same merged cell; edit the original Excel room merge before exporting.");
        owned.set(address,event.signature);
      }
    }
    // An event in only Hall A cannot be written into an existing merged
    // Hall A+B cell: Excel would silently show it in Hall B too. Require
    // all physical rooms covered by the preserved merge to agree.
    const roomByRow=new Map<number,string>();
    for(const label of [...HALL_ROWS,...BALLROOM_ROWS]){
      const row=byLabel.get(label.toLowerCase());
      if(row)roomByRow.set(row,label);
    }
    for(const range of ws.model.merges??[]){
      const [from,to]=range.split(":");
      if(!from||!to)continue;
      const top=ws.getCell(from),bottom=ws.getCell(to);
      const column=Number(top.col);
      if(column!==Number(bottom.col)||Number(top.row)===Number(bottom.row))continue;
      const day=[...cols].find(([,c])=>c===column)?.[0];
      if(!day)continue;
      const i=w.dates.indexOf(day);
      if(i<0)continue;
      const rooms=Array.from({length:Number(bottom.row)-Number(top.row)+1},(_,n)=>roomByRow.get(Number(top.row)+n))
        .filter((label):label is string=>!!label);
      if(rooms.length<2)continue;
      const signatures=rooms.map(label=>w.rows[label]?.[i]?.signature??"");
      if(!signatures.some(Boolean))continue;
      if(signatures.some(sig=>!sig||sig!==signatures[0]))
        throw new Error("Source workbook merged-room conflict on "+day+" at "+range+
          ": the selected show does not occupy every room already joined in the template. Review the original merged-room layout; ShowPilot will not modify it.");
    }
  }else unmergeEventSpaces(ws, w, byLabel, cols);
  const write = (label: string, i: number, text: string, codes?: string[]) => {
    const date = w.dates[i];
    const r = byLabel.get(label.toLowerCase()); const c = date ? cols.get(date) : undefined;
    if (!r || !c || !text) return;
    const cell = ws.getRow(r).getCell(c);
    cell.value = text;
    if(!preserveTemplateLayout)cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    if (codes) paint(cell, codes);
  };
  w.dates.forEach((_, i) => {
    // In exact-template mode, the existing CGC, escalator and desk rows
    // remain precisely as supplied in the uploaded workbook.
    if(!preserveTemplateLayout){
      if(w.cgc[i]!=="DARK"){write("CGC",i,w.cgc[i]!);write("CCC",i,w.cgc[i]!);}
      write("Escalator",i,w.escalator[i]!);
      write("Service Desk",i,w.serviceDesk[i]!,["MI"]);
    }
    for(const [label,cells] of Object.entries(w.rows))write(label,i,cells[i]!.text,cells[i]!.codes);
  });
  // Task suggestions go in the empty cells of the Tasks row under HALLS and BALLROOM; anything already typed there is kept.
  for (const [section, lastRow] of [["HALLS", "hall d"], ["BALLROOM", "ballroom f"]] as const) {
    const from = byLabel.get(lastRow);
    if (!from) continue;
    let tr = 0;
    for (let n = from + 1; n <= from + 3 && !tr; n++) if (String(ws.getRow(n).getCell(1).value ?? "").trim().toLowerCase() === "tasks") tr = n;
    if (!tr) continue;
    for (const [date, c] of cols) {
      const text = tasks.filter((t) => t.section === section && t.date === date).map((t) => t.text).join("\n");
      const cell = ws.getRow(tr).getCell(c);
      if (text && !String(cell.value ?? "").trim()) { cell.value = text; cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" }; }
    }
  }
  // Engineer shifts in the uploaded workbook are authoritative.
  // Even blank shift cells stay blank when exact-template mode is enabled.
  if(!preserveTemplateLayout)for (const p of ENGINEER_ROSTER) {
    const nr = byLabel.get(p.name.toLowerCase());
    if (!nr) continue;
    for (const [date, c] of cols) {
      const top = ws.getRow(nr).getCell(c), mid = ws.getRow(nr + 1).getCell(c);
      const e = engineerCell(plans, p.name, date);
      if (!e || String(top.value ?? "").trim() || String(mid.value ?? "").toString().trim()) continue;
      if (e.top) { top.value = e.top; top.alignment = { vertical: "middle", horizontal: "center" }; }
      mid.value = e.mid; mid.alignment = { vertical: "middle", horizontal: "center" };
    }
  }
  // The uploaded workbook is the formatting authority. Do NOT clear empty
  // cells, change original border styles, or resize its rows when merging.
  // Only the approved event cells and any necessary room merges may change.
  if(!preserveTemplateLayout)mergeEventSpaces(ws, w, byLabel, cols);
  // Keep original merged cells, borders, fills and row heights when in exact-template mode.
  return true;
}

/** Fail closed when an approved template does not contain every event date.
 * The legacy in-place merger cannot yet re-date historical template sheets.
 */
export async function validateApprovedTemplate(file: File, entries: EventEntry[], options:{retargetWeek?:boolean}={}): Promise<void> {
 const module=await import("exceljs");
 const ExcelJS=module.default??module;
 const wb:XWorkbook=new ExcelJS.Workbook();
 await wb.xlsx.load(await file.arrayBuffer());
 const covered=new Set<string>();
 for(const ws of wb.worksheets.filter(s=>/week/i.test(s.name))){
  const dayRow=scheduleDayHeaderRow(ws);
  if(!dayRow)continue;
  for(let c=2;c<=8;c++){const d=cellDate(ws.getRow(dayRow+1).getCell(c).value);if(d)covered.add(d);}
 }
 // A template with formula-only dates is valid as a layout. When exporting
 // one selected week, make a COPY and stamp date values into its seven cells.
 // The saved master itself is never edited.
 if(options.retargetWeek&&wb.worksheets.some(s=>/^Week\s*#\d+$/i.test(s.name)&&isExactCgcEngineeringTemplate(s)))return;
 if(!covered.size)throw new Error("The approved workbook has no recognizable weekly date rows or compatible CGC layout.");
 const missing=[...new Set(entries.map(e=>e.date))].filter(d=>!covered.has(d));
 if(missing.length)throw new Error("The master workbook does not contain "+missing.length+" schedule dates (first: "+missing[0]+"). Use Fresh Export, or choose a matching approved workbook. Automatic template re-dating is not ready yet.");
}
/** The uploaded engineering workbook—not the fresh exporter—is authoritative.
 * Refuse a layout mismatch rather than silently rebuilding the design.
 */
export function isExactCgcEngineeringTemplate(ws:XSheet):boolean {
 const row=(n:number)=>String(ws.getRow(n).getCell(1).value??"").trim().toUpperCase();
 return [
  [54,"HALLS"],[55,"HALL A"],[56,"HALL B"],[57,"HALL C"],[58,"HALL D"],
  [59,"TASKS"],[60,"BALLROOM"],[61,"BALLROOM A"],[62,"BALLROOM B"],
  [63,"BALLROOM E"],[64,"BALLROOM G"],[65,"BALLROOM C"],[66,"BALLROOM D"],
  [67,"BALLROOM F"],[68,"TASKS"],[69,"LOCATION"]
 ].every(([n,name])=>row(Number(n))===name);
}

/** Builds the weekly engineering workbook (Week #1, #2 …) or, given an existing schedule, fills its event rows. */
export async function eventsWorkbook(entries: EventEntry[], existing?: File, tasks: TaskNote[] = [], options: {singleWeek?:string;preserveTemplateLayout?:boolean;retargetTemplateWeek?:boolean} = {}): Promise<Blob> {
  const module = await import("exceljs");
  const ExcelJS = module.default ?? module;
  const wb: XWorkbook = new ExcelJS.Workbook();
  // Only the actual CGC Hall A-D and Ballroom A-G rows exist in the user's
  // workbook. Never invent an "Other Spaces" block; fail visibly so the venue
  // alias can be reviewed rather than dropping or misplacing an event.
  const allowedRooms=new Set([...HALL_ROWS,...BALLROOM_ROWS]);
  const unknown=[...new Set(entries.flatMap(e=>expandSpace(e.space).filter(room=>!allowedRooms.has(room))))];
  if(unknown.length)throw new Error("Unmapped CGC space(s): "+unknown.join(", ")+
    ". Review the source room labels; the uploaded engineering template has no Other Spaces section.");
  // Expand a combined hall such as "Hall AB" to existing Hall A and Hall B.
  const sheetEntries = entries.flatMap(e => expandSpace(e.space).map(space => ({ ...e, space })));
  const weeks = weekLayouts(sheetEntries);
  if (existing) await wb.xlsx.load(await existing.arrayBuffer());
  if(options.singleWeek){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(options.singleWeek))throw new Error("Invalid selected week.");
    // Week-only export must never include the other five weeks in a template.
    // Refuse incompatible templates rather than keeping unrelated old events.
    if(entries.some(e=>mondayIso(e.date)!==options.singleWeek))throw new Error("Entries outside the selected week cannot be exported.");
    if(existing){
      const matches=wb.worksheets.filter(ws=>{
        if(!/week/i.test(ws.name))return false;
        const header=scheduleDayHeaderRow(ws);
        return header>0&&cellDate(ws.getRow(header+1).getCell(2).value)===options.singleWeek;
      });
      if(matches.length>1)throw new Error("Multiple template worksheets use the selected week; select a unique master workbook.");
      // Only the explicitly chosen APPROVED master can be re-dated. Uploaded
      // source workbooks remain date-authoritative and are never retargeted.
      const retarget=!matches.length&&options.retargetTemplateWeek===true;
      const selected=matches[0]||(retarget?wb.worksheets.find(ws=>
        /^Week\s*#\d+$/i.test(ws.name)&&isExactCgcEngineeringTemplate(ws)):undefined);
      if(!selected)throw new Error("The Excel master has no worksheet for the selected week "+options.singleWeek+
        ". Select a matching template or the approved CGC master in Settings & AI.");
      const originalPrintArea=selected.pageSetup.printArea;
      const header=scheduleDayHeaderRow(selected);
      if(!header)throw new Error("Template date header is missing.");
      const dates=retarget?weekDates(options.singleWeek):null;
      if(retarget)clearRetargetedEventGrid(selected);
      // Use explicit dates in the EXPORTED COPY. Week templates can link to
      // Extra via uncached Excel formulas; those cannot survive removing Extra.
      for(let col=2;col<=8;col++){
        const cell=selected.getRow(header+1).getCell(col);
        const iso=dates?.[col-2]??cellDate(cell.value);
        if(!iso)throw new Error("The template date "+cell.address+" has no cached value. Choose the approved master to re-date the selected week.");
        const style={...cell.style};
        cell.value=toDate(iso);
        cell.style=style;
      }
      for(const sheet of [...wb.worksheets])if(sheet!==selected)wb.removeWorksheet(sheet.id);
      // Remove print areas pointing at deleted sheets. Restore the surviving
      // week print range, if the user's original worksheet defined one.
      wb.definedNames.model=[];
      if(originalPrintArea)selected.pageSetup.printArea=originalPrintArea;
    }
  }
  const sheets = wb.worksheets.filter((ws) => /^Week\s*#\d+$/i.test(ws.name));
  if(existing && (!sheets.length || sheets.some(ws=>!isExactCgcEngineeringTemplate(ws))))
    throw new Error("The uploaded workbook is not the original engineering template. Choose the 11 November 2026 workbook with HALLS in row 54 and BALLROOM in row 60.");
  // PTO and shifts you already typed into the engineer rows are read first, so the plan works around them.
  const avail: Record<string, Record<string, Avail>> = {};
  for (const ws of sheets) {
    const dayRow=scheduleDayHeaderRow(ws);
    if (!dayRow) continue;
    const cols = new Map<string, number>();
    for (let c = 2; c <= 8; c++) { const d = cellDate(ws.getRow(dayRow + 1).getCell(c).value); if (d) cols.set(d, c); }
    ws.eachRow((row, i) => {
      const name = String(row.getCell(1).value ?? "").trim();
      if (!ENGINEER_ROSTER.some((p) => p.name === name)) return;
      for (const [d, c] of cols) {
        const t = (x: { text?: string; value?: unknown }) => x.text ?? String(x.value ?? "");
        const a = readAvail(t(row.getCell(c))) ?? (/^[a-z]/i.test(t(ws.getRow(i + 1).getCell(c)).trim()) && !/^off$/i.test(t(ws.getRow(i + 1).getCell(c)).trim()) ? readAvail(t(ws.getRow(i + 1).getCell(c))) : null);
        if (a) (avail[name] ??= {})[d] = a;
      }
    });
  }
  const dates = [...new Set(entries.map((e) => e.date))].sort();
  const plans = new Map(planWeeks(dates, sheetEntries, avail, undefined, airwallHolds(tasks, sheetEntries)).map((p) => [p.date, p] as const));
  let n = sheets.length;
  for (const w of weeks) {
    if (sheets.some((s) => mergeWeekSheet(s, w, tasks, plans,!!options.preserveTemplateLayout))) continue;
    if(existing)throw new Error("The exact engineering template has no worksheet for week "+w.monday+". A differently formatted worksheet will not be generated.");
    writeWeekSheet(wb.addWorksheet(`Week #${++n}`), w, tasks, plans);
  }
  if(!options.singleWeek && !existing)addStaffingSheets(wb, [...plans.values()]);
  const out = await wb.xlsx.writeBuffer();
  return new Blob([out], { type: XLSX_MIME });
}

/** "Staffing" (who works when) and "Staffing Why" (the reasoning behind every pick) sheets. */
function addStaffingSheets(wb: XWorkbook, plans: DayPlan[]) {
  if (!plans.length) return;
  for (const name of ["Staffing", "Staffing Why"]) { const old = wb.getWorksheet(name); if (old) wb.removeWorksheet(old.id); }
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" });
  const plan = wb.addWorksheet("Staffing");
  plan.addRow(["Date", "Needed (people: hours)", "Engineers", "Service Desk (Jacquline)", "Gaps"]).font = { bold: true };
  const why = wb.addWorksheet("Staffing Why");
  why.addRow(["Date", "Who", "Shift", "Why"]).font = { bold: true };
  for (const p of plans) {
    const row = plan.addRow([day(p.date), needText(p.need), p.assignments.map((a) => `${a.name.split(" ")[0]} ${shiftText(a)}`).join("\n"), p.desk ? shiftText(p.desk) : "", p.gaps.map((g) => `${shiftText(g)} short ${g.short}`).join(", ")]);
    row.alignment = { wrapText: true, vertical: "top" };
    if (p.gaps.length) row.getCell(5).font = { bold: true, color: { argb: "FFC00000" } };
    for (const a of p.assignments) why.addRow([day(p.date), a.name, shiftText(a), a.reason]);
    if (p.desk) why.addRow([day(p.date), p.desk.name, shiftText(p.desk), p.desk.reason]);
    for (const n of p.notUsed) why.addRow([day(p.date), n.name, "Off", n.why]);
    for (const n of p.notes) why.addRow([day(p.date), "Note", "", n]);
  }
  const total = new Map<string, { days: number; hours: number }>();
  for (const p of plans) for (const a of p.assignments) { const t = total.get(a.name) ?? { days: 0, hours: 0 }; t.days++; t.hours += workedHours(a); total.set(a.name, t); }
  plan.addRow([]);
  plan.addRow(["Totals", "Days", "Worked hrs (8.5 scheduled = 8 after lunch)"]).font = { bold: true };
  for (const [name, t] of total) plan.addRow([name, t.days, t.hours]);
  plan.columns = [{ width: 12 }, { width: 34 }, { width: 28 }, { width: 22 }, { width: 30 }];
  why.columns = [{ width: 12 }, { width: 22 }, { width: 14 }, { width: 110 }];
  why.eachRow((r) => { r.alignment = { wrapText: true, vertical: "top" }; });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
