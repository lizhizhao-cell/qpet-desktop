"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),source=process.argv[2];
if(!source||!path.isAbsolute(source))throw Error("Pass an absolute path to your authorized local QPet source or runtime bundle");
const sourceRoot=path.resolve(source),lock=JSON.parse(fs.readFileSync(path.join(root,"asset-lock.json"),"utf8"));
const sha=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toUpperCase();
const plans=Object.entries(lock.runtime).map(([relative,expected])=>({
  from:path.join(sourceRoot,relative),to:path.join(root,relative),relative,expected
}));
plans.push({from:path.join(sourceRoot,"desktop-pet/vendor/live2dcubismcore.min.js"),
  to:path.join(root,"app/vendor/live2dcubismcore.min.js"),
  relative:"app/vendor/live2dcubismcore.min.js",expected:lock.coreSha256});
for(const plan of plans){
  if(!fs.existsSync(plan.from)||sha(plan.from)!==plan.expected)throw Error("Missing or mismatched runtime asset: "+plan.relative);
  let ancestor=plan.from;
  while(ancestor!==sourceRoot&&ancestor!==path.dirname(ancestor)){
    if(fs.lstatSync(ancestor).isSymbolicLink())throw Error("Linked runtime inputs are excluded");
    ancestor=path.dirname(ancestor);
  }
  if(fs.existsSync(plan.to)&&sha(plan.to)!==plan.expected)throw Error("Different local asset is protected: "+plan.relative);
}
for(const plan of plans){
  fs.mkdirSync(path.dirname(plan.to),{recursive:true});
  if(!fs.existsSync(plan.to))fs.copyFileSync(plan.from,plan.to,fs.constants.COPYFILE_EXCL);
  if(sha(plan.to)!==plan.expected)throw Error("Asset copy verification failed");
}
fs.mkdirSync(path.join(root,".local"),{recursive:true});
fs.writeFileSync(path.join(root,".local/asset-import.json"),JSON.stringify({
  modelVersion:lock.modelVersion,files:plans.length,shaVerified:true,
  assetDistributionPermissionConfirmed:false,coreDistributionTermsConfirmed:false
},null,2));
console.log(JSON.stringify({imported:plans.length,shaVerified:true,
  notice:"Local import does not grant public distribution permission; imported binaries are gitignored"}));
