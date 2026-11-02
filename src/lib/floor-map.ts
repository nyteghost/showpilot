/**
 * Floor map: colour a trade-show floor plan from a "Better Work Order Items" report.
 * Pure logic only (no pdf.js, no DOM) so it can be tested on its own. The PDF reading lives in floor-map-pdf.ts.
 *
 * Coordinates are PDF points as drawn on the page, origin top-left, y grows downward.
 */

export type TextBit = { s: string; x: number; y: number; w: number; h: number };
export type Seg = { x1: number; y1: number; x2: number; y2: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Prims = { width: number; height: number; texts: TextBit[]; segs: Seg[]; boxes: Box[] };

// ---------------------------------------------------------------- work order

export type OrderLine = { pre: string; units: number; desc: string; order: string };

/** Lines of text from the report (each already joined left→right) → one row per order line. */
export function parseWorkOrderLines(lines: string[]): OrderLine[] {
  const out: OrderLine[] = [];
  for (const raw of lines) {
    const m = raw.trim().match(/^(.*?)\s+(\d+\.\d\d)\s+(.*?)\s+(\d\d\/\d\d\/\d\d)\s+(\d+)\s+(.*)$/);
    if (m) out.push({ pre: m[1] ?? "", units: Number(m[2]), desc: m[3] ?? "", order: m[5] ?? "" });
  }
  return out;
}

export type Kind = "a10" | "a20" | "a30" | "a60" | "water" | "air" | "big" | "showcase" | "trackA" | "trackB" | "other";

export function classify(desc: string): { kind: Kind; mult: number } {
  const d = desc.toLowerCase().trim();
  if (/^10 ?amp/.test(d)) return { kind: "a10", mult: 1 };
  if (/^20 ?amp/.test(d)) return { kind: "a20", mult: 1 };
  if (/^30 ?amp/.test(d)) return { kind: "a30", mult: 1 };
  if (/^60 ?amp/.test(d)) return { kind: "a60", mult: 1 };
  if (/^(100|200) ?amp/.test(d)) return { kind: "big", mult: 1 };
  if (/water/.test(d) && !/sink/.test(d)) return { kind: "water", mult: 1 };
  if (/compressed|^air\b/.test(d)) return { kind: "air", mult: 1 };
  const sc = d.match(/^power for \((\d+)\)/);
  if (sc) return { kind: "showcase", mult: Number(sc[1]) };
  if (/package a\b/.test(d)) return { kind: "trackA", mult: 1 };
  if (/package b\b/.test(d)) return { kind: "trackB", mult: 1 };
  return { kind: "other", mult: 1 };
}

const isBoothToken = (t: string) => /^[A-Za-z]{0,2}-?\d{1,4}[A-Za-z]?([-/,][A-Za-z]{0,2}\d{1,4}[A-Za-z]?)*$/.test(t) || /^[A-Za-z]{1,2}\d{1,3}(and|AND)\d{1,3}$/.test(t) || /^\d{3,4}[A-Za-z]{3,}$/.test(t) || /^[A-Za-z]{1,2}\d{1,3}[A-Za-z]{1,2}\d{1,3}$/.test(t) || /^(tbd)$/i.test(t) || /^\d{1,3}_[A-Za-z]+$/.test(t) || /^[A-Za-z]\d{1,3}[A-Za-z]{3,}$/.test(t);

export type Entry = {
  key: string;
  booth: string; // as typed on the order ("" when none)
  exhibitor: string;
  counts: Record<Kind, number>;
  other: string[];
  orders: string[]; // order numbers seen (a repeat means the same order came twice)
  dupOrders: boolean;
};

const zero = (): Record<Kind, number> => ({ a10: 0, a20: 0, a30: 0, a60: 0, water: 0, air: 0, big: 0, showcase: 0, trackA: 0, trackB: 0, other: 0 });

export function buildEntries(lines: OrderLine[]): Entry[] {
  const map = new Map<string, Entry>();
  for (const l of lines) {
    const toks = l.pre.split(/\s+/).filter(Boolean);
    const last = toks[toks.length - 1] ?? "";
    // a booth token must carry a digit (or be TBD) and not just be the tail of a word list
    const booth = toks.length >= 2 && isBoothToken(last) && (/\d/.test(last) || /^tbd$/i.test(last)) ? last : "";
    const exhibitor = (booth ? toks.slice(0, -1) : toks).join(" ");
    const nameKey = /^tbd$/i.test(booth) || !booth ? `|${exhibitor.toLowerCase()}` : "";
    const key = `${booth.toUpperCase()}${nameKey}`;
    let e = map.get(key);
    if (!e) { e = { key, booth, exhibitor, counts: zero(), other: [], orders: [], dupOrders: false }; map.set(key, e); }
    const { kind, mult } = classify(l.desc);
    if (kind === "other") e.other.push(`${l.units} × ${l.desc.split("(")[0]?.trim() ?? l.desc}`);
    else e.counts[kind] += l.units * mult;
    if (e.orders.includes(l.order)) e.dupOrders = true;
    e.orders.push(l.order);
  }
  return [...map.values()];
}

/** Does this entry have anything to draw? */
export const hasPower = (e: Entry) => (["a10", "a20", "a30", "a60", "water", "air", "showcase", "trackA", "trackB"] as Kind[]).some((k) => e.counts[k] > 0);

// ---------------------------------------------------------------- booth names

export type BoothSpec = { ids: string[]; range?: { prefix: string; a: number; b: number }; note?: string };

const canon = (prefix: string, num: number, suffix = "") => `${prefix.toUpperCase()}${num}${suffix.toUpperCase()}`;

/** "803ASPIRE"→803, "D01"→D1, "Mo1"→M1, "H14H13"→H14+H13, "N9and10"→N9+N10, "m6-7"→M6–M7, "Q08/09"→Q8+Q9, "336-A"→336A */
export function parseBooth(token: string): BoothSpec {
  let t = token.trim().replace(/^([A-Za-z]{1,2})-(\d)/, "$1$2"); // T-18 → T18
  if (!t || /^tbd$/i.test(t)) return { ids: [] };
  t = t.replace(/^([A-Za-z])o(\d+)$/, "$10$2"); // "Mo1" is M01
  t = t.replace(/_.*$/, ""); // 508_WGU
  // N9and10, E10-JJ-like trailing names
  let m = t.match(/^([A-Za-z]{0,2})(\d+)(?:and|AND)(\d+)$/);
  if (m) return { ids: [canon(m[1] ?? "", Number(m[2])), canon(m[1] ?? "", Number(m[3]))] };
  // H14H13
  m = t.match(/^([A-Za-z]{1,2})(\d+)([A-Za-z]{1,2})(\d+)$/);
  if (m) return { ids: [canon(m[1] ?? "", Number(m[2])), canon(m[3] ?? "", Number(m[4]))] };
  // 336-A  (booth with letter suffix)
  m = t.match(/^(\d+)-([A-Za-z])$/);
  if (m) return { ids: [canon("", Number(m[1]), m[2])] };
  // ranges: m11-m13, m6-7, 412-414, 823-5, 929-1028
  m = t.match(/^([A-Za-z]{0,2})(\d+)-([A-Za-z]{0,2})(\d+)$/);
  if (m) {
    const p = m[1] ?? "";
    const a = Number(m[2]);
    let bs = m[4] ?? "";
    if (!p && bs.length < (m[2] ?? "").length) bs = (m[2] ?? "").slice(0, (m[2] ?? "").length - bs.length) + bs; // 823-5 → 825
    const b = Number(bs);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (hi - lo <= 8) {
      const ids: string[] = [];
      for (let i = lo; i <= hi; i++) ids.push(canon(p, i));
      return { ids, range: { prefix: p, a: lo, b: hi } };
    }
    return { ids: [canon(p, a), canon(p, b)], range: { prefix: p, a: lo, b: hi }, note: "range" };
  }
  // slashes and commas: 312/314, 122,124, Q08/09, 5,H4
  if (/[/,]/.test(t)) {
    const parts = t.split(/[/,]/).filter(Boolean);
    const ids: string[] = [];
    let prefix = "";
    let note: string | undefined;
    for (const part of parts) {
      const pm = part.match(/^([A-Za-z]{0,2})(\d+)([A-Za-z]?)$/);
      if (!pm) continue;
      if (pm[1]) prefix = pm[1];
      else if (!prefix && ids.length === 0 && parts.some((q) => /^[A-Za-z]/.test(q))) { note = `"${token}": "${part}" has no letter — I used only the lettered booth`; continue; }
      ids.push(canon(pm[1] || prefix, Number(pm[2]), pm[3] ?? ""));
    }
    return { ids, ...(note ? { note } : {}) };
  }
  // plain: letter prefix + digits + optional single letter suffix + optional trailing name (803ASPIRE, K905kitche)
  m = t.match(/^([A-Za-z]{0,2})(\d+)(?!\d)([A-Za-z]?)(?![A-Za-z])/);
  if (m) return { ids: [canon(m[1] ?? "", Number(m[2]), m[3] ?? "")] };
  m = t.match(/^([A-Za-z]{0,2})(\d+)/);
  if (m) return { ids: [canon(m[1] ?? "", Number(m[2]))] };
  return { ids: [] };
}

// ---------------------------------------------------------------- finding booths on the plan

const normLabel = (s: string) => {
  const t = s.replace(/[\s'"]/g, "").toUpperCase();
  const m = t.match(/^([A-Z]{0,2})(\d+)([A-Z]?)$/);
  return m ? canon(m[1] ?? "", Number(m[2]), m[3] ?? "") : t;
};

/** Join text pieces that sit side by side on one line ("T" + "45"), keeping the originals too. */
export function mergeTexts(texts: TextBit[]): TextBit[] {
  const out = [...texts];
  const rows = [...texts].sort((a, b) => a.y - b.y || a.x - b.x);
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]!;
    if (!/^[A-Za-z]{1,2}$/.test(a.s.trim())) continue;
    for (const b of rows) {
      if (b === a || !/^\d{1,4}$/.test(b.s.trim())) continue;
      if (Math.abs(b.y - a.y) < Math.max(a.h, b.h) * 0.5 && b.x - (a.x + a.w) > -1 && b.x - (a.x + a.w) < Math.max(a.h, b.h) * 0.9)
        out.push({ s: a.s.trim() + b.s.trim(), x: a.x, y: Math.min(a.y, b.y), w: b.x + b.w - a.x, h: Math.max(a.h, b.h) });
    }
  }
  return out;
}

/** For booths with a small opening or an internal divider, the tightest
 * rectangle around the booth number may be just a narrow strip.
 * Prefer the *outer* booth footprint only when its geometry is well supported.
 */
function fullBoothAround(p: Prims, px: number, py: number, narrow: Box): Box | null {
  const horizontalStrip = narrow.w > narrow.h * 1.8;
  const verticalStrip = narrow.h > narrow.w * 1.8;
  if (!horizontalStrip && !verticalStrip) return null;

  const contains = (b: Box) =>
    px >= b.x - 0.8 && px <= b.x + b.w + 0.8 &&
    py >= b.y - 0.8 && py <= b.y + b.h + 0.8;
  const plausible = (b: Box) => {
    const ratio = b.w / b.h;
    const area = b.w * b.h, stripArea = narrow.w * narrow.h;
    return b.w >= 12 && b.h >= 12 && b.w <= p.width * 0.3 && b.h <= p.height * 0.3 &&
      ratio >= 0.7 && ratio <= 1.45 && area >= stripArea * 1.7 &&
      area <= stripArea * 20 && contains(b) &&
      (horizontalStrip
        ? Math.abs(b.x - narrow.x) <= Math.max(1.5, narrow.w * 0.05) &&
          Math.abs(b.w - narrow.w) <= Math.max(2, narrow.w * 0.09)
        : Math.abs(b.y - narrow.y) <= Math.max(1.5, narrow.h * 0.05) &&
          Math.abs(b.h - narrow.h) <= Math.max(2, narrow.h * 0.09));
  };

  // A closed rectangle from the PDF is strongest evidence. Do not let
  // an internal horizontal divider override it just because it is tighter.
  const closed = p.boxes.filter(plausible).sort((a, b) => a.w * a.h - b.w * b.h)[0];
  if (closed) return closed;

  // Some CAD plans leave a small door/opening in the outer perimeter, so
  // pdf.js cannot report a closed box. Reconstruct only if both opposite
  // edges and both remaining edges are mostly present; never infer from
  // the booth label or a single neighboring line alone.
  if (!horizontalStrip) return null;
  const x1 = narrow.x, x2 = narrow.x + narrow.w, w = narrow.w;
  const nearby = p.segs.filter(s =>
    Math.min(s.x1, s.x2) <= x2 + 1.5 && Math.max(s.x1, s.x2) >= x1 - 1.5 &&
    Math.min(s.y1, s.y2) <= py + w * 1.5 && Math.max(s.y1, s.y2) >= py - w * 1.5);
  const hLines = nearby.filter(s => Math.abs(s.y1 - s.y2) < 0.4 &&
    Math.abs(s.x2 - s.x1) >= 3);
  const vLines = nearby.filter(s => Math.abs(s.x1 - s.x2) < 0.4 &&
    Math.abs(s.y2 - s.y1) >= 3);
  if (!hLines.length || !vLines.length) return null;

  const coverage = (intervals: [number, number][], min: number, max: number) => {
    const sorted = intervals.map(([a, b]) => [Math.max(min, a), Math.min(max, b)] as const)
      .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    let sum = 0, last = min;
    for (const [a, b] of sorted) {
      const from = Math.max(last, a);
      if (b > from) sum += b - from;
      last = Math.max(last, b);
    }
    return sum / (max - min);
  };
  const hSupport = (y: number) => coverage(hLines
    .filter(s => Math.abs(s.y1 - y) <= 0.85)
    .map(s => [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)]), x1, x2);
  const vSupport = (x: number, top: number, bottom: number) => coverage(vLines
    .filter(s => Math.abs(s.x1 - x) <= 0.85)
    .map(s => [Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)]), top, bottom);

  const ys = [...new Set(hLines
    .filter(s => Math.max(s.x1, s.x2) >= x1 + 3 && Math.min(s.x1, s.x2) <= x2 - 3)
    .map(s => Math.round(s.y1 * 2) / 2))].sort((a, b) => a - b);
  let best: Box | null = null;
  for (const top of ys) for (const bottom of ys) {
    if (top >= py || bottom <= py || bottom <= top) continue;
    const candidate = {x:x1, y:top, w, h:bottom-top};
    if (!plausible(candidate)) continue;
    if (hSupport(top) < 0.65 || hSupport(bottom) < 0.65) continue;
    if (vSupport(x1, top, bottom) < 0.72 || vSupport(x2, top, bottom) < 0.72) continue;
    if (!best || candidate.w * candidate.h < best.w * best.h) best = candidate;
  }
  return best;
}

