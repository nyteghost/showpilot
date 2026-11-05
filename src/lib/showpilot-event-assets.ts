/** Local event file categories. Original documents are always preserved.
 * EOC summaries are a reading aid only; the PDF remains authoritative.
 */
export const EVENT_FILE_KINDS=["work-order","eoc","diagram","other"] as const;
export type EventFileKind=typeof EVENT_FILE_KINDS[number];
export type EocSection="Event Notes"|"Engineering"|"Utility";
export type EocExcerpt={section:EocSection;page:number;text:string};
export type EventFileRecord={
 id:string;eventKey:string;kind:EventFileKind;name:string;extension:string;
 bytes:number;created:string;sha256:string;eocExcerpts:EocExcerpt[];archived?:boolean;
};
export const EVENT_ALLOWED_EXTENSIONS=["pdf","png","jpg","jpeg","webp","docx","xlsx","xls","csv","txt","dwg","dxf"] as const;
export const EVENT_MAX_FILE_BYTES=25*1024*1024;
export const kindTitle=(kind:EventFileKind)=>kind==="work-order"?"Work orders":kind==="eoc"?"Event Order Confirmations (EOCs)":kind==="diagram"?"Diagrams and event layouts":"Other event documents";
export function guessEventFileKind(name:string):EventFileKind{
 const s=name.toLowerCase();
 if(/\beoc\b|event[\s_-]*order[\s_-]*confirmation/.test(s))return "eoc";
 if(/\bwo\b|work[\s_-]*order|utility[\s_-]*order/.test(s))return "work-order";
 if(/diagram|layout|floor[\s_-]*plan|seating[\s_-]*plan|room[\s_-]*set|drawing/.test(s)||/\.(?:dwg|dxf)$/i.test(s))return "diagram";
 return "other";
}
export function validateEventFile(file:Pick<File,"name"|"size">):void{
 const extension=file.name.split(".").pop()?.toLowerCase()??"";
 if(!EVENT_ALLOWED_EXTENSIONS.some(ext=>ext===extension))
  throw new Error("Unsupported file type. Use PDF, image, Word, Excel, text, CSV, DWG or DXF.");
 if(file.size<1||file.size>EVENT_MAX_FILE_BYTES)
  throw new Error(file.name+": each event file must be between 1 byte and 25 MB.");
}
/** Testable, page-aware parser; no hallucinated EOC content is generated.
 * We deliberately show sections with their source page numbers and leave
 * ambiguous or scanned PDFs to the original attachment viewer.
 */
export function extractEocFocus(pages:readonly string[]):EocExcerpt[]{
 const headings:Array<{name:EocSection;re:RegExp}>=[
  {name:"Event Notes",re:/^\s*(?:event\s+notes?|notes?\s*[-–:]\s*event)\s*(?:[:：–-]\s*(.*))?$/i},
  {name:"Engineering",re:/^\s*(?:engineering|engineering\s+notes?|engineering\s+requirements?)\s*(?:[:：–-]\s*(.*))?$/i},
  {name:"Utility",re:/^\s*(?:utilities|utility|utility\s+orders?|utility\s+services?)\s*(?:[:：–-]\s*(.*))?$/i}
 ];
 const result:EocExcerpt[]=[];
 for(let i=0;i<Math.min(pages.length,80);i++){
  let current:EocSection|null=null;
  const data=new Map<EocSection,string[]>();
  for(const raw of pages[i]!.split(/\r?\n/)){
   const line=raw.replace(/\s+/g," ").trim();
   if(!line)continue;
   const section=headings.find(h=>h.re.test(line));
   if(section){current=section.name; if(!data.has(current))data.set(current,[]);
    const suffix=line.match(section.re)?.[1]?.trim();
    if(suffix)data.get(current)!.push(suffix);
    continue;
   }
   if(/^(?:event information|billing|payment|catering|audio visual|security|status|contacts|client information|general information|charges|total|signature|instructions|schedule|event times|exhibitor information|terms and conditions)\s*:?\s*$/i.test(line)){
    current=null;continue;
   }
   if(current){
    const lines=data.get(current)!;
    if(lines.join(" ").length<1200)lines.push(line.slice(0,360));
   }
  }
  for(const [section,lines] of data){
   if(lines.length)result.push({section,page:i+1,text:lines.join("\n").slice(0,1200)});
  }
 }
 return result.slice(0,45);
}
export async function extractEocFromPdf(file:File):Promise<EocExcerpt[]>{
 if(!/\.pdf$/i.test(file.name))return [];
 const pdfjs=await import("pdfjs-dist");
 const bytes=await file.arrayBuffer();
 const task=pdfjs.getDocument({data:bytes});
 try{
  const doc=await task.promise;
  const pages:string[]=[];
  for(let page=1;page<=Math.min(doc.numPages,80);page++){
   const content=await (await doc.getPage(page)).getTextContent();
   const tokens=(content.items as Array<{str?:string;transform?:number[]}>)
    .filter(t=>typeof t.str==="string"&&t.str.trim())
    .map(t=>({text:t.str!,y:t.transform?.[5]??0}));
   // Use approximate PDF text-row grouping while preserving page breaks.
   const rows=new Map<number,string[]>();
   for(const t of tokens){
    const key=Math.round(t.y/3)*3;
    rows.set(key,[...(rows.get(key)??[]),t.text]);
   }
   pages.push([...rows.entries()].sort((a,b)=>b[0]-a[0]).map(([,line])=>line.join(" ").trim()).join("\n"));
  }
  return extractEocFocus(pages);
 }finally{await task.destroy();}
}
