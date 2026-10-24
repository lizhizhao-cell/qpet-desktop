"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../app/main.cjs"),"utf8");
function paths({packaged,args=[]}){
  const parent=path.join(os.tmpdir(),"qpet-path-contract");
  const appRoot=path.join(parent,"resources",packaged?"app.asar":"app");
  const locations={appData:path.join(parent,"profile"),temp:path.join(parent,"temp")};
  const app={isPackaged:packaged,setName(){},getPath:name=>locations[name],
    setPath:(name,value)=>{locations[name]=value},requestSingleInstanceLock:()=>false,quit(){},on(){}};
  const realFs=require("node:fs"),fakeFs={...realFs,readFileSync(file,...rest){
    if(file===path.join(appRoot,"model-version.json"))
      return JSON.stringify({authorizedForDesktopUse:true,runtimeVersion:"surprise-face-v04"});
    return realFs.readFileSync(file,...rest);
  }};
  const context={__dirname:appRoot,module:{exports:{}},process:{argv:["QPet.exe",...args]},
    require(name){
      if(name==="electron")return {app};
      if(name==="node:fs")return fakeFs;
      if(name==="./companion-core.cjs")return require("../app/companion-core.cjs");
      return require(name);
    },console,setTimeout,clearTimeout,setInterval,clearInterval,Buffer};
  vm.runInNewContext(source+"\nmodule.exports={STATE_FILE,INSTANCE_FILE,QA_ROOT,RUNTIME};",context);
  return {...context.module.exports,locations,appRoot};
}
test("installed application writes its instance and settings outside app.asar",()=>{
  const result=paths({packaged:true});
  assert.equal(result.INSTANCE_FILE,path.join(result.locations.userData,".instance.json"));
  assert.equal(result.STATE_FILE,path.join(result.locations.appData,"QPet2D-Desktop","settings.json"));
  assert.equal(result.INSTANCE_FILE.startsWith(result.appRoot+path.sep),false);
  assert.equal(result.RUNTIME,path.join(path.dirname(result.appRoot),"production-live2d","runtime"));
});
test("packaged companion regression uses a writable isolated temp profile",()=>{
  const result=paths({packaged:true,args:["--companion-test","--qa-run=release-test"]});
  assert.equal(result.QA_ROOT,path.join(result.locations.temp,"QPet2D-Desktop-QA"));
  assert.equal(result.locations.userData,path.join(result.QA_ROOT,".qa-companion-20261021","release-test"));
  assert.equal(result.INSTANCE_FILE,path.join(result.locations.userData,".instance.json"));
});
test("development app keeps the existing stop-script instance location",()=>{
  const result=paths({packaged:false});
  assert.equal(result.INSTANCE_FILE,path.join(result.appRoot,".instance.json"));
  assert.equal(result.QA_ROOT,result.appRoot);
});
