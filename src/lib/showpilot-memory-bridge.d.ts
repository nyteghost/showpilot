/** Narrow interface: only named ShowPilot memory notes in a user-chosen Obsidian vault. */
export type MemoryCategory="Stage Setups"|"Ballroom Configurations"|"Recurring Events"|"Engineering Procedures"|"Approved Tasks"|"Lessons Learned";
export type MemoryStatus={configured:boolean;available:boolean;vault:string;rememberTasks:boolean;rememberStages:boolean;error?:string};
export type MemorySummary={id:string;category:MemoryCategory;title:string;excerpt:string;modified:string};
export type MemoryReference={id:string;category:MemoryCategory;title:string;excerpt:string};
export type MemoryDraft={category:MemoryCategory;title:string;content:string};
export type MemoryBridge={
 status():Promise<MemoryStatus>;
 createDefault():Promise<MemoryStatus>;
 choose():Promise<MemoryStatus>;
 preferences(value:{rememberTasks:boolean;rememberStages:boolean}):Promise<MemoryStatus>;
 list(query:string):Promise<MemorySummary[]>;
 search(query:string):Promise<MemoryReference[]>;
 read(id:string):Promise<{id:string;content:string}>;
 save(note:MemoryDraft):Promise<{id:string;title:string;category:MemoryCategory}>;
 edit(id:string,content:string):Promise<{id:string;content:string}>;
 archive(id:string):Promise<{archived:true}>;
 openFolder():Promise<{opened:true}>;
};
declare global{interface Window{showpilotMemory?:MemoryBridge}}
export {};
