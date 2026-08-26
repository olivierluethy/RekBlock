// ===============================
// focus.js — Pomodoro / focus timer UI (#6)
// ===============================

const RING_CIRCUMFERENCE = 2 * Math.PI * 54; // r = 54
const POINTS_PER_LEVEL = 500;

const FOCUS_DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];

const DEFAULT_ACTIVITIES = [
  "Stand up and stretch",
  "Take a short walk",
  "Drink a glass of water",
  "Look at something 20m away for 20s",
  "Do 10 deep breaths",
];

const BADGE_LABELS = {
  "first-session": "🌱 First session",
  "ten-sessions": "🔟 10 sessions",
  "fifty-sessions": "💪 50 sessions",
  "500-points": "⭐ 500 points",
  "2000-points": "🌟 2000 points",
};

let selected = { routine: "pomodoro", workMin: 25, breakMin: 5 };
let routines = [];
let activities = [];
let editingRoutineId = null;

// ---------- Theme ----------
chrome.storage.sync.get("settings", (data) => {
  document.documentElement.setAttribute("data-bs-theme", data.settings?.theme || "light");
});

// ---------- Helpers ----------
function fmt(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function isSameDay(ts, ref) {
  const a = new Date(ts);
  return a.getFullYear() === ref.getFullYear() && a.getMonth() === ref.getMonth() && a.getDate() === ref.getDate();
}

function daysLabel(days) {
  return FOCUS_DAYS.filter((d) => days.includes(d.value)).map((d) => d.label).join(", ") || "—";
}

function send(type, config) {
  chrome.runtime.sendMessage({ type, config }, () => {});
}

function newId() {
  return `r_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// ---------- Timer rendering ----------
function renderState(state) {
  const setup = document.getElementById("setup");
  const controls = document.getElementById("controls");
  const phaseLabel = document.getElementById("phaseLabel");
  const timer = document.getElementById("timer");
  const cycleInfo = document.getElementById("cycleInfo");
  const ring = document.getElementById("progressRing");
  const pauseBtn = document.getElementById("pauseBtn");

  if (!state || !state.active) {
    setup.classList.remove("d-none");
    controls.classList.add("d-none");
    phaseLabel.textContent = "Idle";
    phaseLabel.className = "text-uppercase fw-semibold phase-idle mb-1";
    timer.textContent = fmt(selected.workMin * 60000);
    timer.className = "timer phase-idle";
    cycleInfo.textContent = "";
    ring.style.strokeDashoffset = RING_CIRCUMFERENCE;
    return;
  }

  setup.classList.add("d-none");
  controls.classList.remove("d-none");

  const isWork = state.phase === "work";
  const phaseMin = isWork ? state.workMin : state.breakMin;
  const totalMs = phaseMin * 60000;
  const remainingMs = state.paused ? state.remainingMs || 0 : state.phaseEndTs - Date.now();

  phaseLabel.textContent = state.paused
    ? `${isWork ? "Work" : "Break"} (paused)`
    : isWork ? "Work" : "Break";
  phaseLabel.className = `text-uppercase fw-semibold mb-1 ${isWork ? "phase-work" : "phase-break"}`;
  timer.textContent = fmt(remainingMs);
  timer.className = `timer ${isWork ? "phase-work" : "phase-break"}`;
  cycleInfo.textContent = `Completed cycles: ${state.cyclesCompleted || 0}`;

  const frac = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  ring.setAttribute("stroke", isWork ? "#dc2626" : "#16a34a");
  ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - frac);
  pauseBtn.textContent = state.paused ? "▶ Resume" : "⏸ Pause";
}

function refresh() {
  chrome.storage.local.get("focusState", (d) => renderState(d.focusState));
}

// ---------- Stats + gamification ----------
function renderStats() {
  chrome.storage.local.get(["focusSessions", "gamification"], (d) => {
    const sessions = d.focusSessions || [];
    const now = new Date();
    const today = sessions.filter((s) => isSameDay(s.ts, now));
    document.getElementById("todaySessions").textContent = today.length;
    document.getElementById("todayFocusMin").textContent = today.reduce((sum, s) => sum + (s.workMin || 0), 0);

    const days = new Set(sessions.map((s) => new Date(s.ts).toDateString()));
    let streak = 0;
    const probe = new Date(now);
    if (!days.has(probe.toDateString())) probe.setDate(probe.getDate() - 1);
    while (days.has(probe.toDateString())) {
      streak++;
      probe.setDate(probe.getDate() - 1);
    }
    document.getElementById("streak").textContent = streak;

    // Gamification
    const g = d.gamification || { points: 0, badges: [] };
    const points = g.points || 0;
    const level = Math.floor(points / POINTS_PER_LEVEL) + 1;
    const into = points % POINTS_PER_LEVEL;
    document.getElementById("points").textContent = points;
    document.getElementById("level").textContent = level;
    document.getElementById("levelProgress").style.width =
      `${Math.round((into / POINTS_PER_LEVEL) * 100)}%`;

    const badgesEl = document.getElementById("badges");
    const earned = g.badges || [];
    badgesEl.innerHTML = earned.length
      ? earned.map((b) => `<span class="badge-chip">${BADGE_LABELS[b] || b}</span>`).join("")
      : `<span class="text-muted small">Complete focus sessions to earn badges.</span>`;
  });
}

// ---------- Routine selection ----------
function selectRoutine(btn) {
  document.querySelectorAll(".routine-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  const routine = btn.dataset.routine;
  const customFields = document.getElementById("customFields");
  if (routine === "custom") {
    customFields.classList.remove("d-none");
    selected = {
      routine: "custom",
      workMin: Number(document.getElementById("customWork").value) || 25,
      breakMin: Number(document.getElementById("customBreak").value) || 5,
    };
  } else {
    customFields.classList.add("d-none");
    selected = { routine, workMin: Number(btn.dataset.work), breakMin: Number(btn.dataset.break) };
  }
  refresh();
}

// ---------- Scheduled routines ----------
function renderRoutines() {
  const body = document.getElementById("routineTable");
  body.innerHTML = "";
  if (routines.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No scheduled routines.</td></tr>`;
    return;
  }
  routines.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.name || "Routine"}</td>
      <td>${r.workMin}/${r.breakMin}</td>
      <td>${daysLabel(r.days || [])}</td>
      <td>${r.startTime}</td>
      <td>${r.enabled ? "✅" : "⏸️"}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary edit-r" data-id="${r.id}">Edit</button>
        <button class="btn btn-sm btn-outline-danger del-r" data-id="${r.id}">Delete</button>
      </td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll(".edit-r").forEach((b) => b.addEventListener("click", () => openRoutineModal(b.dataset.id)));
  body.querySelectorAll(".del-r").forEach((b) => b.addEventListener("click", () => deleteRoutine(b.dataset.id)));
}

