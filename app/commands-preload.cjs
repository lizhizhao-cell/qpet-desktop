"use strict";
const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("commandHost",{
  submit:text=>ipcRenderer.invoke("pet:command",text),
  info:()=>ipcRenderer.invoke("pet:command-info"),
  close:()=>ipcRenderer.send("pet:command-close"),
  resize:width=>ipcRenderer.send("pet:command-resize",width),
  onAnchor:callback=>{
    const handler=(_event,value)=>callback(value);
    ipcRenderer.on("pet:command-anchor",handler);
    return ()=>ipcRenderer.removeListener("pet:command-anchor",handler);
  },
});
