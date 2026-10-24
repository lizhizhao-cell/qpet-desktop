"use strict";
const fs = require("node:fs"), path = require("node:path");
const {execFile} = require("node:child_process");
const {promisify} = require("node:util");
const execFileAsync = promisify(execFile);
module.exports = async function test(host) {
  const {win, action, state, settings, resetAnchor, save, stateFile, root, menuTemplate} = host;
  const qa = path.join(root, "qa");
  fs.mkdirSync(qa, {recursive: true});
  const evaluate = script => win.webContents.executeJavaScript(script, true);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function wait(test, ms = 5000) {
    const deadline = Date.now() + ms;
    while (!await test()) {
      if (Date.now() > deadline) throw Error("Desktop check timed out");
      await delay(25);
    }
  }
  const report = {electron: state().version, checks: {}, passed: false};
  const writeReport = () => fs.writeFileSync(path.join(qa, "desktop-check.json"),
    JSON.stringify(report, null, 2));
  writeReport();
  settings.autonomous = false;
  const area = state().workArea, initial = win.getBounds();
  win.setBounds({...initial,x:Math.round(area.x + (area.width - initial.width) / 2),
    y:Math.round(area.y + area.height - initial.height - 65)});
  resetAnchor();
  await delay(150);
  await wait(() => evaluate("window.qa.ready && !!window.desktopPet"));
  const rendered = await evaluate(`(() => {
    const s=window.qa.info();
    return {ready:s.ready,parameters:s.parameters.length,drawables:s.drawables,
      error:s.error,webglError:s.webglError,
      desktop:window.desktopPet.info(),nodeUnavailable:typeof require==="undefined",
      nativeBridge:typeof window.petHost.pose==="function"};
  })()`);
  report.checks.native = {visible:win.isVisible(),alwaysOnTop:win.isAlwaysOnTop(),
    frameless:!win.isResizable(),background:win.getBackgroundColor(),
    ...rendered};
  const shot = await win.webContents.capturePage();
  fs.writeFileSync(path.join(qa, "native-neutral.png"), shot.toPNG());
  const bitmap = shot.toBitmap(), size = shot.getSize();
  let transparentPixels = 0, opaquePixels = 0;
  for (let i = 3; i < bitmap.length; i += 4) {
    if (bitmap[i] === 0) transparentPixels++;
    if (bitmap[i] > 200) opaquePixels++;
  }
  report.checks.alpha = {size, transparentPixels, opaquePixels,
    transparentRatio:transparentPixels / (bitmap.length / 4),
    passed:transparentPixels > bitmap.length / 8 && opaquePixels > 1000};
  report.checks.hitTest = await evaluate(`(() => {
    const sample=(x,y)=>window.desktopPet.hitTest(x,y);
    return {transparentCorner:sample(2,2),opaqueHead:sample(innerWidth/2,innerHeight*.32)};
  })()`);
  const idleBounds = win.getBounds();
  action("jump");
  await wait(() => evaluate("window.qa.info().jumping"));
  await delay(330);
  const apex = win.getBounds();
  report.checks.jump = {groundY:idleBounds.y,apexY:apex.y,
    windowActuallyMovedUp:apex.y < idleBounds.y - 10};
  fs.writeFileSync(path.join(qa, "native-jump.png"), (await win.webContents.capturePage()).toPNG());
  await wait(() => evaluate("!window.qa.info().jumping"));
  await delay(60);
  report.checks.jump.landingY = win.getBounds().y;
  report.checks.jump.info = await evaluate("window.qa.info().jumpState");
  report.checks.jump.returned = Math.abs(win.getBounds().y - idleBounds.y) <= 1;
  action("happy");
  await wait(() => evaluate("window.qa.info().emotionPlaying === 'happy'"));
  await delay(800);
  report.checks.happy = await evaluate(`(() => {
    const s=window.qa.info();
    return {height:s.rootY,armsRaised:s.values.ParamShoulderL>.9&&s.values.ParamShoulderR>.9,
      eyes:s.values.ParamEyeLOpen,tracks:s.emotionState.activeTracks};
  })()`);
  fs.writeFileSync(path.join(qa, "native-happy.png"), (await win.webContents.capturePage()).toPNG());
  await wait(() => evaluate("!window.qa.info().emotionPlaying"));
  await delay(70);
  const start = win.getBounds();
  action("right");
  await wait(() => evaluate("window.qa.info().walking && window.qa.info().stepDirection==='right'"));
  await delay(180); action("stop");
  await wait(() => evaluate("!window.qa.info().walking"));
  await delay(100);
  const right = win.getBounds();
  action("left");
  await wait(() => evaluate("window.qa.info().walking && window.qa.info().stepDirection==='left'"));
  await delay(180); action("stop");
  await wait(() => evaluate("!window.qa.info().walking"));
  await delay(100);
  const left = win.getBounds(), scale = await evaluate("window.desktopPet.info().cssPixelsPerModel");
  report.checks.walk = {initialX:start.x,afterRightX:right.x,afterLeftX:left.x,
    pixelsPerModel:scale,expectedStrideDip:44*scale,
    rightMoved:Math.abs(right.x-start.x-44*scale)<=1,
    leftReturned:Math.abs(left.x-start.x)<=1};
  report.checks.windowSizeStable = {
    initial:[initial.width,initial.height], start:[start.width,start.height],
    afterRight:[right.width,right.height],afterLeft:[left.width,left.height],
    passed:[right,left].every(b=>b.width===start.width&&b.height===start.height)
      &&Math.abs(start.width-320)<=1&&Math.abs(start.height-400)<=1,
  };
  action("reset"); await delay(100);
  win.show(); win.focus(); await delay(200);
  const nativeHandle = win.getNativeWindowHandle().readBigUInt64LE().toString();
  const input = await execFileAsync("powershell.exe",["-NoProfile","-ExecutionPolicy","Bypass",
    "-File",path.join(root,"qa-pointer.ps1"),"-TargetHandle",nativeHandle,
    "-TargetProcessId",String(process.pid)],{windowsHide:true,timeout:20000});
  report.checks.pointer = JSON.parse(input.stdout.trim());
  await delay(100);
  report.checks.pointer.windowMoved = Math.abs(win.getBounds().x-left.x)>15;
  report.checks.pointer.stateAfter = state();
  report.checks.pointer.sizeStable = Math.abs(win.getBounds().width-320)<=1
    &&Math.abs(win.getBounds().height-400)<=1;
  host.setSize("large"); await delay(200);
  const large=win.getBounds();
  host.setSize("normal"); await delay(200);
  const normal=win.getBounds();
  report.checks.resize={large:[large.width,large.height],normal:[normal.width,normal.height],
    passed:Math.abs(large.width-400)<=1&&Math.abs(large.height-500)<=1
      &&Math.abs(normal.width-320)<=1&&Math.abs(normal.height-400)<=1};
  report.checks.menuLabels = menuTemplate().map(item => item.label).filter(Boolean);
  save();
  const stored = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  report.checks.settings = {exists:fs.existsSync(stateFile),size:stored.size,
    positionSaved:Number.isFinite(stored.x)&&Number.isFinite(stored.y),
    alwaysOnTopSaved:stored.alwaysOnTop===settings.alwaysOnTop};
  report.checks.final = await evaluate(`(() => {
    const s=window.qa.info();
    return {rootY:s.rootY,error:s.error,webglError:s.webglError,
      buttons:["step_left","step_right","joy_jump","emotion_happy","wave","blink","both"]
      .every(id=>!!document.getElementById(id))};
  })()`);
  report.passed = rendered.ready && rendered.nativeBridge && rendered.nodeUnavailable
    && !rendered.error && !rendered.webglError && report.checks.alpha.passed
    && !report.checks.hitTest.transparentCorner && report.checks.hitTest.opaqueHead
    && report.checks.jump.windowActuallyMovedUp && report.checks.jump.returned
    && report.checks.happy.armsRaised && report.checks.happy.height > 55
    && report.checks.walk.rightMoved && report.checks.walk.leftReturned
    && report.checks.windowSizeStable.passed
    && report.checks.pointer.transparentAreaPasses
    && report.checks.pointer.opaqueAreaInteractive && report.checks.pointer.windowMoved
    && report.checks.pointer.sizeStable && report.checks.resize.passed
    && report.checks.settings.positionSaved && report.checks.settings.alwaysOnTopSaved
    && !report.checks.final.error && !report.checks.final.webglError
    && report.checks.final.rootY===0 && report.checks.final.buttons;
  writeReport();
  if (!report.passed) throw Error("Desktop check failed; see desktop-pet/qa/desktop-check.json");
  return report;
};
