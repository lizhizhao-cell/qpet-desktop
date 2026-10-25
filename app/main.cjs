"use strict";
const {app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, dialog} = require("electron");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const crypto = require("node:crypto");
const {Companion} = require("./companion-core.cjs");
const {parseCommand, loadCustom} = require("./command-parser.cjs");
const {commandPlacement} = require("./command-placement.cjs");
const ROOT = __dirname, PROJECT = path.resolve(ROOT, "..");
const RUNTIME = path.join(PROJECT, "production-live2d/runtime");
const adoptedModel = JSON.parse(fs.readFileSync(path.join(ROOT, "model-version.json"), "utf8"));
if (!adoptedModel.authorizedForDesktopUse || !/^[a-z0-9-]+$/.test(adoptedModel.runtimeVersion))
  throw Error("Invalid desktop model adoption record");
const MODEL_VERSION = adoptedModel.runtimeVersion;
const DESKTOP_PAGE = "/runtime/" + MODEL_VERSION + "/outward/desktop.html";
const EXPRESSION_TEST = process.argv.includes("--expression-integration-test");
const COMPANION_TEST = process.argv.includes("--companion-test");
const COMMAND_TEST = process.argv.includes("--command-test");
const DAILY_TEST = process.argv.includes("--daily-actions-test");
const SELF_TEST = process.argv.includes("--self-test") || DAILY_TEST || EXPRESSION_TEST || COMPANION_TEST || COMMAND_TEST;
const testRun = process.argv.find(value => value.startsWith("--qa-run="))?.slice(9) || "integration";
if (!/^[a-z0-9-]+$/.test(testRun)) throw Error("Invalid QA run name");
const SIZES = {small: [260, 330], normal: [320, 400], large: [400, 500]};
app.setName("QPet Desktop");
const QA_ROOT = app.isPackaged ? path.join(app.getPath("temp"), "QPet2D-Desktop-QA") : ROOT;
app.setPath("userData", SELF_TEST
  ? path.join(QA_ROOT, COMMAND_TEST ? ".qa-commands-20261024/" + testRun
    : COMPANION_TEST ? ".qa-companion-20261021/" + testRun
    : EXPRESSION_TEST ? ".qa-expressions-20261021/" + testRun : ".qa-user-data")
  : path.join(app.getPath("appData"), "QPet2D-Desktop"));
const STATE_FILE = path.join(app.getPath("userData"), "settings.json");
const INSTANCE_FILE = app.isPackaged || EXPRESSION_TEST || COMPANION_TEST || COMMAND_TEST
  ? path.join(app.getPath("userData"), ".instance.json") : path.join(ROOT, ".instance.json");
const defaults = {size: "normal", alwaysOnTop: true, clickThrough: false, autonomous: true, activityMode: "natural"};
const companion = new Companion({file: path.join(app.getPath("userData"), "companion.json")});
let settings = {...defaults};
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  for (const key of Object.keys(defaults)) {
    if (typeof saved[key] === typeof defaults[key]) settings[key] = saved[key];
  }
  if (!SIZES[settings.size]) settings.size = "normal";
  if (!["natural","lively","quiet"].includes(settings.activityMode)) settings.activityMode = "natural";
  if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    settings.x = saved.x; settings.y = saved.y;
  }
} catch { /* First run uses defaults. */ }
let win, tray, server, origin, saveTimer, cursorTimer, anchor = {x: 0, y: 0};
let pose = {x: 0, y: 0}, drag = null, interactive = false, menuOpen = false;
let rendererReady = false, quitting = false;
let companionTimer, exitTimer, exitStarted = false, exitAuthorized = false;
let commandWindow = null, lastCommandAt = 0;
let commandAnchor = null;
let commandWidth = 160;
const COMMANDS_PAGE = "/desktop/commands.html";
const COMMAND_RULES_FILE = path.join(app.getPath("userData"), "interaction-commands.json");

