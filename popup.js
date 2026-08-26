// ===============================
// popup.js
// ===============================

// ---------- Domain helpers ----------
function normalizePattern(pattern) {
  return pattern
    .replace(/^\*:\/\/|\/?\*$/g, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function domainFromInput(input) {
  return getDomain(input)?.toLowerCase();
}

function isDomainInAnyCategory(domain) {
  return Object.values(categoryLists).some((patterns) =>
    patterns.some((pattern) => normalizePattern(pattern) === domain),
  );
}

function findCategoryByDomain(domain) {
  for (const [category, patterns] of Object.entries(categoryLists)) {
    for (const pattern of patterns) {
      if (normalizePattern(pattern) === domain) {
        return category;
      }
    }
  }
  return null;
}

// 1. Define the Category URLs
const categoryLists = {
  checkSports: [
    "*://espn.com*",
    "*://bleacherreport.com*",
    "*://sports.yahoo.com*",
    "*://skysports.com*",
    "*://fifa.com*",
  ],
  checkNews: [
    "*://srf.ch*",
    "*://edition.cnn.com*",
    "*://bbc.com*",
    "*://reuters.com*",
    "*://nytimes.com*",
  ],
  checkGaming: [
    "*://twitch.tv/*",
    "*://ign.com*",
    "*://gamespot.com*",
    "*://roblox.com*",
  ],
  checkSocial: [
    "*://facebook.com*",
    "*://instagram.com*",
    "*://tiktok.com*",
    "*://x.com*",
  ],
};

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
    if (compoundTlds.includes(tld)) {
      return parts.slice(-3).join(".");
    } else {
      return parts.slice(-2).join(".");
    }
  }
  return hostname;
}

function getDomain(input) {
  const domainRegex = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
  let hostname = input.trim();

  try {
    let url = new URL(input.startsWith("http") ? input : `http://${input}`);
    hostname = url.hostname;
  } catch (e) {
    // If URL parsing fails, use input as is
  }

  if (!domainRegex.test(hostname)) {
    return null;
  }

  const baseDomain = getBaseDomain(hostname);
  return baseDomain;
}

// ---------- Shared UI state ----------
let urlStats = {}; // { domain: { deletes, reinserts, lastDeleted } } (storage.local)
let settings = {}; // { theme, password: { hash } } (storage.sync)
let blockFilter = ""; // search query for the blocked list

function openPage(path) {
  const url = chrome.runtime.getURL(path);
  chrome.tabs.query({ url }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true }, () => {
        chrome.windows.update(tabs[0].windowId, { focused: true });
      });
    } else {
      chrome.tabs.create({ url });
    }
  });
}