/** The booth drawn around a point: prefer a supported full footprint over a
 * narrow inner strip; otherwise keep the existing smallest-cell behavior.
 */
export function cellAround(p: Prims, px: number, py: number): Box | null {
  const maxW = p.width * 0.3;
  const maxH = p.height * 0.3;
  let best: Box | null = null;
  for (const b of p.boxes) {
    if (b.w < 6 || b.h < 6 || b.w > maxW || b.h > maxH) continue;
    if (px < b.x - 0.4 || px > b.x + b.w + 0.4 || py < b.y - 0.4 || py > b.y + b.h + 0.4) continue;
    if (!best || b.w * b.h < best.w * best.h) best = b;
  }
  const ray = rayCell(p, px, py);
  const tight = best && ray ? (best.w * best.h <= ray.w * ray.h * 1.6 ? best : ray) : best ?? ray;
  if (!tight) return null;
  return fullBoothAround(p, px, py, tight) ?? tight;
}

function rayCell(p: Prims, px: number, py: number): Box | null {
  const eps = 0.35;
  let top = -Infinity, bot = Infinity, left = -Infinity, right = Infinity;
  for (const s of p.segs) {
    const horiz = Math.abs(s.y1 - s.y2) < 0.3;
    const vert = Math.abs(s.x1 - s.x2) < 0.3;
    if (horiz) {
      const lo = Math.min(s.x1, s.x2), hi = Math.max(s.x1, s.x2);
      if (hi - lo < 3 || px < lo - 0.2 || px > hi + 0.2) continue;
      if (s.y1 <= py - eps && s.y1 > top) top = s.y1;
      if (s.y1 >= py + eps && s.y1 < bot) bot = s.y1;
    } else if (vert) {
      const lo = Math.min(s.y1, s.y2), hi = Math.max(s.y1, s.y2);
      if (hi - lo < 3 || py < lo - 0.2 || py > hi + 0.2) continue;
      if (s.x1 <= px - eps && s.x1 > left) left = s.x1;
      if (s.x1 >= px + eps && s.x1 < right) right = s.x1;
    }
  }
  if (!isFinite(top) || !isFinite(bot) || !isFinite(left) || !isFinite(right)) return null;
  const w = right - left, h = bot - top;
  if (w < 6 || h < 6 || w > p.width * 0.3 || h > p.height * 0.3) return null;
  return { x: left, y: top, w, h };
}

