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

function renderBlockedList(blocked, editingIndex = null) {
  const ul = document.getElementById("blockedList");
  ul.innerHTML = "";

  // 🔑 Only show manually added domains
  const visibleBlocked = blocked.filter((pattern) => {
    const domain = normalizePattern(pattern);
    return !isDomainInAnyCategory(domain);
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
    li.textContent = "No URLs currently defined";
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
      li.innerHTML = `
        <span>${pattern}</span>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm edit" data-index="${realIndex}">Edit</button>
          <button class="btn btn-danger btn-sm delete" data-index="${realIndex}">Delete</button>
        </div>
      `;
    }

    ul.appendChild(li);
  });

  // 🔘 Button click handlers
  document.querySelectorAll(".btn").forEach((button) => {
    button.addEventListener("click", function () {
      const index = parseInt(this.dataset.index, 10);

      if (this.classList.contains("edit")) {
        renderBlockedList(blocked, index);
        return;
      }

      if (this.classList.contains("cancel")) {
        renderBlockedList(blocked);
        return;
      }

      chrome.storage.sync.get("blocked", (data) => {
        let blocked = data.blocked || [];

        if (this.classList.contains("delete")) {
          blocked.splice(index, 1);
        }

        if (this.classList.contains("save")) {
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
        }

        chrome.storage.sync.set({ blocked }, () => {
          renderBlockedList(blocked);
        });
      });
    });
  });

  // 🔑 Enable Enter / Escape while editing (✅ CORRECT PLACE)
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

  chrome.storage.sync.get("blocked", (data) => {
    const blocked = data.blocked || [];

    const exists = blocked.some((p) => normalizePattern(p) === domain);

    if (exists) {
      alert("This domain is already blocked.");
      return;
    }

    blocked.push(`*://${domain}/*`);
    chrome.storage.sync.set({ blocked }, () => {
      document.getElementById("urlInput").value = "";
      renderBlockedList(blocked);
    });
  });
}

document.addEventListener("DOMContentLoaded", function () {
  chrome.storage.sync.get("blocked", function (data) {
    renderBlockedList(data.blocked || []);
  });

  document.getElementById("addButton").addEventListener("click", handleSubmit);

  document
    .getElementById("urlInput")
    .addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        handleSubmit();
      }
    });

  document.getElementById("fullScreen").addEventListener("click", function () {
    const appUrl = chrome.runtime.getURL("/pages/app.html");

    chrome.tabs.query({ url: appUrl }, (tabs) => {
      if (tabs.length > 0) {
        // Ein Tab mit der URL existiert bereits
        const existingTab = tabs[0]; // Nimm den ersten passenden Tab
        chrome.tabs.update(existingTab.id, { active: true }, () => {
          chrome.windows.update(existingTab.windowId, { focused: true });
        });
      } else {
        // Kein Tab mit der URL existiert, erstelle einen neuen
        chrome.tabs.create({ url: appUrl });
      }
    });
  });

  // Logic for toggling Categories
  const checkboxes = document.querySelectorAll(".category-checkbox");

  checkboxes.forEach((checkbox) => {
    // On popup load, check if the category is already active in the blocked list
    chrome.storage.sync.get("blocked", function (data) {
      const blocked = data.blocked || [];
      const categoryUrls = categoryLists[checkbox.id];
      // If the first URL of the category is in the list, show the toggle as ON
      const categoryDomains = categoryUrls.map(normalizePattern);

      const blockedDomains = blocked.map(normalizePattern);

      checkbox.checked = categoryDomains.every((domain) =>
        blockedDomains.includes(domain),
      );
    });

    // Handle the Toggle Click
    checkbox.addEventListener("change", function () {
      const urls = categoryLists[this.id];

      chrome.storage.sync.get("blocked", (data) => {
        let blocked = data.blocked || [];

        if (this.checked) {
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
document.getElementById("reportBtn").addEventListener("click", () => {
  window.open("https://forms.gle/7YXi5qjtyi4foTNr7");
});
document.getElementById("requestBtn").addEventListener("click", () => {
  window.open("https://forms.gle/gv67rcBSrtHDpn2v6");
});