function errorLog(error) {
  fs.mkdirSync(app.getPath("userData"), {recursive: true});
  fs.appendFileSync(path.join(app.getPath("userData"), "error.log"),
    new Date().toISOString() + " " + (error.stack || error) + "\n");
}
function save() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  settings.x = b.x; settings.y = Math.round(b.y + pose.y);
  fs.mkdirSync(path.dirname(STATE_FILE), {recursive: true});
  const temporary = STATE_FILE + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(settings, null, 2));
  fs.renameSync(temporary, STATE_FILE);
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 350);
}
function workArea(bounds = win.getBounds()) {
  return screen.getDisplayMatching(bounds).workArea;
}
function clampBounds(b) {
  const area = workArea(b);
  return {...b, x: Math.round(Math.max(area.x, Math.min(b.x, area.x + area.width - b.width))),
    y: Math.round(Math.max(area.y, Math.min(b.y, area.y + area.height - b.height)))};
}
function state() {
  return {settings, bounds: win.getBounds(), workArea: workArea(), dragging: !!drag,
    commandOpen:!!commandWindow&&!commandWindow.isDestroyed()&&commandWindow.isVisible(),menuOpen,
    interactive, ignoringMouse: settings.clickThrough || (!interactive && !drag && !menuOpen),
    rendererReady, selfTest: SELF_TEST, version: process.versions.electron,
    modelVersion: MODEL_VERSION, desktopEffectsVersion: 1, visible: win.isVisible(),
    companion: companion.view()};
}
function sendState() {
  if (win && !win.isDestroyed()) win.webContents.send("pet:state", state());
}
function updateMouse() {
  const ignore = settings.clickThrough || (!interactive && !drag && !menuOpen);
  win.setIgnoreMouseEvents(ignore, {forward: true});
}
function resetAnchor() {
  const b = win.getBounds();
  anchor = {x: b.x, y: b.y};
  pose = {x: 0, y: 0};
}
function action(name) {
  if (rendererReady) win.webContents.send("pet:action", name);
}
function sendCompanion(event) {
  if (!event || !rendererReady || !win || win.isDestroyed() || !win.isVisible()) return false;
  win.webContents.send("pet:companion-event", event);
  return true;
}
function pumpCompanion() {
  clearTimeout(companionTimer);
  if (quitting || exitStarted) return;
  const event = companion.tick(), view = companion.view();
  const canShow = rendererReady && win && !win.isDestroyed() && win.isVisible()
    && view.enabled && !view.doNotDisturb;
  if (event && canShow) sendCompanion(event);
  const due = companion.nextDueAt();
  if (due === null || (due <= companion.now() && !canShow)) return;
  companionTimer = setTimeout(() => {
    pumpCompanion(); sendState();
  }, Math.max(event && canShow ? 15000 : 250, due - companion.now()));
}
async function companionCommand(command, payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return companion.view();
  let event = null;
  if (command === "touch") event = companion.touch(payload.area);
  else if (command === "interaction:menu") event = companion.interactionMenu();
  else if (command === "interact" && typeof payload.topic === "string") event = companion.interact(payload.topic);
  else if (command === "respond" && typeof payload.topic === "string") event = companion.respond(payload.topic);
  else if (command === "focus:start" && [25, 50].includes(payload.minutes))
    event = companion.startFocus(payload.minutes);
  else if (command === "focus:pause") companion.pauseFocus();
  else if (command === "focus:resume") companion.resumeFocus();
  else if (command === "focus:cancel") companion.cancelFocus();
  else if (command === "rest:seen" && typeof payload.id === "string") companion.acknowledge(payload.id);
  else if (command === "rest:snooze" && typeof payload.id === "string") companion.snooze(payload.id);
  else if (command === "enabled" && typeof payload.value === "boolean") companion.setEnabled(payload.value);
  else if (command === "quiet" && typeof payload.value === "boolean") companion.setDoNotDisturb(payload.value);
  else if (command !== "peek") return companion.view();
  sendState();
  sendCompanion(event);
  pumpCompanion();
  return companion.view();
}
function setActivityMode(mode) {
  if(!["natural","lively","quiet"].includes(mode))return false;
  settings.activityMode=mode;settings.autonomous=mode!=="quiet";
  scheduleSave();sendState();return true;
}
async function executePetCommand(text) {
  const custom = loadCustom(COMMAND_RULES_FILE), parsed = parseCommand(text, custom.rules);
  const reply = (message, accepted = false) => ({reply: message, accepted, warning: custom.warning});
  if (["invalid", "empty", "unknown", "help"].includes(parsed.type)) return reply(parsed.reply);
  if (quitting || exitStarted || !rendererReady) return reply("桌宠暂时没有准备好，请稍后再试。");
  const immediate = parsed.type === "action" && ["stop", "reset"].includes(parsed.value);
  if (!immediate && Date.now() - lastCommandAt < 250) return reply("稍等一下，再发送下一句指令吧。");
  lastCommandAt = Date.now();
  if(parsed.type==="activity"){
    setActivityMode(parsed.value);
    return reply(parsed.value==="quiet"?"好，我先安静待着。你叫我，我就回应。"
      :parsed.value==="lively"?"好呀，我会更活泼些，空闲时自己活动一下。":"收到，按自然的节奏陪着你。",true);
  }
  if (parsed.type === "action") {
    if (!win.isVisible()) win.showInactive();
    action(parsed.value);
    return reply(parsed.reply, true);
  }
  if (parsed.type === "interaction" || parsed.type === "response") {
    if (!companion.view().enabled) return reply("陪伴互动已关闭，请在“日常陪伴”里打开后再试。");
    const event = parsed.type === "response" ? companion.respond(parsed.value) : companion.interact(parsed.value);
    if (!event) return reply("让我缓一小会儿，互动之间请间隔4秒。");
    sendState();
    if (event.action) { if (!win.isVisible()) win.showInactive(); action(event.action); }
    return reply(event.line, true);
  }
  const care = companion.view();
  if (!care.enabled) return reply("陪伴互动已关闭，请先打开陪伴互动。");
  if (parsed.value === "start25" || parsed.value === "start50") {
    if (care.focus) return reply("已经有一轮专注，可以输入“暂停专注”或“结束专注”。");
    const minutes = parsed.value === "start25" ? 25 : 50;
    await companionCommand("focus:start", {minutes});
    return reply(`已开始${minutes}分钟专注，我会安静陪着。`, true);
  }
  if (!care.focus) return reply("现在没有进行中的专注，可以输入“专注25分钟”开始。");
  if (parsed.value === "pause") {
    if (care.focus.status === "paused") return reply("这轮专注已经暂停了。");
    await companionCommand("focus:pause"); return reply("已暂停专注。准备好后输入“继续专注”。", true);
  }
  if (parsed.value === "resume") {
    if (care.focus.status === "running") return reply("这轮专注正在进行中。");
    await companionCommand("focus:resume"); return reply("已继续这轮专注。", true);
  }
  await companionCommand("focus:cancel"); return reply("已结束这轮专注。", true);
}
function positionCommandWindow(requestedWidth = commandWidth) {
  if (!commandWindow || commandWindow.isDestroyed() || !win || win.isDestroyed()) return;
  if (Number.isFinite(requestedWidth)) commandWidth = Math.round(Math.max(160, Math.min(440, requestedWidth)));
  commandAnchor = commandPlacement(win.getBounds(), workArea(), commandWidth);
  const current = commandWindow.getBounds(), next = commandAnchor.bounds;
  if (Object.keys(next).some(key => current[key] !== next[key])) commandWindow.setBounds(next, false);
  commandWindow.webContents.send("pet:command-anchor", commandAnchor);
}
async function openCommandWindow() {
  if (!rendererReady || quitting || exitStarted) return;
  if (!win.isVisible()) win.showInactive();
  if (commandWindow && !commandWindow.isDestroyed()) {
    if (commandWindow.isMinimized()) commandWindow.restore();
    positionCommandWindow(); commandWindow.show(); commandWindow.focus(); return;
  }
  fs.mkdirSync(path.dirname(COMMAND_RULES_FILE), {recursive: true});
  if (!fs.existsSync(COMMAND_RULES_FILE))
    fs.writeFileSync(COMMAND_RULES_FILE, JSON.stringify({schema: 1, commands: []}, null, 2), {flag: "wx"});
  commandWidth = 160;
  commandAnchor = commandPlacement(win.getBounds(), workArea(), commandWidth);
  commandWindow = new BrowserWindow({...commandAnchor.bounds,
    title: "和 QPet 互动", parent: win, show: false, autoHideMenuBar: true,
    frame: false, transparent: true, hasShadow: false, resizable: false,
    maximizable: false, fullscreenable: false, skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop, backgroundColor: "#00000000",
    webPreferences: {preload: path.join(ROOT, "commands-preload.cjs"), nodeIntegration: false,
      contextIsolation: true, sandbox: true}});
  const current = commandWindow;
  current.setMenu(null);
  current.webContents.setWindowOpenHandler(() => ({action: "deny"}));
  current.webContents.on("will-navigate", (event, url) => {
    if (url !== origin + COMMANDS_PAGE) event.preventDefault();
  });
  current.on("show",sendState);
  current.on("hide",sendState);
  current.on("closed", () => { if (commandWindow === current) commandWindow = null; sendState(); });
  await current.loadURL(origin + COMMANDS_PAGE);
  if (!current.isDestroyed()) { positionCommandWindow(); current.show(); current.focus(); }
}
async function companionRecords(clear = false) {
  if (clear) {
    const result = await dialog.showMessageBox(win, {type: "question",
      title: "清除陪伴记忆", message: "清除来访、触摸和专注记录？",
      detail: "当前专注计时也会结束。", buttons: ["保留", "清除"], defaultId: 0, cancelId: 0});
    if (result.response !== 1) return;
    companion.clearMemory(); pumpCompanion(); sendState();
    sendCompanion({kind: "notice", automatic: false, line: "陪伴记录已清除，我们从现在重新开始。"});
    return;
  }
  const value = companion.view();
  await dialog.showMessageBox(win, {type: "info", title: "本地陪伴记录",
    message: `一起出现了 ${value.totalDays} 天，最近7天来了 ${value.recentActiveDays} 天。`,
    detail: `头部互动 ${value.headTouches} 次，身体互动 ${value.bodyTouches} 次。\n`
      + `完成专注 ${value.completedFocus} 轮，共 ${value.focusMinutes} 分钟。\n\n`
      + `主动互动 ${[...Object.values(value.interactions),...Object.values(value.responses)].reduce((sum, count) => sum + count, 0)} 次。\n\n`
      + "只记录桌宠自身的使用汇总，保存在本机。可以随时清除。\n"
      + "免打扰会暂停主动问候和提醒；你的点击仍会得到回应。", buttons: ["知道了"]});
}
function requestExit() {
  if (exitStarted) return;
  exitStarted = true;
  clearTimeout(companionTimer);
  const farewell = companion.endSession();
  const shown = sendCompanion(farewell);
  const finish = () => { exitAuthorized = true; app.quit(); };
  if (shown) exitTimer = setTimeout(finish, 2250);
  else finish();
}
function home() {
  const area = workArea(), b = win.getBounds();
  action("reset");
  setTimeout(() => {
    win.setBounds({x: area.x + area.width - b.width - 32,
      y: area.y + area.height - b.height - 8, width: b.width, height: b.height});
    resetAnchor(); scheduleSave(); sendState();
  }, 40);
}
function setSize(name) {
  if (!SIZES[name]) return;
  action("reset");
  setTimeout(() => {
    const b = win.getBounds(), [width, height] = SIZES[name];
    settings.size = name;
    win.setBounds(clampBounds({x: b.x + (b.width - width) / 2,
      y: b.y + b.height - height, width, height}));
    resetAnchor(); scheduleSave(); sendState();
  }, 40);
}
function menuTemplate() {
  const command = (label, name) => ({label, click: () => action(name), enabled: rendererReady});
  const care = companion.view();
  const invoke = (name, payload) => () => companionCommand(name, payload).catch(errorLog);
  const remaining = care.focus ? Math.ceil(care.focus.remainingMs / 60000) : 0;
  return [
    {label: "QPet · 银狼", enabled: false},
    command("高兴 · 跳跃＋挥手＋眨眼", "happy"),
    command("高兴跳跃（0.7秒）", "jump"),
    {label: "动作组合", submenu: [
      command("打招呼", "greeting"), command("得意", "proud"),
      command("好奇", "curious"), command("赞同", "approve"),
      command("犯困", "sleepy"), command("散步后招呼", "stroll"),
      command("惊讶捂嘴", "surprise"), command("月牙闭眼笑", "crescent"),
    ]},
    {label: "眼口形态", submenu: [
      command("月牙闭眼笑", "face:crescent"), command("睁大眼＋小圆嘴", "face:wide"),
      command("原笑眼＋微笑", "face:smile"), command("睁眼＋微笑", "face:openSmile"),
      command("原眼＋小圆嘴", "face:round"), command("恢复眼口", "face:reset"),
    ]},
    {type: "separator"},
    command("向左走", "left"), command("向右走", "right"), command("停下", "stop"),
    {label: "更多动作", submenu: [
      command("挥手", "wave"), command("双手挥动", "both"),
      command("眨眼", "blink"), command("点头", "nod"), command("左右摆头", "head"),
    ]},
    command("回到自然站姿", "reset"),
    {label: "输入指令…", enabled: rendererReady,
      click: () => openCommandWindow().catch(errorLog)},
    {label: "互动一下…", enabled: care.enabled && rendererReady,
      click: invoke("interaction:menu", {})},
    {label:"陪我玩一会",enabled:care.enabled&&rendererReady,click:invoke("respond",{topic:"bored"})},
    {label: "日常陪伴", submenu: [
      {label: "陪伴互动", type: "checkbox", checked: care.enabled,
        click: item => companionCommand("enabled", {value: item.checked}).catch(errorLog)},
      {label: "免打扰", type: "checkbox", checked: care.doNotDisturb,
        click: item => companionCommand("quiet", {value: item.checked}).catch(errorLog)},
      {type: "separator"},
      {label: care.focus ? `专注${care.focus.status === "paused" ? "已暂停" : "中"} · 剩余${remaining}分钟`
        : "按自己的节奏，随时开始", enabled: false},
      {label: "开始25分钟专注", enabled: care.enabled && !care.focus,
        click: invoke("focus:start", {minutes: 25})},
      {label: "开始50分钟专注", enabled: care.enabled && !care.focus,
        click: invoke("focus:start", {minutes: 50})},
      {label: care.focus?.status === "paused" ? "继续专注" : "暂停专注",
        enabled: care.enabled && !!care.focus,
        click: invoke(care.focus?.status === "paused" ? "focus:resume" : "focus:pause")},
      {label: "结束本轮专注", enabled: !!care.focus, click: invoke("focus:cancel")},
      {type: "separator"},
      {label: "查看陪伴记录", click: () => companionRecords().catch(errorLog)},
      {label: "清除陪伴记忆…", click: () => companionRecords(true).catch(errorLog)},
    ]},
    {type: "separator"},
    {label: "自主活动", type: "checkbox", checked: settings.autonomous,
      click: item => setActivityMode(item.checked?(settings.activityMode==="quiet"?"natural":settings.activityMode):"quiet")},
    {label:"活跃程度",submenu:[["quiet","安静陪伴"],["natural","自然活动"],["lively","活泼一点"]]
      .map(([mode,label])=>({label,type:"radio",checked:mode===(settings.autonomous?settings.activityMode:"quiet"),
        click:()=>setActivityMode(mode)}))},
    {label: "始终置顶", type: "checkbox", checked: settings.alwaysOnTop,
      click: item => { settings.alwaysOnTop = item.checked;
        win.setAlwaysOnTop(item.checked);
        if (commandWindow && !commandWindow.isDestroyed()) commandWindow.setAlwaysOnTop(item.checked);
        scheduleSave(); sendState(); }},
    {label: "鼠标穿透（从托盘取消）", type: "checkbox", checked: settings.clickThrough,
      click: item => { settings.clickThrough = item.checked;
        updateMouse(); scheduleSave(); sendState(); }},
    {label: "角色大小", submenu: [["small", "小"], ["normal", "中"], ["large", "大"]]
      .map(([name,label]) => ({label, type: "radio", checked: settings.size === name,
        click: () => setSize(name)}))},
    {label: "回到屏幕右下角", click: home},
    {label: win.isVisible() ? "暂时隐藏" : "显示桌宠",
      click: () => {
        if (win.isVisible()) { action("reset"); win.hide(); } else win.showInactive();
        sendState();
      }},
    {type: "separator"},
    {label: "退出桌宠", click: () => app.quit()},
  ];
}
function showMenu() {
  menuOpen = true; updateMouse();sendState();
  Menu.buildFromTemplate(menuTemplate()).popup({window: win, callback: () => {
    menuOpen = false; updateMouse();sendState();
  }});
}
function applyPose(next) {
  if (!next || !Number.isFinite(next.x) || !Number.isFinite(next.y)
      || Math.abs(next.x) > 100000 || Math.abs(next.y) > 5000 || drag) return;
  pose = next;
  const b = win.getBounds(), area = workArea();
  const x = Math.round(Math.max(area.x, Math.min(anchor.x + pose.x,
    area.x + area.width - b.width)));
  const y = Math.round(Math.max(area.y, Math.min(anchor.y - pose.y,
    area.y + area.height - b.height)));
  if (x !== b.x || y !== b.y) {
    const [width, height] = SIZES[settings.size];
    win.setBounds({x, y, width, height}, false); scheduleSave();
  }
}
function dragEvent(data) {
  if (!data || !["start", "move", "end"].includes(data.phase)) return;
  if (data.phase === "start") {
    const p = screen.getCursorScreenPoint(), b = win.getBounds();
    drag = {dx: p.x - b.x, dy: p.y - b.y};
    interactive = true;
  } else if (data.phase === "move" && drag) {
    const p = screen.getCursorScreenPoint(), [width, height] = SIZES[settings.size];
    win.setBounds(clampBounds({width, height, x: p.x - drag.dx, y: p.y - drag.dy}));
  } else if (data.phase === "end") {
    const b = win.getBounds();
    anchor = {x: b.x - pose.x, y: b.y + pose.y};
    drag = null; scheduleSave();
  }
  updateMouse(); sendState();
}

