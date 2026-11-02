import type { ComponentProps } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Keep an already opened work tab in the React tree while it is hidden.
 * Radix defaults to unmounting inactive content, discarding imported local
 * File objects, schedule edits, and ongoing booth placement questions.
 * Parent controls which tabs have ever been visited to avoid eager loading.
 */
export function KeepAliveTabContent({ className, ...props }: ComponentProps<typeof TabsContent>) {
  return <TabsContent {...props} forceMount className={cn("data-[state=inactive]:hidden", className)} />;
}
