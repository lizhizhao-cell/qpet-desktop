"use strict";
const fs = require("node:fs"), path = require("node:path");
const MINUTE = 60000;
const INTERACTIONS = Object.freeze({
  encourage: {label: "给我打气", action: "approve",
    lines: ["先完成眼前这一小步就好。我陪你。", "不用一下子做到完美，开始一点也算进度。", "辛苦啦。你已经往前走了一点，继续按自己的节奏来。"]},
  praise: {label: "夸夸她", action: "proud",
    lines: ["哼哼，这句夸奖我收下了。你今天也很棒。", "被你发现我的厉害了？那就一起加油。", "收到夸奖，心情加一。也给你一个赞。"]},
  relax: {label: "一起放松", action: "crescent",
    lines: ["好呀。松松肩，慢慢呼一口气，我在这里陪着。", "这一小会儿先不用赶进度。看远一点，歇一歇。", "休息也是正事。等你准备好了，我们再继续。"]},
});
const number = value => Number.isFinite(value) && value >= 0 ? value : 0;
const RESPONSES=Object.freeze({
  call:{action:"greeting",lines:["在呢，叫我有什么事？","收到召唤。陪你待一会儿。","我在这里，随时点点我。"]},
  pet:{action:"crescent",lines:["摸头奖励收到啦。","好啦，给你一个笑。","这一下很受用，心情加一。"]},
  comfort:{action:"approve",lines:["先歇一小会儿吧。我陪着你，不用急。","今天辛苦了，先做眼前能做的一点就好。","累的时候可以慢一点。需要时再叫我。"]},
  bored:{action:"happy",lines:["那我表演一个，给你解解闷。","收到，一起开心一下！","看这里，给你一点小小的热闹。"]},
  thanks:{action:"proud",lines:["不客气，陪着你是我的拿手项目。","收到夸奖啦。我们继续慢慢来。","嘿嘿，这句谢谢我收下了。"]},
});
const dateKey = now => {
  const date = new Date(now);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")].join("-");
};

function initial() {
  return {schema: 1, enabled: true, doNotDisturb: false, firstVisitAt: 0,
    lastGreetingAt: 0, lastTouchAt: 0, lastClosedAt: 0, sessions: 0,
    totalDays: 0, headTouches: 0, bodyTouches: 0, completedFocus: 0,
    focusMinutes: 0, days: [], focus: null, reminder: null, lastReminderId: null,
    lastInteractionAt: 0, interactions: {encourage: 0, praise: 0, relax: 0},
    responses:{call:0,pet:0,comfort:0,bored:0,thanks:0}};
}

