import type {WorkTabId} from "@/components/work-tools";

/** Each tool owns exactly one React component tree. Opening a second window
 * never creates a second copy of a schedule, editor, or Google connection. */
export type WorkspaceWindowId=WorkTabId|"settings";
export const WORKSPACE_IDS:readonly WorkspaceWindowId[]=[
 "today","events","eventhub","shifts","floor","vendors","settings"
];
export type WindowRectangle={x:number;y:number;width:number;height:number;maximized:boolean};
export type WindowBounds={width:number;height:number};
const minimumWidth=360,minimumHeight=260;
const safe=(x:number,otherwise:number)=>Number.isFinite(x)?x:otherwise;
const bounded=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));

export function isWorkspaceWindowId(value:unknown):value is WorkspaceWindowId{
 return typeof value==="string"&&WORKSPACE_IDS.some(x=>x===value);
}
export function focusWorkspaceWindow<T extends WorkspaceWindowId>(open:readonly T[],id:T):T[]{
 return [...open.filter(x=>x!==id),id];
}
export function defaultWindowRectangle(id:WorkspaceWindowId):WindowRectangle{
 const n=WORKSPACE_IDS.indexOf(id);
 return {x:26+(n%5)*44,y:22+(n%5)*33,width:850,height:530,maximized:false};
}
export function clampWindowRectangle(rect:WindowRectangle,bounds:WindowBounds):WindowRectangle{
 const bw=Math.max(1,safe(bounds.width,1)),bh=Math.max(1,safe(bounds.height,1));
 const width=bounded(safe(rect.width,780),Math.min(minimumWidth,bw),bw);
 const height=bounded(safe(rect.height,510),Math.min(minimumHeight,bh),bh);
 return {
  x:bounded(safe(rect.x,0),0,Math.max(0,bw-width)),
  y:bounded(safe(rect.y,0),0,Math.max(0,bh-height)),
  width,height,maximized:rect.maximized===true
 };
}
export function resizeWindowRectangle(rect:WindowRectangle,dx:number,dy:number,bounds:WindowBounds):WindowRectangle{
 return clampWindowRectangle({...rect,width:rect.width+safe(dx,0),height:rect.height+safe(dy,0)},bounds);
}
/** Ignore unknown/malformed saved records. Window geometry is UI-only and
 * cannot change schedules, personnel, OAuth, or repository data. */
export function readSavedWindowRectangles(raw:string|null):Partial<Record<WorkspaceWindowId,WindowRectangle>>{
 if(!raw||raw.length>8000)return {};
 try{
  const payload:unknown=JSON.parse(raw);
  if(!payload||Array.isArray(payload)||typeof payload!=="object")return {};
  const result:Partial<Record<WorkspaceWindowId,WindowRectangle>>={};
  for(const id of WORKSPACE_IDS){
   const r=(payload as Record<string,unknown>)[id];
   if(!r||Array.isArray(r)||typeof r!=="object")continue;
   const x=(r as Record<string,unknown>);
   if([x.x,x.y,x.width,x.height].some(v=>typeof v!=="number"||!Number.isFinite(v)))continue;
   result[id]={x:x.x as number,y:x.y as number,width:x.width as number,height:x.height as number,maximized:x.maximized===true};
  }
  return result;
 }catch{return {}}
}
export function readSavedOpenWindows(raw:string|null):WorkspaceWindowId[]{
 if(!raw||raw.length>2000)return [];
 try{
  const data:unknown=JSON.parse(raw);
  if(!Array.isArray(data))return [];
  return [...new Set(data.filter(isWorkspaceWindowId))].slice(0,WORKSPACE_IDS.length);
 }catch{return []}
}
