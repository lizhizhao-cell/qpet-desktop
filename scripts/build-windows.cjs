"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"..");
process.chdir(root);
const config=require("../electron-builder.cjs");
const lock=JSON.parse(fs.readFileSync(path.join(root,"asset-lock.json"),"utf8"));
const sha=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
for(const[relative,expected]of Object.entries(lock.runtime)){
  if(!fs.existsSync(relative)||sha(relative)!==expected)throw Error("Import matching local assets first: "+relative);
}
if(!fs.existsSync("app/vendor/live2dcubismcore.min.js")||sha("app/vendor/live2dcubismcore.min.js")!==lock.coreSha256)
  throw Error("The matching licensed Core is required");
if(!fs.existsSync("assets/icon.ico"))throw Error("assets/icon.ico is required");
const output=path.resolve(root,config.directories.output);
if(!output.startsWith(root+path.sep))throw Error("Build output must stay within this checkout");
if(fs.existsSync(output))throw Error("Existing build output is protected; choose a new output directory");
if(process.env.QPET_ELECTRON_DIST){
  const directory=path.resolve(process.env.QPET_ELECTRON_DIST);
  if(!fs.existsSync(path.join(directory,"electron.exe")))throw Error("Invalid fixed local Electron directory");
  if(fs.readFileSync(path.join(directory,"version"),"utf8").trim()!==config.electronVersion)
    throw Error("Local Electron version differs from the pinned build version");
  config.electronDist=directory;
}
process.env.CSC_IDENTITY_AUTO_DISCOVERY="false";
const {build}=require("electron-builder");
build({config,publish:"never"}).then(files=>{
  const artifacts=files.filter(file=>fs.existsSync(file)&&/\.(exe|zip)$/.test(file));
  const checksums=artifacts.map(file=>({name:path.basename(file),bytes:fs.statSync(file).size,sha256:sha(file)}));
  fs.writeFileSync(path.join(output,"SHA256SUMS.txt"),
    checksums.map(file=>file.sha256+"  "+file.name).join("\n")+"\n");
  fs.writeFileSync(path.join(output,"build-receipt.json"),JSON.stringify({
    version:require("../app/package.json").version,platform:"windows-x64",electronVersion:config.electronVersion,artifacts:checksums,
    publicUploadPerformed:false,codeSigned:false,crossMachineValidated:false,
    assetDistributionPermissionConfirmed:false,coreDistributionTermsConfirmed:false
  },null,2));
  console.log(JSON.stringify({artifacts:checksums,publicUploadPerformed:false}));
}).catch(error=>{console.error(error.stack||error);process.exitCode=1});
