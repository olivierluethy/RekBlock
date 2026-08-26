// ===============================
// routine.js — per-domain schedule management (#1, #2)
// ===============================

const DAYS = [
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
  { label: "Sun", value: 0 },
];

const params = new URLSearchParams(location.search);
const domain = (params.get("domain") || "").toLowerCase();

let schedules = {}; // full schedules object from storage
let editingId = null; // interval id currently being edited (null = new)

function showModal() {
  document.getElementById("routineModal").classList.add("show");
}
function hideModal() {
  document.getElementById("routineModal").classList.remove("show");
}

// ---------- Schedule math (mirrors background.js) ----------
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

function anyActive(intervals, now = new Date()) {
  return (intervals || []).some((iv) => isIntervalActiveNow(iv, now));
}

// Step forward minute-by-minute (max 7 days) to find the next state change.
function nextTransition(intervals) {
  const now = new Date();
  const active = anyActive(intervals, now);
  const probe = new Date(now.getTime());
  probe.setSeconds(0, 0);
  for (let i = 1; i <= 7 * 24 * 60; i++) {
    probe.setMinutes(probe.getMinutes() + 1);
    if (anyActive(intervals, probe) !== active) {
      return { active, at: new Date(probe.getTime()) };
    }
  }
  return { active, at: null };
}

function formatWhen(date) {
  const now = new Date();
  const diffMin = Math.round((date - now) / 60000);
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  const rel = h > 0 ? `${h}h ${m}min` : `${m}min`;
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = date.toDateString() === now.toDateString();
  const dayLabel = sameDay
    ? ""
    : ` (${date.toLocaleDateString([], { weekday: "short" })})`;
  return { rel, time, dayLabel };
}

// ---------- Rendering ----------
function currentConfig() {
  return schedules[domain] || { redirect: { enabled: false, url: "" }, intervals: [] };
}

function renderStatus() {
  const banner = document.getElementById("statusBanner");
  const text = document.getElementById("statusText");
  const config = currentConfig();
  const intervals = config.intervals || [];

  if (intervals.filter((iv) => iv.enabled).length === 0) {
    banner.className = "alert alert-secondary";
    text.textContent = "No enabled time windows — this schedule is inactive.";
    return;
  }

  const { active, at } = nextTransition(intervals);
  if (active) {
    banner.className = "alert alert-danger";
    if (at) {
      const w = formatWhen(at);
      text.textContent = `🔒 ${domain} is currently blocked — next release at ${w.time}${w.dayLabel} (in ${w.rel}).`;
    } else {
      text.textContent = `🔒 ${domain} is currently blocked.`;
    }
  } else {
    banner.className = "alert alert-success";
    if (at) {
      const w = formatWhen(at);
      text.textContent = `✅ ${domain} is currently free — next block at ${w.time}${w.dayLabel} (in ${w.rel}).`;
    } else {
      text.textContent = `✅ ${domain} is currently free.`;
    }
  }
}

function daysLabel(days) {
  return DAYS.filter((d) => days.includes(d.value)).map((d) => d.label).join(", ") || "—";
}

function renderTable() {
  const body = document.getElementById("routineTableBody");
  body.innerHTML = "";
  const intervals = currentConfig().intervals || [];

  if (intervals.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No time windows yet.</td></tr>`;
    return;
  }

  intervals.forEach((iv) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${daysLabel(iv.days)}</td>
      <td>${iv.start} – ${iv.end}</td>
      <td>${iv.enabled ? "✅" : "⏸️"}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary edit-iv" data-id="${iv.id}">Edit</button>
        <button class="btn btn-sm btn-outline-danger del-iv" data-id="${iv.id}">Delete</button>
      </td>`;
    body.appendChild(tr);
  });

  body.querySelectorAll(".edit-iv").forEach((btn) =>
    btn.addEventListener("click", () => openModal(btn.dataset.id))
  );
  body.querySelectorAll(".del-iv").forEach((btn) =>
    btn.addEventListener("click", () => deleteInterval(btn.dataset.id))
  );
}

function renderRedirect() {
  const config = currentConfig();
  document.getElementById("redirectToggle").checked = !!config.redirect?.enabled;
  document.getElementById("redirectUrlInput").value = config.redirect?.url || "";
}

