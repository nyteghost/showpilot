/** UI-only acknowledgement of an exact rule finding.
 * No EOC, schedule, operating rule, or AI memory is edited by OK. */
export const FINDING_ACK_KEY="showpilot:today:acknowledged-findings:v1";
export type AcknowledgedFinding={key:string;at:string};
export function findingKey(source:"rule"|"source",text:string):string{
 // The entire displayed finding is the identity: if its evidence, date or
 // explanation changes, it will reappear for a fresh acknowledgement.
 let hash=2166136261;
 const full=source+"|"+text.trim();
 for(let i=0;i<full.length;i++){
  hash^=full.charCodeAt(i);
  hash=Math.imul(hash,16777619);
 }
 return source+":"+full.length+":"+(hash>>>0).toString(16);
}
export function readFindingAcknowledgements(storage:Pick<Storage,"getItem">):AcknowledgedFinding[]{
 try{
  const parsed:unknown=JSON.parse(storage.getItem(FINDING_ACK_KEY)??"[]");
  if(!Array.isArray(parsed))return [];
  return parsed.filter((x):x is AcknowledgedFinding=>
   !!x&&typeof x==="object"&&
   typeof x.key==="string"&&/^(rule|source):[0-9]+:[0-9a-f]+$/.test(x.key)&&
   typeof x.at==="string"&&/^\d{4}-\d{2}-\d{2}T/.test(x.at)).slice(-500);
 }catch{return []}
}
export function acknowledgeFinding(
 records:readonly AcknowledgedFinding[],key:string,at:string
):AcknowledgedFinding[]{
 if(records.some(x=>x.key===key))return [...records];
 return [...records,{key,at}].slice(-500);
}
