import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const read=(name:string)=>readFileSync(fileURLToPath(new URL("../../desktop/"+name,import.meta.url)),"utf8");
describe("experimental Claude builds cannot modify normal ShowPilot appdata",()=>{
 it("use a distinct Electron userData folder only for -claude packages",()=>{
  const main=read("main.cjs");
  expect(main).toContain('app.setPath("userData",isolated)');
  expect(main).toContain("ShowPilot-Claude-Test");
  expect(main).toMatch(/-claude/);
 });
 it("do not auto-install or download beta/main in an experimental package",()=>{
  const updater=read("app-updates.cjs");
  expect(updater).toContain("refuseExperimentalUpdate()");
  expect(updater).toContain('channel:"claude"');
 });
});
