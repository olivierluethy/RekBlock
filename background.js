let blocked = [];

// Function to update the blocked list from storage
function updateBlocked() {
  chrome.storage.sync.get('blocked', function(data) {
    blocked = data.blocked || [];
  });
}

// Initial load of blocked URLs
updateBlocked();

// Listen for changes to storage
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'sync' && changes.blocked) {
    blocked = changes.blocked.newValue || [];
  }
});

// Block URLs using webRequest
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    try {
      const parsed = new URL(details.url);
      const hostname = parsed.hostname.toLowerCase();
      for (let pattern of blocked) {
        const domain = pattern.split('://')[1].toLowerCase();
        // Check if hostname is the domain or a subdomain
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return {cancel: true};
          }
        }
      }
    } catch (e) {
      // Invalid URL, skip
    }
    return {};
  },
  {urls: ["<all_urls>"]},
  ["blocking"]
);