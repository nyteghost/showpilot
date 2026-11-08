import type {ReviewProject} from "./showpilot-review";

/** Offline Windows portable workspace backup. The file is stored in
 * Electron userData and is not cleared by replacing the app ZIP. */
export type ScheduleSessionSnapshot={
 project:ReviewProject; savedAt:string;
 templateBytes:Uint8Array|null; templateMissing:boolean;
};
export type ScheduleSessionApi={
 load:()=>Promise<ScheduleSessionSnapshot|null>;
 save:(project:ReviewProject)=>Promise<{saved:true;savedAt:string}>;
 saveTemplate:(bytes:ArrayBuffer)=>Promise<{saved:true;bytes:number}>;
 saveOverviewWorkbook:(bytes:ArrayBuffer)=>Promise<{saved:true;bytes:number}>;
 readOverviewWorkbook:()=>Promise<Uint8Array|null>;
};
declare global{interface Window{showpilotScheduleSession?:ScheduleSessionApi}}
export {};