// ---------- Theme (#11 light/dark mode) ----------
function applyTheme(theme) {
  document.documentElement.setAttribute("data-bs-theme", theme || "light");
  const btn = document.getElementById("themeBtn");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

function toggleTheme() {
  const next = settings.theme === "dark" ? "light" : "dark";
  settings.theme = next;
  chrome.storage.sync.set({ settings }, () => applyTheme(next));
}

// ---------- Password protection (#8) ----------
const PW_SALT = "rekblock::";

async function hashPassword(pw) {
  const bytes = new TextEncoder().encode(PW_SALT + pw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isProtected() {
  return !!settings.password?.hash;
}

// Resolves true if the action may proceed (no password, or correct one entered).
async function requireUnlock() {
  if (!isProtected()) return true;
  const entered = window.prompt(
    "This action is password protected.\nEnter your password to continue:",
  );
  if (entered === null) return false;
  const hash = await hashPassword(entered);
  if (hash === settings.password.hash) return true;
  alert("Incorrect password.");
  return false;
}

async function handleLockButton() {
  if (isProtected()) {
    // Offer to remove protection (requires current password).
    if (!(await requireUnlock())) return;
    if (confirm("Remove password protection?")) {
      delete settings.password;
      chrome.storage.sync.set({ settings }, updateLockIcon);
    }
    return;
  }
  const pw = window.prompt("Set a password to protect your blocking settings:");
  if (!pw) return;
  const confirmPw = window.prompt("Confirm password:");
  if (pw !== confirmPw) {
    alert("Passwords do not match.");
    return;
  }
  settings.password = { hash: await hashPassword(pw) };
  chrome.storage.sync.set({ settings }, updateLockIcon);
}

function updateLockIcon() {
  const btn = document.getElementById("lockBtn");
  if (btn) btn.textContent = isProtected() ? "🔒" : "🔓";
}

// ---------- Delete / reinsert tracking (#9) ----------
function recordDeletion(domain) {
  const s = urlStats[domain] || { deletes: 0, reinserts: 0 };
  s.deletes += 1;
  s.lastDeleted = Date.now();
  urlStats[domain] = s;
  chrome.storage.local.set({ urlStats });
}

function recordReinsertion(domain) {
  const s = urlStats[domain];
  if (s && s.deletes > 0) {
    s.reinserts += 1;
    urlStats[domain] = s;
    chrome.storage.local.set({ urlStats });
  }
}

// ---------- Blocked list rendering ----------
function renderBlockedList(blocked, editingIndex = null) {
  const ul = document.getElementById("blockedList");
  ul.innerHTML = "";

  // 🔑 Only show manually added domains, honouring the search filter.
  const visibleBlocked = blocked.filter((pattern) => {
    const domain = normalizePattern(pattern);
    if (isDomainInAnyCategory(domain)) return false;
    if (blockFilter && !domain.includes(blockFilter)) return false;
    return true;
  });

  if (visibleBlocked.length === 0) {
    const li = document.createElement("li");
    li.classList.add(
      "list-group-item",
      "text-center",
      "text-muted",
      "rounded-3",
      "mb-2",
      "bg-light",
      "border",
      "border-light",
      "shadow-sm"
    );
    li.textContent = blockFilter
      ? "No matching domains"
      : "No URLs currently defined";
    ul.appendChild(li);
    return;
  }

  visibleBlocked.forEach((pattern) => {
    const realIndex = blocked.indexOf(pattern);
    const li = document.createElement("li");

    li.classList.add(
      "list-group-item",
      "d-flex",
      "justify-content-between",
      "align-items-center",
      "rounded-3",
      "mb-2",
      "bg-light",
      "border",
      "border-light",
      "shadow-sm"
    );

    if (realIndex === editingIndex) {
      const domain = normalizePattern(pattern);
      li.innerHTML = `
        <input class="form-control form-control-sm me-2" value="${domain}">
        <div class="d-flex gap-2">
          <button class="btn btn-success btn-sm save" data-index="${realIndex}">Save</button>
          <button class="btn btn-secondary btn-sm cancel" data-index="${realIndex}">Cancel</button>
        </div>
      `;
    } else {
      const domain = normalizePattern(pattern);
      const stats = urlStats[domain];
      const badge =
        stats && stats.reinserts > 0
          ? `<span class="badge bg-warning text-dark ms-2" title="Deleted ${stats.deletes}× / re-added ${stats.reinserts}×">↩ ${stats.reinserts}</span>`
          : "";
      li.innerHTML = `
        <span>${pattern}${badge}</span>
        <div class="d-flex gap-1">
          <button class="btn btn-outline-secondary btn-sm schedule" data-domain="${domain}" title="Schedule">⏰</button>
          <button class="btn btn-primary btn-sm edit" data-index="${realIndex}">Edit</button>
          <button class="btn btn-danger btn-sm delete" data-index="${realIndex}" data-domain="${domain}">Delete</button>
        </div>
      `;
    }

    ul.appendChild(li);
  });

  // 🔘 Button click handlers
  document.querySelectorAll("#blockedList .btn").forEach((button) => {
    button.addEventListener("click", function () {
      const index = parseInt(this.dataset.index, 10);

      if (this.classList.contains("schedule")) {
        const domain = this.dataset.domain;
        const url = chrome.runtime.getURL(
          `pages/routine.html?domain=${encodeURIComponent(domain)}`,
        );
        chrome.tabs.create({ url });
        return;
      }

      if (this.classList.contains("edit")) {
        renderBlockedList(blocked, index);
        return;
      }

      if (this.classList.contains("cancel")) {
        renderBlockedList(blocked);
        return;
      }

      if (this.classList.contains("delete")) {
        const domain = this.dataset.domain;
        requireUnlock().then((ok) => {
          if (!ok) return;
          chrome.storage.sync.get("blocked", (data) => {
            let blocked = data.blocked || [];
            blocked.splice(index, 1);
            recordDeletion(domain);
            chrome.storage.sync.set({ blocked }, () => {
              renderBlockedList(blocked);
            });
          });
        });
        return;
      }

      if (this.classList.contains("save")) {
        chrome.storage.sync.get("blocked", (data) => {
          let blocked = data.blocked || [];
          const input = document.querySelector("li input");
          const domain = domainFromInput(input.value);

          if (!domain) {
            alert("Invalid domain");
            return;
          }

          if (isDomainInAnyCategory(domain)) {
            alert("This domain belongs to a category.");
            return;
          }

          blocked[index] = `*://${domain}/*`;
          chrome.storage.sync.set({ blocked }, () => {
            renderBlockedList(blocked);
          });
        });
        return;
      }
    });
  });

  // 🔑 Enable Enter / Escape while editing
  const editInput = document.querySelector("li input");
  if (editInput) {
    editInput.focus();

    editInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        document.querySelector(".btn.save")?.click();
      }
      if (e.key === "Escape") {
        document.querySelector(".btn.cancel")?.click();
      }
    });
  }
}

