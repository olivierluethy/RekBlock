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
  if (!blocked || blocked.length === 0) {
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
      "shadow-sm",
      "animate__animated",
      "animate__fadeIn"
    );
    li.textContent = "No URLs currently defined";
    ul.appendChild(li);
    return;
  }
  blocked.forEach((pattern, index) => {
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
      "shadow-sm",
      "animate__animated",
      "animate__fadeInUp"
    );
    if (index === editingIndex) {
      // Edit mode
      const domain = pattern.replace(/^\*:\/\/|\/\*$/g, "");
      li.innerHTML = `
          <input type="text" class="form-control form-control-sm me-2 rounded-3 shadow-sm" value="${domain}">
          <div class="d-flex gap-2">
            <button class="btn btn-success btn-sm save rounded-3" data-index="${index}" style="--bs-btn-bg: #16a34a; --bs-btn-hover-bg: #15803d;">Save</button>
            <button class="btn btn-secondary btn-sm cancel rounded-3" data-index="${index}" style="--bs-btn-bg: #6b7280; --bs-btn-hover-bg: #4b5563;">Cancel</button>
          </div>`;
    } else {
      // Display mode
      li.innerHTML = `
          <span class="text-dark">${pattern}</span>
          <div class="d-flex gap-2">
            <button class="btn btn-primary btn-sm edit rounded-3" data-index="${index}" style="--bs-btn-bg: #3b82f6; --bs-btn-hover-bg: #2563eb;">Edit</button>
            <button class="btn btn-danger btn-sm delete rounded-3" data-index="${index}" style="--bs-btn-bg: #dc2626; --bs-btn-hover-bg: #b91c1c;">Delete</button>
          </div>`;
    }
    ul.appendChild(li);
  });

  document.querySelectorAll(".btn").forEach((button) => {
    button.addEventListener("click", function () {
      const index = parseInt(this.dataset.index);

      if (this.classList.contains("delete")) {
        chrome.storage.sync.get("blocked", function (data) {
          let blocked = data.blocked || [];
          blocked.splice(index, 1);
          chrome.storage.sync.set({ blocked: blocked }, function () {
            renderBlockedList(blocked);
          });
        });
      } else if (this.classList.contains("save")) {
        const input = document.querySelector(`li input.form-control`);
        const newDomain = input.value.trim();
        const validatedDomain = getDomain(newDomain);
        if (!validatedDomain) {
          alert("Invalid domain. Please enter a valid domain with TLD.");
          return;
        }

        chrome.storage.sync.get("blocked", function (data) {
          let blocked = data.blocked || [];
          const newPattern = `*://${validatedDomain}/*`;

          // Erzeuge eine Kopie der Liste ohne das aktuell bearbeitete Element
          const filtered = blocked.filter((_, i) => i !== index);

          if (filtered.includes(newPattern)) {
            alert("This domain is already blocked");
            return;
          }

          blocked[index] = newPattern;

          chrome.storage.sync.set({ blocked: blocked }, function () {
            renderBlockedList(blocked);
          });
        });
      } else if (this.classList.contains("cancel")) {
        chrome.storage.sync.get("blocked", function (data) {
          renderBlockedList(data.blocked || []);
        });
      } else if (this.classList.contains("edit")) {
        renderBlockedList(blocked, index);
      }
    });
  });

  const editInput = document.querySelector(".form-control");
  if (editInput) {
    editInput.focus();
    editInput.addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        document
          .querySelector(`.btn.save[data-index="${editingIndex}"]`)
          .click();
      }
    });
    editInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        document
          .querySelector(`.btn.cancel[data-index="${editingIndex}"]`)
          .click();
      }
    });
  }
}

function handleSubmit() {
  const input = document.getElementById("urlInput").value.trim();
  const domain = getDomain(input);

  if (!domain) {
    alert(
      "Invalid domain. Please enter a valid domain with TLD (e.g., schindler.ch, example.com)."
    );
    return;
  }

  const pattern = `*://${domain}/*`;

  chrome.storage.sync.get("blocked", function (data) {
    let blocked = data.blocked || [];
    if (blocked.includes(pattern)) {
      alert("This domain is already blocked");
      return;
    }
    blocked.push(pattern);
    chrome.storage.sync.set({ blocked: blocked }, function () {
      document.getElementById("urlInput").value = "";
      renderBlockedList(blocked); // <--- hier wird die Liste korrekt neu gerendert
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
});
