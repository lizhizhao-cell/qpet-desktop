"use strict";
const fs = require("node:fs"), path = require("node:path");
module.exports = async function test(host) {
  const {win, action, state, settings, resetAnchor, save, setSize, stateFile,
    root, menuTemplate, app, testRun} = host;
  const qa = path.join(root, "qa/expressions-20261021", testRun);
  if (fs.existsSync(qa)) throw Error("Existing integration evidence is protected: " + qa);
  fs.mkdirSync(qa, {recursive: true});
  const report = {run: testRun, modelVersion: state().modelVersion,
    checks: {}, actions: [], performance: {}, passed: false};
  const persist = () => fs.writeFileSync(path.join(qa, "report.json"), JSON.stringify(report, null, 2));
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const evaluate = script => win.webContents.executeJavaScript(script, true);
  async function wait(predicate, label, ms = 7000) {
    const until = Date.now() + ms;
    while (!await predicate()) {
      if (Date.now() > until) throw Error("Timed out: " + label);
      await delay(20);
    }
  }
  function check(name, result) {
    report.checks[name] = result; persist();
    if (!result.passed) throw Error(name + ": " + JSON.stringify(result));
  }
  const info = () => evaluate("window.qa.info()");
  const idle = () => evaluate(`(() => {
    const s=window.qa.info();return !s.walking&&!s.jumping&&!s.emotionPlaying&&!s.pendingEmotion
      &&!s.pendingStepDirection&&!window.desktopPet.info().pendingAction;
  })()`);
  const restored = () => evaluate(`(() => {
    const s=window.qa.info();return s.controls.every(c=>Math.abs(s.values[c.id]-c.default)<1e-7)
      &&s.rootY===0&&!s.error&&!s.webglError;
  })()`);
  async function perf(label) {
    app.getAppMetrics();
    const before = win.getBounds();
    const measurement = await evaluate(`(async()=>{
      const original=draw,stats={renders:0,drawMs:[],frameMs:[]};
      draw=function(){const start=performance.now();const result=original();
        stats.renders++;stats.drawMs.push(performance.now()-start);return result;};
      let last=null,frame=null;const start=performance.now();
      await new Promise(resolve=>{
        function tick(now){if(last!==null)stats.frameMs.push(now-last);last=now;
          frame=requestAnimationFrame(tick);}
        frame=requestAnimationFrame(tick);
        setTimeout(()=>{cancelAnimationFrame(frame);resolve();},2500);
      });
      draw=original;
      const p95=a=>a.length?[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*.95)]:0;
      return {seconds:(performance.now()-start)/1000,renders:stats.renders,
        renderRate:stats.renders/((performance.now()-start)/1000),
        drawP95Ms:p95(stats.drawMs),displayP95Ms:p95(stats.frameMs),
        displayedFrames:last===null?0:stats.frameMs.length+1,
        visibility:document.visibilityState};
    })()`);
    const metrics = app.getAppMetrics().map(metric => ({
      type: metric.type, pid: metric.pid,
      percentCPUUsage: metric.cpu.percentCPUUsage,
      workingSetKiB: metric.memory.workingSetSize,
      privateKiB: metric.memory.privateBytes,
    }));
    report.performance[label] = {renderer: measurement, processes: metrics,
      totalCPUPercent: metrics.reduce((sum, row) => sum + row.percentCPUUsage, 0),
      workingSetMiB: metrics.reduce((sum, row) => sum + row.workingSetKiB, 0) / 1024,
      initialBounds: before, finalBounds: win.getBounds()};
    persist();
  }
  persist();
  try {
    settings.autonomous = false;
    const area = state().workArea;
    win.setBounds({x: Math.round(area.x + (area.width - 320) / 2),
      y: Math.round(area.y + area.height - 460), width: 320, height: 400});
    resetAnchor();
    await delay(150);
    check("loaded", {parameters: (await info()).parameters.length,
      nodeUnavailable: await evaluate("typeof require==='undefined'"),
      version: state().modelVersion, passed: (await info()).parameters.length === 27
        && state().modelVersion === "surprise-face-v04"});
    const shot = await win.webContents.capturePage();
    const bitmap = shot.toBitmap();
    let transparent = 0, opaque = 0;
    for (let i = 3; i < bitmap.length; i += 4) {
      if (bitmap[i] === 0) transparent++;
      if (bitmap[i] > 200) opaque++;
    }
    check("transparency", {transparentPixels: transparent, opaquePixels: opaque,
      passed: transparent > bitmap.length / 8 && opaque > 1000});
    const hits = await evaluate(`({corner:window.desktopPet.hitTest(2,2),
      head:window.desktopPet.hitTest(160,125)})`);
    check("alphaHitTest", {...hits, passed: !hits.corner && hits.head});
    const combos = menuTemplate().find(item => item.label === "动作组合").submenu;
    const names = ["surprise", "crescent", "greeting", "proud", "curious", "approve",
      "sleepy", "stroll", "happy"];
    const labels = ["惊讶捂嘴", "月牙闭眼笑", "打招呼", "得意", "好奇", "赞同",
      "犯困", "散步后招呼", "高兴 · 跳跃＋挥手＋眨眼"];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      await evaluate("window.qa.resetStep()");
      await delay(30);
      const before = win.getBounds();
      const entry = [...combos, ...menuTemplate()].find(item => item.label === labels[i]);
      if (!entry?.enabled) throw Error("Missing menu: " + name);
      entry.click();
      await wait(() => evaluate("window.qa.info().emotionPlaying===" + JSON.stringify(name)),
        "start " + name, 10000);
      await delay(name === "sleepy" ? 1250 : name === "happy" ? 810 : 850);
      const peak = await info();
      if (["surprise", "crescent", "happy", "curious", "sleepy"].includes(name))
        fs.writeFileSync(path.join(qa, name + ".png"),
          (await win.webContents.capturePage()).toPNG());
      await wait(idle, "finish " + name);
      const end = await info(), after = win.getBounds(), returned = await restored();
      const result = {name, actualSeconds: end.emotionState.actualSeconds,
        duration: end.emotionState.duration, peakValues: peak.values,
        nativeDeltaX: after.x - before.x, nativeDeltaY: after.y - before.y,
        restored: returned, rootX: end.rootX, rootY: end.rootY,
        passed: returned && Math.abs(end.emotionState.actualSeconds -
          end.emotionState.duration) < .1 && Math.abs(after.y - before.y) <= 1
          && (name === "stroll" ? Math.abs(after.x - before.x) > 10 : after.x === before.x)};
      if (state().desktopEffectsVersion === 1) {
        const expressive = name === "happy" ? peak.values.ParamEyeSmile > .9
            && peak.values.ParamEyeLOpen === 0 && peak.values.ParamMouthForm > .9
          : name === "curious" ? peak.values.ParamEyeShape > .6 && peak.values.ParamMouthForm < -.6
          : name === "sleepy" ? peak.values.ParamMouthOpenY < .4
          : true;
        result.enhancedExpressionPresent = expressive;
        result.passed &&= expressive;
      }
      report.actions.push(result); persist();
      if (!result.passed) throw Error("Menu action failed: " + name);
    }
    await evaluate("window.qa.resetStep()");
    action("jump");
    await wait(() => evaluate("window.qa.info().jumping"), "jump start");
    await wait(idle, "jump end");
    check("independentJump", {actual: (await info()).jumpState.actualSeconds,
      passed: Math.abs((await info()).jumpState.actualSeconds - .7) < .08 && await restored()});
    action("left");
    await wait(() => evaluate("window.qa.info().walking"), "walk start");
    await delay(120); action("surprise");
    await delay(100);
    const queued = await evaluate("window.desktopPet.info().pendingAction");
    await wait(() => evaluate("window.qa.info().emotionPlaying==='surprise'"), "walk then surprise");
    const stand = await info();
    await delay(100); action("right");
    await wait(() => evaluate("window.qa.info().walking&&window.qa.info().stepDirection==='right'"),
      "surprise then right");
    action("stop");
    await wait(idle, "right boundary stop");
    check("walkExpressionReverse", {queued, expressionRoot: stand.rootX,
      finalRoot: (await info()).rootX, passed: queued === "surprise" && stand.rootX === -44
        && (await info()).rootX === 0 && await restored()});
    action("surprise");
    await wait(() => evaluate("window.qa.info().emotionPlaying==='surprise'"), "queue start");
    action("happy"); await delay(30); action("crescent");
    await wait(() => evaluate("window.qa.info().emotionPlaying==='crescent'"), "latest request");
    await wait(idle, "latest end");
    check("latestPendingAction", {passed: await restored()});
    action("face:crescent");
    await wait(() => evaluate("window.desktopPet.info().heldFace==='crescent'"), "held face");
    await evaluate("window.desktopPet.sampleIdle(true)");
    await delay(2700);
    const held = await info();
    await evaluate("window.desktopPet.sampleIdle(false)");
    check("idleDoesNotOpenHeldEyes", {eyes: [held.values.ParamEyeLOpen, held.values.ParamEyeROpen],
      smile: held.values.ParamEyeSmile, passed: held.values.ParamEyeLOpen === 0
        && held.values.ParamEyeROpen === 0 && held.values.ParamEyeSmile === 1});
    action("face:reset"); await delay(100);
    action("surprise");
    await wait(() => evaluate("window.qa.info().emotionPlaying==='surprise'"), "drag expression");
    action("crescent");
    win.webContents.sendInputEvent({type: "mouseDown", x: 160, y: 125,
      button: "left", clickCount: 1});
    win.webContents.sendInputEvent({type: "mouseMove", x: 172, y: 125, movementX: 12, movementY: 0});
    await wait(() => evaluate("window.desktopPet.info().dragging"), "drag starts");
    win.webContents.sendInputEvent({type: "mouseUp", x: 172, y: 125,
      button: "left", clickCount: 1});
    await wait(() => evaluate("!window.desktopPet.info().dragging"), "drag ends");
    await delay(250);
    check("dragCancelsActionAndQueue", {pending: await evaluate("window.desktopPet.info().pendingAction"),
      hostDragging: state().dragging, passed: await idle() && await restored() && !state().dragging});
    action("happy");
    await wait(() => evaluate("window.qa.info().rootY>5"), "jumping before reset");
    action("reset"); await delay(150);
    check("airborneReset", {rootY: (await info()).rootY,
      passed: await idle() && await restored()});
    setSize("large"); await delay(150);
    const large = win.getBounds();
    setSize("normal"); await delay(150);
    const normal = win.getBounds();
    save();
    const stored = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    check("sizeAndSettings", {large, normal, stored,
      passed: Math.abs(large.width - 400) <= 1 && Math.abs(normal.width - 320) <= 1
        && Number.isFinite(stored.x) && Number.isFinite(stored.y) && stored.size === "normal"});
    await evaluate("window.qa.resetStep();window.desktopPet.sampleIdle(true)");
    await perf("idle");
    action("left"); await wait(() => evaluate("window.qa.info().walking"), "perf walk");
    await perf("walking");
    action("stop"); await wait(idle, "perf stop");
    win.hide();
    await delay(100);
    await perf("hidden");
    win.showInactive();
    await evaluate("window.desktopPet.sampleIdle(false);window.qa.resetStep()");
    report.passed = report.actions.length === 9 && report.actions.every(item => item.passed)
      && Object.values(report.checks).every(item => item.passed);
    persist();
    return report;
  } catch (error) {
    report.error = error.stack || String(error); persist(); throw error;
  }
};
