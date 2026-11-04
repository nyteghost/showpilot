import type { LayoutStage, PositionedLayoutStage } from "@/components/deck-planner/stage-layout";

/** A physical stage. Loose/bridge deck tiles are not separate stages. */
export type CrewPrintStage = Pick<LayoutStage,"name"|"width"|"length"|"heightIn"|"valid"|"decks"|"holders"> & { extraDecks?: number };

const escape = (value: string) => value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/,"");
const num = (value: number) => Number.isFinite(value) ? Math.max(0,value) : 0;

export function crewPrintData(stage: CrewPrintStage) {
  const capacities={1:0,2:0,3:0};
  for(const h of stage.holders)if(h.capacity===1||h.capacity===2||h.capacity===3)capacities[h.capacity]++;
  return {decks:stage.decks.length+Math.max(0,stage.extraDecks??0),loose:Math.max(0,stage.extraDecks??0),holders:capacities,holderTotal:capacities[1]+capacities[2]+capacities[3]};
}

function stageDiagram(stage:CrewPrintStage):string {
  const width=Math.max(1,stage.width),length=Math.max(1,stage.length);
  const padding=5;
  const shape=(x:number,y:number,w:number,h:number)=>[
    fmt(num(x)),fmt(num(y)),fmt(num(w)),fmt(num(h)),
  ];
  const decks=stage.decks.map((d,i)=>{
    const [x,y,w,h]=shape(d.x,d.y,d.w,d.h);
    const bridgeLabel=d.isBridge ? '<text x="'+fmt(num(d.x)+num(d.w)/2)+'" y="'+fmt(num(d.y)+num(d.h)/2)+'" font-size=".75" font-family="Arial,sans-serif" font-weight="700" fill="#111827" dominant-baseline="middle" text-anchor="middle">BRIDGE</text>' : "";
    return '<g><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+(d.isBridge?"#edf1f5":"#fff")+'" stroke="#111827" stroke-width=".16" vector-effect="non-scaling-stroke"><title>'+(d.isBridge?"Bridge deck ":"Deck ")+(i+1)+'</title></rect>'+bridgeLabel+'</g>';
  }).join("");
  const holders=stage.holders.map((h,i)=>{
    const [x,y,w,hh]=shape(h.x,h.y,h.w,h.h);
    const dash=h.capacity===2?' stroke-dasharray=".7 .4"':'';
    const extra=h.capacity===3?'<rect x="'+fmt(num(h.x)+.25)+'" y="'+fmt(num(h.y)+.25)+'" width="'+fmt(Math.max(.1,num(h.w)-.5))+'" height="'+fmt(Math.max(.1,num(h.h)-.5))+'" fill="none" stroke="#111827" stroke-width=".10" vector-effect="non-scaling-stroke"/>':'';
    const labelSize=Math.max(.7,Math.min(1.3,h.w>0?h.w/4:1,h.h>0?h.h/3:1));
    return '<g><rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+hh+'" fill="none" stroke="#111827" stroke-width=".38"'+dash+' vector-effect="non-scaling-stroke"/>'+extra+
      '<text x="'+fmt(num(h.x)+num(h.w)/2)+'" y="'+fmt(num(h.y)+num(h.h)/2)+'" font-size="'+fmt(labelSize)+'" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-weight="700" fill="#111827">'+h.capacity+'x</text></g>';
  }).join("");
  return '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Deck placement for '+escape(stage.name)+'" viewBox="'+(-padding)+' '+(-padding)+' '+(width+2*padding)+' '+(length+2*padding)+'" preserveAspectRatio="xMidYMid meet">'+
    '<text x="'+fmt(width/2)+'" y="-2.2" text-anchor="middle" font-size="1.6" font-weight="700" fill="#101827">'+fmt(width)+' ft width</text>'+
    '<text x="-2.2" y="'+fmt(length/2)+'" transform="rotate(-90 -2.2 '+fmt(length/2)+')" text-anchor="middle" font-size="1.6" font-weight="700" fill="#101827">'+fmt(length)+' ft length</text>'+
    '<rect x="0" y="0" width="'+fmt(width)+'" height="'+fmt(length)+'" fill="#f8fafc" stroke="#111827" stroke-width=".36" vector-effect="non-scaling-stroke"/>'+
    decks+holders+'</svg>';
}

