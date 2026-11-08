/** Bounded, read-only rule evidence for optional local AI review. */
import type {Shift,EventEntry,TaskNote} from "./work-tools";
import type {Store} from "./vendors";
import {landed,ranked} from "./vendors";
export type RuleReviewDomain="shifts"|"calendar"|"vendors"|"imports"|"exports"|"event-schedule";
export type RuleEvidence={domain:RuleReviewDomain;label:string;findings:string[]};
const clean=(s:string,n=160)=>s.replace(/[\u0000-\u001f]+/g," ").trim().slice(0,n);
export function boundedEvidence(evidence:RuleEvidence):RuleEvidence{
 return {domain:evidence.domain,label:clean(evidence.label,100),
  findings:evidence.findings.filter(Boolean).slice(0,18).map(x=>clean(x,300))};
}
export function shiftRuleEvidence(shifts:readonly Shift[],removedCount=0):RuleEvidence{
 const findings=["Current shift count: "+shifts.length,
  "Removed shifts: "+removedCount+". Existing Google Calendar events are NOT deleted automatically."];
 const ids=new Set<string>();
 for(const s of shifts.slice(0,14)){
  findings.push("Shift "+s.date+" "+s.start+"–"+s.end+" minutes after midnight");
  if(s.id){if(ids.has(s.id))findings.push("Duplicate shift identifier detected: "+s.id);ids.add(s.id);}
  if(s.end-s.start>16*60)findings.push("Unusually long shift on "+s.date);
  if(s.end<=s.start)findings.push("Nonpositive shift duration on "+s.date);
 }
 return boundedEvidence({domain:"shifts",label:"My Shifts rules",findings});
}
export function calendarRuleEvidence(shifts:readonly Shift[],title:string,kind:"ics"|"google"):RuleEvidence{
 return boundedEvidence({domain:"calendar",label:kind==="ics"?"Calendar .ics export":"Google Calendar sync",
  findings:[
   "Destination: "+(kind==="ics"?"Local ICS file":"Google Calendar ShowPilot-managed events"),
   "Event title: "+clean(title,90),"Shift count: "+shifts.length,
   "Calendar timezone: America/New_York",
   "Shifts with stable IDs: "+shifts.filter(s=>Boolean(s.id)).length+" of "+shifts.length,
   "Google sync can update or create but never automatically deletes old events.",
   "Manually importing ICS more than once can create duplicates.",
   ...shifts.slice(0,7).map(s=>s.date+" "+s.start+"–"+s.end+" minutes after midnight")
  ]});
}
export function vendorRuleEvidence(store:Store):RuleEvidence{
 const findings=["Purchase/rental items: "+store.items.length];
 for(const item of store.items.slice(0,9)){
  const offers=ranked(item),priced=offers.filter(o=>landed(o)!==undefined);
  findings.push(clean(item.name,65)+" ("+(item.kind||"buy")+") "+
   "quotes="+item.offers.length+" lowest landed cost="+
   (priced.length?String(landed(priced[0]!)):"unknown")+
   " vendor="+(priced.length?clean(priced[0]!.vendor,65):"unknown")+
   ". Quote age, availability, tax and terms are not verified.");
  for(const quote of offers.slice(0,2))
   findings.push(clean(item.name,55)+": "+clean(quote.vendor,55)+
    " price="+quote.price+" shipping="+quote.shipping+" checked="+clean(quote.checked||"unknown",30));
 }
 return boundedEvidence({domain:"vendors",label:"Vendor ranking rules",findings});
}
export function eventScheduleRuleEvidence(entries:readonly EventEntry[],tasks:readonly TaskNote[],status:string):RuleEvidence{
 const dates=new Set(entries.map(e=>e.date)),rooms=new Set(entries.map(e=>e.space));
 return boundedEvidence({domain:"event-schedule",label:"Event Schedule import and review",
  findings:[
   "Reviewed entries: "+entries.length+"; days: "+dates.size+"; distinct room rows: "+rooms.size,
   "Dated task suggestions: "+tasks.length,"Import/review status: "+clean(status,240),
   "Only CGC records are permitted. CEPAC records must be excluded.",
   ...entries.slice(0,8).map(e=>e.date+" "+e.space+" "+e.code+" "+clean(e.title,70)),
   ...tasks.slice(0,6).map(t=>t.date+" "+t.section+" "+clean(t.text,95))
  ]});
}
export function exportRuleEvidence(kind:string,entries:number,dates:number,status:string):RuleEvidence{
 return boundedEvidence({domain:"exports",label:"Excel export validation",findings:[
  "Export kind: "+clean(kind,80),"Entries: "+entries,"Selected days: "+dates,
  "Current validation status: "+clean(status,220),
  "Original Excel template is formatting authority. Existing shifts and PTO must be preserved.",
  "Unapproved rooms and non-CGC events must not be silently exported."]});
}
