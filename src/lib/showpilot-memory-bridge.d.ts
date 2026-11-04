/** Private ShowPilot SQLite-backed memory, with portable JSON import and export. */
export type MemoryCategory="Stage Setups"|"Ballroom Configurations"|"Recurring Events"|"Engineering Procedures"|"Approved Tasks"|"Lessons Learned";
export type MemoryStatus={configured:boolean;available:boolean;storage:"sqlite";databasePath:string;vault:string;rememberTasks:boolean;rememberStages:boolean;rememberExports:boolean;noteCount:number;historicalCount:number;migratedCount:number;error?:string};
export type MemorySummary={id:string;category:MemoryCategory;title:string;excerpt:string;modified:string};
export type MemoryReference={id:string;category:MemoryCategory;title:string;excerpt:string};
export type MemoryDraft={category:MemoryCategory;title:string;content:string};
export type MemoryImportResult={cancelled?:boolean;notesAdded?:number;historyAdded?:number;notesSeen?:number;historySeen?:number};
export type MemoryBridge={
 status():Promise<MemoryStatus>;
 preferences(value:{rememberTasks:boolean;rememberStages:boolean;rememberExports:boolean}):Promise<MemoryStatus>;
 list(query:string):Promise<MemorySummary[]>;
 search(query:string):Promise<MemoryReference[]>;
 read(id:string):Promise<{id:string;content:string}>;
 save(note:MemoryDraft):Promise<{id:string;title:string;category:MemoryCategory}>;
 edit(id:string,content:string):Promise<{id:string;content:string}>;
 archive(id:string):Promise<{archived:true}>;
 importJson():Promise<MemoryImportResult>;
 exportJson():Promise<{cancelled?:boolean;saved?:boolean;notes?:number;history?:number}>;
 rememberSchedule(payload:{entries:readonly unknown[];tasks:readonly unknown[]}):Promise<{saved:boolean;eventsAdded?:number;reason?:string}>;
 openFolder():Promise<{opened:true}>;
};
declare global{interface Window{showpilotMemory?:MemoryBridge}}
export {};
