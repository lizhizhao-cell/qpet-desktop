"use strict";
const fs=require("node:fs"),path=require("node:path");
const {commandPlacement}=require("./command-placement.cjs");
module.exports=async function test(host){
  const {win,root,testRun,menuTemplate,companion,companionCommand,commandRulesFile}=host;
  const qa=path.join(root,"qa/commands-20261024",testRun);
  if(fs.existsSync(qa))throw Error("Existing command-window QA is protected");
  fs.mkdirSync(qa,{recursive:true});
  const report={run:testRun,checks:{},passed:false};
  const persist=()=>fs.writeFileSync(path.join(qa,"report.json"),JSON.stringify(report,null,2));
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const pet=code=>win.webContents.executeJavaScript(code,true);
  const dialog=()=>host.getCommandWindow();
  const evaluate=code=>dialog().webContents.executeJavaScript(code,true);
  const idle=()=>pet("!window.desktopPet.isBusy()");
  function click(x,y,count=1){
    win.webContents.sendInputEvent({type:"mouseDown",x,y,button:"left",clickCount:count});
    win.webContents.sendInputEvent({type:"mouseUp",x,y,button:"left",clickCount:count});
  }
  async function wait(predicate,label,timeout=9000){
    const until=Date.now()+timeout;
    while(!await predicate()){if(Date.now()>until)throw Error("Timed out: "+label);await delay(25)}
  }
  function check(name,detail){report.checks[name]=detail;persist();if(!detail.passed)throw Error(name+": "+JSON.stringify(detail))}
  async function send(text,keyboard=false){
    await delay(280);
    await evaluate(`document.getElementById("command-input").value=${JSON.stringify(text)}`);
    if(keyboard){
      dialog().focus();
      for(const type of ["keyDown","char","keyUp"])dialog().webContents.sendInputEvent({type,keyCode:"Return"});
    }else await evaluate('document.getElementById("command-form").requestSubmit()');
    await wait(()=>evaluate(`!document.getElementById("command-input").readOnly&&document.getElementById("command-input").value===""`),"command reply");
    return evaluate('document.getElementById("command-input").placeholder');
  }
  async function shot(name){
    await delay(150);
    fs.writeFileSync(path.join(qa,name+".png"),(await dialog().webContents.capturePage()).toPNG());
  }
  async function portrait(name){
    const {nativeImage}=require("electron");
    const captures=await Promise.all([dialog(),win].map(async window=>{
      const bounds=window.getBounds();
      return {bounds,image:(await window.webContents.capturePage()).resize({width:bounds.width,height:bounds.height}).toBitmap()};
    }));
    const x=Math.min(...captures.map(c=>c.bounds.x)),y=Math.min(...captures.map(c=>c.bounds.y));
    const width=Math.max(...captures.map(c=>c.bounds.x+c.bounds.width))-x;
    const height=Math.max(...captures.map(c=>c.bounds.y+c.bounds.height))-y;
    const bitmap=Buffer.alloc(width*height*4,255);
    for(const {bounds,image} of captures)for(let row=0;row<bounds.height;row++)for(let col=0;col<bounds.width;col++){
      const from=(row*bounds.width+col)*4,to=((bounds.y-y+row)*width+bounds.x-x+col)*4,a=image[from+3]/255;
      for(let channel=0;channel<3;channel++)bitmap[to+channel]=Math.round(image[from+channel]*a+bitmap[to+channel]*(1-a));
    }
    fs.writeFileSync(path.join(qa,name+".png"),nativeImage.createFromBitmap(bitmap,{width,height}).toPNG());
  }
  function anchored(){
    const actual=dialog().getBounds();
    const expected=commandPlacement(win.getBounds(),host.state().workArea,actual.width).bounds;
    return Object.keys(expected).every(key=>Math.abs(actual[key]-expected[key])<=1);
  }
  try{
    host.settings.autonomous=false;
    const area=host.state().workArea;
    win.setBounds({x:Math.round(area.x+area.width/2),y:Math.round(area.y+area.height-460),width:320,height:400});
    host.resetAnchor();
    let now=Date.now();companion.now=()=>now;
    await companionCommand("enabled",{value:false});
    await wait(idle,"startup action ends");
    await pet("window.companionUI.dismiss()");
    click(5,390);await delay(650);
    check("transparentAreaDoesNotOpenDialog",{passed:!dialog()});
    win.webContents.sendInputEvent({type:"mouseDown",x:160,y:125,button:"left",clickCount:1});
    win.webContents.sendInputEvent({type:"mouseMove",x:174,y:125,movementX:14,movementY:0});
    await wait(()=>pet("window.desktopPet.info().dragging"),"drag before click test");
    win.webContents.sendInputEvent({type:"mouseUp",x:174,y:125,button:"left",clickCount:1});
    await delay(650);
    check("dragDoesNotOpenDialog",{passed:!dialog()&&!host.state().dragging});
    click(160,125);await delay(60);click(160,125,2);
    await wait(()=>pet("window.qa.info().emotionPlaying==='happy'"),"double click retains happy");
    await wait(idle,"double click animation ends");await delay(600);
    check("doubleClickKeepsHappyWithoutOpeningDialog",{passed:!dialog()});
    click(160,125);
    await wait(()=>!!dialog()&&!dialog().isDestroyed(),"single click opens bubble");
    await wait(()=>evaluate("document.activeElement.id==='command-input'"),"single click focuses input");
    check("singleClickOpensEvenWithCompanionDisabled",{passed:dialog().isVisible()});
    const clickedDialog=dialog();
    await evaluate('document.getElementById("command-input").value="尚未发送的草稿"');
    click(160,125);await delay(650);
    check("repeatClickKeepsSameDialogAndDraft",{passed:dialog()===clickedDialog&&
      await evaluate('document.getElementById("command-input").value==="尚未发送的草稿"')});
    dialog().close();await wait(()=>!dialog(),"close click test bubble");
    await companionCommand("enabled",{value:true});
    await menuTemplate().find(item=>item.label==="输入指令…").click();
    await wait(()=>!!dialog()&&!dialog().isDestroyed(),"dialog created");
    await wait(()=>evaluate("!!window.commandHost&&document.activeElement.id==='command-input'"),"input focused");
    check("realInputWindowOpens",{passed:dialog().isVisible()&&await evaluate("typeof require==='undefined'")});
    check("singleCompactInputOnly",{passed:dialog().getBounds().height<=80&&await evaluate(`document.querySelectorAll("input,textarea,button").length===1&&document.querySelectorAll("header,nav,details,#messages,#status").length===0`)});
    const narrow=dialog().getBounds().width;
    await evaluate(`(()=>{const input=document.getElementById("command-input");input.value="我想让她跳一下再挥挥手";input.dispatchEvent(new Event("input",{bubbles:true}))})()`);
    await wait(()=>dialog().getBounds().width>narrow+40,"bubble grows with typed text");
    check("bubbleGrowsWithTypedText",{narrow,wide:dialog().getBounds().width,passed:anchored()});
    await portrait("00-narrow-to-wide");
    await evaluate(`(()=>{const input=document.getElementById("command-input");input.value="这".repeat(80);input.dispatchEvent(new Event("input",{bubbles:true}))})()`);
    await wait(()=>dialog().getBounds().width===440,"bubble width capped");
    check("bubbleWidthCappedAndStaysAnchored",{width:dialog().getBounds().width,passed:anchored()});
    await evaluate(`(()=>{const input=document.getElementById("command-input");input.value="";input.dispatchEvent(new Event("input",{bubbles:true}))})()`);
    await wait(()=>dialog().getBounds().width===narrow,"bubble shrinks again");
    check("bubbleShrinksWithClearedText",{width:dialog().getBounds().width,passed:anchored()});
    await shot("01-command-window");
    check("bubbleAboveHead",{passed:anchored()&&dialog().getBounds().y+dialog().getBounds().height<=win.getBounds().y+win.getBounds().height*.065});
    await portrait("01-pet-and-bubble");
    const original=win.getBounds(),beforeMove=dialog().getBounds();
    win.setPosition(original.x-80,original.y);await wait(anchored,"bubble follows position");
    check("bubbleFollowsPetMove",{passed:Math.abs(dialog().getBounds().x-beforeMove.x+80)<=1});
    win.setPosition(area.x+area.width-original.width,original.y);await wait(anchored,"right edge clamp");
    const right=dialog().getBounds();
    check("screenEdgeKeepsBubbleVisible",{passed:right.x+right.width<=area.x+area.width&&
      await evaluate("parseInt(document.body.style.getPropertyValue('--tail-x'))>=24")});
    win.setPosition(original.x,area.y);await wait(anchored,"top fallback");
    check("topEdgeUsesUpwardTail",{passed:await evaluate("document.body.classList.contains('tail-up')")});
    await portrait("01-top-edge");
    win.setBounds(original);host.resetAnchor();await wait(anchored,"restore placement");
    await evaluate(`(()=>{const input=document.getElementById("command-input");input.value="你好";input.dispatchEvent(new CompositionEvent("compositionstart"));document.getElementById("command-form").requestSubmit()})()`);
    await delay(100);
    check("imeCompositionDoesNotSubmit",{passed:await evaluate('document.getElementById("command-input").value==="你好"&&!document.getElementById("command-input").readOnly')});
    await evaluate('document.getElementById("command-input").dispatchEvent(new CompositionEvent("compositionend"))');
    await send("跳一下",true);
    await wait(()=>pet("window.qa.info().jumping"),"jump reacts",2000);
    check("typedCommandDrivesActualJump",{passed:await pet("window.qa.info().jumping")});
    await wait(idle,"jump return");
    const help=await send("帮助");
    check("helpShowsActualCommands",{passed:help.includes("向左走")&&help.includes("专注25分钟")});
    const unknown=await send("<img src=x onerror=alert(1)>");
    check("unknownTextRenderedWithoutHtml",{passed:unknown.includes("暂时")&&await evaluate("document.querySelector('img')===null")&&await idle()});
    await send("向左走");
    await wait(()=>pet("window.qa.info().walking"),"walking begins");
    const walkX=win.getBounds().x;
    await wait(()=>win.getBounds().x<walkX-5,"actual walking displacement");
    await wait(anchored,"walking bubble follows");
    check("bubbleFollowsActualWalking",{passed:anchored()});
    await send("停下");
    await wait(idle,"walking completes current cycle",5000);
    check("typedWalkAndStop",{passed:await idle()});
    now+=5000;await send("给我打气");
    await wait(()=>pet("window.qa.info().emotionPlaying==='approve'"),"encourage action");
    check("textInteractionUsesExistingResponse",{passed:companion.view().interactions.encourage===1});
    await wait(idle,"encourage ends");
    await send("专注25分钟");
    const focus=companion.view().focus;
    await send("暂停专注");const paused=companion.view().focus.status;
    await send("继续专注");const resumed=companion.view().focus.status;
    check("typedFocusLifecycle",{passed:focus.minutes===25&&paused==="paused"&&resumed==="running"});
    now+=5000;const quiet=await send("夸夸你");
    check("focusedInteractionIsQuiet",{passed:quiet.includes("安静")&&await idle()&&companion.view().focus.status==="running"});
    await send("结束专注");
    check("typedFocusCancel",{passed:companion.view().focus===null});
    fs.writeFileSync(commandRulesFile,JSON.stringify({schema:1,commands:[
      {triggers:["击掌"],action:"approve",reply:"击掌！这句是你的自定义口令。"}]},null,2));
    const custom=await send("击掌");
    await wait(()=>pet("window.qa.info().emotionPlaying==='approve'"),"custom action");
    check("customJsonLoadsOnNextCommand",{passed:custom.includes("自定义")});
    await shot("02-custom-command");
    await wait(idle,"custom ends");
    fs.writeFileSync(commandRulesFile,JSON.stringify({schema:1,commands:[
      {triggers:["危险指令"],action:"exec",reply:"should not run"}]}));
    const invalid=await send("危险指令");
    check("invalidScriptCannotRunCommands",{passed:invalid.includes("暂时")&&await evaluate('document.getElementById("command-input").title.includes("未加载")')&&await idle()});
    const reset=await send("恢复");
    check("badCustomFileKeepsBuiltins",{passed:reset.includes("自然")&&await idle()});
    check("repeatedCommandsKeepSingleInputVisible",{passed:await evaluate(`(()=>{
      const input=document.getElementById("command-input").getBoundingClientRect();
      const form=document.getElementById("command-form").getBoundingClientRect();
      return document.querySelectorAll("input").length===1&&input.top>=0&&form.bottom<=innerHeight&&document.body.scrollHeight<=innerHeight+1;
    })()`)});
    dialog().setSize(240,72);await delay(150);
    check("smallWindowKeepsComposerAccessible",{passed:await evaluate(`(()=>{
      const input=document.getElementById("command-input").getBoundingClientRect();
      return input.top>=0&&input.right<=innerWidth&&input.bottom<=innerHeight;
    })()`)});
    win.setPosition(original.x,original.y);host.resetAnchor();await wait(anchored,"restore bubble size");
    fs.writeFileSync(commandRulesFile,JSON.stringify({schema:1,commands:[]}));
    await shot("03-help-and-replies");
    const senderResult=await win.webContents.executeJavaScript("typeof window.commandHost",true);
    check("petRendererDoesNotReceiveCommandBridge",{passed:senderResult==="undefined"});
    dialog().focus();
    for(const type of ["keyDown","keyUp"])dialog().webContents.sendInputEvent({type,keyCode:"Escape"});
    await wait(()=>host.getCommandWindow()===null,"dialog closed");
    check("closeDialogKeepsPet",{passed:!win.isDestroyed()&&win.isVisible()});
    await host.openCommandWindow();
    await wait(()=>evaluate('!!window.commandHost&&document.getElementById("command-input")!==null'),"new empty session");
    check("reopenClearsDraftAndReply",{passed:await evaluate('document.getElementById("command-input").value===""&&document.getElementById("command-input").placeholder==="说点什么…"')});
    await shot("04-reopened");
    win.hide();await wait(()=>!dialog().isVisible(),"hide bubble with pet");
    win.showInactive();await wait(()=>dialog().isVisible(),"show bubble with pet");
    check("petVisibilityIncludesBubble",{passed:anchored()});
    dialog().close();await wait(()=>host.getCommandWindow()===null,"close before hidden tray open");
    win.hide();await host.openCommandWindow();
    await wait(()=>win.isVisible()&&dialog().isVisible(),"tray command reveals pet");
    check("trayCommandRevealsHiddenPet",{passed:anchored()});
    await send("活泼一点");
    check("typedActivityMode",{passed:host.settings.autonomous&&host.settings.activityMode==="lively"});
    let autoNow=500000;
    const sample=async()=>pet(`window.desktopPet.sampleAutonomy(${autoNow+=100000})`);
    check("typingBlocksAutonomousAction",{passed:await sample()===null&&await idle()});
    for(const [text,topic,action] of [["银狼","call","greeting"],["摸摸头","pet","crescent"],
      ["我好累","comfort","approve"],["好无聊","bored","happy"],["谢谢","thanks","proud"]]){
      now+=5000;const line=await send(text);
      await wait(()=>pet(`window.qa.info().emotionPlaying===${JSON.stringify(action)}`),"new response action "+topic);
      check("response-"+topic,{line,passed:companion.view().responses[topic]===1});
      await wait(idle,"response ends "+topic);
    }
    await send("专注25分钟");now+=5000;
    await send("好无聊");
    check("newInteractionHonorsFocus",{passed:await idle()&&companion.view().focus.status==="running"});
    dialog().close();await wait(()=>!host.getCommandWindow(),"close before autonomous checks");
    await wait(()=>pet("!window.desktopPet.info().hostState.commandOpen"),"input closed state");
    host.setCursorForTest({x:-100,y:-100});await delay(60);
    check("focusBlocksAutonomousAction",{passed:await sample()===null});
    await companionCommand("focus:cancel");
    await companionCommand("quiet",{value:true});
    await delay(60);
    check("doNotDisturbBlocksAutonomousAction",{passed:await sample()===null});
    await companionCommand("quiet",{value:false});await delay(60);
    win.webContents.send("pet:cursor",{x:160,y:125});
    check("hoverBlocksAutonomousAction",{passed:await sample()===null});
    win.webContents.send("pet:cursor",{x:-100,y:-100});await delay(60);
    const automatic=await sample();
    await wait(()=>pet("window.desktopPet.info().autonomousAction&&window.desktopPet.isBusy()"),"actual autonomous action");
    host.action("jump");
    await wait(()=>pet("window.qa.info().jumping"),"manual interrupt autoplay");
    check("manualActionInterruptsAutonomy",{automatic,passed:!await pet("window.desktopPet.info().autonomousAction")});
    await wait(idle,"manual jump lands");
    win.webContents.send("pet:cursor",{x:-100,y:-100});await delay(60);
    const secondAutomatic=await sample();
    check("secondAutonomousActionStarts",{secondAutomatic,passed:typeof secondAutomatic==="string"});
    await wait(idle,"second autonomous action ends");
    win.webContents.send("pet:cursor",{x:-100,y:-100});await delay(60);
    const beforeStroll=win.getBounds(),stroll=await sample();
    check("autonomousStrollSelected",{stroll,autonomy:await pet("window.desktopPet.info().autonomy"),passed:stroll==="stroll"});
    await wait(()=>pet("window.qa.info().walking"),"autonomous bounded stroll begins");
    await wait(idle,"bounded stroll ends",12000);
    const afterStroll=win.getBounds(),strollState=await pet("window.qa.info().emotionState");
    check("autonomousStrollIsBounded",{stroll,before:beforeStroll,after:afterStroll,cycles:strollState.walkCycles,
      passed:stroll==="stroll"&&strollState.walkCycles>0&&strollState.walkCycles<=2
        &&beforeStroll.x!==afterStroll.x&&afterStroll.x>=area.x&&afterStroll.x+afterStroll.width<=area.x+area.width});
    const activityMenu=menuTemplate().find(item=>item.label==="活跃程度").submenu;
    activityMenu.find(item=>item.label==="安静陪伴").click();await delay(60);
    check("quietMenuStopsAutonomousActions",{passed:!host.settings.autonomous&&await sample()===null});
    activityMenu.find(item=>item.label==="自然活动").click();await delay(60);host.save();
    check("activityPreferenceSaved",{passed:JSON.parse(fs.readFileSync(host.stateFile,"utf8")).activityMode==="natural"});
    host.settings.autonomous=false;
    await host.openCommandWindow();await wait(()=>!!dialog(),"final interaction bubble");
    await shot("05-new-interactions");
    dialog().close();
    report.passed=Object.values(report.checks).every(c=>c.passed);persist();return report;
  }catch(error){report.error=error.stack||String(error);persist();throw error}
};
