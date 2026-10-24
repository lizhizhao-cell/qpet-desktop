"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {Companion}=require("../app/companion-core.cjs");
function fixture(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"qpet-interactions-"));
  let now=100000;
  const file=path.join(directory,"companion.json"),care=new Companion({file,now:()=>now});
  return {care,file,tick:ms=>now+=ms,clock:()=>now};
}
test("legacy memory gains additive interaction fields without changing old records",()=>{
  const f=fixture();
  fs.writeFileSync(f.file,JSON.stringify({schema:1,enabled:true,headTouches:7,completedFocus:3,focusMinutes:75}));
  const care=new Companion({file:f.file,now:f.clock});
  assert.equal(care.view().headTouches,7);assert.equal(care.view().completedFocus,3);
  assert.deepEqual(care.view().interactions,{encourage:0,praise:0,relax:0});
});
test("menu is manual and reading it never increments memory",()=>{
  const {care,file}=fixture(),menu=care.interactionMenu();
  assert.equal(menu.automatic,false);assert.equal(menu.action,null);
  assert.deepEqual(menu.choices.map(c=>c.id),["encourage","praise","relax"]);
  assert.equal(fs.existsSync(file),false);
});
test("unknown choices do not write or consume cooldown",()=>{
  const {care,file}=fixture();
  assert.equal(care.interact("__proto__"),null);assert.equal(care.interact("constructor"),null);
  assert.equal(fs.existsSync(file),false);assert.equal(care.interact("praise").action,"proud");
});
test("manual interactions have a shared four second cooldown and persistent totals",()=>{
  const f=fixture();assert.equal(f.care.interact("encourage").action,"approve");
  assert.equal(f.care.interact("relax"),null);
  f.tick(3999);assert.equal(f.care.interact("praise"),null);
  f.tick(1);assert.equal(f.care.interact("relax").action,"crescent");
  const restored=new Companion({file:f.file,now:f.clock});
  assert.deepEqual(restored.view().interactions,{encourage:1,praise:0,relax:1});
  assert.equal(restored.interact("praise"),null);
});
test("focus keeps interactions quiet without changing the focus clock",()=>{
  const f=fixture();f.care.startFocus(25);
  const deadline=f.care.data.focus.deadline,reply=f.care.interact("praise");
  assert.equal(reply.action,null);assert.equal(reply.automatic,false);
  assert.equal(f.care.data.focus.deadline,deadline);assert.equal(f.care.data.focus.status,"running");
});
test("do not disturb permits user initiated interaction; disabling companionship blocks it",()=>{
  const f=fixture();f.care.setDoNotDisturb(true);
  assert.equal(f.care.interact("relax").action,"crescent");
  f.care.setEnabled(false);f.tick(5000);
  assert.equal(f.care.interactionMenu(),null);assert.equal(f.care.interact("praise"),null);
  assert.deepEqual(f.care.view().interactions,{encourage:0,praise:0,relax:1});
});
test("reply text rotates without changing the topic action; clear resets interaction memory",()=>{
  const f=fixture(),first=f.care.interact("encourage");
  f.tick(4000);const second=f.care.interact("encourage");
  assert.notEqual(first.line,second.line);assert.equal(second.action,first.action);
  f.care.clearMemory();assert.deepEqual(f.care.view().interactions,{encourage:0,praise:0,relax:0});
  assert.equal(f.care.data.lastInteractionAt,0);
});
