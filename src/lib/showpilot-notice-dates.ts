/** Calendar day on the operator's PC, not UTC (which can advance early). */
export function localNoticeDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

/** Display-only scope; historical records remain available to review/export. */
export function currentNoticeEntries<T extends {date:string}>(entries:readonly T[],today=localNoticeDate()):T[] {
  return entries.filter(entry => entry.date >= today);
}
