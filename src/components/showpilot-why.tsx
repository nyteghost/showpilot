import type {ReactNode} from "react";
import {CircleHelp} from "lucide-react";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger} from "@/components/ui/dialog";

/** Accessible explanation dialog. A centered, scrollable overlay avoids the
 * tiny calendar cells clipping or covering adjacent operational information. */
export function ShowPilotWhy({label,children}:{label:string;children:ReactNode}){
 return <Dialog>
  <DialogTrigger asChild>
   <button type="button" aria-label={"Why? "+label} title={"Why was "+label+" selected?"}
    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
    <CircleHelp size={15} aria-hidden="true"/>
   </button>
  </DialogTrigger>
  <DialogContent className="max-h-[min(80vh,40rem)] overflow-y-auto sm:max-w-lg">
   <DialogHeader>
    <DialogTitle className="break-words text-base">Why? {label}</DialogTitle>
    <DialogDescription>Source information and reasoning to verify against your event documents.</DialogDescription>
   </DialogHeader>
   <div className="space-y-2 break-words text-sm">{children}</div>
  </DialogContent>
 </Dialog>;
}
