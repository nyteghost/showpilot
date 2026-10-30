#!/usr/bin/env node
/**
 * Stamp a deterministic SemVer version from GitHub's monotonically increasing
 * workflow run_number. No commits or tags are pushed, and the source manifest
 * remains at its development version.
 *
 * Main #27: 0.1.27
 * Beta #28: 0.1.28-beta
 * Each job in the same run uses the SAME run_number / channel.
 *
 * CLI: node scripts/stamp-build-version.mjs
 * Test: node scripts/stamp-build-version.mjs --dry-run beta 28 0.1.0-beta
 */
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const here=path.dirname(fileURLToPath(import.meta.url));
const manifest=path.resolve(here,"../package.json");
const dryRun=process.argv[2]==="--dry-run";
const channel=dryRun?process.argv[3]:process.env.SHOWPILOT_BUILD_CHANNEL;
const number=dryRun?process.argv[4]:process.env.SHOWPILOT_BUILD_NUMBER;
const pkg=JSON.parse(readFileSync(manifest,"utf8"));
const base=dryRun?(process.argv[5]??pkg.version):pkg.version;

function versionFor(sourceVersion, releaseChannel, buildNumber) {
 const baseMatch=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.+-]+)?$/.exec(sourceVersion??"");
 if(!baseMatch)throw new Error("Invalid base package version: "+sourceVersion);
 if(releaseChannel!=="main"&&releaseChannel!=="beta")throw new Error("Build channel must be main or beta");
 if(!/^[1-9]\d*$/.test(String(buildNumber??"")))throw new Error("Missing positive GitHub workflow run number");
 const n=Number(buildNumber);
 if(!Number.isSafeInteger(n))throw new Error("Workflow run number is too large");
 return baseMatch[1]+"."+baseMatch[2]+"."+n+(releaseChannel==="beta"?"-beta":"");
}
try {
 const version=versionFor(base,channel,number);
 if(dryRun) {
  process.stdout.write(version+"\n");
 }else{
  pkg.version=version;
  writeFileSync(manifest,JSON.stringify(pkg,null,2)+"\n","utf8");
  process.stdout.write("ShowPilot "+channel+" build #"+number+" → v"+version+"\n");
 }
}catch(e){
 process.stderr.write("ShowPilot version stamp: "+e.message+"\n");
 process.exitCode=1;
}
