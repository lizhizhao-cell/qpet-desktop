"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {parseCommand,loadCustom,validateRules}=require("../app/command-parser.cjs");
test("Chinese punctuation, whitespace and full-width text normalize to exact commands",()=>{
  assert.equal(parseCommand("  跳 一下！ ").value,"jump");
  assert.equal(parseCommand("ＪＵＭＰ").value,"jump");
  assert.equal(parseCommand("帮助！").type,"help");
});
test("negations and arbitrary strings do not accidentally match actions",()=>{
  for(const text of ["不要跳","别向左走","不想休息一下","给我打气然后关电脑","<script>jump</script>","constructor","__proto__"])
    assert.equal(parseCommand(text).type,"unknown",text);
  assert.equal(parseCommand(null).type,"invalid");
  assert.equal(parseCommand("跳".repeat(201)).type,"invalid");
  assert.equal(parseCommand(" ").type,"empty");
});
test("commands retain separate action, focus and companionship semantics",()=>{
  assert.deepEqual([parseCommand("给我打气").type,parseCommand("给我打气").value],["interaction","encourage"]);
  assert.deepEqual([parseCommand("专注25分钟").type,parseCommand("专注25分钟").value],["focus","start25"]);
  assert.equal(parseCommand("停下").value,"stop");
});
test("custom exact aliases return only whitelisted actions and text",()=>{
  const rules=validateRules({schema:1,commands:[{triggers:["击掌"],action:"approve",reply:"击掌！"}]},{custom:true});
  assert.equal(parseCommand("击掌",rules).value,"approve");
  assert.equal(parseCommand("击掌",rules).reply,"击掌！");
  for(const action of ["exec","shell","__proto__","constructor","left;exit"])
    assert.throws(()=>validateRules({schema:1,commands:[{triggers:["测试"],action,reply:"x"}]},{custom:true}));
});
test("custom file parse failure and builtin collisions keep builtin commands working",()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"qpet-command-rules-")),file=path.join(directory,"rules.json");
  fs.writeFileSync(file,"not json");assert.ok(loadCustom(file).warning);
  fs.writeFileSync(file,JSON.stringify({schema:1,commands:[{triggers:["跳一下"],action:"stop",reply:"x"}]}));
  const result=loadCustom(file);assert.ok(result.warning);assert.equal(result.rules.length,0);
  assert.equal(parseCommand("跳一下",result.rules).value,"jump");
  fs.writeFileSync(file," ".repeat(65537));assert.ok(loadCustom(file).warning);
});
test("duplicate normalized triggers and multiple dispatch methods are rejected",()=>{
  assert.throws(()=>validateRules({schema:1,commands:[{triggers:["你好","你 好！"],action:"greeting",reply:"x"}]}));
  assert.throws(()=>validateRules({schema:1,commands:[{triggers:["测试"],action:"jump",focus:"pause",reply:"x"}]}));
});
