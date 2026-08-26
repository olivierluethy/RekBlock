// ===============================
// stats.js — personal productivity dashboard (#4, #5)
// ===============================

const DEFAULTS = { wage: 50, currency: "€", minutesPerAttempt: 5 };

let blockHits = [];
let focusSessions = [];
let assumptions = { ...DEFAULTS };
let period = "week";

// ---------- Theme ----------
chrome.storage.sync.get("settings", (data) => {
  document.documentElement.setAttribute(
    "data-bs-theme",
    data.settings?.theme || "light",
  );
});

// ---------- Date helpers ----------
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}
function startOfMonth(d) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Returns { start, end, prevStart, prevEnd } for the current period.
function periodRange() {
  const now = new Date();
  if (period === "today") {
    const start = startOfDay(now);
    return {
      start,
      end: addDays(start, 1),
      prevStart: addDays(start, -1),
      prevEnd: start,
    };
  }
  if (period === "week") {
    const start = startOfWeek(now);
    return {
      start,
      end: addDays(start, 7),
      prevStart: addDays(start, -7),
      prevEnd: start,
    };
  }
  if (period === "month") {
    const start = startOfMonth(now);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    return { start, end, prevStart, prevEnd: start };
  }
  return { start: new Date(0), end: new Date(8640000000000000), prevStart: null, prevEnd: null };
}

// ---------- Aggregation ----------
function inRange(ts, start, end) {
  return ts >= start.getTime() && ts < end.getTime();
}

function aggregate(start, end) {
  const focusMin = focusSessions
    .filter((s) => inRange(s.ts, start, end))
    .reduce((sum, s) => sum + (s.workMin || 0), 0);
  const attempts = blockHits.filter((h) => inRange(h.ts, start, end)).length;
  return { focusMin, attempts };
}

