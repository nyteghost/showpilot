import type {EventFileRecord,EventFileKind,EocExcerpt} from "./showpilot-event-assets";
/** Private ShowPilot SQLite-backed memory, with portable JSON import and export. */
export type MemoryCategory="Stage Setups"|"Ballroom Configurations"|"Recurring Events"|"Engineering Procedures"|"Approved Tasks"|"Lessons Learned";
export type MemoryStatus={configured:boolean;available:boolean;storage:"sqlite";databasePath:string;vault:string;rememberTasks:boolean;rememberStages:boolean;rememberExports:boolean;noteCount:number;historicalCount:number;postConCount:number;showCatalogCount:number;eventFileCount:number;migratedCount:number;archivedCount:number;weeklyBackupEnabled:boolean;backupFolder:string;lastBackupAt:string;backupError:string;error?:string};
export type MemorySummary={id:string;category:MemoryCategory;title:string;excerpt:string;modified:string};
export type MemoryReference={id:string;category:MemoryCategory;title:string;excerpt:string};
export type MemoryDraft={category:MemoryCategory;title:string;content:string};
export type MemoryImportResult={cancelled?:boolean;notesAdded?:number;historyAdded?:number;notesSeen?:number;historySeen?:number};
export type PostConReport={
 id?:string;eventId:string;showName:string;showDate:string;rooms:string;
 rating:number;wentWell:string;issues:string;staffing:string;stage:string;floor:string;followUp:string;
 created?:string;modified?:string;
};
export type ShowCatalogRecord={key:string;eventId:string;showName:string;showDate:string;rooms:string;startDate?:string};
export type EventZipInspection={
 files:{path:string;name:string;bytes:number;kind:EventFileKind}[];
 ignored:string[];manifest:null|{showName:string;eventId:string;startDate:string;showDate:string;rooms:string};totalBytes:number;
};
export type EventZipScan={sources:({path:string;format:"text";text:string}|{path:string;format:"pdf";bytes:Uint8Array})[];skipped:string[];manifest:EventZipInspection["manifest"]};
export type EventZipImportResult={
 eventKey:string;imported:{id:string;name:string;kind:EventFileKind;extension:string}[];
 duplicates:string[];ignored:string[];errors:{name:string;error:string}[];
};
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
 backupNow():Promise<{created:boolean;reason?:string;path?:string;lastBackupAt?:string;notes?:number;archived?:number;history?:number}>;
 setWeeklyBackup(enabled:boolean):Promise<MemoryStatus>;
 chooseBackupFolder():Promise<MemoryStatus>;
 openBackupFolder():Promise<{opened:true}>;
 rememberSchedule(payload:{entries:readonly unknown[];tasks:readonly unknown[]}):Promise<{saved:boolean;eventsAdded?:number;reason?:string}>;
 postConList():Promise<(PostConReport & {id:string})[]>;
 postConSave(report:PostConReport):Promise<{id:string;saved:true}>;
 postConArchive(id:string):Promise<{archived:true}>;
 showCatalogList():Promise<ShowCatalogRecord[]>;
 showCatalogSave(shows:readonly ShowCatalogRecord[]):Promise<{saved:true;added:number;total:number}>;
 eventFileList(eventKey:string,includeArchived?:boolean):Promise<(EventFileRecord&{available:boolean})[]>;
 eventFileSave(input:{eventKey:string;kind:EventFileKind;name:string;bytes:ArrayBuffer;eocExcerpts?:EocExcerpt[]}):Promise<EventFileRecord&{available:true}>;
 eventFileOpen(id:string):Promise<{opened:true}>;
 eventFileRead(id:string):Promise<{bytes:Uint8Array;extension:string;name:string}>;
 eventFileArchive(id:string,archived?:boolean):Promise<{archived:boolean}>;
 eventZipInspect(bytes:ArrayBuffer):Promise<EventZipInspection>;
 eventZipScan(bytes:ArrayBuffer):Promise<EventZipScan>;
 eventZipImport(input:{eventKey:string;bytes:ArrayBuffer}):Promise<EventZipImportResult>;
 eventFileSetEocExcerpts(id:string,excerpts:EocExcerpt[]):Promise<{saved:true;count:number}>;
 openFolder():Promise<{opened:true}>;
};
declare global{interface Window{showpilotMemory?:MemoryBridge}}
export {};
