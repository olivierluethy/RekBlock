let blockedDomains = ["youtube.com", "instagram.com", "reddit.com", "snapchat.com", "srf.ch"];

chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    console.log("Intercepted:", details.url);

    let url = new URL(details.url);
    let domain = url.hostname.toLowerCase();

    for (let blocked of blockedDomains) {
      if (domain === blocked || domain.endsWith("." + blocked)) {
        console.log("Blocked:", details.url);
        return { cancel: true };
      }
    }

    return { cancel: false };
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);