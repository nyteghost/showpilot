import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Tabs } from "@/components/ui/tabs";
import { KeepAliveTabContent } from "@/components/showpilot-keep-alive-tab";

describe("ShowPilot workspace tabs keep their content while inactive", () => {
 it("retains inactive Event Schedule markup instead of unmounting it", () => {
  const markup=renderToStaticMarkup(
    <Tabs value="shifts">
      <KeepAliveTabContent value="events"><span data-testid="imported-report">Report already imported</span></KeepAliveTabContent>
      <KeepAliveTabContent value="shifts"><span>Shift editor</span></KeepAliveTabContent>
    </Tabs>
  );
  expect(markup).toContain("Report already imported");
  expect(markup).toContain('data-state="inactive"');
  expect(markup).toContain("data-[state=inactive]:hidden");
  expect(markup).toContain("Shift editor");
 });
 it("keeps the selected Event Schedule content mounted", () => {
  const markup=renderToStaticMarkup(
    <Tabs value="events">
      <KeepAliveTabContent value="events"><span>Reviewed engineering schedule</span></KeepAliveTabContent>
      <KeepAliveTabContent value="floor"><span>Floor map workspace</span></KeepAliveTabContent>
    </Tabs>
  );
  expect(markup).toContain("Reviewed engineering schedule");
  expect(markup).toContain("Floor map workspace");
  expect(markup).toContain('data-state="active"');
 });
});
