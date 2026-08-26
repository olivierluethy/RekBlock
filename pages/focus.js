// ===============================
// focus.js — Pomodoro / focus timer UI (#6)
// ===============================

const RING_CIRCUMFERENCE = 2 * Math.PI * 54; // r = 54

let selected = { routine: "pomodoro", workMin: 25, breakMin: 5 };
let tickHandle = null;

// ---------- Theme ----------
chrome.storage.sync.get("settings", (data) => {
  document.documentElement.setAttribute(
    "data-bs-theme",
    data.settings?.theme || "light",
  );
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
  return (
    a.getFullYear() === ref.getFullYear() &&
    a.getMonth() === ref.getMonth() &&
    a.getDate() === ref.getDate()
  );
}

function send(type, config) {
  chrome.runtime.sendMessage({ type, config }, () => {
    // Rendering is driven by the storage.onChanged listener below.
  });
}

// ---------- Rendering ----------
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
  const remainingMs = state.paused
    ? state.remainingMs || 0
    : state.phaseEndTs - Date.now();

  phaseLabel.textContent = state.paused
    ? `${isWork ? "Work" : "Break"} (paused)`
    : isWork
      ? "Work"
      : "Break";
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

function renderStats() {
  chrome.storage.local.get("focusSessions", (d) => {
    const sessions = d.focusSessions || [];
    const now = new Date();
    const today = sessions.filter((s) => isSameDay(s.ts, now));
    document.getElementById("todaySessions").textContent = today.length;
    document.getElementById("todayFocusMin").textContent = today.reduce(
      (sum, s) => sum + (s.workMin || 0),
      0,
    );

    // Day streak: consecutive days (ending today or yesterday) with >=1 session.
    const days = new Set(
      sessions.map((s) => new Date(s.ts).toDateString()),
    );
    let streak = 0;
    const probe = new Date(now);
    if (!days.has(probe.toDateString())) probe.setDate(probe.getDate() - 1);
    while (days.has(probe.toDateString())) {
      streak++;
      probe.setDate(probe.getDate() - 1);
    }
    document.getElementById("streak").textContent = streak;
  });
}

// ---------- Routine selection ----------
function selectRoutine(btn) {
  document
    .querySelectorAll(".routine-btn")
    .forEach((b) => b.classList.remove("active"));
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
    selected = {
      routine,
      workMin: Number(btn.dataset.work),
      breakMin: Number(btn.dataset.break),
    };
  }
  refresh();
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("progressRing").style.strokeDasharray =
    RING_CIRCUMFERENCE;

  document.querySelectorAll(".routine-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectRoutine(btn));
  });
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
  document
    .getElementById("skipBtn")
    .addEventListener("click", () => send("focus.skip"));
  document
    .getElementById("stopBtn")
    .addEventListener("click", () => send("focus.stop"));

  // React to background state changes.
  chrome.storage.onChanged.addListener((changes, ns) => {
    if (ns === "local" && changes.focusState) {
      renderState(changes.focusState.newValue);
    }
    if (ns === "local" && changes.focusSessions) {
      renderStats();
    }
  });

  // Local countdown tick (visual only; background drives phase transitions).
  tickHandle = setInterval(refresh, 1000);

  refresh();
  renderStats();
});