/** Stable date-only rendering: never shift the show date across local time zones. */
export type CrewScheduleDates = { showDate?: string; buildByDate?: string };
function crewDate(value?: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Not set";
  const parsed = new Date(value + "T12:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {weekday:"short",month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(parsed);
}


/** The selected Layout View gets a separate overview page after the physical-stage crew sheets. */
function layoutPage(title: string, stages: readonly PositionedLayoutStage[], dates: CrewScheduleDates): string {
  if (!stages.length) return "";
  const left = Math.max(0, Math.min(...stages.map(s => num(s.position.x))) - 3);
  const top = Math.max(0, Math.min(...stages.map(s => num(s.position.y))) - 3);
  const right = Math.max(8, ...stages.map(s => num(s.position.x) + num(s.width))) + 3;
  const bottom = Math.max(8, ...stages.map(s => num(s.position.y) + num(s.length))) + 3;
  const placements = stages.map((stage, index) => {
    const px = num(stage.position.x), py = num(stage.position.y);
    const w = Math.max(1, num(stage.width)), h = Math.max(1, num(stage.length));
    const decks = stage.decks.map(deck => {
      const bridge = !!deck.isBridge;
      return '<rect x="' + fmt(num(deck.x)) + '" y="' + fmt(num(deck.y)) +
        '" width="' + fmt(num(deck.w)) + '" height="' + fmt(num(deck.h)) +
        '" fill="' + (bridge ? '#dae3ec' : '#fff') +
        '" stroke="#64748b" stroke-width=".15" vector-effect="non-scaling-stroke"/>' +
        (bridge ? '<text x="' + fmt(num(deck.x) + num(deck.w)/2) + '" y="' +
          fmt(num(deck.y) + num(deck.h)/2) +
          '" text-anchor="middle" dominant-baseline="middle" font-size=".65" fill="#111827">BRIDGE</text>' : '');
    }).join("");
    const holders = stage.holders.map(holder =>
      '<rect x="' + fmt(num(holder.x)) + '" y="' + fmt(num(holder.y)) +
      '" width="' + fmt(num(holder.w)) + '" height="' + fmt(num(holder.h)) +
      '" fill="none" stroke="#111827" stroke-width=".38" vector-effect="non-scaling-stroke"' +
      (holder.capacity === 2 ? ' stroke-dasharray=".8 .4"' : '') + '/>' +
      (holder.capacity === 3 ? '<rect x="' + fmt(num(holder.x)+.22) + '" y="' +
        fmt(num(holder.y)+.22) + '" width="' + fmt(Math.max(.1,num(holder.w)-.44)) +
        '" height="' + fmt(Math.max(.1,num(holder.h)-.44)) +
        '" fill="none" stroke="#111827" stroke-width=".12" vector-effect="non-scaling-stroke"/>' : '')
    ).join("");
    return '<g transform="translate(' + fmt(px) + ' ' + fmt(py) + ')">' +
      '<title>' + escape(stage.name) + '</title>' +
      '<rect width="' + fmt(w) + '" height="' + fmt(h) +
      '" fill="#f8fafc" stroke="#111827" stroke-width=".4" vector-effect="non-scaling-stroke"/>' +
      decks + holders +
      '<text x="' + fmt(w/2) + '" y="' + fmt(h/2) +
      '" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="' +
      fmt(Math.max(.7, Math.min(2,w/5,h/3))) + '" fill="#111827" font-weight="700">' + (index+1) + '</text></g>';
  }).join("");
  const key = stages.map((stage,index) => '<tr><td>' + (index+1) + '</td><td>' +
    escape(stage.name) + (stage.valid ? "" : ' — CHECK PLAN') + '</td><td>' +
    fmt(stage.width) + ' × ' + fmt(stage.length) + ' ft</td><td>' + fmt(stage.heightIn) +
    ' in</td><td>(' + fmt(num(stage.position.x)) + ', ' + fmt(num(stage.position.y)) +
    ') ft</td></tr>').join("");
  return '<section class="layout-sheet">' +
    '<div class="eyebrow">COBB CONVENTION CENTER-ATLANTA · STAGE LAYOUT</div>' +
    '<h1>' + title + '</h1><h2>Layout view · arranged stages</h2>' +
    '<p class="layout-dates"><b>BUILD BY:</b> ' + crewDate(dates.buildByDate) +
    ' &nbsp; <b>SHOW DATE:</b> ' + crewDate(dates.showDate) + '</p>' +
    '<div class="layout-drawing"><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Complete arranged stage layout" ' +
    'viewBox="' + fmt(left) + ' ' + fmt(top) + ' ' + fmt(right-left) + ' ' + fmt(bottom-top) +
    '" preserveAspectRatio="xMidYMid meet">' + placements + '</svg></div>' +
    '<table class="layout-key"><thead><tr><th>#</th><th>Stage</th><th>Width × Length</th><th>Height</th><th>Position (x, y)</th></tr></thead><tbody>' +
    key + '</tbody></table>' +
    '<div class="layout-footer">Positions are in feet from the Layout View origin. Includes rotated stages, stage copies, and loose bridge tiles.</div>' +
    '</section>';
}

/** Self-contained HTML: independent of the planner CSS and page chrome. */
export function crewPrintDocument(eventName:string, stages:readonly CrewPrintStage[], dates: CrewScheduleDates = {}, layoutStages: readonly PositionedLayoutStage[] = []):string {
  const title=escape(eventName.trim()||"Stage Plan");
  const pages=stages.map((s,index)=>{
    const tally=crewPrintData(s);
    const bridgeCount=s.decks.filter(d=>d.isBridge).length;
    const bridgeInfo=bridgeCount ? '<p class="loose"><b>Bridge decks:</b> '+bridgeCount+' of the '+tally.decks+' total decks (marked BRIDGE on diagram). Verify approved bridge support before assembly.</p>' : '';
    const note=s.valid?"":"<p class=\"warning\">CHECK PLAN: layout cannot be built from current stock.</p>";
    const loose=tally.loose>0?'<p class="loose">Includes '+tally.loose+' extra loose deck'+(tally.loose===1?"":"s")+' not shown in the diagram.</p>':"";
    return '<article class="sheet" data-stage="'+(index+1)+'">'+
      '<div class="eyebrow">COBB CONVENTION CENTER-ATLANTA · STAGE CREW SHEET</div>'+
      '<h1>'+title+'</h1><h2>'+escape(s.name||"Stage "+(index+1))+'</h2>'+
      '<div class="crew-dates"><div><span>BUILD BY</span><strong>'+crewDate(dates.buildByDate)+'</strong></div>'+
      '<div><span>SHOW DATE</span><strong>'+crewDate(dates.showDate)+'</strong></div></div>'+
      '<div class="dimensions"><div><span>WIDTH</span><strong>'+fmt(s.width)+' ft</strong></div>'+
      '<div><span>LENGTH</span><strong>'+fmt(s.length)+' ft</strong></div>'+
      '<div><span>HEIGHT</span><strong>'+fmt(s.heightIn)+' in</strong></div></div>'+
      '<div class="counts"><div class="major"><span>4 × 8 DECKS</span><strong>'+tally.decks+'</strong></div>'+
      '<div><span>3-DECK HOLDERS</span><strong>'+tally.holders[3]+'</strong></div>'+
      '<div><span>2-DECK HOLDERS</span><strong>'+tally.holders[2]+'</strong></div>'+
      '<div><span>1-DECK HOLDERS</span><strong>'+tally.holders[1]+'</strong></div></div>'+
      '<div class="drawing"><h3>DECK PLACEMENT · TOP VIEW</h3>'+stageDiagram(s)+'</div>'+
      '<div class="legend"><b>Diagram key:</b> solid outline = 1-deck holder · dashed = 2-deck holder · double = 3-deck holder. Outlines show individual decks. Deck size is stated once in the materials summary.</div>'+
      bridgeInfo+loose+note+
      '<div class="footer">STAGE '+(index+1)+' OF '+stages.length+' · '+escape(s.name||"Stage")+'</div></article>';
  }).join("");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+title+' — Stage Crew Sheets</title>'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<style>@page{size:letter portrait;margin:.45in}@page layout{size:letter landscape;margin:.45in}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:#111827;font-family:Arial,Helvetica,sans-serif}'+
    '.sheet{height:9.75in;width:100%;padding:0;break-inside:avoid;page-break-inside:avoid;break-after:page;page-break-after:always;display:flex;flex-direction:column;overflow:hidden}'+
    '.sheet:last-child{break-after:auto;page-break-after:auto}.eyebrow{font-size:10px;font-weight:700;letter-spacing:.09em;border-bottom:2px solid #111827;padding-bottom:9px}'+
    'h1{font-size:25px;line-height:1.15;margin:13px 0 3px;color:#000;overflow-wrap:anywhere}h2{font-size:19px;margin:0 0 10px;color:#111}'+
    '.crew-dates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:11px}.crew-dates>div{padding:9px 11px;border:2px solid #111827;background:#f3f5f8}.crew-dates span{font-size:10px;font-weight:800;letter-spacing:.05em;display:block;color:#111827}.crew-dates strong{display:block;font-size:17px;color:#000;margin-top:3px}'+
    '.dimensions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:13px}.dimensions>div{border:2px solid #1f2937;padding:9px 13px}'+
    '.counts{display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:8px;margin-bottom:12px}.counts>div{border:1px solid #374151;padding:9px 8px;min-height:67px}.counts .major{background:#eff3f7;border:2px solid #111827}'+
    '.dimensions span,.counts span{display:block;font-size:10px;font-weight:700;color:#20252d;letter-spacing:.04em}.dimensions strong,.counts strong{display:block;font-size:25px;color:#000;margin-top:5px}'+
    '.drawing{border:2px solid #111827;border-radius:3px;flex:1;min-height:0;display:flex;flex-direction:column;padding:10px 13px}h3{font-size:12px;letter-spacing:.05em;margin:0 0 5px;font-weight:700}'+
    '.drawing svg{width:100%;flex:1;min-height:0;max-height:5.2in;display:block}.legend{font-size:10.5px;color:#161b22;margin:11px 0 4px;line-height:1.3}'+
    '.loose{font-size:10.5px;font-weight:700;margin:5px 0}.warning{border:2px solid #111827;padding:5px 8px;font-weight:700;font-size:11px;margin:4px 0}'+
    '.footer{font-size:9px;border-top:1px solid #111827;padding-top:6px;margin-top:auto;text-align:right;color:#111827}'+
    '.layout-sheet{page:layout;height:7.5in;display:flex;flex-direction:column;break-inside:avoid;page-break-inside:avoid;overflow:hidden}'+
    '.layout-sheet h1{font-size:22px;margin:9px 0 2px}.layout-sheet h2{font-size:16px;margin:0 0 5px}.layout-dates{font-size:11px;margin:0 0 8px}'+
    '.layout-drawing{border:2px solid #111827;flex:1;min-height:0;padding:7px}.layout-drawing svg{display:block;width:100%;height:100%}'+
    '.layout-key{border-collapse:collapse;width:100%;font-size:10px;margin-top:8px;table-layout:fixed}.layout-key th,.layout-key td{text-align:left;border-bottom:1px solid #cbd5e1;padding:3px 5px;overflow-wrap:anywhere}.layout-key th:nth-child(1){width:5%}.layout-key th:nth-child(2){width:42%}'+
    '.layout-footer{font-size:9px;color:#334155;margin-top:7px}'+
    '@media screen{body{background:#e5e7eb;padding:20px}.sheet{width:8.5in;height:11in;background:#fff;margin:0 auto 22px;padding:.45in;box-shadow:0 2px 12px #9ca3af}.layout-sheet{width:11in;height:8.5in;background:#fff;margin:0 auto 22px;padding:.45in;box-shadow:0 2px 12px #9ca3af}}'+
    '@media print{html,body{background:#fff!important}.sheet{height:9.7in!important;page-break-after:always}.sheet:last-child{page-break-after:auto}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'+
    '</style></head><body>'+pages+layoutPage(title, layoutStages, dates)+'</body></html>';
}

/** A hidden print frame prevents printing the whole ShowPilot UI and extra blank pages. */
export function printCrewPages(eventName:string,stages:readonly CrewPrintStage[],dates:CrewScheduleDates = {},layoutStages: readonly PositionedLayoutStage[] = []):void {
  if(!stages.length)throw new Error("Set up at least one stage before printing.");
  const frame=document.createElement("iframe");
  frame.title="ShowPilot crew print document";
  frame.setAttribute("aria-hidden","true");
  frame.style.cssText="position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
  const cleanup=()=>{try{frame.remove()}catch{}};
  frame.onload=()=>{
    const w=frame.contentWindow;
    if(!w){cleanup();return}
    w.addEventListener("afterprint",cleanup,{once:true});
    w.focus();w.print();
  };
  // Assign srcdoc before attaching: avoid printing the initial empty iframe document.
  frame.srcdoc=crewPrintDocument(eventName,stages,dates,layoutStages);
  document.body.appendChild(frame);
}
