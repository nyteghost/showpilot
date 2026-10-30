import {describe,it,expect} from "vitest";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const script=fileURLToPath(new URL("../../scripts/stamp-build-version.mjs",import.meta.url));
const manifest=fileURLToPath(new URL("../../package.json",import.meta.url));
function simulate(channel:string,number:string,base="0.1.0-beta"){
 const result=spawnSync(process.execPath,[script,"--dry-run",channel,number,base],{encoding:"utf8",timeout:8000});
 return {exit:result.status,output:result.stdout.trim(),error:result.stderr.trim()};
}
describe("automatic ShowPilot Main/Beta version stamping",()=>{
 it("increments the patch component on every GitHub workflow run",()=>{
  expect(simulate("beta","14")).toEqual({exit:0,output:"0.1.14-beta",error:""});
  expect(simulate("beta","15").output).toBe("0.1.15-beta");
  expect(simulate("main","16").output).toBe("0.1.16");
 });
 it("produces matching versions for Windows and browser jobs in the same run",()=>{
  expect(simulate("beta","123").output).toBe(simulate("beta","123").output);
  expect(simulate("main","123").output).toBe("0.1.123");
 });
 it("preserves the release series when the source version changes",()=>{
  expect(simulate("beta","31","1.4.0-beta").output).toBe("1.4.31-beta");
  expect(simulate("main","31","1.4.0").output).toBe("1.4.31");
 });
 it("rejects invalid channels, missing run numbers, and unsafe inputs",()=>{
  for(const args of [["other","9"],["beta","0"],["main","-2"],["main","not-a-number"],["beta","9007199254740995"]]){
   expect(simulate(args[0],args[1]).exit).not.toBe(0);
  }
  expect(simulate("beta","16","invalid").exit).not.toBe(0);
 });
 it("never modifies source package.json during a dry-run",()=>{
  const before=readFileSync(manifest,"utf8");
  simulate("beta","231");
  expect(readFileSync(manifest,"utf8")).toBe(before);
 });
});
