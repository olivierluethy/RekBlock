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

  return getBaseDomain(hostname);
}

function isValidUrl(url) {
  try {
    new URL(url.startsWith("http") ? url : `http://${url}`);
    return true;
  } catch {
    return false;
  }
}

function togglePages(showMain = true) {
  document.getElementById("mainPage").classList.toggle("d-none", !showMain);
  document.getElementById("routinePage").classList.toggle("d-none", showMain);
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
  blocked.forEach((entry, index) => {
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
    const domain = entry.pattern.replace(/^\*:\/\/|\/\*$/g, "");
    if (index === editingIndex) {
      li.innerHTML = `
        <div class="flex-grow-1">
          <input type="text" class="form-control form-control-sm me-2 rounded-3 shadow-sm mb-2" value="${domain}">
          <select class="form-select form-select-sm mb-2" id="editBlockType${index}">
            <option value="block"${
              entry.type === "block" ? " selected" : ""
            }>Block</option>
            <option value="redirect"${
              entry.type === "redirect" ? " selected" : ""
            }>Redirect</option>
          </select>
          <input type="text" class="form-control form-control-sm rounded-3 shadow-sm redirect-url-input" id="editRedirectUrl${index}" value="${
        entry.redirectUrl || ""
      }" placeholder="Redirect URL (optional)"${
        entry.type !== "redirect" ? " style='display: none;'" : ""
      }>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-success btn-sm save rounded-3" data-index="${index}" style="--bs-btn-bg: #16a34a; --bs-btn-hover-bg: #15803d;">Save</button>
          <button class="btn btn-secondary btn-sm cancel rounded-3" data-index="${index}" style="--bs-btn-bg: #6b7280; --bs-btn-hover-bg: #4b5563;">Cancel</button>
        </div>`;
    } else {
      li.innerHTML = `
        <span class="text-dark">${domain} (${entry.type}${
        entry.type === "redirect" ? ` to ${entry.redirectUrl}` : ""
      })</span>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm edit rounded-3" data-index="${index}" style="--bs-btn-bg: #3b82f6; --bs-btn-hover-bg: #2563eb;">Edit</button>
          <button class="btn btn-primary btn-sm routines rounded-3" data-index="${index}" style="--bs-btn-bg: #3b82f6; --bs-btn-hover-bg: #2563eb;">Routines</button>
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
        const blockType = document.getElementById(
          `editBlockType${index}`
        ).value;
        const redirectUrl = document
          .getElementById(`editRedirectUrl${index}`)
          .value.trim();
        const newDomain = input.value.trim();
        const validatedDomain = getDomain(newDomain);
        if (!validatedDomain) {
          alert("Invalid domain. Please enter a valid domain with TLD.");
          return;
        }
        if (
          blockType === "redirect" &&
          redirectUrl &&
          !isValidUrl(redirectUrl)
        ) {
          alert("Invalid redirect URL. Please enter a valid URL.");
          return;
        }

        chrome.storage.sync.get("blocked", function (data) {
          let blocked = data.blocked || [];
          const newPattern = `*://${validatedDomain}/*`;
          const filtered = blocked.filter((_, i) => i !== index);

          if (filtered.some((entry) => entry.pattern === newPattern)) {
            alert("This domain is already blocked");
            return;
          }

          blocked[index] = {
            pattern: newPattern,
            type: blockType,
            redirectUrl: blockType === "redirect" ? redirectUrl : null,
            routines: blocked[index].routines || [],
          };

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
      } else if (this.classList.contains("routines")) {
        showRoutinePage(index);
      }
    });
  });

  document.querySelectorAll(".form-select").forEach((select) => {
    select.addEventListener("change", function () {
      const index = this.id.match(/\d+/)[0];
      const redirectInput = document.getElementById(`editRedirectUrl${index}`);
      redirectInput.style.display =
        this.value === "redirect" ? "block" : "none";
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

function renderRoutineList(domainIndex, blocked) {
  const ul = document.getElementById("routineList");
  ul.innerHTML = "";
  const routines = blocked[domainIndex].routines || [];
  if (routines.length === 0) {
    const li = document.createElement("li");
    li.classList.add("list-group-item", "text-center", "text-muted");
    li.textContent = "No routines defined";
    ul.appendChild(li);
    return;
  }

  routines.forEach((routine, index) => {
    const li = document.createElement("li");
    li.classList.add(
      "list-group-item",
      "d-flex",
      "justify-content-between",
      "align-items-center"
    );
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const activeDays = routine.days.map((d) => days[d]).join(", ");
    li.innerHTML = `
      <div>
        <span>${routine.startTime} - ${routine.endTime} on ${activeDays}</span>
        <span class="ms-2">(${routine.enabled ? "Enabled" : "Disabled"})</span>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-primary btn-sm toggle-routine" data-index="${index}" data-domain-index="${domainIndex}">
          ${routine.enabled ? "Disable" : "Enable"}
        </button>
        <button class="btn btn-danger btn-sm delete-routine" data-index="${index}" data-domain-index="${domainIndex}">
          Delete
        </button>
      </div>`;
    ul.appendChild(li);
  });

  document.querySelectorAll(".toggle-routine").forEach((button) => {
    button.addEventListener("click", function () {
      const domainIndex = parseInt(this.dataset.domainIndex);
      const routineIndex = parseInt(this.dataset.index);
      chrome.storage.sync.get("blocked", function (data) {
        let blocked = data.blocked || [];
        blocked[domainIndex].routines[routineIndex].enabled =
          !blocked[domainIndex].routines[routineIndex].enabled;
        chrome.storage.sync.set({ blocked: blocked }, function () {
          renderRoutineList(domainIndex, blocked);
        });
      });
    });
  });

  document.querySelectorAll(".delete-routine").forEach((button) => {
    button.addEventListener("click", function () {
      const domainIndex = parseInt(this.dataset.domainIndex);
      const routineIndex = parseInt(this.dataset.index);
      chrome.storage.sync.get("blocked", function (data) {
        let blocked = data.blocked || [];
        blocked[domainIndex].routines.splice(routineIndex, 1);
        chrome.storage.sync.set({ blocked: blocked }, function () {
          renderRoutineList(domainIndex, blocked);
        });
      });
    });
  });
}

function showRoutinePage(domainIndex) {
  chrome.storage.sync.get("blocked", function (data) {
    const blocked = data.blocked || [];
    const domain = blocked[domainIndex].pattern.replace(/^\*:\/\/|\/\*$/g, "");
    document.getElementById("routineDomain").textContent = domain;
    togglePages(false);
    renderRoutineList(domainIndex, blocked);

    document.getElementById("addRoutineButton").onclick = () => {
      const startTime = document.getElementById("startTime").value;
      const endTime = document.getElementById("endTime").value;
      const days = Array.from(
        document.querySelectorAll(".weekday-checkboxes input:checked")
      ).map((input) => parseInt(input.value));

      if (!startTime || !endTime || days.length === 0) {
        alert("Please specify start time, end time, and at least one day.");
        return;
      }

      chrome.storage.sync.get("blocked", function (data) {
        let blocked = data.blocked || [];
        if (!blocked[domainIndex].routines) {
          blocked[domainIndex].routines = [];
        }
        blocked[domainIndex].routines.push({
          startTime,
          endTime,
          days,
          enabled: true,
        });
        chrome.storage.sync.set({ blocked: blocked }, function () {
          renderRoutineList(domainIndex, blocked);
          document.getElementById("startTime").value = "";
          document.getElementById("endTime").value = "";
          document
            .querySelectorAll(".weekday-checkboxes input")
            .forEach((input) => (input.checked = false));
        });
      });
    };
  });
}

function handleSubmit() {
  const input = document.getElementById("urlInput").value.trim();
  const blockType = document.getElementById("blockType").value;
  const redirectUrl = document.getElementById("redirectUrl").value.trim();
  const domain = getDomain(input);

  if (!domain) {
    alert(
      "Invalid domain. Please enter a valid domain with TLD (e.g., example.com)."
    );
    return;
  }
  if (blockType === "redirect" && redirectUrl && !isValidUrl(redirectUrl)) {
    alert("Invalid redirect URL. Please enter a valid URL.");
    return;
  }

  const pattern = `*://${domain}/*`;

  chrome.storage.sync.get("blocked", function (data) {
    let blocked = data.blocked || [];
    if (blocked.some((entry) => entry.pattern === pattern)) {
      alert("This domain is already blocked");
      return;
    }
    blocked.push({
      pattern,
      type: blockType,
      redirectUrl: blockType === "redirect" ? redirectUrl : null,
      routines: [],
    });
    chrome.storage.sync.set({ blocked: blocked }, function () {
      document.getElementById("urlInput").value = "";
      document.getElementById("redirectUrl").value = "";
      document.getElementById("blockType").value = "block";
      document.getElementById("redirectUrl").style.display = "none";
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

  document.getElementById("blockType").addEventListener("change", function () {
    document.getElementById("redirectUrl").style.display =
      this.value === "redirect" ? "block" : "none";
  });

  document.getElementById("backButton").addEventListener("click", () => {
    togglePages(true);
  });
});
