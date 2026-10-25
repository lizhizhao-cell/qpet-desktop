"use strict";
(()=>{
  const input=document.getElementById("command-input"),form=document.getElementById("command-form"),
    measure=document.createElement("canvas").getContext("2d");
  let sending=false,composing=false;
  function resizeForText(text){
    const style=getComputedStyle(input);
    measure.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const width=Math.max(160,Math.min(440,Math.ceil(measure.measureText(text).width+54)));
    window.commandHost.resize(width);
  }
  function anchor(value){
    if(!value)return;
    document.body.style.setProperty("--tail-x",Math.max(24,Number(value.tailX)||24)+"px");
    document.body.classList.toggle("tail-up",value.direction==="up");
  }
  window.commandHost.onAnchor(anchor);
  async function send(text){
    if(sending||!text.trim()||composing)return;
    sending=true;input.readOnly=true;input.value="";
    try{
      const result=await window.commandHost.submit(text);
      input.placeholder=result?.reply||"再说一次，好吗？";
      input.title=result?.warning||input.placeholder;
    }catch{
      input.placeholder="暂时没有连上，请重试。";
      input.title=input.placeholder;
    }
    finally{
      sending=false;input.readOnly=false;resizeForText(input.value||input.placeholder);input.focus();
    }
  }
  input.addEventListener("compositionstart",()=>{composing=true});
  input.addEventListener("compositionend",()=>{composing=false;resizeForText(input.value)});
  input.addEventListener("input",()=>resizeForText(input.value));
  input.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!event.isComposing&&!composing){
      event.preventDefault();window.commandHost.close();return;
    }
    if(event.key==="Enter"&&(event.isComposing||event.keyCode===229||composing))event.preventDefault();
  });
  form.addEventListener("submit",event=>{event.preventDefault();send(input.value)});
  window.commandHost.info().then(info=>{
    anchor(info?.anchor);
    if(info?.warning)input.title=info.warning;
    input.focus();
  }).catch(()=>{input.placeholder="暂时没有连上，请重试。"});
})();