function desktopHtml() {
  const nonce = crypto.randomBytes(16).toString("base64");
  const policy = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'; `
    + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'";
  return fs.readFileSync(path.join(RUNTIME, MODEL_VERSION + "/outward/preview.html"), "utf8")
    .replace(/<title>[^<]*<\/title>/, "<title>QPet 桌面宠物</title>")
    .replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '">')
    .replace("<script>", '<script nonce="' + nonce + '">')
    .replace('<script src="/vendor/live2dcubismcore.min.js">',
      '<script src="/desktop/frame-clock.js"></script><script src="/vendor/live2dcubismcore.min.js">')
    .replace("</style>", "</style><link rel=\"stylesheet\" href=\"/desktop/pet.css\">")
    .replace("</html>", "<script src=\"/desktop/autonomy.js\"></script><script src=\"/desktop/pet.js\"></script><script src=\"/desktop/companion.js\"></script></html>");
}
function desktopEmotions() {
  const source = fs.readFileSync(path.join(RUNTIME, MODEL_VERSION, "emotion_actions.js"), "utf8");
  const original = 'const preset = PRESETS[name] || await jsonFile("../expressions/" + name + ".json");';
  if (source.split(original).length !== 2)
    throw Error("Adopted emotion engine template changed");
  return source.replace(original, 'const preset = await jsonFile("../expressions/" + name + ".json");');
}
function createServer() {
  const mime = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".png": "image/png", ".moc3": "application/octet-stream"};
  return new Promise(resolve => {
    server = http.createServer((request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
        if (pathname === DESKTOP_PAGE) {
          response.writeHead(200, {"Content-Type": mime[".html"], "Cache-Control": "no-store"});
          response.end(desktopHtml()); return;
        }
        if (pathname === "/runtime/" + MODEL_VERSION + "/emotion_actions.js") {
          response.writeHead(200, {"Content-Type": mime[".js"], "Cache-Control": "no-store"});
          response.end(desktopEmotions()); return;
        }
        const enhanced = pathname.match(new RegExp("^/runtime/" + MODEL_VERSION
          + "/expressions/(happy|curious|sleepy)\\.json$"));
        if (enhanced) {
          const content = fs.readFileSync(path.join(ROOT, "expressions", enhanced[1] + ".json"));
          response.writeHead(200, {"Content-Type": mime[".json"], "Cache-Control": "no-store"});
          response.end(content); return;
        }
        let root, relative;
        if (pathname.startsWith("/runtime/")) { root = RUNTIME; relative = pathname.slice(9); }
        else if (pathname === "/vendor/live2dcubismcore.min.js") {
          root = path.join(ROOT, "vendor"); relative = "live2dcubismcore.min.js";
        } else if (["/desktop/pet.css", "/desktop/pet.js", "/desktop/frame-clock.js",
          "/desktop/companion.js", "/desktop/autonomy.js", "/desktop/commands.html", "/desktop/commands.css",
          "/desktop/commands.js"].includes(pathname)) {
          root = ROOT; relative = pathname.slice(9);
        } else { response.writeHead(404); response.end(); return; }
        const file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile())
          throw Error("Invalid local asset");
        response.writeHead(200, {"Content-Type": mime[path.extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"});
        fs.createReadStream(file).pipe(response);
      } catch { response.writeHead(404); response.end("Missing local asset"); }
    });
    server.listen(0, "127.0.0.1", () => {
      origin = "http://127.0.0.1:" + server.address().port;
      resolve();
    });
  });
}
async function createPet() {
  await createServer();
  const [width, height] = SIZES[settings.size], area = screen.getPrimaryDisplay().workArea;
  const initial = clampBounds({width, height,
    x: settings.x ?? area.x + area.width - width - 32,
    y: settings.y ?? area.y + area.height - height - 8});
  win = new BrowserWindow({...initial, title: "QPet Desktop Pet", frame: false,
    transparent: true, backgroundColor: "#00000000", resizable: false, thickFrame: false,
    maximizable: false, fullscreenable: false, hasShadow: false,
    alwaysOnTop: settings.alwaysOnTop, skipTaskbar: true, show: false,
    webPreferences: {preload: path.join(ROOT, "preload.cjs"), nodeIntegration: false,
      contextIsolation: true, sandbox: true, backgroundThrottling: false}});
  resetAnchor();
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({action: "deny"}));
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== origin + DESKTOP_PAGE)
      event.preventDefault();
  });
  win.webContents.on("render-process-gone", (_event, details) => errorLog(Error(JSON.stringify(details))));
  win.webContents.on("console-message", (_event, details) => {
    if (details.level === "error" || details.level === "warning")
      errorLog(Error("Renderer: " + details.message));
  });
  win.on("move", () => { scheduleSave(); sendState(); positionCommandWindow(); });
  win.on("resize", () => { sendState(); positionCommandWindow(); });
  win.on("show", () => {
    if (commandWindow && !commandWindow.isDestroyed()) {
      positionCommandWindow(); commandWindow.showInactive();
    }
    sendState(); pumpCompanion();
  });
  win.on("hide", () => { if (commandWindow && !commandWindow.isDestroyed()) commandWindow.hide(); sendState(); pumpCompanion(); });
  win.on("blur", () => { if (drag) dragEvent({phase: "end"}); });
  win.on("close", event => {
    if (!SELF_TEST && !exitAuthorized) { event.preventDefault(); requestExit(); }
  });
  win.on("query-session-end", () => { exitAuthorized = true; companion.endSession(); });
  win.on("closed", () => { if (!quitting) app.quit(); });
  const valid = event => event.sender === win.webContents;
  ipcMain.handle("pet:state", event => valid(event) ? state() : null);
  ipcMain.handle("pet:companion", (event, command, payload) =>
    valid(event) ? companionCommand(command, payload) : null);
  const validCommand = event => commandWindow && !commandWindow.isDestroyed()
    && event.sender === commandWindow.webContents
    && event.senderFrame === commandWindow.webContents.mainFrame;
  ipcMain.handle("pet:command", (event, text) =>
    validCommand(event) ? executePetCommand(text) : null);
  ipcMain.handle("pet:command-info", event =>
    validCommand(event) ? {rulesPath: COMMAND_RULES_FILE, warning: loadCustom(COMMAND_RULES_FILE).warning, anchor: commandAnchor} : null);
  ipcMain.on("pet:command-close", event => { if (validCommand(event)) commandWindow.close(); });
  ipcMain.on("pet:command-resize", (event, width) => {
    if (validCommand(event) && Number.isInteger(width) && width >= 160 && width <= 440)
      positionCommandWindow(width);
  });
  ipcMain.on("pet:command-open", event => {
    if (valid(event) && event.senderFrame === win.webContents.mainFrame)
      openCommandWindow().catch(errorLog);
  });
  ipcMain.on("pet:pose", (event, value) => { if (valid(event)) applyPose(value); });
  ipcMain.on("pet:rebase", event => { if (valid(event)) resetAnchor(); });
  ipcMain.on("pet:interactive", (event, value) => {
    if (valid(event)) { interactive = !!value; updateMouse(); }
  });
  ipcMain.on("pet:drag", (event, value) => { if (valid(event)) dragEvent(value); });
  ipcMain.on("pet:menu", event => { if (valid(event)) showMenu(); });
  ipcMain.on("pet:ready", event => {
    if (!valid(event)) return;
    rendererReady = true;
    win.showInactive();
    const [width,height]=SIZES[settings.size];
    win.setBounds({...initial,width,height});
    resetAnchor(); updateMouse(); sendState();
    fs.writeFileSync(INSTANCE_FILE,JSON.stringify({
      pid:process.pid,executable:process.execPath,project:PROJECT,
      settingsFile:STATE_FILE,selfTest:SELF_TEST,started:new Date().toISOString(),
      modelVersion:MODEL_VERSION,
      companionVersion:1,
    },null,2));
    clearInterval(cursorTimer);
    cursorTimer = setInterval(() => {
      if (win.isDestroyed() || !win.isVisible()) return;
      const b = win.getBounds(), p = screen.getCursorScreenPoint();
      const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
      if (inside) win.webContents.send("pet:cursor", {x: p.x - b.x, y: p.y - b.y});
      else if (!drag && interactive) { interactive = false; updateMouse(); }
    }, 50);
    if (SELF_TEST) runSelfTest();
    else {
      const greeting = companion.beginSession();
      setTimeout(() => { sendState(); sendCompanion(greeting); pumpCompanion(); }, 250);
    }
  });
  await win.loadURL(origin + DESKTOP_PAGE);
  const head = nativeImage.createFromPath(path.join(RUNTIME,
    MODEL_VERSION + "/outward/Head_Group.png"));
  const icon = head.crop({x: 385, y: 70, width: 510, height: 610}).resize({width: 32, height: 32});
  tray = new Tray(icon);
  tray.setToolTip("QPet 桌宠 · 右键菜单 / 双击高兴");
  tray.on("right-click", showMenu);
  tray.on("click", () => { win.showInactive(); showMenu(); });
  tray.on("double-click", () => { win.showInactive(); action("happy"); });
  screen.on("display-metrics-changed", () => {
    const [width,height]=SIZES[settings.size];
    win.setBounds(clampBounds({...win.getBounds(),width,height})); resetAnchor(); sendState();
  });
  screen.on("display-removed", () => {
    const [width,height]=SIZES[settings.size];
    win.setBounds(clampBounds({...win.getBounds(),width,height})); resetAnchor(); sendState();
  });
}
async function runSelfTest() {
  try {
    const report = await require(COMMAND_TEST ? "./command-window-test.cjs" : COMPANION_TEST ? "./companion-test.cjs"
      : EXPRESSION_TEST ? "./expression-integration-test.cjs"
      : DAILY_TEST ? "./daily-actions-test.cjs" : "./self-test.cjs")({
      win, action, state, settings, applyPose, dragEvent, resetAnchor, save, setSize,
      stateFile: STATE_FILE, root: QA_ROOT, menuTemplate, updateMouse, app, testRun,
      companion, companionCommand, pumpCompanion, sendCompanion,
      requestExit,
      setCursorForTest: point => { clearInterval(cursorTimer); win.webContents.send("pet:cursor",point); },
      openCommandWindow, getCommandWindow: () => commandWindow, commandRulesFile: COMMAND_RULES_FILE,
    });
    process.exitCode = report.passed ? 0 : 1;
    if (report.passed && !(COMPANION_TEST && report.exitHandled)) app.quit();
  } catch (error) {
    errorLog(error);
    const errorFile = COMMAND_TEST
      ? path.join(QA_ROOT, "qa/commands-20261024", testRun, "error.txt")
      : COMPANION_TEST
      ? path.join(QA_ROOT, "qa/companion-20261021", testRun, "error.txt")
      : EXPRESSION_TEST
      ? path.join(QA_ROOT, "qa/expressions-20261021", testRun, "error.txt")
      : path.join(QA_ROOT, "qa/self-test-error.txt");
    fs.mkdirSync(path.dirname(errorFile), {recursive: true});
    fs.writeFileSync(errorFile, error.stack || String(error));
    process.exitCode = 1;
    app.quit();
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (win) { win.showInactive(); action("happy"); } });
  app.whenReady().then(createPet).catch(error => {
    errorLog(error);
    dialog.showErrorBox("QPet 启动失败", error.message);
    app.quit();
  });
}
app.on("before-quit", event => {
  if (!SELF_TEST && win && !win.isDestroyed() && !exitAuthorized) {
    event.preventDefault(); requestExit(); return;
  }
  quitting = true; clearTimeout(saveTimer); clearInterval(cursorTimer);
  clearTimeout(companionTimer); clearTimeout(exitTimer);
  companion.endSession();
  if (win && !win.isDestroyed()) save();
  try {
    if(JSON.parse(fs.readFileSync(INSTANCE_FILE,"utf8")).pid===process.pid)
      fs.unlinkSync(INSTANCE_FILE);
  } catch { /* Instance receipt may already be gone. */ }
  tray?.destroy(); server?.close();
});
app.on("window-all-closed", () => app.quit());
