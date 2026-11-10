import {z} from "zod";
import type {StaffingPolicy} from "./staffing";

/** Experimental Claude scheduling preferences: operator-controlled, local
 * and included in ShowPilot's allowlisted work backup. */
export const CLAUDE_POLICY_KEY="showpilot:claude:staffing-policy:v1";
const days=z.array(z.number().int().min(0).max(6)).max(7);
export const ClaudeStaffingSettingsSchema=z.object({
 coverBookingClose:z.boolean().default(true),
 respectExistingOff:z.boolean().default(true),
 managerRegularLine:z.boolean().default(false),
 managerMayWorkAlone:z.boolean().default(false),
 attendanceThreshold:z.number().int().positive().max(1000000).nullable().default(null),
 preferredDaysOffByName:z.record(days).default({}),
 usualWeekdaysByName:z.record(days).default({}),
 aliasesByName:z.record(z.array(z.string().trim().min(1).max(100)).max(8)).default({})
}).strict();
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
