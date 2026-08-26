// ===============================
// options.js — RekBlock Options / Settings page (#11)
// Vanilla JS only (MV3 CSP: script-src 'self'). No CDN JS.
// ===============================

// ---------- Domain helpers (copied/adapted from popup.js) ----------
const compoundTlds = [
  "co.uk",
  "com.au",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "net.au",
  "edu.au",
];

function getBaseDomain(hostname) {
  const parts = hostname.split(".");
  if (parts.length > 2) {
    const tld = parts.slice(-2).join(".");
    if (compoundTlds.includes(tld)) return parts.slice(-3).join(".");
    return parts.slice(-2).join(".");
  }
  return hostname;
}

// Normalize any URL / domain string to a bare base domain, or null if invalid.
function getDomain(input) {
  const domainRegex = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
  let hostname = (input || "").trim();
  if (!hostname) return null;
  try {
    const url = new URL(hostname.startsWith("http") ? hostname : `http://${hostname}`);
    hostname = url.hostname;
  } catch (e) {
    // fall through, use raw input
  }
  if (!domainRegex.test(hostname)) return null; // must contain a dot / TLD
  return getBaseDomain(hostname).toLowerCase();
}

// ---------- Predefined website database ----------
// Bare base domains, grouped by category. Real, well-known sites.
const PREDEFINED_DB = {
  social: {
    name: "Social Media",
    emoji: "💬",
    mode: "block",
    domains: [
      "facebook.com",
      "instagram.com",
      "tiktok.com",
      "x.com",
      "twitter.com",
      "reddit.com",
      "snapchat.com",
      "pinterest.com",
      "linkedin.com",
      "tumblr.com",
      "threads.net",
    ],
  },
  news: {
    name: "News",
    emoji: "📰",
    mode: "block",
    domains: [
      "cnn.com",
      "bbc.com",
      "nytimes.com",
      "reuters.com",
      "theguardian.com",
      "foxnews.com",
      "washingtonpost.com",
      "bloomberg.com",
      "srf.ch",
      "spiegel.de",
    ],
  },
  video: {
    name: "Video / Streaming",
    emoji: "📺",
    mode: "block",
    domains: [
      "youtube.com",
      "netflix.com",
      "twitch.tv",
      "hulu.com",
      "disneyplus.com",
      "primevideo.com",
      "vimeo.com",
      "dailymotion.com",
      "hbomax.com",
      "max.com",
    ],
  },
  shopping: {
    name: "Shopping",
    emoji: "🛒",
    mode: "block",
    domains: [
      "amazon.com",
      "ebay.com",
      "aliexpress.com",
      "etsy.com",
      "walmart.com",
      "target.com",
      "wish.com",
      "temu.com",
      "shein.com",
      "zalando.com",
    ],
  },
  gaming: {
    name: "Gaming",
    emoji: "🎮",
    mode: "block",
    domains: [
      "steampowered.com",
      "roblox.com",
      "epicgames.com",
      "ign.com",
      "gamespot.com",
      "miniclip.com",
      "kongregate.com",
      "poki.com",
      "chess.com",
      "ea.com",
    ],
  },
  adult: {
    name: "Adult",
    emoji: "🔞",
    mode: "block",
    domains: [
      "pornhub.com",
      "xvideos.com",
      "xnxx.com",
      "xhamster.com",
      "redtube.com",
      "youporn.com",
      "onlyfans.com",
      "chaturbate.com",
    ],
  },
};

// ---------- Global state (mirrors chrome.storage.sync) ----------
let categories = {}; // { id: { name, emoji, mode, domains[] } }
let modes = {}; // { id: { name, categoryIds[] } }
let activeMode = null; // mode id or null
let exceptions = {}; // { domain: "allow" | "block" }
let settings = {}; // { theme, ... }
let searchQuery = ""; // lowercased search filter

// Working state
let editingCatId = null; // category id being edited, or null when creating
let editingDomains = []; // domains buffer for the category modal

// ---------- Utilities ----------
function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function el(id) {
  return document.getElementById(id);
}

function persist(obj, cb) {
  chrome.storage.sync.set(obj, cb || (() => {}));
}