/**
 * Where does booth `id` sit?  A label that reads exactly `id`, then the booth drawn around its text.
 * The label usually sits in a corner of the booth, so the point used is the middle of the text.
 */
export function locate(p: Prims, labels: TextBit[], id: string): Box | null {
  const hits = labels.filter((t) => normLabel(t.s) === id);
  for (const t of hits) {
    const c = cellAround(p, t.x + t.w / 2, t.y + t.h / 2);
    if (c) return c;
  }
  // thin things (a 6x2 table with its number beside it): the closest small box to the label
  for (const t of hits) {
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    let best: Box | null = null, bd = Math.max(8, t.h * 2.2);
    for (const b of p.boxes) {
      if (b.w < 2 || b.h < 2 || Math.max(b.w, b.h) > 40 || (b.w >= 6 && b.h >= 6)) continue;
      const d = Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) return best;
  }
  return null;
}

/** Text on the plan that looks like this exhibitor's name (the work order often has the name when the booth is missing). */
export function findByName(p: Prims, exhibitor: string): { text: string; cell: Box | null }[] {
  const words = exhibitor.toLowerCase().replace(/[^a-z0-9& ]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !["inc", "llc", "company", "group", "services", "international"].includes(w));
  if (!words.length) return [];
  const first = words[0]!;
  const out: { text: string; cell: Box | null }[] = [];
  for (const t of p.texts) {
    const s = t.s.toLowerCase().replace(/[^a-z0-9& ]/g, " ");
    if (s.includes(first) && s.length < 60) out.push({ text: t.s.trim(), cell: cellAround(p, t.x + t.w / 2, t.y + t.h / 2) });
    if (out.length >= 4) break;
  }
  return out;
}