function persistRoutines(cb) {
  chrome.storage.sync.set({ focusRoutines: routines }, cb);
}

function buildRDayChecks() {
  const container = document.getElementById("rDays");
  container.innerHTML = "";
  FOCUS_DAYS.forEach((d) => {
    const id = `rday_${d.value}`;
    const wrap = document.createElement("div");
    wrap.className = "form-check form-check-inline m-0";
    wrap.innerHTML = `<input class="form-check-input rday" type="checkbox" id="${id}" value="${d.value}"><label class="form-check-label" for="${id}">${d.label}</label>`;
    container.appendChild(wrap);
  });
}

function openRoutineModal(id = null) {
  editingRoutineId = id;
  document.getElementById("routineModalTitle").textContent = id ? "Edit scheduled routine" : "New scheduled routine";
  const checks = document.querySelectorAll(".rday");
  const r = id ? routines.find((x) => x.id === id) : null;
  document.getElementById("rName").value = r ? r.name || "" : "";
  document.getElementById("rWork").value = r ? r.workMin : 25;
  document.getElementById("rBreak").value = r ? r.breakMin : 5;
  document.getElementById("rStart").value = r ? r.startTime : "09:00";
  document.getElementById("rBlockDuring").checked = r ? r.blockDuring !== false : true;
  document.getElementById("rEnabled").checked = r ? r.enabled : true;
  const daysSel = r ? r.days || [] : [1, 2, 3, 4, 5];
  checks.forEach((c) => (c.checked = daysSel.includes(Number(c.value))));
  document.getElementById("routineModal").classList.add("show");
}

function closeRoutineModal() {
  document.getElementById("routineModal").classList.remove("show");
}

function saveRoutine() {
  const days = Array.from(document.querySelectorAll(".rday")).filter((c) => c.checked).map((c) => Number(c.value));
  if (days.length === 0) {
    alert("Select at least one day.");
    return;
  }
  const data = {
    name: document.getElementById("rName").value.trim() || "Routine",
    workMin: Number(document.getElementById("rWork").value) || 25,
    breakMin: Number(document.getElementById("rBreak").value) || 5,
    startTime: document.getElementById("rStart").value || "09:00",
    days,
    blockDuring: document.getElementById("rBlockDuring").checked,
    enabled: document.getElementById("rEnabled").checked,
  };
  if (editingRoutineId) {
    const r = routines.find((x) => x.id === editingRoutineId);
    if (r) Object.assign(r, data);
  } else {
    routines.push({ id: newId(), ...data });
  }
  persistRoutines(() => {
    closeRoutineModal();
    renderRoutines();
  });
}

function deleteRoutine(id) {
  routines = routines.filter((r) => r.id !== id);
  persistRoutines(renderRoutines);
}

// ---------- Calendar export (.ics) ----------
function icsLocal(date) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear() + p(date.getMonth() + 1) + p(date.getDate()) +
    "T" + p(date.getHours()) + p(date.getMinutes()) + "00"
  );
}

