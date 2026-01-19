// In MV3 service workers are event-driven and terminated when idle

let cachedBlocked = [];

// Load once at startup
chrome.storage.sync.get("blocked", (data) => {
  cachedBlocked = data.blocked || [];
  updateDynamicRules();
});

// Listen for storage changes (popup changes → storage → here)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.blocked) {
    cachedBlocked = changes.blocked.newValue || [];
    updateDynamicRules();
  }
});

async function updateDynamicRules() {
  try {
    // 1. Remove all previous dynamic rules (safest approach)
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    const oldRuleIds = oldRules.map(r => r.id);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: oldRuleIds
    });

    // 2. Build new rules
    const newRules = cachedBlocked.map((pattern, index) => {
      // pattern = "*://example.com/*"  or  "*://*.example.com/*"
      let domain = pattern
        .replace(/^\*:\/\/|\*\/$/g, "")
        .replace(/^\*\./, ""); // remove *://  and  /*   and leading *.

      return {
        id: index + 1,               // IDs must be 1 … 30000
        priority: 1,
        action: { type: "block" },
        condition: {
          urlFilter: `||${domain}^`, // ||domain^  = domain + all subdomains
          resourceTypes: ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "other"]
          // You can remove some types if you only want to block pages
        }
      };
    });

    // 3. Add new rules (max ~ 30 000 dynamic rules, but 5 000 is soft limit)
    if (newRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: newRules
      });
    }

  } catch (err) {
    console.error("Failed to update DNR rules:", err);
  }
}