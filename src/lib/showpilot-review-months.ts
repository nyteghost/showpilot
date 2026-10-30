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
