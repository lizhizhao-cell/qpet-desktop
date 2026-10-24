"use strict";
const fs=require("node:fs"),path=require("node:path");
module.exports=async function test(host){
 const {win,action,state,resetAnchor,root,menuTemplate}=host;
 const qa=path.join(root,"qa/daily-expressions-20261020");
 fs.mkdirSync(qa,{recursive:true});
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const evaluate=script=>win.webContents.executeJavaScript(script,true);
 async function wait(test,ms=6500){
  const deadline=Date.now()+ms;
  while(!await test()){if(Date.now()>deadline)throw Error("Daily desktop expression timed out");await delay(20);}
 }
 const report={actions:[],regression:{},passed:false};
 const persist=()=>fs.writeFileSync(path.join(qa,"runtime-check.json"),JSON.stringify(report,null,2));
 persist();
 const b=win.getBounds(),area=state().workArea;
 win.setBounds({x:Math.round(area.x+(area.width-320)/2),y:Math.round(area.y+area.height-460),
  width:320,height:400});resetAnchor();await delay(150);
 const names=["greeting","proud","curious","approve","sleepy","stroll"];
 const labels=["打招呼","得意","好奇","赞同","犯困","散步后招呼"];
 const peaks={greeting:.95,proud:.24,curious:.65,approve:.65,sleepy:1.5,stroll:.95};
 for(let i=0;i<names.length;i++){
  const name=names[i];
  await evaluate("window.qa.resetStep()");await delay(50);
  const before=win.getBounds();
  const entry=menuTemplate().find(item=>item.label==="动作组合").submenu
   .find(item=>item.label===labels[i]);
  if(!entry?.enabled)throw Error("Daily expression menu item missing: "+name);
  const requested=Date.now();entry.click();
  await wait(()=>evaluate("window.qa.info().emotionPlaying==="+JSON.stringify(name)),8000);
  const start=await evaluate("window.qa.info()");
  await delay(peaks[name]*1000);
  fs.writeFileSync(path.join(qa,name+".png"),(await win.webContents.capturePage()).toPNG());
  await wait(()=>evaluate("!window.qa.info().emotionPlaying"));
  await delay(50);
  const final=await evaluate(`(() => {
   const s=window.qa.info();
   return {name:s.emotionState.name,actualSeconds:s.emotionState.actualSeconds,
    duration:s.emotionState.duration,walkCycles:s.emotionState.walkCycles,
    rootX:s.rootX,rootY:s.rootY,returned:controls.every(c=>Math.abs(s.values[c.id]-c.default)<1e-7),
    scale:window.desktopPet.info().cssPixelsPerModel,error:s.error,webglError:s.webglError};
  })()`);
  const after=win.getBounds();
  const moved=after.x-before.x;
  const check={name,label:labels[i],...final,totalSeconds:(Date.now()-requested)/1000,
   menuInvoked:true,nativeDeltaX:moved,nativeDeltaY:after.y-before.y,
   startWalkCycles:start.emotionState.walkCycles};
  check.passed=final.name===name&&Math.abs(final.actualSeconds-final.duration)<.08&&final.returned
   &&final.rootY===0&&Math.abs(after.y-before.y)<=1&&!final.error&&!final.webglError
   &&(name==="stroll"
    ?final.walkCycles===2&&Math.abs(moved-final.rootX*final.scale)<=1&&Math.abs(moved)>15
    :moved===0&&final.rootX===0);
  report.actions.push(check);persist();
  if(!check.passed)throw Error(JSON.stringify(check));
 }
 await evaluate("window.qa.resetStep()");
 action("happy");await wait(()=>evaluate("window.qa.info().emotionPlaying==='happy'"));
 await wait(()=>evaluate("!window.qa.info().emotionPlaying"));
 const happy=await evaluate("window.qa.info()");
 action("jump");await wait(()=>evaluate("window.qa.info().jumping"));
 await wait(()=>evaluate("!window.qa.info().jumping"));
 const jump=await evaluate("window.qa.info()");
 action("right");await wait(()=>evaluate("window.qa.info().walking"));
 await delay(150);action("stop");await wait(()=>evaluate("!window.qa.info().walking"));
 const walked=win.getBounds();
 const sourceX=await evaluate("window.qa.info().rootX");
 await evaluate("window.qa.resetStep()");
 report.regression={happyDuration:happy.emotionState.duration,
  happyReturned:happy.rootY===0,jumpDuration:jump.jumpDuration,jumpActualSeconds:jump.jumpState.actualSeconds,
  jumpReturned:jump.rootY===0,walkingCycleSeconds:jump.stepCycleSeconds,
  walkingRootX:sourceX,nativeWalkX:walked.x,
  originalButtonsPresent:await evaluate('["step_left","step_right","joy_jump","emotion_happy","blink","both","wave"].every(id=>!!document.getElementById(id))')};
 report.passed=report.actions.length===6&&report.actions.every(a=>a.passed)
  &&report.regression.happyDuration===1.8&&report.regression.happyReturned
  &&report.regression.jumpDuration===.7&&Math.abs(report.regression.jumpActualSeconds-.7)<.05
  &&report.regression.jumpReturned&&Math.abs(report.regression.walkingCycleSeconds-1.6)<1e-6
  &&sourceX===44&&report.regression.originalButtonsPresent;
 persist();
 if(!report.passed)throw Error("Desktop daily expressions regression failed");
 return report;
};
