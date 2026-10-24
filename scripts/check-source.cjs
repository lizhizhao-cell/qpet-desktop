"use strict";
const fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const run=spawnSync("git",["ls-files","--cached","-z"],{cwd:root,encoding:"utf8",windowsHide:true});
let files=run.status===0?run.stdout.split("\0").filter(Boolean):[];
if(!files.length){
  function walk(relative){
    const target=path.join(root,relative);
    for(const entry of fs.readdirSync(target,{withFileTypes:true})){
      const next=path.posix.join(relative,entry.name);
      if(entry.isDirectory())walk(next);else files.push(next);
    }
  }
  for(const folder of ["app","assets","scripts","tests",".github"])if(fs.existsSync(path.join(root,folder)))walk(folder);
  files=files.filter(file=>!/^app\/vendor\/.*\.(js|wasm)$/.test(file));
}
const findings=[];
for(const file of files){
  if(/(^|\/)(\.history|node_modules|release|production-live2d|\.local|\.qa-[^/]*)(\/|$)|\.(cmo3|can3|moc3|psd|exe|dll)$/i.test(file))
    findings.push(file+": unexpected private/binary/development asset");
  if(/^app\/vendor\/.*\.(js|wasm)$/.test(file))findings.push(file+": licensed Core must not be tracked");
  if(/(^|\/)(settings|companion|\.instance)\.json$/.test(file))findings.push(file+": user data must not be tracked");
  if(/\.(cjs|json|md|yml|ps1|svg|gitignore|gitattributes)$/.test(file)){
    const text=fs.readFileSync(path.join(root,file),"utf8");
    if(/[A-Z]:\\Users\\[^\\\r\n]+\\/i.test(text))findings.push(file+": personal absolute Windows path");
    if(/\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/.test(text))findings.push(file+": possible credential");
  }
}
console.log(JSON.stringify({checkedFiles:files.length,findings,passed:findings.length===0}));
if(findings.length)process.exitCode=1;