function toast(msg) {
  // Lightweight status message in the header.
  const t = el("statusToast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("d-none");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("d-none"), 2500);
}

// ---------- Theme ----------
function applyTheme(theme) {
  document.documentElement.setAttribute("data-bs-theme", theme || "light");
}

// ---------- Tabs (custom, no Bootstrap JS) ----------
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("d-none"));
      btn.classList.add("active");
      el(`tab-${btn.dataset.tab}`).classList.remove("d-none");
    });
  });
}

// ---------- Category modal (custom) ----------
function openCategoryModal(catId) {
  editingCatId = catId || null;
  const cat = catId ? categories[catId] : null;
  el("catModalTitle").textContent = cat ? "Edit category" : "New category";
  el("catNameInput").value = cat ? cat.name : "";
  el("catEmojiInput").value = cat ? cat.emoji : "📁";
  el("catModeSelect").value = cat ? cat.mode : "block";
  editingDomains = cat ? [...cat.domains] : [];
  el("catDomainInput").value = "";
  renderModalDomains();
  el("catModal").classList.remove("d-none");
  el("catNameInput").focus();
}

function closeCategoryModal() {
  el("catModal").classList.add("d-none");
  editingCatId = null;
  editingDomains = [];
}

function renderModalDomains() {
  const ul = el("catDomainList");
  ul.innerHTML = "";
  if (editingDomains.length === 0) {
    const li = document.createElement("li");
    li.className = "list-group-item text-muted small";
    li.textContent = "No domains yet — add one above.";
    ul.appendChild(li);
    return;
  }
  editingDomains.forEach((d, i) => {
    const li = document.createElement("li");
    li.className = "list-group-item d-flex justify-content-between align-items-center py-1";
    li.innerHTML = `<span>${d}</span>`;
    const btn = document.createElement("button");
    btn.className = "btn btn-outline-danger btn-sm";
    btn.textContent = "✕";
    btn.addEventListener("click", () => {
      editingDomains.splice(i, 1);
      renderModalDomains();
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function addModalDomain() {
  const raw = el("catDomainInput").value;
  const domain = getDomain(raw);
  if (!domain) {
    toast("Invalid domain — must include a dot / TLD.");
    return;
  }
  if (editingDomains.includes(domain)) {
    toast("Domain already in this category.");
    el("catDomainInput").value = "";
    return;
  }
  editingDomains.push(domain);
  el("catDomainInput").value = "";
  renderModalDomains();
  el("catDomainInput").focus();
}

function saveCategory() {
  const name = el("catNameInput").value.trim();
  if (!name) {
    toast("Category needs a name.");
    return;
  }
  const emoji = el("catEmojiInput").value.trim() || "📁";
  const mode = el("catModeSelect").value === "allow" ? "allow" : "block";
  const id = editingCatId || newId("cat");
  categories[id] = { name, emoji, mode, domains: [...editingDomains] };
  persist({ categories }, () => {
    closeCategoryModal();
    renderAll();
    toast("Category saved.");
  });
}

function deleteCategory(id) {
  if (!confirm(`Delete category "${categories[id]?.name}"?`)) return;
  delete categories[id];
  // Remove the category from any modes that referenced it.
  Object.values(modes).forEach((m) => {
    m.categoryIds = m.categoryIds.filter((cid) => cid !== id);
  });
  persist({ categories, modes }, () => {
    renderAll();
    toast("Category deleted.");
  });
}

// ---------- Category list rendering ----------
function domainMatches(domain) {
  return !searchQuery || domain.toLowerCase().includes(searchQuery);
}

function categoryMatches(cat) {
  if (!searchQuery) return true;
  if (cat.name.toLowerCase().includes(searchQuery)) return true;
  return cat.domains.some((d) => d.toLowerCase().includes(searchQuery));
}

function renderCategories() {
  const wrap = el("categoryList");
  wrap.innerHTML = "";
  const entries = Object.entries(categories).filter(([, c]) => categoryMatches(c));
  if (entries.length === 0) {
    wrap.innerHTML = `<div class="col-12"><div class="text-muted text-center py-4">${
      Object.keys(categories).length === 0
        ? "No categories yet. Click “New category” to create one."
        : "No categories match your search."
    }</div></div>`;
    return;
  }
  entries.forEach(([id, cat]) => {
    const col = document.createElement("div");
    col.className = "col-12 col-md-6 col-lg-4";
    const modeBadge =
      cat.mode === "allow"
        ? `<span class="badge bg-success">allowlist</span>`
        : `<span class="badge bg-danger">block</span>`;
    const domains = cat.domains.filter(domainMatches);
    const domainHtml =
      cat.domains.length === 0
        ? `<li class="list-group-item text-muted small py-1">No domains.</li>`
        : domains
            .map((d) => `<li class="list-group-item py-1 small">${d}</li>`)
            .join("");
    col.innerHTML = `
      <div class="card h-100 shadow-sm">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h5 class="card-title m-0">${cat.emoji} ${cat.name}</h5>
            ${modeBadge}
          </div>
          <div class="text-muted small mb-2">${cat.domains.length} domain(s)</div>
          <ul class="list-group list-group-flush mb-3" style="max-height:180px;overflow-y:auto">${domainHtml}</ul>
          <div class="d-flex gap-2">
            <button class="btn btn-outline-primary btn-sm flex-fill" data-edit="${id}">Edit</button>
            <button class="btn btn-outline-danger btn-sm flex-fill" data-del="${id}">Delete</button>
          </div>
        </div>
      </div>`;
    wrap.appendChild(col);
  });
  wrap.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => openCategoryModal(b.dataset.edit))
  );
  wrap.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteCategory(b.dataset.del))
  );
}

// ---------- Predefined DB rendering ----------
function renderPredefined() {
  const wrap = el("predefinedList");
  wrap.innerHTML = "";
  Object.entries(PREDEFINED_DB).forEach(([key, cat]) => {
    const div = document.createElement("div");
    div.className = "col-12 col-md-6";
    const domainChecks = cat.domains
      .map(
        (d) => `
        <label class="d-inline-flex align-items-center me-3 mb-1 small">
          <input type="checkbox" class="form-check-input me-1 pd-domain" data-key="${key}" data-domain="${d}" checked>
          ${d}
        </label>`
      )
      .join("");
    div.innerHTML = `
      <div class="card h-100 shadow-sm">
        <div class="card-body">
          <label class="d-flex align-items-center gap-2 mb-2">
            <input type="checkbox" class="form-check-input pd-cat" data-key="${key}">
            <span class="fw-semibold">${cat.emoji} ${cat.name}</span>
            <span class="badge bg-danger">block</span>
          </label>
          <div>${domainChecks}</div>
        </div>
      </div>`;
    wrap.appendChild(div);
  });
}

// Gather selected predefined categories -> { key: [domains] }.
function collectSelectedPredefined() {
  const result = {};
  document.querySelectorAll(".pd-cat:checked").forEach((cb) => {
    const key = cb.dataset.key;
    result[key] = [];
  });
  document.querySelectorAll(".pd-domain:checked").forEach((cb) => {
    const key = cb.dataset.key;
    if (result[key]) result[key].push(cb.dataset.domain);
  });
  return result;
}

// Import predefined categories. onlyMissing => never duplicate existing domains.
function importPredefined(onlyMissing) {
  const selected = collectSelectedPredefined();
  const keys = Object.keys(selected);
  if (keys.length === 0) {
    toast("Select at least one predefined category (tick its box).");
    return;
  }
  let added = 0;
  keys.forEach((key) => {
    const pd = PREDEFINED_DB[key];
    const wanted = selected[key];
    // Find an existing user category with the same name, else create one.
    let existingId = Object.keys(categories).find(
      (id) => categories[id].name.toLowerCase() === pd.name.toLowerCase()
    );
    if (!existingId) {
      existingId = newId("cat");
      categories[existingId] = { name: pd.name, emoji: pd.emoji, mode: pd.mode, domains: [] };
    }
    const target = categories[existingId];
    wanted.forEach((d) => {
      const missing = !target.domains.includes(d);
      if (missing || !onlyMissing) {
        if (missing) {
          target.domains.push(d);
          added++;
        }
      }
    });
  });
  persist({ categories }, () => {
    renderAll();
    toast(`Imported ${added} new domain(s).`);
  });
}

// ---------- Modes ----------
function renderModeCategoryPicker() {
  const wrap = el("modeCatChecks");
  wrap.innerHTML = "";
  const entries = Object.entries(categories);
  if (entries.length === 0) {
    wrap.innerHTML = `<div class="text-muted small">Create a category first.</div>`;
    return;
  }
  entries.forEach(([id, cat]) => {
    const label = document.createElement("label");
    label.className = "d-flex align-items-center gap-2 mb-1";
    label.innerHTML = `
      <input type="checkbox" class="form-check-input mode-cat-check" data-id="${id}">
      <span>${cat.emoji} ${cat.name}</span>
      ${cat.mode === "allow" ? '<span class="badge bg-success">allowlist</span>' : '<span class="badge bg-danger">block</span>'}`;
    wrap.appendChild(label);
  });
  wrap.querySelectorAll(".mode-cat-check").forEach((cb) =>
    cb.addEventListener("change", updateAllowlistWarning)
  );
  updateAllowlistWarning();
}

function updateAllowlistWarning() {
  const warn = el("modeAllowWarning");
  const anyAllow = [...document.querySelectorAll(".mode-cat-check:checked")].some(
    (cb) => categories[cb.dataset.id]?.mode === "allow"
  );
  warn.classList.toggle("d-none", !anyAllow);
}

function createMode() {
  const name = el("modeNameInput").value.trim();
  if (!name) {
    toast("Mode needs a name.");
    return;
  }
  const categoryIds = [...document.querySelectorAll(".mode-cat-check:checked")].map(
    (cb) => cb.dataset.id
  );
  if (categoryIds.length === 0) {
    toast("Select at least one category for this mode.");
    return;
  }
  const id = newId("mode");
  modes[id] = { name, categoryIds };
  persist({ modes }, () => {
    el("modeNameInput").value = "";
    renderAll();
    toast("Mode created.");
  });
}

function activateMode(id) {
  activeMode = id;
  persist({ activeMode }, () => {
    renderModes();
    toast(`Activated “${modes[id]?.name}”.`);
  });
}

function deactivateMode() {
  activeMode = null;
  persist({ activeMode }, () => {
    renderModes();
    toast("Deactivated. Nothing is being blocked by a mode.");
  });
}

function deleteMode(id) {
  if (!confirm(`Delete mode "${modes[id]?.name}"?`)) return;
  if (activeMode === id) activeMode = null;
  delete modes[id];
  persist({ modes, activeMode }, () => {
    renderModes();
    toast("Mode deleted.");
  });
}

function renderModes() {
  const wrap = el("modeList");
  wrap.innerHTML = "";
  const entries = Object.entries(modes);
  if (entries.length === 0) {
    wrap.innerHTML = `<div class="text-muted text-center py-3">No modes yet.</div>`;
    return;
  }
  entries.forEach(([id, mode]) => {
    const isActive = activeMode === id;
    const cats = mode.categoryIds
      .map((cid) => categories[cid])
      .filter(Boolean);
    const hasAllow = cats.some((c) => c.mode === "allow");
    const catBadges = cats.length
      ? cats
          .map(
            (c) =>
              `<span class="badge ${c.mode === "allow" ? "bg-success" : "bg-danger"} me-1">${c.emoji} ${c.name}</span>`
          )
          .join("")
      : '<span class="text-muted small">(no existing categories)</span>';
    const div = document.createElement("div");
    div.className = `card mb-2 ${isActive ? "border-primary border-2" : ""}`;
    div.innerHTML = `
      <div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <div class="fw-semibold">
            ${mode.name} ${isActive ? '<span class="badge bg-primary">ACTIVE</span>' : ""}
          </div>
          <div class="mt-1">${catBadges}</div>
          ${hasAllow ? '<div class="text-danger small mt-1">⚠️ Allowlist lockdown: only listed sites will be reachable when active.</div>' : ""}
        </div>
        <div class="d-flex gap-2">
          ${
            isActive
              ? `<button class="btn btn-outline-secondary btn-sm" data-deact="1">Deactivate</button>`
              : `<button class="btn btn-primary btn-sm" data-act="${id}">Activate</button>`
          }
          <button class="btn btn-outline-danger btn-sm" data-delmode="${id}">Delete</button>
        </div>
      </div>`;
    wrap.appendChild(div);
  });
  wrap.querySelectorAll("[data-act]").forEach((b) =>
    b.addEventListener("click", () => activateMode(b.dataset.act))
  );
  wrap.querySelectorAll("[data-deact]").forEach((b) =>
    b.addEventListener("click", deactivateMode)
  );
  wrap.querySelectorAll("[data-delmode]").forEach((b) =>
    b.addEventListener("click", () => deleteMode(b.dataset.delmode))
  );
}

// ---------- Exceptions ----------
function addException() {
  const domain = getDomain(el("excDomainInput").value);
  if (!domain) {
    toast("Invalid domain for exception.");
    return;
  }
  const type = el("excTypeSelect").value === "block" ? "block" : "allow";
  exceptions[domain] = type;
  persist({ exceptions }, () => {
    el("excDomainInput").value = "";
    renderExceptions();
    toast("Exception saved.");
  });
}

function removeException(domain) {
  delete exceptions[domain];
  persist({ exceptions }, () => {
    renderExceptions();
    toast("Exception removed.");
  });
}

function renderExceptions() {
  const wrap = el("excList");
  wrap.innerHTML = "";
  const entries = Object.entries(exceptions).filter(
    ([d]) => !searchQuery || d.toLowerCase().includes(searchQuery)
  );
  if (entries.length === 0) {
    wrap.innerHTML = `<li class="list-group-item text-muted text-center">${
      Object.keys(exceptions).length === 0 ? "No exceptions defined." : "No matches."
    }</li>`;
    return;
  }
  entries.forEach(([domain, type]) => {
    const li = document.createElement("li");
    li.className = "list-group-item d-flex justify-content-between align-items-center";
    li.innerHTML = `
      <span>${domain} <span class="badge ${type === "allow" ? "bg-success" : "bg-danger"} ms-2">${type}</span></span>`;
    const btn = document.createElement("button");
    btn.className = "btn btn-outline-danger btn-sm";
    btn.textContent = "Remove";
    btn.addEventListener("click", () => removeException(domain));
    li.appendChild(btn);
    wrap.appendChild(li);
  });
}

// ---------- Export ----------
function renderExportPickers() {
  const catWrap = el("exportCatList");
  const modeWrap = el("exportModeList");
  catWrap.innerHTML = "";
  modeWrap.innerHTML = "";
  const catEntries = Object.entries(categories);
  const modeEntries = Object.entries(modes);
  catWrap.innerHTML = catEntries.length
    ? catEntries
        .map(
          ([id, c]) =>
            `<label class="d-block small"><input type="checkbox" class="form-check-input me-1 exp-cat" data-id="${id}" checked> ${c.emoji} ${c.name}</label>`
        )
        .join("")
    : '<span class="text-muted small">No categories.</span>';
  modeWrap.innerHTML = modeEntries.length
    ? modeEntries
        .map(
          ([id, m]) =>
            `<label class="d-block small"><input type="checkbox" class="form-check-input me-1 exp-mode" data-id="${id}" checked> ${m.name}</label>`
        )
        .join("")
    : '<span class="text-muted small">No modes.</span>';
  catWrap.querySelectorAll(".exp-cat").forEach((cb) => cb.addEventListener("change", updateExportPreview));
  modeWrap.querySelectorAll(".exp-mode").forEach((cb) => cb.addEventListener("change", updateExportPreview));
  updateExportPreview();
}

function buildExportPayload() {
  const selCats = {};
  document.querySelectorAll(".exp-cat:checked").forEach((cb) => {
    selCats[cb.dataset.id] = categories[cb.dataset.id];
  });
  const selModes = {};
  document.querySelectorAll(".exp-mode:checked").forEach((cb) => {
    selModes[cb.dataset.id] = modes[cb.dataset.id];
  });
  return {
    version: 1,
    categories: selCats,
    modes: selModes,
    exceptions: el("exportExceptions").checked ? exceptions : {},
  };
}

function updateExportPreview() {
  el("exportPreview").textContent = JSON.stringify(buildExportPayload(), null, 2);
}

function downloadExport() {
  const blob = new Blob([JSON.stringify(buildExportPayload(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rekblock-config-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Config downloaded.");
}

// ---------- Import config (with preview + merge) ----------
let importBuffer = null; // parsed config awaiting apply

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (e) {
      toast("Invalid JSON file.");
      return;
    }
    if (!data || typeof data !== "object") {
      toast("File is not a RekBlock config.");
      return;
    }
    importBuffer = {
      categories: data.categories && typeof data.categories === "object" ? data.categories : {},
      modes: data.modes && typeof data.modes === "object" ? data.modes : {},
      exceptions: data.exceptions && typeof data.exceptions === "object" ? data.exceptions : {},
    };
    renderImportPreview();
  };
  reader.readAsText(file);
}

function renderImportPreview() {
  const wrap = el("importPreview");
  wrap.innerHTML = "";
  if (!importBuffer) {
    wrap.innerHTML = '<div class="text-muted small">Load a file to preview.</div>';
    el("importApplyBtn").disabled = true;
    return;
  }
  const catEntries = Object.entries(importBuffer.categories);
  const modeEntries = Object.entries(importBuffer.modes);
  const excEntries = Object.entries(importBuffer.exceptions);
  let html = "";
  html += `<h6 class="mt-2">Categories</h6>`;
  html += catEntries.length
    ? catEntries
        .map(
          ([id, c]) =>
            `<label class="d-block small"><input type="checkbox" class="form-check-input me-1 imp-cat" data-id="${id}" checked> ${c.emoji || "📁"} ${c.name} (${(c.domains || []).length} domains)</label>`
        )
        .join("")
    : '<div class="text-muted small">None.</div>';
  html += `<h6 class="mt-3">Modes</h6>`;
  html += modeEntries.length
    ? modeEntries
        .map(
          ([id, m]) =>
            `<label class="d-block small"><input type="checkbox" class="form-check-input me-1 imp-mode" data-id="${id}" checked> ${m.name}</label>`
        )
        .join("")
    : '<div class="text-muted small">None.</div>';
  html += `<h6 class="mt-3">Exceptions</h6>`;
  html += excEntries.length
    ? excEntries
        .map(
          ([d, t]) =>
            `<label class="d-block small"><input type="checkbox" class="form-check-input me-1 imp-exc" data-domain="${d}" checked> ${d} (${t})</label>`
        )
        .join("")
    : '<div class="text-muted small">None.</div>';
  wrap.innerHTML = html;
  el("importApplyBtn").disabled = false;
}

function applyImport() {
  if (!importBuffer) return;
  // Merge only the checked items into existing storage.
  document.querySelectorAll(".imp-cat:checked").forEach((cb) => {
    const id = cb.dataset.id;
    const c = importBuffer.categories[id];
    if (c && c.name) {
      categories[id] = {
        name: c.name,
        emoji: c.emoji || "📁",
        mode: c.mode === "allow" ? "allow" : "block",
        domains: Array.isArray(c.domains) ? c.domains : [],
      };
    }
  });
  document.querySelectorAll(".imp-mode:checked").forEach((cb) => {
    const id = cb.dataset.id;
    const m = importBuffer.modes[id];
    if (m && m.name) {
      modes[id] = {
        name: m.name,
        categoryIds: Array.isArray(m.categoryIds) ? m.categoryIds : [],
      };
    }
  });
  document.querySelectorAll(".imp-exc:checked").forEach((cb) => {
    const d = cb.dataset.domain;
    const t = importBuffer.exceptions[d];
    exceptions[d] = t === "block" ? "block" : "allow";
  });
  persist({ categories, modes, exceptions }, () => {
    importBuffer = null;
    renderImportPreview();
    renderAll();
    toast("Config merged into your settings.");
  });
}

// ---------- Import from other blockers ----------
let blkParsed = []; // parsed unique base domains awaiting category creation

function parseBlockerList(text) {
  // Accept: JSON array of strings, or newline/comma-separated list of domains/URLs.
  let items = [];
  const trimmed = (text || "").trim();
  if (!trimmed) return [];
  try {
    const json = JSON.parse(trimmed);
    if (Array.isArray(json)) {
      items = json.filter((x) => typeof x === "string");
    }
  } catch (e) {
    // Not JSON — split on newlines and commas.
    items = trimmed.split(/[\n,]+/);
  }
  const domains = [];
  items.forEach((raw) => {
    const d = getDomain(raw);
    if (d && !domains.includes(d)) domains.push(d);
  });
  return domains;
}

function renderBlkPreview() {
  const wrap = el("blkPreview");
  wrap.innerHTML = "";
  if (blkParsed.length === 0) {
    wrap.innerHTML = '<div class="text-muted small">Nothing parsed yet.</div>';
    el("blkCreateBtn").disabled = true;
    return;
  }
  wrap.innerHTML = blkParsed
    .map(
      (d) =>
        `<label class="d-inline-flex align-items-center me-3 mb-1 small"><input type="checkbox" class="form-check-input me-1 blk-domain" data-domain="${d}" checked> ${d}</label>`
    )
    .join("");
  el("blkCreateBtn").disabled = false;
}

function doParseBlocker() {
  blkParsed = parseBlockerList(el("blkPasteInput").value);
  if (blkParsed.length === 0) toast("No valid domains found.");
  renderBlkPreview();
}

function createCategoryFromBlocker() {
  const selected = [...document.querySelectorAll(".blk-domain:checked")].map(
    (cb) => cb.dataset.domain
  );
  if (selected.length === 0) {
    toast("Select at least one domain.");
    return;
  }
  const name = el("blkCatName").value.trim() || "Imported";
  const id = newId("cat");
  categories[id] = { name, emoji: "📥", mode: "block", domains: selected };
  persist({ categories }, () => {
    el("blkPasteInput").value = "";
    el("blkCatName").value = "";
    blkParsed = [];
    renderBlkPreview();
    renderAll();
    toast(`Created category “${name}” with ${selected.length} domain(s).`);
  });
}

// ---------- Master render ----------
function renderAll() {
  renderCategories();
  renderModeCategoryPicker();
  renderModes();
  renderExceptions();
  renderExportPickers();
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(
    ["categories", "modes", "activeMode", "exceptions", "settings"],
    (data) => {
      categories = data.categories || {};
      modes = data.modes || {};
      activeMode = data.activeMode || null;
      exceptions = data.exceptions || {};
      settings = data.settings || {};
      applyTheme(settings.theme);

      initTabs();
      renderPredefined();
      renderImportPreview();
      renderBlkPreview();
      renderAll();
    }
  );

  // Search
  el("searchInput").addEventListener("input", (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderCategories();
    renderExceptions();
  });

  // Category modal
  el("newCategoryBtn").addEventListener("click", () => openCategoryModal(null));
  el("catSaveBtn").addEventListener("click", saveCategory);
  el("catCancelBtn").addEventListener("click", closeCategoryModal);
  el("catModalClose").addEventListener("click", closeCategoryModal);
  el("catDomainAddBtn").addEventListener("click", addModalDomain);
  el("catDomainInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addModalDomain();
    }
  });
  // Click on backdrop closes modal.
  el("catModal").addEventListener("click", (e) => {
    if (e.target === el("catModal")) closeCategoryModal();
  });

  // Predefined DB
  el("pdImportSelected").addEventListener("click", () => importPredefined(false));
  el("pdAddMissing").addEventListener("click", () => importPredefined(true));

  // Modes
  el("modeCreateBtn").addEventListener("click", createMode);

  // Exceptions
  el("excAddBtn").addEventListener("click", addException);
  el("excDomainInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") addException();
  });

  // Export
  el("exportExceptions").addEventListener("change", updateExportPreview);
  el("exportDownloadBtn").addEventListener("click", downloadExport);

  // Import config
  el("importConfigFile").addEventListener("change", (e) => {
    if (e.target.files?.[0]) handleImportFile(e.target.files[0]);
    e.target.value = "";
  });
  el("importApplyBtn").addEventListener("click", applyImport);

  // Import from other blockers
  el("blkParseBtn").addEventListener("click", doParseBlocker);
  el("blkFile").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      el("blkPasteInput").value = reader.result;
      doParseBlocker();
    };
    reader.readAsText(file);
    e.target.value = "";
  });
  el("blkCreateBtn").addEventListener("click", createCategoryFromBlocker);
});

// Keep in sync if storage changes elsewhere (e.g. popup toggles).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  let touched = false;
  if (changes.categories) {
    categories = changes.categories.newValue || {};
    touched = true;
  }
  if (changes.modes) {
    modes = changes.modes.newValue || {};
    touched = true;
  }
  if (changes.activeMode) {
    activeMode = changes.activeMode.newValue || null;
    touched = true;
  }
  if (changes.exceptions) {
    exceptions = changes.exceptions.newValue || {};
    touched = true;
  }
  if (changes.settings) {
    settings = changes.settings.newValue || {};
    applyTheme(settings.theme);
  }
  if (touched) renderAll();
});
