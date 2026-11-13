import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {
 WORKSPACE_IDS,focusWorkspaceWindow,defaultWindowRectangle,
 clampWindowRectangle,resizeWindowRectangle,readSavedOpenWindows,
 readSavedWindowRectangles,isWorkspaceWindowId
} from "@/lib/showpilot-window-workspace";
import {ShowPilotWindowWorkspace} from "@/components/showpilot-window-workspace";

describe("ShowPilot floating workspace state and secure layout persistence",()=>{
 it("supports independent simultaneous tools without duplicating the same window",()=>{
  const opened=focusWorkspaceWindow(["events","shifts"],"eventhub");
  expect(opened).toEqual(["events","shifts","eventhub"]);
  expect(focusWorkspaceWindow(opened,"events")).toEqual(["shifts","eventhub","events"]);
  expect(focusWorkspaceWindow(["events","events"],"events")).toEqual(["events"]);
  expect(WORKSPACE_IDS).toContain("settings");
 });
 it("keeps invalid and future unknown window IDs out of saved UI state",()=>{
  expect(isWorkspaceWindowId("events")).toBe(true);
  expect(isWorkspaceWindowId("__proto__")).toBe(false);
  expect(readSavedOpenWindows(JSON.stringify(["events","floor","floor","untrusted","settings"])))
   .toEqual(["events","floor","settings"]);
  expect(readSavedOpenWindows('{"fake":"list"}')).toEqual([]);
  expect(readSavedOpenWindows("broken JSON")).toEqual([]);
 });
 it("limits remembered positions and sizes to the real workspace dimensions",()=>{
  const bounds={width:980,height:630};
  const a=clampWindowRectangle({x:-9000,y:800,width:2400,height:4000,maximized:false},bounds);
  expect(a).toEqual({x:0,y:0,width:980,height:630,maximized:false});
  const b=clampWindowRectangle(defaultWindowRectangle("events"),bounds);
  expect(b.x+b.width).toBeLessThanOrEqual(bounds.width);
  expect(b.y+b.height).toBeLessThanOrEqual(bounds.height);
  expect(resizeWindowRectangle(b,-2000,-3000,bounds).width).toBeGreaterThanOrEqual(360);
  expect(resizeWindowRectangle(b,-2000,-3000,bounds).height).toBeGreaterThanOrEqual(260);
 });
 it("rejects poisoned or malformed saved geometry without affecting work data",()=>{
  const raw=JSON.stringify({
   events:{x:45,y:70,width:850,height:520,maximized:false},
   shifts:{x:"bad",y:5,width:500,height:350,maximized:false},
   "__proto__":{x:0,y:0,width:9,height:9,maximized:true}
  });
  expect(readSavedWindowRectangles(raw)).toEqual({
   events:{x:45,y:70,width:850,height:520,maximized:false}
  });
  expect(readSavedWindowRectangles("not json")).toEqual({});
  expect(readSavedWindowRectangles("x".repeat(8100))).toEqual({});
 });
 it("renders several tools in one in-app desktop, with keyboard-operable window controls",()=>{
  const items=[
   {id:"events" as const,label:"Event Schedule",description:"Reports",icon:createElement("span",null,"E"),content:createElement("div",null,"Event editor state")},
   {id:"shifts" as const,label:"My Shifts",description:"Calendar",icon:createElement("span",null,"S"),content:createElement("div",null,"Shifts editor state")},
   {id:"settings" as const,label:"Settings & AI",description:"Provider configuration",icon:createElement("span",null,"C"),content:createElement("div",null,"Settings remain mounted")}
  ];
  const noop=()=>{};
  const html=renderToStaticMarkup(createElement(ShowPilotWindowWorkspace,{
   items,openIds:["events","shifts","settings"],minimizedIds:["shifts"],activeId:"events",
   windowed:true,visible:true,onFocus:noop,onClose:noop,onMinimize:noop
  }));
  expect(html).toContain("Windowed workspace");
  expect(html).toContain('aria-label="Move Event Schedule window; Alt plus arrow keys"');
  expect(html).toContain('aria-label="Resize Event Schedule window; drag or Alt plus arrow keys"');
  expect(html).toContain('aria-label="Minimize Event Schedule"');
  expect(html).toContain('aria-label="Maximize Event Schedule"');
  expect(html).toContain('aria-label="Close Event Schedule"');
  expect(html).toContain("Event editor state");
  expect(html).toContain("Shifts editor state"); // still mounted behind hidden attr
  expect(html).toContain('aria-label="Restore My Shifts"');
  expect(html).toContain("Settings remain mounted");
  expect(html).toContain("Tile");
  expect(html).toContain("Cascade");
 });
 it("supports classic single-tab fallback without destroying other visited panes",()=>{
  const items=[
   {id:"events" as const,label:"Event Schedule",description:"",icon:null,content:createElement("div",null,"Draft spreadsheet edits")},
   {id:"shifts" as const,label:"My Shifts",description:"",icon:null,content:createElement("div",null,"Pending shifts")}
  ];
  const noop=()=>{};
  const html=renderToStaticMarkup(createElement(ShowPilotWindowWorkspace,{
   items,openIds:["events","shifts"],minimizedIds:[],activeId:"shifts",
   windowed:false,visible:true,onFocus:noop,onClose:noop,onMinimize:noop
  }));
  expect(html).toContain("sp-mode-classic");
  expect(html).toContain("Draft spreadsheet edits");
  expect(html).toContain("Pending shifts");
  expect(html).not.toContain("sp-floating-drag");
 });
});
