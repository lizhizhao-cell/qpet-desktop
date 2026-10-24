"use strict";
const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("petHost", {
  ready: () => ipcRenderer.send("pet:ready"),
  getState: () => ipcRenderer.invoke("pet:state"),
  companion: (command, payload) => ipcRenderer.invoke("pet:companion", command, payload),
  pose: (x, y) => ipcRenderer.send("pet:pose", {x, y}),
  rebase: () => ipcRenderer.send("pet:rebase"),
  interactive: value => ipcRenderer.send("pet:interactive", !!value),
  drag: (phase, point) => ipcRenderer.send("pet:drag", {phase, point}),
  menu: () => ipcRenderer.send("pet:menu"),
  onAction: callback => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on("pet:action", handler);
    return () => ipcRenderer.removeListener("pet:action", handler);
  },
  onCompanion: callback => {
    const handler = (_event, event) => callback(event);
    ipcRenderer.on("pet:companion-event", handler);
    return () => ipcRenderer.removeListener("pet:companion-event", handler);
  },
  onState: callback => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("pet:state", handler);
    return () => ipcRenderer.removeListener("pet:state", handler);
  },
  onCursor: callback => {
    const handler = (_event, point) => callback(point);
    ipcRenderer.on("pet:cursor", handler);
    return () => ipcRenderer.removeListener("pet:cursor", handler);
  },
});
