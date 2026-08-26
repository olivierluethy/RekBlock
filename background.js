// ===============================
// Background Service Worker (MV3)
// ===============================

// ---------- Cached state ----------
let cachedBlocked = [];        // always-on block patterns
let cachedSchedules = {};      // { baseDomain: { redirect, intervals } }
let cachedFocus = { active: false };
let cachedCategories = {};     // { id: { name, emoji, mode:'block'|'allow', domains:[] } }
let cachedModes = {};          // { id: { name, categoryIds:[] } }
let cachedActiveMode = null;   // mode id or null
let cachedExceptions = {};     // { domain: 'allow' | 'block' }
let cachedRoutines = [];       // scheduled focus routines
let cachedBreakActivities = [];

const DEFAULT_BREAK_ACTIVITIES = [
  "Stand up and stretch",
  "Take a short walk",
  "Drink a glass of water",
  "Look at something 20m away for 20s",
  "Do 10 deep breaths",
];

// ---------- Legacy quick-block categories (popup toggles) ----------
const categoryLists = {
  checkSports: ["*://espn.com*", "*://bleacherreport.com*", "*://sports.yahoo.com*", "*://skysports.com*", "*://fifa.com*"],
  checkNews: ["*://srf.ch*", "*://edition.cnn.com*", "*://bbc.com*", "*://reuters.com*", "*://nytimes.com*"],
  checkGaming: ["*://twitch.tv/*", "*://ign.com*", "*://gamespot.com*", "*://roblox.com*"],
  checkSocial: ["*://facebook.com*", "*://instagram.com*", "*://tiktok.com*", "*://x.com*"],
};

const compoundTlds = ["co.uk", "com.au", "org.uk", "gov.uk", "ac.uk", "net.au", "edu.au"];

// ---------- Helpers ----------
function normalizePattern(pattern) {
  return pattern
    .replace(/^\*:\/\/|\/?\*$/g, "")
    .replace(/\/$/, "")
    .replace(/^www\./, "")
    .toLowerCase();
}

function getBaseDomain(hostname) {
  const parts = hostname.split(".");
  if (parts.length > 2) {
    const tld = parts.slice(-2).join(".");
    if (compoundTlds.includes(tld)) return parts.slice(-3).join(".");
    return parts.slice(-2).join(".");
  }
  return hostname;
}

function getDomainFromUrl(url) {
  try {
    return getBaseDomain(normalizePattern(new URL(url).hostname));
  } catch {
    return null;
  }
}

function getCore(baseDomain) {
  if (!baseDomain) return null;
  return baseDomain.split(".")[0];
}

function findCategoryByDomain(domain) {
  for (const [category, patterns] of Object.entries(categoryLists)) {
    for (const pattern of patterns) {
      if (normalizePattern(pattern) === domain) return category;
    }
  }
  return null;
}

function allCategoryDomains() {
  const out = [];
  for (const patterns of Object.values(categoryLists)) {
    for (const p of patterns) out.push(normalizePattern(p));
  }
  return out;
}

// ---------- Schedule evaluation ----------
function timeToMinutes(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
}

function isIntervalActiveNow(interval, now = new Date()) {
  if (!interval || !interval.enabled) return false;
  if (!Array.isArray(interval.days) || interval.days.length === 0) return false;
  const day = now.getDay();
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(interval.start);
  const end = timeToMinutes(interval.end);
  if (Number.isNaN(start) || Number.isNaN(end) || start === end) return false;
  if (start < end) return interval.days.includes(day) && cur >= start && cur < end;
  if (interval.days.includes(day) && cur >= start) return true;
  const prevDay = (day + 6) % 7;
  return interval.days.includes(prevDay) && cur < end;
}

function scheduleActionNow(domain) {
  const config = cachedSchedules[domain];
  if (!config || !Array.isArray(config.intervals)) return null;
  const active = config.intervals.some((iv) => isIntervalActiveNow(iv));
  if (!active) return null;
  if (config.redirect && config.redirect.enabled && config.redirect.url) {
    return { type: "redirect", url: config.redirect.url };
  }
  return { type: "block" };
}

// ---------- Modes / custom categories (#11) ----------
function activeCategoryIds() {
  if (cachedActiveMode && cachedModes[cachedActiveMode]) {
    return cachedModes[cachedActiveMode].categoryIds || [];
  }
  return [];
}

// Domains that must be blocked because they belong to an active block-mode category.
function activeBlockCategoryDomains() {
  const domains = [];
  for (const id of activeCategoryIds()) {
    const cat = cachedCategories[id];
    if (cat && cat.mode === "block") {
      for (const d of cat.domains || []) domains.push(normalizePattern(d));
    }
  }
  return domains;
}