function render() {
  renderStatus();
  renderTable();
  renderRedirect();
}

// ---------- Persistence ----------
function persist(callback) {
  chrome.storage.sync.set({ schedules }, () => {
    if (callback) callback();
  });
}

function ensureConfig() {
  if (!schedules[domain]) {
    schedules[domain] = { redirect: { enabled: false, url: "" }, intervals: [] };
  }
  return schedules[domain];
}

function newId() {
  return `iv_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

// ---------- Modal ----------
function buildDayChecks() {
  const container = document.getElementById("dayChecks");
  container.innerHTML = "";
  DAYS.forEach((d) => {
    const id = `day_${d.value}`;
    const wrapper = document.createElement("div");
    wrapper.className = "form-check form-check-inline m-0";
    wrapper.innerHTML = `
      <input class="form-check-input day-check" type="checkbox" id="${id}" value="${d.value}">
      <label class="form-check-label" for="${id}">${d.label}</label>`;
    container.appendChild(wrapper);
  });
}

function openModal(id = null) {
  editingId = id;
  document.getElementById("modalTitle").textContent = id
    ? "Edit time window"
    : "New time window";

  const checks = document.querySelectorAll(".day-check");
  checks.forEach((c) => (c.checked = false));

  if (id) {
    const iv = currentConfig().intervals.find((x) => x.id === id);
    if (iv) {
      checks.forEach((c) => (c.checked = iv.days.includes(Number(c.value))));
      document.getElementById("startTime").value = iv.start;
      document.getElementById("endTime").value = iv.end;
      document.getElementById("enabledCheck").checked = iv.enabled;
    }
  } else {
    // Default: weekdays Mon–Fri
    checks.forEach((c) => (c.checked = [1, 2, 3, 4, 5].includes(Number(c.value))));
    document.getElementById("startTime").value = "09:00";
    document.getElementById("endTime").value = "17:00";
    document.getElementById("enabledCheck").checked = true;
  }

  showModal();
}

function saveFromModal() {
  const days = Array.from(document.querySelectorAll(".day-check"))
    .filter((c) => c.checked)
    .map((c) => Number(c.value));
  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;
  const enabled = document.getElementById("enabledCheck").checked;

  if (days.length === 0) {
    alert("Please select at least one day.");
    return;
  }
  if (!start || !end) {
    alert("Please set both a start and end time.");
    return;
  }
  if (start === end) {
    alert("Start and end time must differ.");
    return;
  }

  const config = ensureConfig();
  if (editingId) {
    const iv = config.intervals.find((x) => x.id === editingId);
    if (iv) Object.assign(iv, { days, start, end, enabled });
  } else {
    config.intervals.push({ id: newId(), days, start, end, enabled });
  }

  persist(() => {
    hideModal();
    render();
  });
}

function deleteInterval(id) {
  const config = currentConfig();
  config.intervals = (config.intervals || []).filter((iv) => iv.id !== id);
  if (config.intervals.length === 0 && !config.redirect?.enabled) {
    delete schedules[domain];
  }
  persist(render);
}

function saveRedirect() {
  const config = ensureConfig();
  config.redirect = {
    enabled: document.getElementById("redirectToggle").checked,
    url: document.getElementById("redirectUrlInput").value.trim(),
  };
  persist(render);
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get("settings", (data) => {
    document.documentElement.setAttribute(
      "data-bs-theme",
      data.settings?.theme || "light",
    );
  });

  document.getElementById("domainLabel").textContent = domain || "(no domain)";
  buildDayChecks();

  chrome.storage.sync.get("schedules", (data) => {
    schedules = data.schedules || {};
    render();
  });

  document.getElementById("addRoutineBtn").addEventListener("click", () => openModal(null));
  document.getElementById("saveRoutineBtn").addEventListener("click", saveFromModal);
  document.getElementById("cancelRoutineBtn").addEventListener("click", hideModal);
  document.getElementById("redirectToggle").addEventListener("change", saveRedirect);
  document.getElementById("redirectUrlInput").addEventListener("change", saveRedirect);

  // Refresh the live status once a minute.
  setInterval(renderStatus, 60000);
});
