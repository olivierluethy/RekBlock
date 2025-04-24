// Liste bekannter zusammengesetzter TLDs
const compoundTlds = [
  "co.uk",
  "com.au",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "net.au",
  "edu.au",
];

// Funktion zum Extrahieren der Basisdomain
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

// Funktion zum Verarbeiten der Eingabe und Extrahieren der Basisdomain
function getDomain(input) {
  const domainRegex = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
  let hostname = input.trim();

  try {
    let url = new URL(input.startsWith("http") ? input : `http://${input}`);
    hostname = url.hostname;
  } catch (e) {
    // Wenn die URL-Parsing fehlschlägt, Eingabe unverändert verwenden
  }

  if (!domainRegex.test(hostname)) {
    return null;
  }

  const baseDomain = getBaseDomain(hostname);
  return baseDomain;
}

// Funktion zum Rendern der blockierten Liste
function renderBlockedList(blocked) {
  const ul = document.getElementById("blockedList");
  ul.innerHTML = "";
  blocked.forEach((pattern, index) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${pattern}</span>
                    <div>
                      <button class="action-btn" data-index="${index}">Edit</button>
                      <button class="action-btn delete" data-index="${index}">Delete</button>
                    </div>`;
    ul.appendChild(li);
  });

  // Event-Listener für Bearbeiten- und Löschen-Buttons hinzufügen
  document.querySelectorAll(".action-btn").forEach((button) => {
    button.addEventListener("click", function () {
      const index = parseInt(this.dataset.index);
      if (this.classList.contains("delete")) {
        // URL löschen
        chrome.storage.sync.get("blocked", function (data) {
          let blocked = data.blocked || [];
          blocked.splice(index, 1);
          chrome.storage.sync.set({ blocked: blocked }, function () {
            renderBlockedList(blocked);
          });
        });
      } else {
        // URL bearbeiten
        chrome.storage.sync.get("blocked", function (data) {
          let blocked = data.blocked || [];
          const pattern = blocked[index];
          // Basisdomain aus dem Muster extrahieren (entferne *:// und /*)
          const domain = pattern.replace(/^\*:\/\/(.+)\/\*\$/, "$1");
          document.getElementById("urlInput").value = domain;
          document.getElementById("urlInput").dataset.editIndex = index;
          document.getElementById("addButton").textContent = "Save";
        });
      }
    });
  });
}

// Funktion zum Verarbeiten der Eingabe (wird für Button-Klick und Enter-Taste verwendet)
function handleSubmit() {
  const input = document.getElementById("urlInput").value.trim();
  const editIndex = document.getElementById("urlInput").dataset.editIndex;
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

    if (editIndex !== undefined && editIndex !== "") {
      // Bestehende URL bearbeiten
      const index = parseInt(editIndex);
      if (blocked.includes(pattern) && blocked.indexOf(pattern) !== index) {
        alert("Diese Domain ist bereits blockiert");
        return;
      }
      blocked[index] = pattern;
    } else {
      // Neue URL hinzufügen
      if (blocked.includes(pattern)) {
        alert("Diese Domain ist bereits blockiert");
        return;
      }
      blocked.push(pattern);
    }

    chrome.storage.sync.set({ blocked: blocked }, function () {
      const ul = document.getElementById("blockedList");
      if (editIndex === undefined || editIndex === "") {
        // Neue URL mit Animation hinzufügen
        const li = document.createElement("li");
        li.innerHTML = `<span>${pattern}</span>
                        <div>
                          <button class="action-btn" data-index="${
                            blocked.length - 1
                          }">Edit</button>
                          <button class="action-btn delete" data-index="${
                            blocked.length - 1
                          }">Delete</button>
                        </div>`;
        li.classList.add("new");
        ul.appendChild(li);
        setTimeout(() => li.classList.remove("new"), 1000);
        // alert(`Erfolgreich ${domain} und deren Subdomains blockiert.`);
      } else {
        // Liste für Bearbeitung neu rendern
        renderBlockedList(blocked);
        // alert(`Erfolgreich zu ${domain} und deren Subdomains aktualisiert.`);
      }
      // Eingabe und Button zurücksetzen
      document.getElementById("urlInput").value = "";
      document.getElementById("urlInput").dataset.editIndex = "";
      document.getElementById("addButton").textContent = "Add";
    });
  });
}

// Event-Listener beim Laden des Dokuments
document.addEventListener("DOMContentLoaded", function () {
  // Blockierte URLs aus dem Speicher laden und anzeigen
  chrome.storage.sync.get("blocked", function (data) {
    renderBlockedList(data.blocked || []);
  });

  // Hinzufügen oder Bearbeiten einer blockierten URL per Button-Klick
  document.getElementById("addButton").addEventListener("click", handleSubmit);

  // Hinzufügen oder Bearbeiten einer blockierten URL per Enter-Taste
  document
    .getElementById("urlInput")
    .addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        handleSubmit();
      }
    });
});
