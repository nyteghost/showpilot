import type {ReactNode} from "react";
import {CircleHelp} from "lucide-react";

/** Small keyboard-accessible disclosure: explain the source and inference
 * behind a field rather than silently claiming an AI-selected answer. */
export function ShowPilotWhy({label,children}:{label:string;children:ReactNode}){
 return <details className="group relative inline-block align-middle">
  <summary aria-label={"Why? "+label} title={"Why was "+label+" selected?"}
   className="inline-flex size-5 cursor-pointer list-none items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
   <CircleHelp size={15} aria-hidden="true"/>
  </summary>
  <div className="absolute right-0 z-30 mt-1 w-[min(24rem,calc(100vw-4rem))] max-h-72 overflow-y-auto rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-xl">
   <p className="mb-2 font-semibold">Why? {label}</p>
   <div className="space-y-2 break-words">{children}</div>
  </div>
 </details>;
}