function nextDateForDay(day, h, m) {
  const now = new Date();
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  let add = (day - now.getDay() + 7) % 7;
  if (add === 0 && d <= now) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

function buildIcs() {
  const dayMap = { 0: "SU", 1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA" };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RekBlock//Focus//EN", "CALSCALE:GREGORIAN"];
  routines.forEach((r) => {
    const days = (r.days || []).slice().sort((a, b) => a - b);
    if (days.length === 0) return;
    const [h, m] = r.startTime.split(":").map(Number);
    const start = nextDateForDay(days[0], h, m);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:rekblock-${r.id}@rekblock`);
    lines.push(`SUMMARY:🍅 Focus: ${r.name || "Session"}`);
    lines.push(`DTSTART:${icsLocal(start)}`);
    lines.push(`DURATION:PT${r.workMin || 25}M`);
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => dayMap[d]).join(",")}`);
    lines.push(`DESCRIPTION:${r.workMin}/${r.breakMin} focus routine from RekBlock`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function exportIcs() {
  if (routines.length === 0) {
    alert("Add at least one scheduled routine first.");
    return;
  }
  const blob = new Blob([buildIcs()], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rekblock-routines.ics";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Break activities ----------
function renderActivities() {
  const list = document.getElementById("activityList");
  const shown = activities.length ? activities : DEFAULT_ACTIVITIES;
  const isDefault = activities.length === 0;
  list.innerHTML = shown
    .map(
      (a, i) => `
      <li class="list-group-item d-flex justify-content-between align-items-center px-0">
        <span>${a}${isDefault ? ' <span class="text-muted small">(default)</span>' : ""}</span>
        ${isDefault ? "" : `<button class="btn btn-sm btn-outline-danger del-act" data-i="${i}">✕</button>`}
      </li>`,
    )
    .join("");
  list.querySelectorAll(".del-act").forEach((b) =>
    b.addEventListener("click", () => {
      activities.splice(Number(b.dataset.i), 1);
      chrome.storage.sync.set({ breakActivities: activities }, renderActivities);
    }),
  );
}

function addActivity() {
  const input = document.getElementById("newActivity");
  const val = input.value.trim();
  if (!val) return;
  // Seed from defaults on first custom add so the list stays complete.
  if (activities.length === 0) activities = DEFAULT_ACTIVITIES.slice();
  activities.push(val);
  chrome.storage.sync.set({ breakActivities: activities }, () => {
    input.value = "";
    renderActivities();
  });
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("progressRing").style.strokeDasharray = RING_CIRCUMFERENCE;
  buildRDayChecks();

  document.querySelectorAll(".routine-btn").forEach((btn) => btn.addEventListener("click", () => selectRoutine(btn)));
  document.getElementById("customWork").addEventListener("input", (e) => {
    selected.workMin = Number(e.target.value) || 25;
    refresh();
  });
  document.getElementById("customBreak").addEventListener("input", (e) => {
    selected.breakMin = Number(e.target.value) || 5;
  });

  document.getElementById("startBtn").addEventListener("click", () => {
    send("focus.start", {
      routine: selected.routine,
      workMin: selected.workMin,
      breakMin: selected.breakMin,
      blockDuring: document.getElementById("blockDuring").checked,
    });
  });
  document.getElementById("pauseBtn").addEventListener("click", () => {
    chrome.storage.local.get("focusState", (d) => {
      const st = d.focusState;
      send(st && st.paused ? "focus.resume" : "focus.pause");
    });
  });
  document.getElementById("skipBtn").addEventListener("click", () => send("focus.skip"));
  document.getElementById("stopBtn").addEventListener("click", () => send("focus.stop"));

  document.getElementById("addRoutine").addEventListener("click", () => openRoutineModal(null));
  document.getElementById("rSave").addEventListener("click", saveRoutine);
  document.getElementById("rCancel").addEventListener("click", closeRoutineModal);
  document.getElementById("exportIcs").addEventListener("click", exportIcs);
  document.getElementById("addActivity").addEventListener("click", addActivity);
  document.getElementById("newActivity").addEventListener("keypress", (e) => {
    if (e.key === "Enter") addActivity();
  });

  chrome.storage.onChanged.addListener((changes, ns) => {
    if (ns === "local" && changes.focusState) renderState(changes.focusState.newValue);
    if (ns === "local" && (changes.focusSessions || changes.gamification)) renderStats();
    if (ns === "sync" && changes.focusRoutines) {
      routines = changes.focusRoutines.newValue || [];
      renderRoutines();
    }
    if (ns === "sync" && changes.breakActivities) {
      activities = changes.breakActivities.newValue || [];
      renderActivities();
    }
  });

  setInterval(refresh, 1000);

  chrome.storage.sync.get(["focusRoutines", "breakActivities"], (d) => {
    routines = d.focusRoutines || [];
    activities = d.breakActivities || [];
    renderRoutines();
    renderActivities();
  });

  refresh();
  renderStats();
});