// ---------------------------------------------------------------- putting it together

export type Placed = { entry: Entry; cells: Box[]; approx?: boolean };
export type Question = { id: string; entryKey: string; exhibitor: string; booth: string; kind: "no-booth" | "not-found" | "check" | "other-lines"; text: string; hints?: { text: string; cell: Box | null }[] };
/** What the user told us, remembered per plan: draw these cells for this entry, or skip it. */
export type Answers = Record<string, { cells?: Box[]; skip?: true }>;
export type Resolved = { placed: Placed[]; questions: Question[] };

export function resolve(p: Prims, entries: Entry[], answers: Answers = {}): Resolved {
  const labels = mergeTexts(p.texts);
  const placed: Placed[] = [];
  const questions: Question[] = [];
  const ask = (e: Entry, kind: Question["kind"], text: string, hints?: Question["hints"]) =>
    questions.push({ id: `${e.key}#${kind}`, entryKey: e.key, exhibitor: e.exhibitor, booth: e.booth, kind, text, ...(hints ? { hints } : {}) });

  for (const e of entries) {
    if (e.counts.big > 0) ask(e, "other-lines", `${e.counts.big} × 100/200 amp — not colored. Which kitchen/area is it for?`);
    if (!hasPower(e)) continue;
    const ans = answers[e.key];
    if (ans?.skip) continue;
    if (ans?.cells?.length) { placed.push({ entry: e, cells: ans.cells }); continue; }
    if (!e.booth || /^tbd$/i.test(e.booth)) {
      ask(e, "no-booth", `No booth number on the order${e.booth ? " (TBD)" : ""}.`, findByName(p, e.exhibitor));
      continue;
    }
    const spec = parseBooth(e.booth);
    const cells: Box[] = [];
    const missing: string[] = [];
    for (const id of spec.ids) {
      const c = locate(p, labels, id);
      if (c) { if (!cells.some((q) => Math.abs(q.x - c.x) < 1 && Math.abs(q.y - c.y) < 1)) cells.push(c); } else missing.push(id);
    }
    if (spec.note && spec.note !== "range") ask(e, "check", spec.note);
    if (!cells.length) {
      ask(e, "not-found", `Booth "${e.booth}" isn't labeled on this plan.`, findByName(p, e.exhibitor));
      continue;
    }
    if (spec.range?.b !== spec.range?.a && spec.note === "range") {
      const far = Math.max(...cells.map((c) => Math.hypot(c.x - cells[0]!.x, c.y - cells[0]!.y)));
      const size = Math.max(cells[0]!.w, cells[0]!.h);
      if (far > size * 6) { ask(e, "not-found", `"${e.booth}" is a long range and the ends are far apart — click the booth(s) to color.`, findByName(p, e.exhibitor)); continue; }
      ask(e, "check", `Range ${e.booth}: colored the block(s) holding ${spec.ids.join(" and ")} as one booth.`);
    } else if (missing.length && !spec.range) ask(e, "check", `Not labeled on the plan: ${missing.join(", ")} — colored the rest.`);
    if (e.dupOrders) ask(e, "check", "The same order number appears on more than one line — units were added together.");
    if (e.counts.showcase > 0 && e.counts.showcase > 12) ask(e, "check", `${e.counts.showcase} showcases (units × showcases per line) — check.`);
    placed.push({ entry: e, cells });
  }
  // a cell far bigger than the rest is probably the wrong outline
  const areas = placed.flatMap((x) => x.cells.map((c) => c.w * c.h)).sort((a, b) => a - b);
  const med = areas[Math.floor(areas.length / 2)] ?? 0;
  for (const pl of placed) if (med && pl.cells.some((c) => c.w * c.h > med * 8) && !answers[pl.entry.key]) ask(pl.entry, "check", "The outline I found is much bigger than a normal booth — is it right? (Click the booth to correct it.)");
  return { placed, questions };
}

