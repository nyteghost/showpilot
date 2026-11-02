import type {AiProviderId} from "@/lib/showpilot-ai-providers";
export type AiStatus = {available:boolean;providers:string[]};
export type AiTaskContext = {
 date:string;
 dates:string[];
 rooms:string[];
 events:{date:string;room:string;title:string;phase:string;time:string}[];
 surroundingEvents:{
  previousWeek:{date:string;room:string;title:string;phase:string;time:string}[];
  currentWeekOtherDates:{date:string;room:string;title:string;phase:string;time:string}[];
  followingWeek:{date:string;room:string;title:string;phase:string;time:string}[];
 };
 contextWindow:{from:string;to:string};
 totals:{selected:number;previous:number;currentWeekOther:number;following:number};
};
export type AiRawResponse = {suggestions:unknown[]};
export interface ShowPilotAiBridge {
 status():Promise<AiStatus>;
 saveKey(provider:AiProviderId,key:string):Promise<AiStatus>;
 removeKey(provider:AiProviderId):Promise<AiStatus>;
 suggestTasks(provider:AiProviderId,context:AiTaskContext):Promise<AiRawResponse>;
}
declare global {interface Window {showpilotAI?:ShowPilotAiBridge}}
export {};
