"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {Scheduler}=require("../app/autonomy.js");
const ready={enabled:true,mode:"natural",visible:true,canStroll:true,hour:12};
test("autonomous actions vary, use bounded strolls and respect the cadence",()=>{
  const scheduler=new Scheduler({random:()=>0});
  assert.equal(scheduler.step(24999,ready),null);
  assert.equal(scheduler.step(25000,ready),"nod");
  assert.equal(scheduler.step(26000,ready),null);
  assert.equal(scheduler.step(60000,ready),"curious");
  assert.equal(scheduler.step(95000,ready),"stroll");
});
test("every blocking situation defers autonomy and allows a recovery interval",()=>{
  for(const change of [{enabled:false},{mode:"quiet"},{visible:false},{busy:true},{focus:true},
    {doNotDisturb:true},{typing:true},{hovered:true},{dragging:true},{heldFace:true},{menuOpen:true}]){
    const scheduler=new Scheduler({random:()=>0});
    assert.equal(scheduler.step(40000,{...ready,...change}),null,JSON.stringify(change));
    assert.equal(scheduler.step(54999,ready),null);
    assert.ok(scheduler.step(55000,ready));
  }
});
test("lively cadence is shorter, no room avoids strolling, and late hours can get sleepy",()=>{
  const natural=new Scheduler({random:()=>0}),lively=new Scheduler({random:()=>0});
  natural.defer(100);lively.defer(100,"lively");
  assert.ok(lively.nextAt<natural.nextAt);
  const scheduler=new Scheduler({random:()=>0});
  scheduler.step(25000,ready);scheduler.step(60000,ready);
  assert.equal(scheduler.step(95000,{...ready,canStroll:false,hour:23}),"sleepy");
});
