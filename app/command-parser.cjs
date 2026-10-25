"use strict";
const fs=require("node:fs");
const builtins=require("./command-rules.json");
const ACTIONS=new Set(["greeting","jump","happy","left","right","stop","reset","wave","both",
  "blink","nod","surprise","crescent","curious","proud","approve","sleepy","stroll"]);
const FOCUS=new Set(["start25","start50","pause","resume","cancel"]);
const TOPICS=new Set(["encourage","praise","relax"]);
const RESPONSES=new Set(["call","pet","comfort","bored","thanks"]);
const ACTIVITIES=new Set(["natural","lively","quiet"]);
function normalize(text){
  return text.normalize("NFKC").trim().toLowerCase().replace(/[。！!？?，,、\s]+/gu,"");
}
function validateRules(document,{custom=false}={}){
  if(!document||document.schema!==1||!Array.isArray(document.commands)||document.commands.length>100)
    throw Error("指令表应包含 schema: 1 和最多100条 commands。");
  const seen=new Set(["帮助","指令","help","?"]);
  const rules=[];
  for(const item of document.commands){
    if(!item||!Array.isArray(item.triggers)||item.triggers.length<1||item.triggers.length>15)
      throw Error("每条规则需要1至15个触发词。");
    const fields=["action","interaction","focus","response","activity"].filter(key=>Object.hasOwn(item,key));
    if(fields.length!==1)throw Error("每条规则只能指定一种 action、interaction 或 focus。");
    const type=fields[0],value=item[type];
    if(custom&&type!=="action")throw Error("自定义规则目前只支持已有动作 action。");
    const allowed={action:ACTIONS,focus:FOCUS,interaction:TOPICS,response:RESPONSES,activity:ACTIVITIES}[type];
    if(!allowed.has(value))
      throw Error("规则引用了不支持的动作或功能。");
    if(type==="action"&&(typeof item.reply!=="string"||!item.reply.trim()||item.reply.length>240))
      throw Error("动作规则需要1至240字的 reply。");
    const triggers=item.triggers.map(trigger=>{
      if(typeof trigger!=="string"||!trigger.trim()||trigger.length>40)throw Error("触发词需为1至40字。");
      const key=normalize(trigger);
      if(!key||seen.has(key))throw Error("触发词重复或与帮助指令冲突。");
      seen.add(key);return key;
    });
    rules.push({triggers,type,value,reply:item.reply?.trim()});
  }
  return rules;
}
const DEFAULT_RULES=validateRules(builtins);
const defaultKeys=new Set(DEFAULT_RULES.flatMap(rule=>rule.triggers));
const HELP="可以输入：你好、跳一下、高兴、挥手、眨眼、点头、捂嘴、笑一下、向左走、向右走、停下、恢复、给我打气、夸夸你、一起放松、银狼、摸摸头、我好累、好无聊、谢谢、活泼一点、自然一点、安静一点、散步、得意、赞同、专注25分钟、专注50分钟、暂停专注、继续专注、结束专注。";
function loadCustom(file){
  if(!file||!fs.existsSync(file))return {rules:[],warning:null};
  try{
    if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>65536)throw Error("指令文件应是64KiB以内的普通JSON文件。");
    const rules=validateRules(JSON.parse(fs.readFileSync(file,"utf8").replace(/^\uFEFF/,"")),{custom:true});
    if(rules.some(rule=>rule.triggers.some(trigger=>defaultKeys.has(trigger))))
      throw Error("自定义触发词与内置指令重复，请换一个触发词。");
    return {rules,warning:null};
  }catch(error){return {rules:[],warning:"自定义指令表未加载："+error.message};}
}
function parseCommand(text,custom=[]){
  if(typeof text!=="string"||text.length>200)return {type:"invalid",reply:"请输入200字以内的指令。"};
  const trimmed=text.trim();
  if(!trimmed)return {type:"empty",reply:"先输入一句指令吧。"};
  if(["帮助","指令","help","?","？"].includes(trimmed.toLowerCase()))
    return {type:"help",reply:HELP};
  const key=normalize(trimmed);
  if(["帮助","指令","help"].includes(key))return {type:"help",reply:HELP};
  const rule=[...DEFAULT_RULES,...custom].find(rule=>rule.triggers.includes(key));
  if(!rule)return {type:"unknown",reply:"这句我暂时没有对应动作。输入“帮助”查看支持的指令。"};
  return {type:rule.type,value:rule.value,reply:rule.reply};
}
module.exports={parseCommand,loadCustom,validateRules,normalize,HELP};