// Domains that are allowlisted (an active allow-mode category turns the web into
// an allowlist: everything is blocked except these).
function activeAllowCategoryDomains() {
  const domains = [];
  for (const id of activeCategoryIds()) {
    const cat = cachedCategories[id];
    if (cat && cat.mode === "allow") {
      for (const d of cat.domains || []) domains.push(normalizePattern(d));
    }
  }
  return domains;
}

function allowlistActive() {
  return activeAllowCategoryDomains().length > 0;
}

// ---------- Focus / Pomodoro engine (#6) ----------
function focusBlockingActive() {
  return (
    cachedFocus.active &&
    !cachedFocus.paused &&
    cachedFocus.phase === "work" &&
    cachedFocus.blockDuring
  );
}

function saveFocus(callback) {
  chrome.storage.local.set({ focusState: cachedFocus }, callback);
}

function recordFocusSession(workMin) {
  chrome.storage.local.get(["focusSessions", "gamification"], (d) => {
    const arr = d.focusSessions || [];
    arr.push({ ts: Date.now(), workMin });
    if (arr.length > 10000) arr.splice(0, arr.length - 10000);

    // Gamification: 10 points + 1 per focus minute (#6).
    const g = d.gamification || { points: 0, badges: [] };
    g.points = (g.points || 0) + 10 + Math.round(workMin);
    g.badges = computeBadges(arr, g.points, g.badges || []);

    chrome.storage.local.set({ focusSessions: arr, gamification: g });
  });
}

function computeBadges(sessions, points, existing) {
  const badges = new Set(existing);
  if (sessions.length >= 1) badges.add("first-session");
  if (sessions.length >= 10) badges.add("ten-sessions");
  if (sessions.length >= 50) badges.add("fifty-sessions");
  if (points >= 500) badges.add("500-points");
  if (points >= 2000) badges.add("2000-points");
  return Array.from(badges);
}

function randomBreakActivity() {
  const list = cachedBreakActivities.length
    ? cachedBreakActivities
    : DEFAULT_BREAK_ACTIVITIES;
  return list[Math.floor(Math.random() * list.length)];
}

function startFocus(config) {
  const workMin = Number(config.workMin) || 25;
  const breakMin = Number(config.breakMin) || 5;
  cachedFocus = {
    active: true,
    paused: false,
    phase: "work",
    routine: config.routine || "custom",
    workMin,
    breakMin,
    phaseEndTs: Date.now() + workMin * 60000,
    cyclesCompleted: 0,
    blockDuring: config.blockDuring !== false,
  };
  chrome.alarms.create("focus-phase", { when: cachedFocus.phaseEndTs });
  saveFocus(rebuildRules);
  notify("Focus started", `Work for ${workMin} min. Stay focused!`);
}

function advanceFocusPhase(recordWork = true) {
  if (!cachedFocus.active) return;
  if (cachedFocus.phase === "work") {
    if (recordWork) {
      recordFocusSession(cachedFocus.workMin);
      cachedFocus.cyclesCompleted = (cachedFocus.cyclesCompleted || 0) + 1;
    }
    cachedFocus.phase = "break";
    cachedFocus.phaseEndTs = Date.now() + cachedFocus.breakMin * 60000;
    notify("Break time", `${randomBreakActivity()} — ${cachedFocus.breakMin} min break.`);
  } else {
    cachedFocus.phase = "work";
    cachedFocus.phaseEndTs = Date.now() + cachedFocus.workMin * 60000;
    notify("Back to work", `Focus for ${cachedFocus.workMin} min.`);
  }
  cachedFocus.paused = false;
  chrome.alarms.create("focus-phase", { when: cachedFocus.phaseEndTs });
  saveFocus(rebuildRules);
}

function pauseFocus() {
  if (!cachedFocus.active || cachedFocus.paused) return;
  cachedFocus.remainingMs = Math.max(0, cachedFocus.phaseEndTs - Date.now());
  cachedFocus.paused = true;
  chrome.alarms.clear("focus-phase");
  saveFocus(rebuildRules);
}

function resumeFocus() {
  if (!cachedFocus.active || !cachedFocus.paused) return;
  cachedFocus.phaseEndTs = Date.now() + (cachedFocus.remainingMs || 0);
  cachedFocus.paused = false;
  delete cachedFocus.remainingMs;
  chrome.alarms.create("focus-phase", { when: cachedFocus.phaseEndTs });
  saveFocus(rebuildRules);
}

function stopFocus() {
  cachedFocus = { active: false };
  chrome.alarms.clear("focus-phase");
  saveFocus(rebuildRules);
}

function skipFocusPhase() {
  if (!cachedFocus.active) return;
  advanceFocusPhase(cachedFocus.phase !== "work");
}

