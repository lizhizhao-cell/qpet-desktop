"use strict";
// Pure policy shared by the renderer and Node tests; it never touches model data.
((root,factory)=>{
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PetAutonomy=api;
})(globalThis,()=>{
  const MODES=Object.freeze({natural:[35000,65000],lively:[18000,32000],quiet:null});
  class Scheduler{
    constructor({now=0,random=Math.random}={}){
      this.random=random;this.nextAt=now+25000;this.last=null;this.count=0;
    }
    defer(now,mode="natural"){
      const range=MODES[mode]||MODES.natural;
      this.nextAt=now+range[0]+this.random()*(range[1]-range[0]);
    }
    step(now,state){
      const mode=state.mode||"natural";
      const blocked=!state.enabled||mode==="quiet"||!state.visible||state.busy
        ||state.focus||state.doNotDisturb||state.typing||state.hovered
        ||state.dragging||state.heldFace||state.menuOpen;
      if(blocked){this.nextAt=Math.max(this.nextAt,now+15000);return null}
      if(now<this.nextAt)return null;
      let choices=["nod","curious","wave","crescent"];
      if((state.hour>=22||state.hour<7)&&this.count%3===2&&(!state.canStroll||this.count%6===5))choices=["sleepy"];
      else if(state.canStroll&&this.count%3===2)choices=["stroll"];
      choices=choices.filter(action=>action!==this.last);
      if(!choices.length)choices=["nod"];
      const action=choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))];
      this.last=action;this.count++;this.defer(now,mode);
      return action;
    }
    info(){return {nextAt:this.nextAt,last:this.last,count:this.count}}
  }
  return {Scheduler,MODES};
});
