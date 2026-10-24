"use strict";

// Small local responses. Automatic events never take over a user's action.
(() => {
  const bubble = document.createElement("section");
  bubble.className = "companion-bubble";
  bubble.setAttribute("role", "status");
  bubble.setAttribute("aria-live", "polite");
  bubble.hidden = true;
  const header = document.createElement("div"), title = document.createElement("span");
  header.className = "companion-header";
  title.textContent = "QPet";
  const close = document.createElement("button");
  close.className = "companion-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "收起");
  header.append(title, close);
  const text = document.createElement("p"), buttons = document.createElement("div");
  buttons.className = "companion-buttons";
  bubble.append(header, text, buttons);
  document.body.append(bubble);
  let care = null, hostVisible = true, active = null, closing = false;
  let hideTimer = null, lastShownAt = -Infinity, lastManualAt = -Infinity, shown = 0;
  function dismiss() {
    clearTimeout(hideTimer);
    bubble.hidden = true;
    active = null;
  }
  close.onclick = dismiss;
  function fail(error) { console.error(error); }
  function addButton(label, callback) {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => Promise.resolve(callback()).catch(fail);
    buttons.append(button);
  }
  async function receive(event) {
    if (!event || typeof event.line !== "string" || !hostVisible) return false;
    if (event.kind === "goodbye") {
      closing = true;
      await window.desktopPet.runAction("reset", {companion: true});
    } else if (closing || care?.enabled === false) return false;
    const now = performance.now();
    if (event.automatic && event.kind !== "goodbye"
        && (care?.doNotDisturb || window.desktopPet.isBusy()
          || now - lastManualAt < 1500 || now - lastShownAt < 6000)) return false;
    dismiss();
    active = event;
    text.textContent = event.line;
    buttons.replaceChildren();
    if (event.kind === "rest") {
      addButton("5分钟后提醒", async () => {
        await window.petHost.companion("rest:snooze", {id: event.id}); dismiss();
      });
      addButton("知道了", dismiss);
    } else if (event.kind === "interaction-menu") {
      for (const choice of event.choices || []) {
        if (!["encourage", "praise", "relax"].includes(choice.id)) continue;
        addButton(choice.label, async () => {
          lastManualAt = performance.now();
          const currentButtons = Array.from(buttons.querySelectorAll("button"));
          for (const button of currentButtons) button.disabled = true;
          try { await window.petHost.companion("interact", {topic: choice.id}); }
          finally { for (const button of currentButtons) button.disabled = false; }
        });
      }
    } else if (event.kind === "interaction") {
      addButton("换个互动", () => window.petHost.companion("interaction:menu", {}));
      addButton("收起", dismiss);
    }
    bubble.hidden = false;
    shown++; lastShownAt = now;
    hideTimer = setTimeout(dismiss,
      ["rest", "interaction-menu"].includes(event.kind) ? 12000 : event.kind === "interaction" ? 8000 : 5000);
    if (event.id) await window.petHost.companion("rest:seen", {id: event.id});
    if (event.action) await window.desktopPet.offerAction(event.action);
    return true;
  }
  window.companionUI = {
    touch: async area => {
      if (closing || !hostVisible || care?.enabled === false) return;
      lastManualAt = performance.now();
      return window.petHost.companion("touch", {area});
    },
    onManualAction() {
      lastManualAt = performance.now();
      if (active?.automatic) dismiss();
    },
    isQuiet: () => !!(care?.enabled && (care.doNotDisturb || care.focus?.status === "running")),
    hitTest(x, y) {
      if (bubble.hidden) return false;
      const rect = bubble.getBoundingClientRect();
      return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
    },
    dismiss,
    info: () => ({visible: !bubble.hidden, kind: active?.kind || null,
      line: active?.line || null, shown, closing, state: care}),
  };
  window.petHost.onCompanion(event => receive(event).catch(fail));
  window.petHost.onState(value => {
    care = value.companion;
    hostVisible = value.visible;
    if (!hostVisible || care?.enabled === false) dismiss();
    if (care?.doNotDisturb && active?.automatic && active.kind !== "goodbye") dismiss();
  });
  window.petHost.getState().then(value => {
    care = value.companion;
    hostVisible = value.visible;
  }).catch(fail);
})();
