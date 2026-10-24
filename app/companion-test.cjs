"use strict";
const fs = require("node:fs"), path = require("node:path");
const {Companion, MINUTE} = require("./companion-core.cjs");
module.exports = async function test(host) {
  const {win, action, state, root, menuTemplate, testRun, companion, companionCommand,
    sendCompanion, pumpCompanion, requestExit, app} = host;
  const qa = path.join(root, "qa/companion-20261021", testRun);
  if (fs.existsSync(qa)) throw Error("Existing companion evidence protected");
  fs.mkdirSync(qa, {recursive: true});
  const report = {run: testRun, checks: {}, passed: false,
    simulatedFocusClock: true, realSevenDayRetention: false};
  const persist = () => fs.writeFileSync(path.join(qa, "report.json"), JSON.stringify(report, null, 2));
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const evaluate = source => win.webContents.executeJavaScript(source, true);
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
  const idle = () => evaluate("!window.desktopPet.isBusy()");
  const ui = () => evaluate("window.companionUI.info()");
  const dismiss = () => evaluate("window.companionUI.dismiss()");
  const shot = async name => {
    await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    await delay(330);
    fs.writeFileSync(path.join(qa, name + ".png"), (await win.webContents.capturePage()).toPNG());
  };
  const click = (x, y, count = 1) => {
    win.webContents.sendInputEvent({type: "mouseDown", x, y, button: "left", clickCount: count});
    win.webContents.sendInputEvent({type: "mouseUp", x, y, button: "left", clickCount: count});
  };
  persist();
  try {
    await wait(() => evaluate("!!window.companionUI && window.qa.ready"), "companion ready");
    const area = state().workArea;
    win.setBounds({x: Math.round(area.x + (area.width - 320) / 2),
      y: Math.round(area.y + area.height - 450), width: 320, height: 400});
    host.resetAnchor();
    await delay(100);
    let now = Date.now();
    companion.now = () => now;
    const greeting = companion.beginSession();
    sendCompanion(greeting);
    await wait(async () => (await ui()).kind === "greeting", "startup greeting");
    await shot("01-greeting");
    check("startupGreeting", {line: (await ui()).line,
      totalDays: companion.view().totalDays, passed: companion.view().totalDays === 1});
    await wait(idle, "greeting ends"); await dismiss();
    click(160, 125);
    await wait(async () => (await ui()).kind === "touch", "head touch");
    check("headTouchAndBubbleHit", {headTouches: companion.view().headTouches,
      bubbleHit: await evaluate("window.desktopPet.hitTest(40,30)"),
      passed: companion.view().headTouches === 1
        && await evaluate("window.desktopPet.hitTest(40,30)")});
    await shot("02-head-touch");
    const requested = Date.now();
    action("right");
    await wait(() => evaluate("window.qa.info().walking"), "manual overrides companion", 1200);
    check("manualActionHasPriority", {milliseconds: Date.now() - requested,
      passed: Date.now() - requested < 1200});
    action("stop"); await wait(idle, "manual walk ends");
    action("reset"); await delay(80); await dismiss();
    const touchesBefore = companion.view().headTouches;
    now += 5000;
    click(160, 125, 1); await delay(60); click(160, 125, 2);
    await wait(() => evaluate("window.qa.info().emotionPlaying==='happy'"), "double click happy");
    await wait(idle, "happy ends"); await delay(550);
    check("doubleClickKeepsHappyWithoutExtraTouch", {
      touchesBefore, touchesAfter: companion.view().headTouches,
      passed: companion.view().headTouches === touchesBefore});
    now += 5000;
    action("surprise");
    await wait(() => evaluate("window.qa.info().emotionPlaying==='surprise'"), "surprise before drag");
    win.webContents.sendInputEvent({type: "mouseDown", x: 160, y: 125, button: "left", clickCount: 1});
    win.webContents.sendInputEvent({type: "mouseMove", x: 174, y: 125, movementX: 14, movementY: 0});
    await wait(() => evaluate("window.desktopPet.info().dragging"), "drag");
    win.webContents.sendInputEvent({type: "mouseUp", x: 174, y: 125, button: "left", clickCount: 1});
    await wait(idle, "drag reset");
    await delay(550);
    check("dragIsNotATouch", {headTouches: companion.view().headTouches,
      passed: companion.view().headTouches === touchesBefore && !state().dragging});
    const careMenu = menuTemplate().find(item => item.label === "日常陪伴").submenu;
    await careMenu.find(item => item.label === "开始25分钟专注").click();
    await wait(async () => (await ui()).kind === "focus-start", "focus begins");
    await shot("03-focus-start");
    check("manualFocusUsesQuietCompanionship", {
      minutes: companion.view().focus.minutes,
      quiet: await evaluate("window.companionUI.isQuiet()"),
      passed: companion.view().focus.minutes === 25 && await evaluate("window.companionUI.isQuiet()")});
    await companionCommand("focus:pause");
    const paused = companion.view().focus;
    await companionCommand("focus:resume");
    check("pauseResumeMenu", {paused: paused.status, resumed: companion.view().focus.status,
      passed: paused.status === "paused" && companion.view().focus.status === "running"});
    await companionCommand("quiet", {value: true});
    await dismiss();
    now += 25 * MINUTE;
    pumpCompanion(); await delay(100);
    check("quietDefersRest", {completed: companion.view().completedFocus,
      pending: companion.view().reminderPending, uiKind: (await ui()).kind,
      passed: companion.view().completedFocus === 1 && companion.view().reminderPending
        && (await ui()).kind !== "rest"});
    win.hide();
    await companionCommand("quiet", {value: false});
    pumpCompanion(); await delay(100);
    check("hiddenDefersRest", {pending: companion.view().reminderPending,
      passed: companion.view().reminderPending && !(await ui()).visible});
    await delay(6100);
    win.showInactive();
    await wait(async () => (await ui()).kind === "rest", "rest after returning");
    await shot("04-rest");
    await wait(() => !companion.view().reminderPending, "rest acknowledgement");
    const seen = (await ui()).shown;
    pumpCompanion(); pumpCompanion(); await delay(100);
    check("restShownOnce", {seen, after: (await ui()).shown,
      passed: (await ui()).shown === seen && companion.view().completedFocus === 1});
    await evaluate(`Array.from(document.querySelectorAll(".companion-buttons button"))
      .find(button=>button.textContent==="5分钟后提醒").click()`);
    await wait(() => companion.view().reminderPending, "snooze saved");
    check("restSnoozeButton", {dueInMs: companion.data.reminder.dueAt - now,
      passed: companion.data.reminder.dueAt - now === 5 * MINUTE});
    await wait(idle, "rest motion ends");
    const loaded = new Companion({file: companion.file, now: () => now});
    check("localMemorySurvivesReload", {state: loaded.view(),
      passed: loaded.view().headTouches === 1 && loaded.view().completedFocus === 1
        && loaded.view().focusMinutes === 25 && loaded.view().reminderPending});
    const legacy = menuTemplate().find(item => item.label === "动作组合").submenu;
    for (const label of ["惊讶捂嘴", "月牙闭眼笑"]) {
      await dismiss();
      const expected = label === "惊讶捂嘴" ? "surprise" : "crescent";
      legacy.find(item => item.label === label).click();
      await wait(() => evaluate("window.qa.info().emotionPlaying===" + JSON.stringify(expected)),
        "legacy " + expected);
      await wait(idle, "legacy finishes");
    }
    check("oldMenusAndReturn", {passed: await evaluate(`(() => {
      const s=window.qa.info();return s.controls.every(c=>Math.abs(s.values[c.id]-c.default)<1e-7)
        &&!s.error&&!s.webglError&&s.rootY===0;
    })()`)});
    const interactionMenu = () => menuTemplate().find(item => item.label === "互动一下…");
    now += 5000;
    await interactionMenu().click();
    await wait(async () => (await ui()).kind === "interaction-menu", "interaction menu");
    const choiceLabels = await evaluate(`Array.from(document.querySelectorAll(".companion-buttons button"))
      .map(button => button.textContent)`);
    check("manualInteractionChoices", {labels: choiceLabels,
      passed: choiceLabels.join("|") === "给我打气|夸夸她|一起放松"});
    await shot("06-interaction-choices");
    await evaluate(`Array.from(document.querySelectorAll(".companion-buttons button"))
      .find(button => button.textContent === "给我打气").click()`);
    await wait(async () => (await ui()).kind === "interaction", "encouragement");
    await wait(() => evaluate("window.qa.info().emotionPlaying==='approve'"), "encouragement motion");
    check("choiceProducesReplyAndExistingAction", {line: (await ui()).line,
      count: companion.view().interactions.encourage,
      passed: companion.view().interactions.encourage === 1 && !!(await ui()).line});
    await shot("07-interaction-reply");
    await companionCommand("interact", {topic: "praise"});
    check("interactionSpamCooldown", {counts: companion.view().interactions,
      passed: companion.view().interactions.praise === 0});
    await wait(idle, "encouragement end");
    now += 5000;
    await evaluate(`Array.from(document.querySelectorAll(".companion-buttons button"))
      .find(button => button.textContent === "换个互动").click()`);
    await wait(async () => (await ui()).kind === "interaction-menu", "follow-up choices");
    await evaluate(`Array.from(document.querySelectorAll(".companion-buttons button"))
      .find(button => button.textContent === "夸夸她").click()`);
    await wait(() => evaluate("window.qa.info().emotionPlaying==='proud'"), "praise motion");
    check("followupChoiceAndReply", {counts: companion.view().interactions,
      passed: companion.view().interactions.praise === 1 && (await ui()).kind === "interaction"});
    await wait(idle, "praise end");
    now += 5000;
    await companionCommand("quiet", {value: true});
    await companionCommand("interact", {topic: "relax"});
    await wait(() => evaluate("window.qa.info().emotionPlaying==='crescent'"), "manual quiet interaction");
    check("manualInteractionWorksInDoNotDisturb", {
      passed: companion.view().interactions.relax === 1 && (await ui()).kind === "interaction"});
    await wait(idle, "relax end");
    now += 5000;
    await companionCommand("focus:start", {minutes: 25});
    await companionCommand("interact", {topic: "encourage"});
    await delay(100);
    check("focusInteractionDoesNotInterrupt", {line: (await ui()).line,
      passed: companion.view().focus.status === "running" && await idle()
        && (await ui()).kind === "interaction" && companion.view().interactions.encourage === 2});
    await companionCommand("focus:cancel");
    await companionCommand("enabled", {value: false});
    check("disabledInteractionMenu", {enabled: interactionMenu().enabled,
      passed: interactionMenu().enabled === false && !(await ui()).visible});
    await companionCommand("enabled", {value: true});
    await companionCommand("quiet", {value: false});
    const interactionReload = new Companion({file: companion.file, now: () => now});
    check("interactionMemoryPersistsWithOldRecords", {state: interactionReload.view(),
      passed: interactionReload.view().interactions.encourage === 2
        && interactionReload.view().interactions.praise === 1
        && interactionReload.view().interactions.relax === 1
        && interactionReload.view().headTouches === 1
        && interactionReload.view().completedFocus === 1});
    win.hide(); await delay(100);
    const hidden = await evaluate(`(async()=>{
      let calls=0;const original=draw;draw=function(){calls++;return original();};
      await new Promise(resolve=>setTimeout(resolve,700));draw=original;return calls;
    })()`);
    check("hiddenStillStopsDrawing", {drawCalls: hidden, passed: hidden === 0});
    win.showInactive(); await delay(100);
    await dismiss();
    const exitAt = Date.now();
    app.once("will-quit", () => {
      const elapsed = Date.now() - exitAt;
      report.checks.normalExitAfterGoodbye = {elapsedMilliseconds: elapsed, passed: elapsed >= 2150 && elapsed < 4500};
      report.passed = report.passed && report.checks.normalExitAfterGoodbye.passed;
      persist();
      if (!report.passed) process.exitCode = 1;
    });
    requestExit();
    await wait(async () => (await ui()).kind === "goodbye", "goodbye");
    await shot("05-goodbye");
    check("goodbyeVisible", {line: (await ui()).line, passed: (await ui()).closing});
    report.exitHandled = true;
    report.passed = Object.values(report.checks).every(item => item.passed);
    persist();
    return report;
  } catch (error) {
    report.error = error.stack || String(error); persist(); throw error;
  }
};
