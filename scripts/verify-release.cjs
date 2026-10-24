"use strict";
// Verify the actual release files and actual EXE regression receipts before handoff.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const read=file=>JSON.parse(fs.readFileSync(file,"utf8").replace(/^\uFEFF/,""));
const sha=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
const receipt=read(path.join(root,"release/build-receipt.json"));
const lock=read(path.join(root,"asset-lock.json"));
const output=path.join(root,".local/release-verification.json");
if(fs.existsSync(output))throw Error("Existing release verification is protected");
const mismatches=[];
for(const asset of receipt.artifacts){
  if(path.basename(asset.name)!==asset.name)throw Error("Invalid artifact filename");
  const file=path.join(root,"release",asset.name);
  if(fs.statSync(file).size!==asset.bytes||sha(file)!==asset.sha256)mismatches.push(asset.name);
}
for(const[relative,expected]of Object.entries(lock.runtime)){
  const file=path.join(root,"release/win-unpacked/resources",relative);
  if(!fs.existsSync(file)||sha(file)!==expected)mismatches.push(relative);
}
const asar=require("@electron/asar");
const appArchive=path.join(root,"release/win-unpacked/resources/app.asar");
const archiveFiles=asar.listPackage(appArchive);
const forbiddenArchive=archiveFiles.filter(file=>/(^|[/\\])(\.history|node_modules|\.local|qa|\.qa-[^/\\]*)([/\\]|$)|\.(cmo3|can3|psd)$/i.test(file));
const main=asar.extractFile(appArchive,"main.cjs"),sourceMain=fs.readFileSync(path.join(root,"app/main.cjs"));
const core=asar.extractFile(appArchive,"vendor/live2dcubismcore.min.js");
if(!main.equals(sourceMain))mismatches.push("app.asar/main.cjs");
if(crypto.createHash("sha256").update(core).digest("hex").toUpperCase()!==lock.coreSha256)mismatches.push("app.asar/Core");
const qa=path.join(root,".local/packaged-qa");
const companion=read(path.join(qa,"release-4383-companion-v01/packaged-receipt.json"));
const installed=read(path.join(qa,"installer-4383-v01-expressions/packaged-receipt.json"));
const installer=read(path.join(qa,"installer-4383-v01-installer.json"));
const zip=read(path.join(qa,"zip-4383-companion-v01/packaged-receipt.json"));
const audit=spawnSync("node",[path.join(root,"scripts/check-source.cjs")],{cwd:root,encoding:"utf8",windowsHide:true});
if(audit.status!==0)throw Error(audit.stdout+audit.stderr);
const sourceAudit=JSON.parse(audit.stdout);
const artifacts=receipt.artifacts.map(asset=>({...asset}));
const result={
  schema:1,version:receipt.version,electronVersion:receipt.electronVersion,artifacts,
  artifactAndRuntimeMismatches:mismatches,originalRuntimeFilesChecked:Object.keys(lock.runtime).length,
  appAsarMatchesReviewedSource:main.equals(sourceMain),forbiddenArchiveFiles:forbiddenArchive,
  sourceAudit,packagedCompanion:{passed:companion.passed,checks:companion.checks,exitCode:companion.exitCode},
  installedAppRegression:{passed:installed.passed,actions:installed.actions,checks:installed.checks,exitCode:installed.exitCode},
  installerAndUninstaller:{passed:installer.passed,realUserDataUnchanged:installer.realUserDataUnchanged},
  zipChinesePathRegression:{passed:zip.passed,checks:zip.checks,exitCode:zip.exitCode},
  realUserDataUnchanged:[companion,installed,installer,zip].every(r=>r.realUserDataUnchanged),
  codeSigned:false,crossMachineValidated:false,githubUploaded:false,repositoryRemoteConfigured:false,
  assetDistributionPermissionConfirmed:false,coreDistributionTermsConfirmed:false,
};
result.passed=!mismatches.length&&!forbiddenArchive.length&&sourceAudit.passed&&
  [companion,installed,installer,zip].every(r=>r.passed)&&result.realUserDataUnchanged&&
  receipt.electronVersion==="43.8.3";
fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:"wx"});
console.log(JSON.stringify(result));
if(!result.passed)process.exitCode=1;