function topDomains(start, end, limit = 8) {
  const counts = {};
  for (const h of blockHits) {
    if (!inRange(h.ts, start, end)) continue;
    counts[h.domain] = (counts[h.domain] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

// ---------- Formatting ----------
function fmtDuration(min) {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
function fmtMoney(value) {
  return `${assumptions.currency}${Math.round(value).toLocaleString()}`;
}
function moneyValue(focusMin, savedMin) {
  return ((focusMin + savedMin) / 60) * (assumptions.wage || 0);
}
function deltaHtml(current, previous) {
  if (previous == null) return "";
  if (previous === 0) {
    return current > 0
      ? `<span class="delta-up">▲ new</span>`
      : `<span class="text-muted">—</span>`;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return `<span class="text-muted">no change</span>`;
  const cls = pct > 0 ? "delta-up" : "delta-down";
  const arrow = pct > 0 ? "▲" : "▼";
  return `<span class="${cls}">${arrow} ${Math.abs(pct)}%</span> vs previous`;
}

// ---------- SVG charts ----------
function renderDailyChart() {
  const days = 14;
  const now = new Date();
  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = addDays(startOfDay(now), -i);
    const end = addDays(start, 1);
    const agg = aggregate(start, end);
    data.push({
      label: start.toLocaleDateString([], { weekday: "short" }).slice(0, 2),
      date: start.toLocaleDateString([], { month: "short", day: "numeric" }),
      ...agg,
    });
  }

  const maxFocus = Math.max(1, ...data.map((d) => d.focusMin));
  const maxAtt = Math.max(1, ...data.map((d) => d.attempts));
  const W = 40, H = 140, gap = 6;
  const chartW = data.length * W;
  const barW = (W - gap) / 2;

  let bars = "";
  data.forEach((d, i) => {
    const x = i * W;
    const fh = (d.focusMin / maxFocus) * H;
    const ah = (d.attempts / maxAtt) * H;
    bars += `
      <g>
        <rect class="bar" x="${x + 2}" y="${H - fh + 20}" width="${barW}" height="${fh}" fill="#3b82f6" rx="2">
          <title>${d.date}: ${d.focusMin} focus min</title></rect>
        <rect class="bar" x="${x + 2 + barW}" y="${H - ah + 20}" width="${barW}" height="${ah}" fill="#dc2626" rx="2">
          <title>${d.date}: ${d.attempts} attempts</title></rect>
        <text x="${x + W / 2}" y="${H + 34}" font-size="10" text-anchor="middle" fill="var(--bs-secondary-color)">${d.label}</text>
      </g>`;
  });

  document.getElementById("dailyChart").innerHTML =
    `<svg width="${chartW}" height="${H + 44}" role="img" aria-label="Daily activity">${bars}</svg>`;
}

function renderTopDomains() {
  const { start, end } = periodRange();
  const top = topDomains(start, end);
  const container = document.getElementById("topDomains");

  if (top.length === 0) {
    container.innerHTML = `<p class="text-muted small m-0">No blocked attempts recorded for this period yet.</p>`;
    return;
  }

  const max = top[0][1];
  container.innerHTML = top
    .map(([domain, count]) => {
      const pct = Math.round((count / max) * 100);
      return `
        <div class="mb-2">
          <div class="d-flex justify-content-between small">
            <span>${domain}</span><span class="text-muted">${count}×</span>
          </div>
          <div class="progress" style="height:8px">
            <div class="progress-bar bar" role="progressbar" style="width:${pct}%;background:#dc2626"></div>
          </div>
        </div>`;
    })
    .join("");
}

// ---------- Main render ----------
function render() {
  const { start, end, prevStart, prevEnd } = periodRange();
  const cur = aggregate(start, end);
  const prev = prevStart ? aggregate(prevStart, prevEnd) : null;
  const savedMin = cur.attempts * (assumptions.minutesPerAttempt || 0);

  document.getElementById("kpiFocus").textContent = fmtDuration(cur.focusMin);
  document.getElementById("kpiAttempts").textContent = cur.attempts;
  document.getElementById("kpiSaved").textContent = fmtDuration(savedMin);
  document.getElementById("kpiValue").textContent = fmtMoney(
    moneyValue(cur.focusMin, savedMin),
  );

  document.getElementById("deltaFocus").innerHTML = deltaHtml(
    cur.focusMin,
    prev ? prev.focusMin : null,
  );
  document.getElementById("deltaAttempts").innerHTML = deltaHtml(
    cur.attempts,
    prev ? prev.attempts : null,
  );

  renderDailyChart();
  renderTopDomains();
}

// ---------- CSV export ----------
function exportCsv() {
  const days = 90;
  const now = new Date();
  const rows = [["date", "focus_minutes", "attempts_blocked"]];
  for (let i = days - 1; i >= 0; i--) {
    const start = addDays(startOfDay(now), -i);
    const end = addDays(start, 1);
    const agg = aggregate(start, end);
    if (agg.focusMin === 0 && agg.attempts === 0) continue;
    rows.push([
      start.toISOString().slice(0, 10),
      agg.focusMin,
      agg.attempts,
    ]);
  }
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rekblock-stats-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Assumptions ----------
function loadAssumptions() {
  document.getElementById("wage").value = assumptions.wage;
  document.getElementById("currency").value = assumptions.currency;
  document.getElementById("minutesPerAttempt").value =
    assumptions.minutesPerAttempt;
}

function saveAssumptions() {
  assumptions = {
    wage: Number(document.getElementById("wage").value) || 0,
    currency: document.getElementById("currency").value.trim() || "€",
    minutesPerAttempt:
      Number(document.getElementById("minutesPerAttempt").value) || 0,
  };
  chrome.storage.sync.get("settings", (data) => {
    const settings = data.settings || {};
    settings.stats = assumptions;
    chrome.storage.sync.set({ settings }, render);
  });
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get("settings", (data) => {
    assumptions = { ...DEFAULTS, ...(data.settings?.stats || {}) };
    loadAssumptions();

    chrome.storage.local.get(["blockHits", "focusSessions"], (local) => {
      blockHits = local.blockHits || [];
      focusSessions = local.focusSessions || [];
      render();
    });
  });

  document.querySelectorAll(".period-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".period-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      period = btn.dataset.period;
      render();
    });
  });

  document
    .getElementById("saveAssumptions")
    .addEventListener("click", saveAssumptions);
  document.getElementById("exportCsv").addEventListener("click", exportCsv);

  chrome.storage.onChanged.addListener((changes, ns) => {
    if (ns !== "local") return;
    if (changes.blockHits) blockHits = changes.blockHits.newValue || [];
    if (changes.focusSessions)
      focusSessions = changes.focusSessions.newValue || [];
    if (changes.blockHits || changes.focusSessions) render();
  });
});
