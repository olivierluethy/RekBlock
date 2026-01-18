let blocked = [];

// Funktion zum Aktualisieren der blockierten Liste aus dem Speicher
function updateBlocked() {
  chrome.storage.sync.get("blocked", function (data) {
    blocked = data.blocked || [];
  });
}

// Initiales Laden der blockierten URLs
updateBlocked();

// Auf Änderungen im Speicher lauschen
chrome.storage.onChanged.addListener(function (changes, namespace) {
  if (namespace === "sync" && changes.blocked) {
    blocked = changes.blocked.newValue || [];
  }
});

// URLs mit webRequest blockieren
chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    try {
      const parsed = new URL(details.url);
      const hostname = parsed.hostname.toLowerCase();
      for (let pattern of blocked) {
        // Basisdomain aus dem Muster extrahieren (entferne *:// und /*)
        const domain = pattern.replace(/^\*:\/\/(.+)\/\*$/, "$1").toLowerCase();
        // Prüfen, ob Hostname die Domain oder eine Subdomain ist
        if (hostname === domain || hostname.endsWith("." + domain)) {
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return { cancel: true };
          }
        }
      }
    } catch (e) {
      // Ungültige URL, überspringen
    }
    return {};
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);
