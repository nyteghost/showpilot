"use strict";
/** Windows CI-only smoke test of the actual detached PowerShell startup path.
 * Operates ONLY on synthetic directories under RUNNER_TEMP, never user's PC.
 * The Node process represents the existing app; the helper must signal ready
 * before this process exits. It then swaps the isolated fixture folders. */
const fs=require("node:fs");
const path=require("node:path");
const {spawnInstall}=require("../desktop/portable-updates.cjs");

async function main(){
 if(process.platform!=="win32"||process.env.SHOWPILOT_UPDATER_SMOKE_TEST!=="1")
  throw Error("Only run this smoke test on Windows with the CI opt-in.");
 const workspace=process.argv[2];
 if(!workspace||!path.isAbsolute(workspace)||!workspace.toLowerCase().includes("showpilot-updater-smoke"))
  throw Error("Refusing to test outside a dedicated updater test directory.");
 const paths={
  installDir:path.join(workspace,"OriginalApp"),
  stageDir:path.join(workspace,".showpilot-next-smoke"),
  backupDir:path.join(workspace,".showpilot-previous-smoke"),
  scriptPath:path.resolve(__dirname,"../desktop/portable-update-helper.ps1"),
  logPath:path.join(workspace,"update-swap-test.log"),
  readyPath:path.join(workspace,"install-ready-ci-smoke.txt"),
  userData:workspace,
  smokeTestNoRelaunch:true
 };
 if(!fs.existsSync(path.join(paths.stageDir,"ShowPilot.exe"))||
    !fs.existsSync(path.join(paths.installDir,"ShowPilot.exe")))
  throw Error("Synthetic old and staged app executables must be present.");
 try{
  const result=await spawnInstall(paths,"0.1.999-beta");
  if(!result.started||fs.readFileSync(paths.readyPath,"utf8").trim()!=="SHOWPILOT_INSTALL_READY")
   throw Error("Detached installer never reported ready.");
  // GitHub Windows runners clean up orphan descendants when a CI step ends.
  // Terminate the smoke helper while it waits for this Node test process,
  // then run the existing isolated folder-swap test separately in the same
  // workflow step. This verifies real startup without racing two installers.
  try{process.kill(result.pid);}catch(e){throw Error("Could not terminate isolated smoke helper: "+String(e));}
  process.stdout.write("Windows installer signaled READY; isolated helper stopped before folder swap.\\n");
  process.exit(0);
 }catch(e){
  process.stderr.write(String(e)+"\n");
  try{process.stderr.write(fs.readFileSync(paths.logPath,"utf8").slice(-3000)+"\n");}catch{}
  process.exit(1);
 }
}
void main().catch(e=>{process.stderr.write(String(e)+"\n");process.exit(1)});