// ---------------------------------------------------------------- what to draw

export type Draw = { cells: Box[]; fill: "y" | "o" | "yo" | null; squares: ("red" | "green" | "blue" | "purple")[]; tag: string[]; tagColor: "y" | "o" | "k"; label: string };

export function drawFor(pl: Placed): Draw {
  const c = pl.entry.counts;
  const yellow = c.a10 > 0 || c.showcase > 0;
  const orange = c.a20 > 0;
  const tag: string[] = [];
  const amps = [c.a10 > 1 ? `x${c.a10}` : "", c.a20 > 1 ? `x${c.a20}` : ""].filter(Boolean);
  if (amps.length) tag.push(amps.join(" "));
  if (c.showcase > 0) tag.push(`SCase x${c.showcase}`);
  if (c.trackA > 0) tag.push(`A x${c.trackA}`);
  if (c.trackB > 0) tag.push(`B x${c.trackB}`);
  const squares: Draw["squares"] = [];
  if (c.a30 > 0) squares.push("red");
  if (c.a60 > 0) squares.push("green");
  if (c.water > 0) squares.push("blue");
  if (c.air > 0) squares.push("purple");
  return { cells: pl.cells, fill: yellow && orange ? "yo" : yellow ? "y" : orange ? "o" : null, squares, tag, tagColor: orange && !yellow ? "o" : yellow ? "y" : "k", label: pl.entry.booth };
}

