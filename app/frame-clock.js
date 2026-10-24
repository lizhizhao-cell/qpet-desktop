"use strict";

// Desktop-only display clock. Motion samplers still receive real timestamps.
(() => {
  const requestNative = window.requestAnimationFrame.bind(window);
  const cancelNative = window.cancelAnimationFrame.bind(window);
  const callbacks = new Map();
  let nextId = 0, nativeId = null, lastFrame = -Infinity, hostVisible = true;
  function schedule() {
    if (nativeId === null && callbacks.size && !document.hidden && hostVisible)
      nativeId = requestNative(tick);
  }
  function tick(now) {
    nativeId = null;
    if (document.hidden || !hostVisible) return;
    if (now - lastFrame < 1000 / 60 - .25) { schedule(); return; }
    lastFrame = now;
    const pending = Array.from(callbacks);
    callbacks.clear();
    for (const [, callback] of pending) {
      try { callback(now); } catch (error) { setTimeout(() => { throw error; }); }
    }
    schedule();
  }
  window.requestAnimationFrame = callback => {
    if (typeof callback !== "function") throw TypeError("Frame callback must be a function");
    const id = ++nextId;
    callbacks.set(id, callback); schedule(); return id;
  };
  window.cancelAnimationFrame = id => callbacks.delete(id);
  window.desktopFrameClock = {
    setVisible(visible) {
      if (hostVisible === !!visible) return;
      hostVisible = !!visible;
      if (nativeId !== null) { cancelNative(nativeId); nativeId = null; }
      lastFrame = -Infinity; schedule();
    },
  };
  document.addEventListener("visibilitychange", () => {
    if (nativeId !== null) { cancelNative(nativeId); nativeId = null; }
    lastFrame = -Infinity; schedule();
  });
})();
