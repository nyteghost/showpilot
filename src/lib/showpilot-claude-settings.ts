import {z} from "zod";
import type {StaffingPolicy} from "./staffing";

/** Experimental Claude scheduling preferences: operator-controlled, local
 * and included in ShowPilot's allowlisted work backup. */
export const CLAUDE_POLICY_KEY="showpilot:claude:staffing-policy:v1";
const days=z.array(z.number().int().min(0).max(6)).max(7);
const isoDay=z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).refine(value=>{
 const d=new Date(value+"T12:00:00Z");
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
},"Enter a real calendar date.");
const personName=z.string().trim().min(2).max(90).refine(x=>!/[<>\\x00-\\x1f]/.test(x));
export const CustomSchedulePersonSchema=z.object({
 name:personName,
 badge:z.string().trim().max(30).default(""),
 title:z.string().trim().min(2).max(100),
 start:z.number().int().min(0).max(1439),
 end:z.number().int().min(1).max(1680),
 usualWeekdays:days,
 notAlone:z.boolean().default(true)
}).strict().refine(x=>x.end-x.start>=120&&x.end-x.start<=840,{
 message:"Choose a shift between 2 and 14 hours.",path:["end"]
});
export const ScheduleDayOverrideSchema=z.object({
 date:isoDay,
 name:personName,
 action:z.enum(["off","shift"]),
 start:z.number().int().min(0).max(1439).optional(),
 end:z.number().int().min(1).max(1680).optional()
}).strict().superRefine((x,ctx)=>{
 if(x.action==="shift"&&
    (x.start===undefined||x.end===undefined||x.end-x.start<120||x.end-x.start>840))
  ctx.addIssue({code:"custom",message:"A manual shift needs valid start/end times (2–14 hours)."});
 if(x.action==="off"&&(x.start!==undefined||x.end!==undefined))
  ctx.addIssue({code:"custom",message:"An OFF override cannot contain shift times."});
});

export const ClaudeStaffingSettingsSchema=z.object({
 coverBookingClose:z.boolean().default(true),
 respectExistingOff:z.boolean().default(true),
 managerRegularLine:z.boolean().default(false),
 managerMayWorkAlone:z.boolean().default(false),
 attendanceThreshold:z.number().int().positive().max(1000000).nullable().default(null),
 preferredDaysOffByName:z.record(days).default({}),
 usualWeekdaysByName:z.record(days).default({}),
 aliasesByName:z.record(z.array(z.string().trim().min(1).max(100)).max(8)).default({}),
 extraPeople:z.array(CustomSchedulePersonSchema).max(30).default([]),
 excludedPeople:z.array(personName).max(70).default([]),
 dayOverrides:z.array(ScheduleDayOverrideSchema).max(600).default([])
}).strict().superRefine((value,ctx)=>{
 const names=new Set<string>();
 for(const person of value.extraPeople){
  const normalized=person.name.toLowerCase();
  if(names.has(normalized))ctx.addIssue({code:"custom",message:"Duplicate scheduling person: "+person.name});
  names.add(normalized);
 }
 const seen=new Set<string>();
 for(const entry of value.dayOverrides){
  const key=entry.date+"|"+entry.name.toLowerCase();
  if(seen.has(key))ctx.addIssue({code:"custom",message:"Only one manual override per person and date."});
  seen.add(key);
 }
});
export type ClaudeStaffingSettings=z.infer<typeof ClaudeStaffingSettingsSchema>;
export const DEFAULT_CLAUDE_SETTINGS:ClaudeStaffingSettings=ClaudeStaffingSettingsSchema.parse({});
export function readClaudeSettings(storage:Pick<Storage,"getItem">|undefined=
 typeof window==="undefined"?undefined:window.localStorage):ClaudeStaffingSettings{
 try{
  const raw=storage?.getItem(CLAUDE_POLICY_KEY);
  return raw?ClaudeStaffingSettingsSchema.parse(JSON.parse(raw)):DEFAULT_CLAUDE_SETTINGS;
 }catch{return DEFAULT_CLAUDE_SETTINGS;}
}
export function saveClaudeSettings(value:ClaudeStaffingSettings,
 storage:Pick<Storage,"setItem">|undefined=
 typeof window==="undefined"?undefined:window.localStorage):ClaudeStaffingSettings{
 const valid=ClaudeStaffingSettingsSchema.parse(value);
 if(storage)storage.setItem(CLAUDE_POLICY_KEY,JSON.stringify(valid));
 return valid;
}
export function asStaffingPolicy(value:ClaudeStaffingSettings):StaffingPolicy{
 return value;
}