export const COLORS = {
  y: "rgba(255,226,0,0.72)", o: "rgba(255,140,0,0.72)",
  yt: "#806000", ot: "#bf4d00",
  red: "#e60d0d", green: "#009e26", blue: "#1a59f2", purple: "#9933cc",
} as const;

export function placedCsv(placed: Placed[]): string {
  const rows = [["Booth", "Exhibitor", "10 amp", "20 amp", "30 amp", "60 amp", "Water", "Air", "Showcases", "Track A", "Track B"]];
  for (const { entry: e } of placed) rows.push([e.booth, e.exhibitor, ...(["a10", "a20", "a30", "a60", "water", "air", "showcase", "trackA", "trackB"] as Kind[]).map((k) => String(e.counts[k]))]);
  return rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n");
}

export function questionsCsv(qs: Question[]): string {
  const rows = [["Exhibitor", "Booth on order", "Question"], ...qs.map((q) => [q.exhibitor, q.booth, q.text])];
  return rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n");
}

/** A key for remembering answers: same plan file → same answers. */
export const planKey = (name: string, p: Prims) => `${name.replace(/\.pdf$/i, "").toLowerCase()}|${Math.round(p.width)}x${Math.round(p.height)}|${p.texts.length}`;


/** Wide itemized "ShowPilot" / "Mobile View" exports.
 * Keep venue and event ID distinct; note booth hints always require review.
 */
