import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import type {PreviewWorkbook} from "@/lib/showpilot-excel-preview";

export function ShowPilotExcelPreview({open,onOpenChange,book,title}:{open:boolean;onOpenChange:(value:boolean)=>void;book:PreviewWorkbook|null;title:string}){
 const [name,setName]=useState("");
 const [zoom,setZoom]=useState(85);
 const sheet=book?.sheets.find(s=>s.name===name)??book?.sheets[0];
 return <Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-3 overflow-hidden p-4">
   <DialogHeader>
    <DialogTitle>Excel preview — {title}</DialogTitle>
    <DialogDescription>Rendered from the actual generated Excel workbook. Changes here do not edit the schedule. Colors, merged cells and date/room labels are shown; Excel remains the final print-layout reference.</DialogDescription>
   </DialogHeader>
   {sheet&&<>
    <div className="flex flex-wrap items-center gap-3 text-sm">
     <label className="flex items-center gap-2">Worksheet
      <select className="rounded border bg-background p-2" value={sheet.name} onChange={e=>setName(e.target.value)}>
       {book!.sheets.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
      </select>
     </label>
     <label className="flex items-center gap-2">Zoom
      <input type="range" min="50" max="150" step="10" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/>
      <span className="min-w-12">{zoom}%</span>
     </label>
     <Button size="sm" variant="outline" onClick={()=>setZoom(85)}>Reset zoom</Button>
     <span className="text-xs text-muted-foreground">{sheet.rows.length} rows shown{sheet.truncated?" (first 160 only)":""}</span>
    </div>
    <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-white text-black" aria-label="Excel worksheet preview">
     <div style={{zoom:zoom/100,display:"inline-block",minWidth:"100%"}}>
      <table className="border-collapse text-[11px] leading-tight" style={{tableLayout:"fixed"}}>
       <colgroup>{sheet.widths.map((width,i)=><col key={i} style={{width,minWidth:width}}/>)}</colgroup>
       <tbody>
        {sheet.rows.map((row,y)=><tr key={y} style={{height:row.height}}>
         {row.cells.map((cell,x)=>cell.hidden?null:<td
          key={x} colSpan={cell.colSpan} rowSpan={cell.rowSpan} title={cell.text}
          className="border border-[#444] px-1 text-center align-middle whitespace-pre-line break-words"
          style={{
           backgroundColor:cell.fill??"#ffffff",
           color:cell.ink??"#121212",
           fontWeight:cell.bold?700:400,
           fontStyle:cell.italic?"italic":"normal",
           minHeight:row.height,
           overflowWrap:"anywhere"
          }}>{cell.text}</td>)}
        </tr>)}
       </tbody>
      </table>
     </div>
    </div>
    <p className="text-xs text-muted-foreground">Previewing {sheet.name}. This preview does not execute Excel formulas and may not display every print setting or conditional format.</p>
   </>}
  </DialogContent>
 </Dialog>;
}