function addDomain(domain) {
  chrome.storage.sync.get("blocked", (data) => {
    const blocked = data.blocked || [];

    const exists = blocked.some((p) => normalizePattern(p) === domain);
    if (exists) {
      alert("This domain is already blocked.");
      return;
    }

    blocked.push(`*://${domain}/*`);
    recordReinsertion(domain);
    chrome.storage.sync.set({ blocked }, () => {
      document.getElementById("urlInput").value = "";
      renderBlockedList(blocked);
    });
  });
}

function handleSubmit() {
  const input = document.getElementById("urlInput").value.trim();
  const domain = domainFromInput(input);

  if (!domain) {
    alert("Invalid domain");
    return;
  }

  if (isDomainInAnyCategory(domain)) {
    alert("This domain is already blocked via a category.");
    return;
  }

  addDomain(domain);
}

// ---------- Block the current tab (#11 quick action) ----------
function blockCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !/^https?:/.test(tab.url)) {
      alert("This tab cannot be blocked.");
      return;
    }
    const domain = getDomain(tab.url);
    if (!domain) {
      alert("Could not determine the domain of this tab.");
      return;
    }
    if (isDomainInAnyCategory(domain)) {
      alert("This domain is already blocked via a category.");
      return;
    }
    addDomain(domain);
  });
}

