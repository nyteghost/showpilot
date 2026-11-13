import {describe,it,expect} from "vitest";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createRequire} from "node:module";

const requireNative=createRequire(import.meta.url);
const recovery=requireNative(resolve(process.cwd(),"desktop/renderer-recovery.cjs")) as {
 safeRendererIncident:(kind:string,details:Record<string,unknown>,when:Date)=>unknown;
 writeRendererIncident:(userData:string,kind:string,details:Record<string,unknown>)=>boolean;
};
describe("ShowPilot renderer crash recovery",()=>{
 it("writes only a sanitized crash code outside the application folder",()=>{
  const dir=mkdtempSync(join(tmpdir(),"showpilot-crash-safe-"));
  try{
   expect(recovery.writeRendererIncident(dir,"renderer-process-gone",{
    reason:"C:\\private\\OAuth-file.json",exitCode:5,
    json:'{"installed":{"client_secret":"secret-string"}}',
    url:"file:///C:/Users/private/",errorDescription:"private Google account"
   })).toBe(true);
   const text=readFileSync(join(dir,"showpilot-renderer-recovery.log"),"utf8");
   expect(text).toContain("renderer-process-gone");
   expect(text).toContain('"reason":"unknown"');
   for(const secret of ["private","OAuth-file","client_secret","secret-string","file:///"])
    expect(text).not.toContain(secret);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it("has native crash recovery plus a React fallback for a blank window",()=>{
  const desktop=readFileSync(resolve(process.cwd(),"desktop/main.cjs"),"utf8");
  const root=readFileSync(resolve(process.cwd(),"src/main.tsx"),"utf8");
  expect(desktop).toContain('win.webContents.on("render-process-gone"');
  expect(desktop).toContain("Reload ShowPilot");
  expect(root).toContain("ShowPilotRecoveryBoundary");
  expect(root).toContain("Restart on dashboard (keep saved data)");
 });
 it("does not route OAuth JSON through a renderer browser file input",()=>{
  const settings=readFileSync(resolve(process.cwd(),"src/components/showpilot-calendar-settings.tsx"),"utf8");
  const preload=readFileSync(resolve(process.cwd(),"desktop/preload.cjs"),"utf8");
  expect(settings).toContain("chooseClient()");
  expect(settings).not.toContain('type="file"');
  expect(preload).toContain("showpilot-calendar:choose-client");
  expect(preload).not.toContain("showpilot-calendar:save-client");
 });
});
