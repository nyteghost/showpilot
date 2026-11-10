/** Export UI gating only. The workbook writer remains authoritative for
 * validating CGC row structure, names, selected dates and existing shifts. */
export type ExportMasterKind="original"|"approved";
export type SavedMasterStatus="checking"|"saved"|"missing"|"error"|"unavailable";
export function activeExportMaster(kind:ExportMasterKind,hasUploadedOriginal:boolean):ExportMasterKind{
 return kind==="original"&&hasUploadedOriginal?"original":"approved";
}
export function canUseExportMaster(kind:ExportMasterKind,hasUploadedOriginal:boolean,
 saved:SavedMasterStatus):boolean{
 return kind==="original"?hasUploadedOriginal:saved==="saved";
}
