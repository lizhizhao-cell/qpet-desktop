"use strict";

// The model and motion scripts are unchanged; this adapter sends root motion
// to the real native window and keeps character rendering centred inside it.
(() => {
  let hostState = null, dragging = false, lastInteractive = null;
  let lastPoseAt = -Infinity, lastSent = {x: NaN, y: NaN};
  let lastAction = performance.now(), lastIdleFrame = 0, blinkAt = 0, nextBlink = 0;
  let pointer = null, autonomousAction = false;
  const autonomy = new window.PetAutonomy.Scheduler({now:performance.now()});
  let actionSerial = 0, pendingAction = null, heldFace = null, performanceSampling = false;
  let companionAction = false, touchTimer = null;
  const pixel = new Uint8Array(4);
  const originalDraw = draw;
  let cssPixelsPerModel = .3;

  function emitPose(x, y, force = false) {
    const now = performance.now(), converted = {x: x * cssPixelsPerModel, y: y * cssPixelsPerModel};
    if (!force && now - lastPoseAt < 16) return;
    if (converted.x === lastSent.x && converted.y === lastSent.y) return;
    lastSent = converted; lastPoseAt = now;
    window.petHost.pose(converted.x, converted.y);
  }
  draw = function () {
    if (hostState?.visible === false) return;
    const x = previewRootX, y = previewRootY;
    previewRootX = 0; previewRootY = 0;
    originalDraw();
    previewRootX = x; previewRootY = y;
    if (fit && window.qa.ready) emitPose(x, y, y === 0);
  };

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    if (!model || !window.qa.ready) return;
    // Match the proven full-body framing while using the desktop window aspect.
    const sy = 1.0016378164291382, sx = sy * canvas.height / canvas.width;
    fit = new Float32Array([sx, sy, -.00195 * -sx, .00078124 * sy]);
    cssPixelsPerModel = innerHeight * sy / 1280;
    draw();
  }
  window.desktopPet = {
    availableCycles(spec) {
      if (!hostState) return 0;
      const b = hostState.bounds, a = hostState.workArea;
      const distance = spec.direction < 0 ? b.x - a.x : a.x + a.width - b.x - b.width;
      return Math.max(0, Math.floor(distance / (spec.stride * cssPixelsPerModel)));
    },
    info: () => ({hostState, cssPixelsPerModel, dragging, transparent: true,
      pendingAction, heldFace, autonomousAction, autonomy:autonomy.info()}),
    sampleIdle: value => { performanceSampling = !!value; },
    hitTest(x, y) {
      if (window.companionUI?.hitTest(x, y)) return true;
      const r = canvas.getBoundingClientRect();
      const px = Math.floor((x - r.left) * canvas.width / r.width);
      const py = canvas.height - 1 - Math.floor((y - r.top) * canvas.height / r.height);
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return false;
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return pixel[3] > 16;
    },
  };
  function setInteractive(value) {
    if (value !== lastInteractive) {
      lastInteractive = value; window.petHost.interactive(value);
    }
  }
  function resetAtCurrent(cancelPending = true) {
    companionAction = false; autonomousAction = false;
    if (cancelPending) { actionSerial++; pendingAction = null; }
    heldFace = null;
    stop();
    // Rebase before resetting the accumulated walking coordinate to zero.
    emitPose(previewRootX, 0, true);
    window.petHost.rebase();
    previewRootX = 0; previewRootY = 0;
    lastSent = {x: NaN, y: NaN};
    writeValues({}, true); draw();
  }
  const originalReset = window.qa.resetStep;
  window.qa.resetStep = () => { resetAtCurrent(); return window.qa.info(); };
  async function runAction(name, options = {}) {
    if (!options.companion) {
      autonomy.defer(performance.now(),hostState?.settings.activityMode);
      window.companionUI?.onManualAction();
      if (companionAction) resetAtCurrent(false);
    }
    lastAction = performance.now();
    const serial = ++actionSerial;
    pendingAction = null;
    if (name === "reset" || name === "face:reset") return resetAtCurrent();
    if (name === "stop") {
      document.querySelector("#step_stop").click();
      if (!window.qa.info().walking) resetAtCurrent();
      return;
    }
    if (dragging) return;
    companionAction = !!options.companion;
    autonomousAction = !!options.autonomous;
    const s = window.qa.info();
    if (s.walking || s.pendingStepDirection || s.jumpPending || s.pendingEmotion)
      document.querySelector("#step_stop").click();
    if (s.playing || s.returning) resetAtCurrent(false);
    pendingAction = name;
    while (window.qa.info().walking || window.qa.info().jumping
        || window.qa.info().emotionPlaying) {
      if (serial !== actionSerial) return;
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    if (serial !== actionSerial) return;
    pendingAction = null;
    heldFace = null;
    if (name.startsWith("face:")) {
      resetAtCurrent(false);
      const preset = name.slice(5);
      window.qa.applyFace(preset);
      heldFace = preset;
      return;
    }
    if (name === "left" || name === "right") return window.qa.walkDirection(name);
    if (["happy","greeting","proud","curious","approve","sleepy","stroll",
         "surprise","crescent"].includes(name)) return window.qa.playEmotion(name);
    if (name === "jump") return window.qa.joyJump();
    if (["wave", "both", "blink", "nod", "head"].includes(name))
      return activate(name);
  }
  window.desktopPet.runAction = runAction;
  window.desktopPet.isBusy = () => {
    if (!window.qa.ready) return true;
    const s = window.qa.info();
    return !!(s.walking || s.jumping || s.emotionPlaying || s.playing || s.returning
      || s.pendingStepDirection || s.pendingEmotion || s.jumpPending || dragging || pendingAction);
  };
  window.desktopPet.offerAction = async name => {
    if (window.desktopPet.isBusy() || heldFace || hostState?.visible === false) return false;
    await runAction(name, {companion: true}); return true;
  };
  window.petHost.onAction(name => Promise.resolve(runAction(name)).catch(fail));
  window.petHost.onState(value => {
    const previous=hostState;
    hostState = value;
    if(previous?.visible!==value.visible||previous?.commandOpen!==value.commandOpen
      ||previous?.settings.activityMode!==value.settings.activityMode
      ||previous?.companion?.doNotDisturb!==value.companion?.doNotDisturb
      ||previous?.companion?.focus?.status!==value.companion?.focus?.status)
      autonomy.defer(performance.now(),value.settings.activityMode);
    window.desktopFrameClock?.setVisible(value.visible !== false);
    if (value.settings.clickThrough) setInteractive(false);
    if(autonomousAction&&(!value.visible||!value.settings.autonomous
      ||value.settings.activityMode==="quiet"||value.commandOpen||value.menuOpen
      ||value.companion?.doNotDisturb||value.companion?.focus?.status==="running"))
      resetAtCurrent();
  });
  window.petHost.onCursor(point => {
    if (!dragging) setInteractive(window.desktopPet.hitTest(point.x, point.y));
  });
  window.addEventListener("resize", resize);
  canvas.addEventListener("pointermove", event => {
    if (dragging) { window.petHost.drag("move"); return; }
    setInteractive(window.desktopPet.hitTest(event.clientX, event.clientY));
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4) {
      clearTimeout(touchTimer);
      window.companionUI?.onManualAction();
      resetAtCurrent(); dragging = true;
      window.petHost.drag("start");
    }
  });
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !window.desktopPet.hitTest(event.clientX, event.clientY)) return;
    pointer = {x: event.clientX, y: event.clientY};
    autonomy.defer(performance.now(),hostState?.settings.activityMode);
    canvas.setPointerCapture(event.pointerId);
    lastAction = performance.now();
  });
  canvas.addEventListener("pointerup", event => {
    const tapped = !!pointer && !dragging && event.button === 0;
    if (dragging) window.petHost.drag("end");
    dragging = false; pointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (tapped) {
      clearTimeout(touchTimer);
      const area = event.clientY < innerHeight * .55 ? "head" : "body";
      touchTimer = setTimeout(() => {
        window.companionUI?.touch(area).catch(fail);
        window.petHost.openCommands();
      }, 500);
    }
  });
  canvas.addEventListener("pointercancel", () => {
    clearTimeout(touchTimer);
    if (dragging) window.petHost.drag("end");
    dragging = false; pointer = null;
  });
  window.addEventListener("blur", () => {
    clearTimeout(touchTimer);
    if (dragging) window.petHost.drag("end");
    dragging = false; pointer = null;
  });
  canvas.addEventListener("mouseleave", () => { if (!dragging) setInteractive(false); });
  canvas.addEventListener("contextmenu", event => {
    event.preventDefault(); window.petHost.menu();
  });
  canvas.addEventListener("dblclick", () => {
    clearTimeout(touchTimer); runAction("happy").catch(fail);
  });

  function autonomousStep(now) {
    const state=hostState,care=state?.companion;
    const busy=window.desktopPet.isBusy();
    if(!busy)autonomousAction=false;
    const selected=autonomy.step(now,{
      enabled:!!state?.settings.autonomous,mode:state?.settings.activityMode,
      visible:!!state?.visible,busy,focus:care?.focus?.status==="running",
      doNotDisturb:!!care?.doNotDisturb,typing:!!state?.commandOpen,
      hovered:lastInteractive===true,dragging:dragging||!!pointer,
      heldFace:!!heldFace,menuOpen:!!state?.menuOpen,
      canStroll:!care?.reminderPending&&Math.max(window.qa.stepCapacity("left"),window.qa.stepCapacity("right"))>0,
      hour:new Date().getHours(),
    });
    if(selected)runAction(selected,{companion:true,autonomous:true}).catch(fail);
    return selected;
  }
  window.desktopPet.sampleAutonomy = now => hostState?.selfTest ? autonomousStep(now) : null;
  function idle(now) {
    if (window.qa.ready && now - lastIdleFrame >= 33) {
      lastIdleFrame = now;
      const s = window.qa.info();
      const busy = s.walking || s.jumping || s.emotionPlaying || s.playing || s.returning
        || s.pendingStepDirection || s.jumpPending || s.pendingEmotion || dragging
        || pendingAction || hostState?.visible === false
        || (hostState?.selfTest && !performanceSampling);
      if (!busy) {
        if (now >= nextBlink) {
          blinkAt = now; nextBlink = now + 3500 + Math.random() * 2200;
        }
        const f = (now - blinkAt) / 220;
        const eyes = f < 1 ? 1 - Math.sin(Math.PI * Math.max(0, f)) ** 2 : 1;
        const values = {ParamBreath: (1 - Math.cos(now / 4000 * Math.PI * 2)) * .28};
        if (!heldFace) Object.assign(values, {ParamEyeLOpen: eyes, ParamEyeROpen: eyes});
        writeValues(values, false);
        draw();
        autonomousStep(now);
      }
    }
    requestAnimationFrame(idle);
  }
  function fail(error) { lastError = error.stack || error.message; console.error(error); }
  async function ready() {
    if (!window.qa.ready || !document.querySelector("#emotion_happy").onclick
        || !document.querySelector("#emotion_crescent")?.onclick) {
      setTimeout(() => ready().catch(fail), 50); return;
    }
    resize();
    hostState = await window.petHost.getState();
    nextBlink = performance.now() + 2500;
    window.petHost.ready();
    requestAnimationFrame(idle);
  }
  resize();
  ready().catch(fail);
})();
