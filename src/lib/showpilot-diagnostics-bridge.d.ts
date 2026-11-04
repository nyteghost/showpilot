/** Read-only status facade; contains no user files, paths or note contents. */
export type NativeMemoryDiagnostics={
 sqliteIntegrityOK:boolean;schemaOK:boolean;exportRoundtripOK:boolean;
 activeNoteCount:number;archivedNoteCount:number;historicalCount:number;postConCount:number;
 weeklyBackupEnabled:boolean;backupFolderAccessible:boolean;
 backupCount:number;latestBackupValid:boolean;latestBackupAgeDays:number;
};
export type NativeDiagnostics={
 desktop:true;platform:"Windows"|"Linux"|"macOS"|"Other";
 architecture:"x64"|"arm64"|"Other";appVersion:string;electronMajor:number;
 gpuFeatures:Record<string,string>;
 memory:NativeMemoryDiagnostics|null;memoryError:boolean;
};
declare global{interface Window{showpilotDiagnostics?:{inspect():Promise<NativeDiagnostics>}}}
export {};