// ---------- Import / export (#11) ----------
function exportConfig() {
  chrome.storage.sync.get(["blocked", "schedules", "settings"], (data) => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      blocked: data.blocked || [],
      schedules: data.schedules || {},
      // Never export the password hash.
      settings: { theme: data.settings?.theme || "light" },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekblock-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function importConfig(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let payload;
    try {
      payload = JSON.parse(reader.result);
    } catch (e) {
      alert("Invalid configuration file.");
      return;
    }
    if (!payload || (!Array.isArray(payload.blocked) && !payload.schedules)) {
      alert("This file does not look like a RekBlock configuration.");
      return;
    }
    if (
      !confirm(
        "Importing will replace your current blocked list and schedules. Continue?",
      )
    ) {
      return;
    }

    const update = {};
    if (Array.isArray(payload.blocked)) update.blocked = payload.blocked;
    if (payload.schedules && typeof payload.schedules === "object")
      update.schedules = payload.schedules;
    if (payload.settings?.theme) {
      settings.theme = payload.settings.theme;
      update.settings = settings;
    }

    chrome.storage.sync.set(update, () => {
      applyTheme(settings.theme);
      renderBlockedList(update.blocked || []);
      syncCategoryToggles(update.blocked || []);
      alert("Configuration imported.");
    });
  };
  reader.readAsText(file);
}

// ---------- Category toggles ----------
function syncCategoryToggles(blocked) {
  const blockedDomains = blocked.map(normalizePattern);
  document.querySelectorAll(".category-checkbox").forEach((checkbox) => {
    const categoryDomains = (categoryLists[checkbox.id] || []).map(
      normalizePattern,
    );
    checkbox.checked = categoryDomains.every((d) => blockedDomains.includes(d));
  });
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", function () {
  // Load settings + stats first so the initial render has them.
  chrome.storage.sync.get(["blocked", "settings"], function (data) {
    settings = data.settings || {};
    applyTheme(settings.theme);
    updateLockIcon();

    chrome.storage.local.get("urlStats", function (local) {
      urlStats = local.urlStats || {};
      renderBlockedList(data.blocked || []);
      syncCategoryToggles(data.blocked || []);
    });
  });

  document.getElementById("addButton").addEventListener("click", handleSubmit);

  document
    .getElementById("urlInput")
    .addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        handleSubmit();
      }
    });

  document
    .getElementById("blockCurrentBtn")
    .addEventListener("click", blockCurrentTab);

  document.getElementById("themeBtn").addEventListener("click", toggleTheme);
  document.getElementById("lockBtn").addEventListener("click", handleLockButton);
  document
    .getElementById("focusBtn")
    .addEventListener("click", () => openPage("pages/focus.html"));
  document
    .getElementById("statsBtn")
    .addEventListener("click", () => openPage("pages/stats.html"));
  document
    .getElementById("optionsBtn")
    .addEventListener("click", () => openPage("pages/options.html"));

  document.getElementById("searchInput").addEventListener("input", (e) => {
    blockFilter = e.target.value.trim().toLowerCase();
    chrome.storage.sync.get("blocked", (data) =>
      renderBlockedList(data.blocked || []),
    );
  });
  document.getElementById("exportBtn").addEventListener("click", exportConfig);
  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });
  document.getElementById("importFile").addEventListener("change", (e) => {
    if (e.target.files?.[0]) importConfig(e.target.files[0]);
    e.target.value = "";
  });

  document.getElementById("fullScreen").addEventListener("click", function () {
    const appUrl = chrome.runtime.getURL("/pages/app.html");

    chrome.tabs.query({ url: appUrl }, (tabs) => {
      if (tabs.length > 0) {
        const existingTab = tabs[0];
        chrome.tabs.update(existingTab.id, { active: true }, () => {
          chrome.windows.update(existingTab.windowId, { focused: true });
        });
      } else {
        chrome.tabs.create({ url: appUrl });
      }
    });
  });

  // Category toggle logic
  const checkboxes = document.querySelectorAll(".category-checkbox");

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", function () {
      const urls = categoryLists[this.id];
      const wasChecked = this.checked;

      // Turning a category OFF is a destructive action -> gate it.
      const proceed = wasChecked ? Promise.resolve(true) : requireUnlock();

      proceed.then((ok) => {
        if (!ok) {
          this.checked = !wasChecked; // revert
          return;
        }

        chrome.storage.sync.get("blocked", (data) => {
          let blocked = data.blocked || [];

          if (wasChecked) {
            urls.forEach((url) => {
              const domain = normalizePattern(url);
              if (!blocked.some((p) => normalizePattern(p) === domain)) {
                blocked.push(`*://${domain}/*`);
              }
            });
          } else {
            const domains = urls.map(normalizePattern);
            blocked = blocked.filter(
              (p) => !domains.includes(normalizePattern(p)),
            );
          }

          chrome.storage.sync.set({ blocked }, () => {
            renderBlockedList(blocked);
          });
        });
      });
    });
  });
});

document.getElementById("reportBtn").addEventListener("click", () => {
  window.open("https://forms.gle/7YXi5qjtyi4foTNr7");
});
document.getElementById("requestBtn").addEventListener("click", () => {
  window.open("https://forms.gle/gv67rcBSrtHDpn2v6");
});