export type ShowPilotItem = {eventId:string;eventName:string;venue:string;line:OrderLine;noteBooth:string;note:string};
export function parseShowPilotItemLines(lines:string[]):ShowPilotItem[]{
 const out:ShowPilotItem[]=[];
 const pattern=/^(.+?)\s+(\d+\.\d{2})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{6})\s+(Open|Completed|Cancelled)(?:\s*\([A-Za-z]?\)?)?\s+(\d{4,6})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2})\s+(.+)$/i;
 for(const raw of lines){
  const m=raw.trim().match(pattern);
  if(!m)continue;
  const prefix=m[1]!.trim(), units=Number(m[2]),desc=m[3]!.trim();
  const tail=m[10]!,venue=tail.match(/\b(CGC|CEPAC)\s*\(\d+\)/i)?.[1]?.toUpperCase()??"unknown";
  const parts=prefix.split(/\s+/),last=parts.at(-1)??"";
  const booth=isBoothToken(last)?last:"";
  const exhibitor=booth?parts.slice(0,-1).join(" "):prefix;
  if(!Number.isFinite(units)||units<=0)continue;
  out.push({eventId:m[7]!,eventName:m[8]!.trim(),venue,
   note:tail,noteBooth:booth?"":tail.match(/\bbooth\s*#?\s*([A-Z]{0,3}\d{1,4}(?:-[A-Z]{0,3}\d{1,4})?)\b/i)?.[1]??"",
   line:{pre:exhibitor+(booth?" "+booth:""),units,desc,order:m[5]!}});
 }
 return out;
}