// Auto-start scheduled focus routines (#6, criterion 2).
function checkFocusRoutines() {
  if (cachedFocus.active) return;
  const now = new Date();
  const day = now.getDay();
  const hhmm =
    String(now.getHours()).padStart(2, "0") + ":" +
    String(now.getMinutes()).padStart(2, "0");
  for (const r of cachedRoutines) {
    if (!r.enabled) continue;
    if (!Array.isArray(r.days) || !r.days.includes(day)) continue;
    if (r.startTime !== hhmm) continue;
    startFocus({
      routine: r.name || "scheduled",
      workMin: r.workMin,
      breakMin: r.breakMin,
      blockDuring: r.blockDuring !== false,
    });
    return;
  }
}

// ---------- Block-hit tracking (#4, #5) ----------
let lastHit = { tabId: null, domain: null, ts: 0 };

function isCurrentlyBlocked(domain) {
  if (cachedExceptions[domain] === "allow") return false;
  if (cachedExceptions[domain] === "block") return true;
  if (cachedBlocked.some((p) => normalizePattern(p) === domain)) return true;
  if (scheduleActionNow(domain)) return true;
  if (focusBlockingActive() && allCategoryDomains().includes(domain)) return true;
  if (activeBlockCategoryDomains().includes(domain)) return true;
  if (allowlistActive() && !activeAllowCategoryDomains().includes(domain)) return true;
  return false;
}

function recordBlockHit(tabId, domain) {
  const now = Date.now();
  if (lastHit.tabId === tabId && lastHit.domain === domain && now - lastHit.ts < 5000) return;
  lastHit = { tabId, domain, ts: now };
  chrome.storage.local.get("blockHits", (d) => {
    const arr = d.blockHits || [];
    arr.push({ ts: now, domain });
    if (arr.length > 5000) arr.splice(0, arr.length - 5000);
    chrome.storage.local.set({ blockHits: arr });
  });
}

// ---------- Context menu ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "block-current-site",
    title: "Block this website",
    contexts: ["page"],
  });
  ensureAlarm();
});

chrome.runtime.onStartup.addListener(ensureAlarm);

function ensureAlarm() {
  chrome.alarms.create("schedule-tick", { periodInMinutes: 1 });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "block-current-site") return;
  if (!tab?.url) return;
  const domain = getDomainFromUrl(tab.url);
  if (!domain) return;
  chrome.storage.sync.get("blocked", (data) => {
    const blocked = data.blocked || [];
    if (blocked.some((p) => normalizePattern(p) === domain)) {
      notify("Already blocked", `${domain} is already blocked.`);
      return;
    }
    const category = findCategoryByDomain(domain);
    if (category) {
      notify("Blocked via category", `${domain} belongs to "${category}". Enable that category to block it.`);
      return;
    }
    blocked.push(`*://${domain}/*`);
    chrome.storage.sync.set({ blocked }, () => notify("Website blocked", `${domain} has been blocked.`));
  });
});

// ---------- Notifications ----------
function notify(title, message) {
  chrome.notifications.create({ type: "basic", iconUrl: "icon/icon48.png", title, message });
}

// ---------- Messaging ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case "focus.start": startFocus(msg.config || {}); break;
    case "focus.pause": pauseFocus(); break;
    case "focus.resume": resumeFocus(); break;
    case "focus.stop": stopFocus(); break;
    case "focus.skip": skipFocusPhase(); break;
    case "rules.rebuild": rebuildRules(); break;
    default: return;
  }
  sendResponse({ ok: true, focusState: cachedFocus });
});

// ---------- Load state ----------
const SYNC_KEYS = [
  "blocked", "schedules", "categories", "modes", "activeMode",
  "exceptions", "focusRoutines", "breakActivities",
];

function loadSync(data) {
  cachedBlocked = data.blocked || [];
  cachedSchedules = data.schedules || {};
  cachedCategories = data.categories || {};
  cachedModes = data.modes || {};
  cachedActiveMode = data.activeMode || null;
  cachedExceptions = data.exceptions || {};
  cachedRoutines = data.focusRoutines || [];
  cachedBreakActivities = data.breakActivities || [];
}

chrome.storage.sync.get(SYNC_KEYS, (data) => {
  loadSync(data);
  ensureAlarm();
  rebuildRules();
});

chrome.storage.local.get("focusState", (data) => {
  cachedFocus = data.focusState || { active: false };
  rebuildRules();
});

