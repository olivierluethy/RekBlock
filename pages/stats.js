// ===============================
// stats.js — personal productivity dashboard (#4, #5)
// ===============================

const DEFAULTS = { wage: 50, currency: "€", minutesPerAttempt: 5 };

let blockHits = [];
let focusSessions = [];
let assumptions = { ...DEFAULTS };
let period = "week";
let members = []; // imported team members: { name, blockHits, focusSessions }

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

// Human-readable label for the selected period (used in print header).
function periodLabel() {
  return { today: "Today", week: "This week", month: "This month", all: "All time" }[period] || period;
}

// ---------- Aggregation ----------
function inRange(ts, start, end) {
  return ts >= start.getTime() && ts < end.getTime();
}

function aggregate(start, end, hits = blockHits, sessions = focusSessions) {
  const focusMin = sessions
    .filter((s) => inRange(s.ts, start, end))
    .reduce((sum, s) => sum + (s.workMin || 0), 0);
  const attempts = hits.filter((h) => inRange(h.ts, start, end)).length;
  return { focusMin, attempts };
}

function topDomains(start, end, limit = 8, hits = blockHits) {
  const counts = {};
  for (const h of hits) {
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

// ---------- Productivity change ----------
// Estimated productivity change = % change in focus minutes vs previous period.
function renderProdChange(cur, prev) {
  const el = document.getElementById("prodChange");
  if (!prev) {
    // "all time" has no previous period to compare against
    el.innerHTML = `<span class="text-muted fs-6">no comparison</span>`;
    return;
  }
  if (prev.focusMin === 0) {
    el.innerHTML =
      cur.focusMin > 0
        ? `<span class="delta-up">▲ New focus activity</span>`
        : `<span class="text-muted fs-6">No focus data yet</span>`;
    return;
  }
  const pct = Math.round(((cur.focusMin - prev.focusMin) / prev.focusMin) * 100);
  if (pct === 0) {
    el.innerHTML = `<span class="text-muted">▬ 0%</span>`;
    return;
  }
  const cls = pct > 0 ? "delta-up" : "delta-down";
  const arrow = pct > 0 ? "▲" : "▼";
  el.innerHTML = `<span class="${cls}">${arrow} ${Math.abs(pct)}%</span>`;
}

// ---------- Optimization suggestions ----------
// Bucket blocked attempts in [start,end) by hour-of-day (0–23).
function hourBuckets(start, end) {
  const buckets = new Array(24).fill(0);
  for (const h of blockHits) {
    if (!inRange(h.ts, start, end)) continue;
    buckets[new Date(h.ts).getHours()]++;
  }
  return buckets;
}
function pad2(n) {
  return String(n).padStart(2, "0");
}

function renderSuggestions() {
  const { start, end, prevStart, prevEnd } = periodRange();
  const cur = aggregate(start, end);
  const prev = prevStart ? aggregate(prevStart, prevEnd) : null;
  const top = topDomains(start, end, 1);
  const container = document.getElementById("suggestions");
  const tips = [];

  // Not enough data to say anything useful.
  if (cur.attempts === 0 && cur.focusMin === 0) {
    container.innerHTML = `<p class="text-muted small m-0">Not enough data for this period yet — run a few focus sessions and keep browsing to get tailored suggestions.</p>`;
    return;
  }

  // 1. Top distraction + peak hour window → scheduled block.
  if (top.length && top[0][1] >= 2) {
    const [domain] = top[0];
    const buckets = hourBuckets(start, end);
    let peak = 0;
    for (let h = 1; h < 24; h++) if (buckets[h] > buckets[peak]) peak = h;
    const window = `${pad2(peak)}:00–${pad2((peak + 2) % 24)}:00`;
    tips.push({
      cls: "danger",
      text: `Your top distraction is <strong>${domain}</strong>, with most attempts around <strong>${window}</strong> — consider a scheduled block during that window.`,
    });
  }

  // 2. Focus minutes dropped vs previous period → nudge more sessions.
  if (prev && prev.focusMin > 0 && cur.focusMin < prev.focusMin) {
    const drop = Math.round(((prev.focusMin - cur.focusMin) / prev.focusMin) * 100);
    tips.push({
      cls: "warning",
      text: `Your focus time is down <strong>${drop}%</strong> vs the previous period. Try scheduling a couple of extra focus sessions to get back on track.`,
    });
  }

  // 3. Many attempts relative to focus time → enable focus mode.
  const focusHrs = cur.focusMin / 60;
  if (cur.attempts >= 5 && (focusHrs === 0 || cur.attempts / Math.max(focusHrs, 0.25) >= 6)) {
    tips.push({
      cls: "info",
      text: `You had <strong>${cur.attempts}</strong> distraction attempts relative to your focus time. Enabling focus mode during work blocks would cut the interruptions.`,
    });
  }

  // 4. Positive reinforcement when things look good.
  if (prev && prev.focusMin > 0 && cur.focusMin > prev.focusMin) {
    const up = Math.round(((cur.focusMin - prev.focusMin) / prev.focusMin) * 100);
    tips.push({
      cls: "success",
      text: `Nice — focus time is up <strong>${up}%</strong> vs the previous period. Keep the current routine going.`,
    });
  }

  if (!tips.length) {
    container.innerHTML = `<p class="text-muted small m-0">No standout patterns this period — keep it up!</p>`;
    return;
  }

  container.innerHTML = tips
    .slice(0, 4)
    .map((t) => `<div class="alert alert-${t.cls} py-2 mb-2 small">${t.text}</div>`)
    .join("");
}

// ---------- Team / multi-member view ----------
// Build a row of aggregated stats for one dataset over the current period.
function memberStats(name, hits, sessions) {
  const { start, end } = periodRange();
  const { focusMin, attempts } = aggregate(start, end, hits, sessions);
  const savedMin = attempts * (assumptions.minutesPerAttempt || 0);
  return { name, focusMin, attempts, value: moneyValue(focusMin, savedMin) };
}

function renderTeam() {
  const container = document.getElementById("teamTable");
  const nameInput = document.getElementById("memberName");
  const myName = (nameInput && nameInput.value.trim()) || "Me";

  const rows = [memberStats(myName, blockHits, focusSessions)];
  members.forEach((m, i) =>
    rows.push({ ...memberStats(m.name, m.blockHits, m.focusSessions), idx: i }),
  );

  const total = rows.reduce(
    (t, r) => ({
      focusMin: t.focusMin + r.focusMin,
      attempts: t.attempts + r.attempts,
      value: t.value + r.value,
    }),
    { focusMin: 0, attempts: 0, value: 0 },
  );

  const body = rows
    .map((r) => {
      const remove =
        r.idx != null
          ? `<button class="btn btn-sm btn-outline-danger py-0 px-1 team-remove no-print" data-idx="${r.idx}" title="Remove">✕</button>`
          : "";
      return `<tr>
        <td>${r.name} ${r.idx == null ? '<span class="badge bg-secondary">you</span>' : ""}</td>
        <td>${fmtDuration(r.focusMin)}</td>
        <td>${r.attempts}</td>
        <td>${fmtMoney(r.value)}</td>
        <td class="text-end">${remove}</td>
      </tr>`;
    })
    .join("");

  container.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0">
        <thead><tr>
          <th>Member</th><th>Focus time</th><th>Attempts</th><th>Est. value</th><th></th>
        </tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr class="fw-semibold border-top">
          <td>Total (${rows.length})</td>
          <td>${fmtDuration(total.focusMin)}</td>
          <td>${total.attempts}</td>
          <td>${fmtMoney(total.value)}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>`;

  container.querySelectorAll(".team-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      members.splice(Number(btn.dataset.idx), 1);
      renderTeam();
    });
  });
}

// Export the current user's raw stats as a shareable JSON file.
function exportMine() {
  const name =
    (document.getElementById("memberName").value.trim()) || "Me";
  const payload = {
    version: 1,
    member: name,
    exportedAt: new Date().toISOString(),
    blockHits,
    focusSessions,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rekblock-stats-${name.replace(/\s+/g, "_")}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Read one or more exported JSON files into the in-memory members array.
function importMembers(fileList) {
  const files = Array.from(fileList || []);
  let pending = files.length;
  if (!pending) return;
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        members.push({
          name: data.member || file.name.replace(/\.json$/i, ""),
          blockHits: Array.isArray(data.blockHits) ? data.blockHits : [],
          focusSessions: Array.isArray(data.focusSessions) ? data.focusSessions : [],
        });
      } catch (e) {
        alert(`Could not read ${file.name}: not a valid stats export.`);
      }
      if (--pending === 0) renderTeam();
    };
    reader.onerror = () => {
      if (--pending === 0) renderTeam();
    };
    reader.readAsText(file);
  });
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

  renderProdChange(cur, prev);
  renderDailyChart();
  renderTopDomains();
  renderSuggestions();
  renderTeam();

  // Print header meta (period + generated date)
  document.getElementById("printMeta").textContent =
    `Period: ${periodLabel()} · Generated ${new Date().toLocaleString()}`;
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
  document
    .getElementById("printPdf")
    .addEventListener("click", () => window.print());

  // Team view
  document.getElementById("exportMine").addEventListener("click", exportMine);
  document
    .getElementById("importMembers")
    .addEventListener("change", (e) => importMembers(e.target.files));
  document
    .getElementById("memberName")
    .addEventListener("input", renderTeam);

  chrome.storage.onChanged.addListener((changes, ns) => {
    if (ns !== "local") return;
    if (changes.blockHits) blockHits = changes.blockHits.newValue || [];
    if (changes.focusSessions)
      focusSessions = changes.focusSessions.newValue || [];
    if (changes.blockHits || changes.focusSessions) render();
  });
});