class Companion {
  constructor({file, now = Date.now}) {
    this.file = file;
    this.now = now;
    this.sessionStarted = false;
    this.data = initial();
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      if (saved.schema !== 1) throw Error("Unsupported companion memory schema");
      for (const name of ["enabled", "doNotDisturb"])
        if (typeof saved[name] === "boolean") this.data[name] = saved[name];
      for (const name of ["firstVisitAt", "lastGreetingAt", "lastTouchAt", "lastClosedAt",
        "sessions", "totalDays", "headTouches", "bodyTouches", "completedFocus", "focusMinutes", "lastInteractionAt"])
        this.data[name] = number(saved[name]);
      for (const topic of Object.keys(INTERACTIONS))
        this.data.interactions[topic] = number(saved.interactions?.[topic]);
      for (const topic of Object.keys(RESPONSES))
        this.data.responses[topic] = number(saved.responses?.[topic]);
      this.data.days = Array.isArray(saved.days) ? saved.days.filter(day =>
        day && /^\d{4}-\d{2}-\d{2}$/.test(day.date)).slice(-62).map(day => ({
        date: day.date, opens: number(day.opens), touches: number(day.touches),
        focusMinutes: number(day.focusMinutes),
      })) : [];
      const focus = saved.focus;
      if (focus && ["running", "paused"].includes(focus.status)
          && Number.isFinite(focus.minutes) && focus.minutes >= 1 && focus.minutes <= 180
          && Number.isFinite(focus.remainingMs) && focus.remainingMs >= 0
          && (focus.status === "paused" || Number.isFinite(focus.deadline))) {
        this.data.focus = {status: focus.status, minutes: focus.minutes,
          remainingMs: Math.min(focus.remainingMs, focus.minutes * MINUTE),
          deadline: number(focus.deadline)};
      }
      const reminder = saved.reminder;
      if (reminder && typeof reminder.id === "string" && Number.isFinite(reminder.dueAt))
        this.data.reminder = {id: reminder.id, dueAt: reminder.dueAt,
          minutes: number(reminder.minutes), snoozed: !!reminder.snoozed};
      if (typeof saved.lastReminderId === "string")
        this.data.lastReminderId = saved.lastReminderId;
    } catch (error) {
      if (error.code !== "ENOENT" && fs.existsSync(file)) {
        let backup = file + ".invalid-" + this.now();
        for (let suffix = 1; fs.existsSync(backup); suffix++) backup = file + ".invalid-" + this.now() + "-" + suffix;
        fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
      }
    }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const temporary = this.file + ".tmp";
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(temporary, this.file);
  }
  day() {
    const key = dateKey(this.now());
    let day = this.data.days.find(item => item.date === key);
    if (!day) {
      day = {date: key, opens: 0, touches: 0, focusMinutes: 0};
      this.data.days.push(day);
      this.data.days = this.data.days.slice(-62);
      this.data.totalDays++;
    }
    return day;
  }
  view() {
    const focus = this.data.focus;
    const remainingMs = focus ? focus.status === "running"
      ? Math.max(0, focus.deadline - this.now()) : focus.remainingMs : 0;
    const recent = new Set();
    const current = new Date(this.now());
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(current);
      date.setDate(date.getDate() - offset);
      recent.add(dateKey(date.getTime()));
    }
    return {
      enabled: this.data.enabled, doNotDisturb: this.data.doNotDisturb,
      totalDays: this.data.totalDays, sessions: this.data.sessions,
      recentActiveDays: this.data.days.filter(day => recent.has(day.date) && day.opens > 0).length,
      headTouches: this.data.headTouches, bodyTouches: this.data.bodyTouches,
      completedFocus: this.data.completedFocus, focusMinutes: this.data.focusMinutes,
      interactions: {...this.data.interactions},
      responses:{...this.data.responses},
      focus: focus ? {status: focus.status, minutes: focus.minutes, remainingMs} : null,
      reminderPending: !!this.data.reminder,
    };
  }
  beginSession() {
    if (this.sessionStarted) return null;
    this.sessionStarted = true;
    if (!this.data.enabled) return null;
    this.day().opens++;
    this.data.sessions++;
    if (!this.data.firstVisitAt) this.data.firstVisitAt = this.now();
    const allowed = !this.data.doNotDisturb
      && (!this.data.lastGreetingAt || this.now() - this.data.lastGreetingAt >= 30 * MINUTE);
    if (allowed) this.data.lastGreetingAt = this.now();
    this.save();
    if (!allowed) return null;
    const line = this.data.focus?.status === "paused"
      ? "回来啦。上次的专注还暂停着，准备好了再继续。"
      : this.data.sessions === 1 ? "来啦。今天也按自己的节奏来，我陪着。"
      : this.data.totalDays > 1 ? `回来啦，这是一起出现的第${this.data.totalDays}天。今天也慢慢来。`
      : "又见面啦。忙你的，我在这儿。";
    return {kind: "greeting", line, action: "greeting", automatic: true};
  }
  touch(area) {
    if (!this.data.enabled || !["head", "body"].includes(area)) return null;
    if (this.data.lastTouchAt && this.now() - this.data.lastTouchAt < 4000) return null;
    this.data.lastTouchAt = this.now();
    this.data[area === "head" ? "headTouches" : "bodyTouches"]++;
    this.day().touches++;
    this.save();
    if (this.data.focus?.status === "running")
      return {kind: "touch", line: "给你打个气。然后我继续安静陪着。", action: null, automatic: false};
    const lines = area === "head"
      ? ["嗯，收到摸头奖励。", "好啦，头发要乱了。你先忙，我在。", "这次就陪你笑一下。"]
      : ["收到，我在。", "休息一下也不错，按你的节奏来。", "需要的时候点点我就好。"];
    const count = this.data[area === "head" ? "headTouches" : "bodyTouches"];
    return {kind: "touch", line: lines[(count - 1) % lines.length],
      action: area === "head" ? "crescent" : "approve", automatic: false};
  }
  interactionMenu() {
    if (!this.data.enabled) return null;
    return {kind: "interaction-menu", line: "想让我怎么陪你一会儿？",
      choices: Object.entries(INTERACTIONS).map(([id, value]) => ({id, label: value.label})),
      action: null, automatic: false};
  }
  interact(topic) {
    if (!this.data.enabled || !Object.hasOwn(INTERACTIONS, topic)) return null;
    if (this.data.lastInteractionAt && this.now() - this.data.lastInteractionAt < 4000) return null;
    this.data.lastInteractionAt = this.now();
    const count = ++this.data.interactions[topic];
    this.save();
    if (this.data.focus?.status === "running")
      return {kind: "interaction", topic, line: "收到，给你一点鼓励。我继续安静陪着，专注结束再慢慢聊。",
        action: null, automatic: false};
    const choice = INTERACTIONS[topic];
    return {kind: "interaction", topic, line: choice.lines[(count - 1) % choice.lines.length],
      action: choice.action, automatic: false};
  }
  respond(topic) {
    if(!this.data.enabled||!Object.hasOwn(RESPONSES,topic))return null;
    if(this.data.lastInteractionAt&&this.now()-this.data.lastInteractionAt<4000)return null;
    this.data.lastInteractionAt=this.now();
    const count=++this.data.responses[topic],choice=RESPONSES[topic];
    this.save();
    const quiet=this.data.focus?.status==="running";
    return {kind:"interaction",topic,line:quiet?"我在，先安静陪你完成这轮专注。":choice.lines[(count-1)%choice.lines.length],
      action:quiet?null:choice.action,automatic:false};
  }
  startFocus(minutes) {
    if (!this.data.enabled || this.data.focus) return null;
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) throw Error("Invalid focus duration");
    this.data.focus = {status: "running", minutes, remainingMs: minutes * MINUTE,
      deadline: this.now() + minutes * MINUTE};
    this.data.reminder = null;
    this.save();
    return {kind: "focus-start", line: `这${minutes}分钟交给你，我负责安静。`,
      action: null, automatic: false};
  }
  pauseFocus() {
    const focus = this.data.focus;
    if (focus?.status !== "running") return;
    focus.remainingMs = Math.max(0, focus.deadline - this.now());
    focus.status = "paused";
    this.save();
  }
  resumeFocus() {
    const focus = this.data.focus;
    if (!this.data.enabled || focus?.status !== "paused") return;
    focus.deadline = this.now() + focus.remainingMs;
    focus.status = "running";
    this.save();
  }
  cancelFocus() {
    this.data.focus = null;
    this.data.reminder = null;
    this.save();
  }
  tick() {
    const focus = this.data.focus;
    if (focus?.status === "running" && focus.deadline <= this.now()) {
      this.data.focus = null;
      this.data.completedFocus++;
      this.data.focusMinutes += focus.minutes;
      this.day().focusMinutes += focus.minutes;
      this.data.reminder = {id: "rest-" + this.now(), minutes: focus.minutes,
        dueAt: this.now(), snoozed: false};
      this.save();
    }
    const reminder = this.data.reminder;
    if (!this.data.enabled || this.data.doNotDisturb || !reminder || reminder.dueAt > this.now())
      return null;
    return {kind: "rest", id: reminder.id, automatic: true, action: "approve",
      line: reminder.snoozed ? "休息提示回来啦。看远一点，活动一下吧。"
        : `${reminder.minutes}分钟结束啦。看远一点，活动一下，再决定要不要继续。`};
  }
  acknowledge(id) {
    if (!this.data.reminder || this.data.reminder.id !== id) return;
    this.data.lastReminderId = id;
    this.data.reminder = null;
    this.save();
  }
  snooze(id) {
    if (id !== this.data.lastReminderId || !this.data.enabled) return;
    this.data.lastReminderId = null;
    this.data.reminder = {id: "rest-snooze-" + this.now(), minutes: 0,
      dueAt: this.now() + 5 * MINUTE, snoozed: true};
    this.save();
  }
  setEnabled(value) {
    if (typeof value !== "boolean") throw Error("Invalid companion setting");
    if (!value) this.pauseFocus();
    this.data.enabled = value;
    this.save();
  }
  setDoNotDisturb(value) {
    if (typeof value !== "boolean") throw Error("Invalid quiet setting");
    this.data.doNotDisturb = value;
    this.save();
  }
  endSession() {
    this.pauseFocus();
    this.data.lastClosedAt = this.now();
    this.save();
    return this.data.enabled && !this.data.doNotDisturb
      ? {kind: "goodbye", line: "今天就到这里。下次见。", action: "greeting", automatic: true} : null;
  }
  clearMemory() {
    const {enabled, doNotDisturb} = this.data;
    this.data = {...initial(), enabled, doNotDisturb};
    this.save();
  }
  nextDueAt() {
    const times = [];
    if (this.data.focus?.status === "running") times.push(this.data.focus.deadline);
    if (this.data.enabled && !this.data.doNotDisturb && this.data.reminder)
      times.push(this.data.reminder.dueAt);
    return times.length ? Math.min(...times) : null;
  }
}
module.exports = {Companion, dateKey, MINUTE};
