/** Read-only preview of the exact XLSX produced by the exporter.
 * ExcelJS runs locally in the renderer; no file leaves this computer.
 */
import type {Workbook,Worksheet,Cell} from "exceljs";
export type PreviewCell={text:string;fill?:string;ink?:string;bold:boolean;italic:boolean;rowSpan:number;colSpan:number;hidden?:boolean};
export type PreviewRow={height:number;cells:PreviewCell[]};
export type PreviewSheet={name:string;widths:number[];rows:PreviewRow[];truncated:boolean};
export type PreviewWorkbook={sheets:PreviewSheet[]};
const rgb=(value:unknown):string|undefined=>{
 if(typeof value!=="string"||!/^[0-9a-fA-F]{8}$/.test(value))return undefined;
 return "#"+value.slice(2);
};
const valueText=(cell:Cell):string=>{
 const value=cell.value;
 if(value===null||value===undefined)return "";
 if(value instanceof Date){
  return new Intl.DateTimeFormat("en-US",{timeZone:"UTC",month:"numeric",day:"numeric",year:"2-digit"}).format(value);
 }
 if(typeof value==="number")return Number.isFinite(value)?String(value):"";
 if(typeof value==="string"||typeof value==="boolean")return String(value);
 if(typeof value==="object"){
  if("result" in value&&value.result!==undefined&&value.result!==null)return String(value.result);
  if("richText" in value&&Array.isArray(value.richText))return value.richText.map(v=>v.text??"").join("");
  if("text" in value)return String(value.text??"");
  if("formula" in value)return "="+String(value.formula);
  if("hyperlink" in value)return String(value.hyperlink);
 }
 return "";
};
const cellColor=(cell:Cell):string|undefined=>{
 const fill=cell.fill;
 if(!fill||fill.type!=="pattern"||fill.pattern==="none")return undefined;
 return rgb(fill.fgColor?.argb);
};
export function previewSheet(sheet:Worksheet):PreviewSheet{
 const maxRows=Math.min(160,Math.max(1,sheet.rowCount));
 const maxCols=Math.min(10,Math.max(9,sheet.columnCount));
 const skip=new Set<string>();
 const spans=new Map<string,{r:number;c:number}>();
 for(const range of sheet.model.merges??[]){
  const [from,to]=range.split(":");
  if(!from||!to)continue;
  const a=sheet.getCell(from),b=sheet.getCell(to);
  const top=Number(a.row),left=Number(a.col),bottom=Number(b.row),right=Number(b.col);
  const r=Math.max(1,Math.min(maxRows-top+1,bottom-top+1));
  const c=Math.max(1,Math.min(maxCols-left+1,right-left+1));
  if(top>maxRows||left>maxCols)continue;
  spans.set(top+":"+left,{r,c});
  for(let y=top;y<top+r;y++)for(let x=left;x<left+c;x++){
   if(y!==top||x!==left)skip.add(y+":"+x);
  }
 }
 const rows:PreviewRow[]=[];
 for(let y=1;y<=maxRows;y++){
  const row=sheet.getRow(y);
  const cells:PreviewCell[]=[];
  for(let x=1;x<=maxCols;x++){
   const cell=row.getCell(x),span=spans.get(y+":"+x);
   cells.push({text:skip.has(y+":"+x)?"":valueText(cell).slice(0,650),
    fill:cellColor(cell),ink:rgb(cell.font?.color?.argb),
    bold:!!cell.font?.bold,italic:!!cell.font?.italic,
    rowSpan:span?.r??1,colSpan:span?.c??1,hidden:skip.has(y+":"+x)});
  }
  rows.push({height:Math.min(130,Math.max(18,row.height??20)),cells});
 }
 return {name:sheet.name,widths:Array.from({length:maxCols},(_,i)=>
  Math.min(290,Math.max(66,Math.round((sheet.getColumn(i+1).width??13)*7)))),
  rows,truncated:sheet.rowCount>maxRows};
}
export async function readWorkbookPreview(blob:Blob):Promise<PreviewWorkbook>{
 if(blob.size>25*1024*1024)throw new Error("Workbook is too large to preview (25 MB limit).");
 const ExcelJS=await import("exceljs");
 const wb:Workbook=new ExcelJS.default.Workbook();
 await wb.xlsx.load(await blob.arrayBuffer());
 if(!wb.worksheets.length)throw new Error("The exported workbook contains no sheets.");
 const sheets=wb.worksheets.slice(0,20).map(previewSheet);
 return {sheets};
}
