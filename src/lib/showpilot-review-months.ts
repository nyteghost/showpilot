/** Month-only view filters for Event Schedule review. The underlying review/export is never truncated. */
export function reviewMonthOf(date: string | undefined | null): string | null {
  if (typeof date !== "string" || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)) return null;
  return date.slice(0,7);
}
export function availableReviewMonths(...collections: ReadonlyArray<readonly {date:string}[]>):string[] {
  return [...new Set(collections.flatMap(items=>items.map(x=>reviewMonthOf(x.date)).filter((v):v is string=>v!==null)))].sort();
}
export function selectedReviewMonth(months: readonly string[], choice: string, now: Date = new Date()): string {
  if (choice === "all") return "";
  if (months.includes(choice)) return choice;
  const current = now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0");
  return months.includes(current)?current:(months[0]??"");
}
export function reviewMatchesMonth<T extends {date:string}>(line:{source?:T|null;final?:T|null},month:string):boolean {
  return !month || reviewMonthOf(line.source?.date)===month || reviewMonthOf(line.final?.date)===month;
}
export function reviewMonthLabel(month:string):string {
  const [year,monthNum]=month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(year,monthNum-1,1)));
}

/** All calendar comparisons are UTC date-only, never local-clock time. */
function parseIsoDay(value:string):Date|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const d=new Date(value+"T12:00:00Z");
 return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==value?null:d;
}
function isoDate(d:Date):string{return d.toISOString().slice(0,10)}
export function reviewWeekStart(date:string):string|null{
 const d=parseIsoDay(date);
 if(!d)return null;
 const daysFromMonday=(d.getUTCDay()+6)%7;
 d.setUTCDate(d.getUTCDate()-daysFromMonday);
 return isoDate(d);
}
export function shiftReviewWeek(monday:string,direction:-1|1):string|null{
 const d=parseIsoDay(monday);
 if(!d)return null;
 d.setUTCDate(d.getUTCDate()+direction*7);
 return isoDate(d);
}
export function availableReviewWeeks(...collections:ReadonlyArray<readonly {date:string}[]>):string[]{
 return [...new Set(collections.flatMap(items=>items.map(x=>reviewWeekStart(x.date)).filter((v):v is string=>v!==null)))].sort();
}
export function selectedReviewWeek(weeks:readonly string[],choice:string,now:Date=new Date()):string{
 if(weeks.includes(choice)||reviewWeekStart(choice)===choice)return choice;
 const current=reviewWeekStart(now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0"));
 return (current&&weeks.includes(current)?current:weeks[0])??"";
}
export function reviewMatchesWeek<T extends {date:string}>(line:{source?:T|null;final?:T|null},week:string):boolean{
 return !week||reviewWeekStart(line.source?.date??"")===week||reviewWeekStart(line.final?.date??"")===week;
}
export function reviewMatchesDay<T extends {date:string}>(line:{source?:T|null;final?:T|null},date:string):boolean{
 return !date||line.source?.date===date||line.final?.date===date;
}
export function reviewWeekLabel(week:string):string{
 const d=parseIsoDay(week);if(!d)return week;
 const end=new Date(d);end.setUTCDate(d.getUTCDate()+6);
 const startLabel=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d);
 const endLabel=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(end);
 return startLabel+" – "+endLabel;
}


/** Scope shared by the schedule review controls and AI Task Assistant.
 * Keep all date calculations UTC/date-only; the assistant must analyze
 * precisely what the review selection includes, without changing exports.
 */
export type ReviewDateScope = {view:"month"|"week"|"day"|"all";value:string};
export function reviewScopeDates<T extends {date:string}>(entries:readonly T[],scope:ReviewDateScope|null):string[]{
 if(!scope)return [];
 return [...new Set(entries.filter(item=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(item.date))return false;
  switch(scope.view){
   case "month":return Boolean(scope.value)&&reviewMonthOf(item.date)===scope.value;
   case "week":return Boolean(scope.value)&&reviewWeekStart(item.date)===scope.value;
   case "day":return Boolean(scope.value)&&item.date===scope.value;
   case "all":return true;
  }
 }).map(e=>e.date))].sort();
}
export function reviewScopeLabel(scope:ReviewDateScope|null):string{
 if(!scope)return "No schedule selected";
 if(scope.view==="month")return scope.value?reviewMonthLabel(scope.value):"No month selected";
 if(scope.view==="week")return scope.value?reviewWeekLabel(scope.value):"No week selected";
 if(scope.view==="day")return scope.value||"No day selected";
 return "All schedule dates";
}
