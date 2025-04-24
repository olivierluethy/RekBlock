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
    }
  
    if (!domainRegex.test(hostname)) {
      return null;
    }
  
    const baseDomain = getBaseDomain(hostzyw);
    return baseDomain;
  }
  
  function renderBlockedList(blocked, editingIndex = null) {
    const ul = document.getElementById("blockedList");
    ul.innerHTML = "";
    blocked.forEach((pattern, index) => {
      const li = document.createElement("li");
      li.classList.add("list-item");
      if (index === editingIndex) {
        const domain = pattern.replace(/^\*:\/\/|\/\*$/g, "");
        li.innerHTML = `
          <input type="text" class="edit-input" value="${domain}">
          <div class="action-buttons">
            <button class="action-btn save" data-index="${index}">Save</button>
            <button class="action-btn cancel" data-index="${index}">Cancel</button>
          </div>`;
      } else {
        li.innerHTML = `
          <span>${pattern}</span>
          <div class="action-buttons">
            <button class="action-btn edit" data-index="${index}">Edit</button>
            <button class="action-btn delete" data-index="${index}">Delete</button>
          </div>`;
      }
      ul.appendChild(li);
    });
  
    document.querySelectorAll(".action-btn").forEach((button) => {
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
          const input = document.querySelector(`li input.edit-input`);
          const newDomain = input.value.trim();
          const validatedDomain = getDomain(newDomain);
          if (!validatedDomain) {
            alert("Ungültige Domain. Bitte geben Sie eine gültige Domain mit TLD ein.");
            return;
          }
          chrome.storage.sync.get("blocked", function (data) {
            let blocked = data.blocked || [];
            const newPattern = `*://${validatedDomain}/*`;
            if (
              blocked.includes(newPattern) &&
              blocked.indexOf(newPattern) !== index
            ) {
              alert("Diese Domain ist bereits blockiert");
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
        } else {
          renderBlockedList(blocked, index);
        }
      });
    });
  
    const editInput = document.querySelector(".edit-input");
    if (editInput) {
      editInput.focus();
      editInput.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
          document
            .querySelector(`.action-btn.save[data-index="${editingIndex}"]`)
            .click();
        }
      });
      editInput.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          document
            .querySelector(`.action-btn.cancel[data-index="${editingIndex}"]`)
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
        "Ungültige Domain. Bitte geben Sie eine gültige Domain mit TLD ein (z. B. schindler.ch, example.com)."
      );
      return;
    }
  
    const pattern = `*://${domain}/*`;
  
    chrome.storage.sync.get("blocked", function (data) {
      let blocked = data.blocked || [];
      if (blocked.includes(pattern)) {
        alert("Diese Domain ist bereits blockiert");
        return;
      }
      blocked.push(pattern);
      chrome.storage.sync.set({ blocked: blocked }, function () {
        const ul = document.getElementById("blockedList");
        const li = document.createElement("li");
        li.classList.add("list-item", "new");
        li.innerHTML = `<span>${pattern}</span>
          <div class="action-buttons">
            <button class="action-btn edit" data-index="${
              blocked.length - 1
            }">Edit</button>
            <button class="action-btn delete" data-index="${
              blocked.length - 1
            }">Delete</button>
          </div>`;
        ul.appendChild(li);
        setTimeout(() => li.classList.remove("new"), 1000);
        document.getElementById("urlInput").value = "";
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