// ---------- Storage change listener ----------
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync") {
    let dirty = false;
    if (changes.blocked) { cachedBlocked = changes.blocked.newValue || []; dirty = true; }
    if (changes.schedules) { cachedSchedules = changes.schedules.newValue || {}; dirty = true; }
    if (changes.categories) { cachedCategories = changes.categories.newValue || {}; dirty = true; }
    if (changes.modes) { cachedModes = changes.modes.newValue || {}; dirty = true; }
    if (changes.activeMode) { cachedActiveMode = changes.activeMode.newValue || null; dirty = true; }
    if (changes.exceptions) { cachedExceptions = changes.exceptions.newValue || {}; dirty = true; }
    if (changes.focusRoutines) cachedRoutines = changes.focusRoutines.newValue || [];
    if (changes.breakActivities) cachedBreakActivities = changes.breakActivities.newValue || [];
    if (dirty) rebuildRules();
  } else if (namespace === "local" && changes.focusState) {
    cachedFocus = changes.focusState.newValue || { active: false };
    rebuildRules();
  }
});

// ---------- Alarms ----------
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "schedule-tick") {
    checkFocusRoutines();
    rebuildRules();
  } else if (alarm.name === "focus-phase") {
    advanceFocusPhase(true);
  }
});

// ---------- Tab navigation: auto-detection (#7) + hit tracking (#4/#5) ----------
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading" || !tab.url) return;
  if (!/^https?:/.test(tab.url)) return;

  const domain = getDomainFromUrl(tab.url);
  if (!domain) return;

  if (isCurrentlyBlocked(domain)) {
    recordBlockHit(tabId, domain);
    return;
  }
  if (findCategoryByDomain(domain)) return;

  const core = getCore(domain);
  if (!core || core.length < 3) return;

  const blockedCores = new Set();
  for (const p of cachedBlocked) blockedCores.add(getCore(normalizePattern(p)));
  for (const patterns of Object.values(categoryLists)) {
    for (const p of patterns) blockedCores.add(getCore(normalizePattern(p)));
  }
  if (!blockedCores.has(core)) return;

  chrome.storage.sync.get("blocked", (data) => {
    const blocked = data.blocked || [];
    if (blocked.some((p) => normalizePattern(p) === domain)) return;
    blocked.push(`*://${domain}/*`);
    chrome.storage.sync.set({ blocked }, () => {
      notify("Variant blocked automatically", `${domain} matches an already blocked site and was blocked too.`);
    });
  });
});

// ---------- Rule building ----------
function blockRule(id, domain, priority = 1) {
  return {
    id, priority,
    action: { type: "block" },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "other"],
    },
  };
}

function allowRule(id, domain, priority = 10) {
  return {
    id, priority,
    action: { type: "allow" },
    condition: { urlFilter: `||${domain}^`, resourceTypes: ["main_frame"] },
  };
}

function buildRules() {
  const rules = [];
  const blockedSeen = new Set();
  let id = 1;

  const addBlock = (domain) => {
    if (!domain || blockedSeen.has(domain)) return;
    blockedSeen.add(domain);
    rules.push(blockRule(id++, domain));
  };

  // 1) Always-on blocks.
  for (const pattern of cachedBlocked) addBlock(normalizePattern(pattern));

  // 2) Scheduled blocks / redirects active now.
  for (const domain of Object.keys(cachedSchedules)) {
    if (blockedSeen.has(domain)) continue;
    const action = scheduleActionNow(domain);
    if (!action) continue;
    if (action.type === "redirect") {
      blockedSeen.add(domain);
      rules.push({
        id: id++, priority: 2,
        action: { type: "redirect", redirect: { url: action.url } },
        condition: { urlFilter: `||${domain}^`, resourceTypes: ["main_frame"] },
      });
    } else {
      addBlock(domain);
    }
  }

  // 3) Focus mode: block legacy distraction categories during a work phase.
  if (focusBlockingActive()) {
    for (const domain of allCategoryDomains()) addBlock(domain);
  }

  // 4) Active mode: block-mode categories.
  for (const domain of activeBlockCategoryDomains()) addBlock(domain);

  // 5) Allowlist mode: block everything (main_frame), allow the listed domains.
  if (allowlistActive()) {
    rules.push({
      id: id++, priority: 1,
      action: { type: "block" },
      condition: { urlFilter: "|http", resourceTypes: ["main_frame"] },
    });
    for (const domain of activeAllowCategoryDomains()) {
      rules.push(allowRule(id++, domain));
    }
  }

  // 6) Per-domain exceptions (override everything).
  for (const [domain, kind] of Object.entries(cachedExceptions)) {
    if (kind === "allow") rules.push(allowRule(id++, domain));
    else if (kind === "block") addBlock(domain);
  }

  return rules;
}

async function rebuildRules() {
  try {
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    const oldRuleIds = oldRules.map((r) => r.id);
    const newRules = buildRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: oldRuleIds,
      addRules: newRules,
    });
  } catch (err) {
    console.error("Failed to update DNR rules:", err);
  }
}
