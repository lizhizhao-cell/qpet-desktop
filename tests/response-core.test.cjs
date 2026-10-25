"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {Companion}=require("../app/companion-core.cjs");
const {parseCommand,validateRules}=require("../app/command-parser.cjs");
function fixture(){
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"qpet-responses-")),"care.json");
  let now=100000;
  return {file,care:new Companion({file,now:()=>now}),advance:ms=>now+=ms,clock:()=>now};
}
test("new local interactions rotate, share cooldown with old topics and survive reload",()=>{
  const f=fixture(),first=f.care.respond("call");
  assert.equal(first.action,"greeting");assert.equal(f.care.interact("praise"),null);
  f.advance(4000);const second=f.care.respond("call");assert.notEqual(first.line,second.line);
  assert.equal(new Companion({file:f.file,now:f.clock}).view().responses.call,2);
  f.advance(4000);assert.equal(f.care.interact("praise").action,"proud");
  assert.equal(f.care.respond("pet"),null);
});
test("focus, disabled companionship, invalid topics and clearing keep their semantics",()=>{
  const f=fixture();assert.equal(f.care.respond("__proto__"),null);assert.equal(fs.existsSync(f.file),false);
  f.care.startFocus(25);assert.equal(f.care.respond("bored").action,null);
  assert.equal(f.care.view().focus.status,"running");f.care.setEnabled(false);f.advance(4000);
  assert.equal(f.care.respond("pet"),null);f.care.clearMemory();
  assert.deepEqual(f.care.view().responses,{call:0,pet:0,comfort:0,bored:0,thanks:0});
});
test("older records remain compatible and new aliases cannot be mistaken for arbitrary chat",()=>{
  const f=fixture();
  fs.writeFileSync(f.file,JSON.stringify({schema:1,headTouches:8,completedFocus:2}));
  const restored=new Companion({file:f.file,now:f.clock});
  assert.equal(restored.view().headTouches,8);assert.equal(restored.view().completedFocus,2);
  assert.equal(restored.view().responses.call,0);
  assert.equal(parseCommand("活泼一点").value,"lively");assert.equal(parseCommand("银狼").type,"response");
  assert.equal(parseCommand("别活泼一点").type,"unknown");
  assert.throws(()=>validateRules({schema:1,commands:[{triggers:["测试"],response:"bored"}]},{custom:true}));
});
