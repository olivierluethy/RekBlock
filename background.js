// ===============================
// Background Service Worker (MV3)
// ===============================

// ---------- Cached state ----------
let cachedBlocked = [];

// ---------- Category definitions ----------
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

// ---------- Helpers ----------
function normalizePattern(pattern) {
  return pattern
    .replace(/^\*:\/\/|\/?\*$/g, "")
    .replace(/\/$/, "")
    .replace(/^www\./, "")
    .toLowerCase();
}

function getDomainFromUrl(url) {
  try {
    return normalizePattern(new URL(url).hostname);
  } catch {
    return null;
  }
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

// ---------- Context menu ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "block-current-site",
    title: "Block this website",
    contexts: ["page"],
  });
});

// ---------- Context menu click ----------
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "block-current-site") return;
  if (!tab?.url) return;

  const domain = getDomainFromUrl(tab.url);
  if (!domain) return;

  chrome.storage.sync.get("blocked", (data) => {
    const blocked = data.blocked || [];

    // 1️⃣ Already blocked?
    const alreadyBlocked = blocked.some(
      (p) => normalizePattern(p) === domain
    );

    if (alreadyBlocked) {
      notify(
        "Already blocked",
        `${domain} is already blocked.`
      );
      return;
    }

    // 2️⃣ Belongs to category?
    const category = findCategoryByDomain(domain);
    if (category) {
      notify(
        "Blocked via category",
        `${domain} belongs to "${category}". Enable that category to block it.`
      );
      return;
    }

    // 3️⃣ Block manually
    blocked.push(`*://${domain}/*`);

    chrome.storage.sync.set({ blocked }, () => {
      notify(
        "Website blocked",
        `${domain} has been blocked.`
      );
    });
  });
});

// ---------- Notifications ----------
function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png",
    title,
    message,
  });
}

// ---------- Load blocked list at startup ----------
chrome.storage.sync.get("blocked", (data) => {
  cachedBlocked = data.blocked || [];
  updateDynamicRules();
});

// ---------- Listen for storage updates ----------
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.blocked) {
    cachedBlocked = changes.blocked.newValue || [];
    updateDynamicRules();
  }
});

// ---------- Update Declarative Net Request rules ----------
async function updateDynamicRules() {
  try {
    // Remove existing rules
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    const oldRuleIds = oldRules.map((r) => r.id);

    if (oldRuleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: oldRuleIds,
      });
    }

    // Create new rules
    const newRules = cachedBlocked.map((pattern, index) => {
      const domain = normalizePattern(pattern);

      return {
        id: index + 1,
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: `||${domain}^`,
          resourceTypes: [
            "main_frame",
            "sub_frame",
            "stylesheet",
            "script",
            "image",
            "font",
            "object",
            "xmlhttprequest",
            "other",
          ],
        },
      };
    });

    if (newRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: newRules,
      });
    }
  } catch (err) {
    console.error("Failed to update DNR rules:", err);
  }
}
