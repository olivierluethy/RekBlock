// Function to extract core domain
function getCoreDomain(domain) {
  // Trim whitespace
  domain = domain.trim().toLowerCase();
  if (!domain) return null;

  // Remove protocol, subdomains, paths, etc.
  // e.g., "www.google.ch" -> "google"
  const parts = domain.split('.');
  if (parts.length === 1) return domain; // e.g., "google"
  // Take the second-to-last part for domains like "google.com", "google.ch"
  return parts[parts.length - 2];
}

// Function to format domain pattern
function formatDomainPattern(core) {
  return `*//${core}/*`;
}

// Function to validate input (less strict)
function isValidDomain(domain) {
  // Trim whitespace
  domain = domain.trim();
  if (!domain) return false;

  // Allow simple names (e.g., "google") or full domains (e.g., "google.com")
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;
  return domainRegex.test(domain) || /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/.test(domain);
}

// Function to show status message
function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = message;
    status.classList.add('show');
    if (isError) {
      status.classList.add('error');
    } else {
      status.classList.remove('error');
    }
    setTimeout(() => {
      status.classList.remove('show');
      setTimeout(() => {
        status.textContent = '';
        status.classList.remove('error');
      }, 300);
    }, 2000);
  }
}

// Function to notify background script
function notifyBackground() {
  chrome.runtime.sendMessage({ action: 'updateBlockedDomains' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error sending message:', chrome.runtime.lastError);
    } else {
      console.log('Background notified:', response);
    }
  });
}

// Function to save domains
function saveDomains() {
  const input = document.getElementById('domains');
  const domainsInput = input.value.trim();
  if (!domainsInput) {
    showStatus('Bitte gib mindestens eine Domain ein.', true);
    return;
  }

  const domains = domainsInput.split(',').map((d) => d.trim()).filter((d) => d);
  const invalidDomains = domains.filter((d) => !isValidDomain(d));

  if (invalidDomains.length > 0) {
    showStatus(`Ungültige Domains: ${invalidDomains.join(', ')}`, true);
    return;
  }

  // Normalize domains
  const coreDomains = domains.map(getCoreDomain).filter((d) => d);
  const domainPatterns = coreDomains.map(formatDomainPattern);

  // Load existing domains and append new ones
  chrome.storage.sync.get(['blockedDomains'], (result) => {
    const existingDomains = result.blockedDomains || [];
    const newDomains = [...new Set([...existingDomains, ...domainPatterns])]; // Remove duplicates
    chrome.storage.sync.set({ blockedDomains: newDomains }, () => {
      showStatus('Domains gespeichert!');
      input.value = '';
      loadDomains();
      notifyBackground();
    });
  });
}

// Function to load and display domains
function loadDomains() {
  const list = document.getElementById('domains-list');
  if (!list) {
    console.error('Element with ID "domains-list" not found.');
    return;
  }

  chrome.storage.sync.get(['blockedDomains'], (result) => {
    const domains = result.blockedDomains || [];
    list.innerHTML = '';

    domains.forEach((pattern, index) => {
      let core;
      try {
        // Try to extract core from pattern (e.g., "*//google/*" -> "google")
        const match = pattern.match(/^\*\/\/(.*)\/\*$/);
        if (match) {
          core = match[1];
        } else {
          // Handle legacy domains (e.g., "youtube.com")
          core = getCoreDomain(pattern) || pattern;
          // Update storage to new format
          domains[index] = formatDomainPattern(core);
          chrome.storage.sync.set({ blockedDomains: domains }, notifyBackground);
        }
      } catch (e) {
        console.error(`Error processing pattern "${pattern}":`, e);
        return; // Skip invalid pattern
      }

      const li = document.createElement('li');
      li.style.animationDelay = `${index * 0.1}s`; // Stagger animations
      li.innerHTML = `
        <span>${core}</span>
        <div>
          <button class="edit" data-index="${index}">Bearbeiten</button>
          <button class="delete" data-index="${index}">Löschen</button>
        </div>
      `;
      list.appendChild(li);
    });

    // Add event listeners for edit and delete buttons
    document.querySelectorAll('.edit').forEach((button) => {
      button.addEventListener('click', handleEdit);
    });
    document.querySelectorAll('.delete').forEach((button) => {
      button.addEventListener('click', handleDelete);
    });
  });
}

// Handle edit button click
function handleEdit(event) {
  const index = event.target.dataset.index;
  chrome.storage.sync.get(['blockedDomains'], (result) => {
    const domains = result.blockedDomains || [];
    const pattern = domains[index];
    let core;
    try {
      core = pattern.match(/^\*\/\/(.*)\/\*$/)[1];
    } catch (e) {
      core = getCoreDomain(pattern) || pattern;
    }
    const newInput = prompt('Domain bearbeiten:', core);
    if (newInput && isValidDomain(newInput.trim())) {
      const newCore = getCoreDomain(newInput.trim());
      if (newCore) {
        domains[index] = formatDomainPattern(newCore);
        chrome.storage.sync.set({ blockedDomains: domains }, () => {
          showStatus('Domain aktualisiert!');
          loadDomains();
          notifyBackground();
        });
      } else {
        showStatus('Ungültige Domain eingegeben.', true);
      }
    } else if (newInput !== null) {
      showStatus('Ungültige Domain eingegeben.', true);
    }
  });
}

// Handle delete button click
function handleDelete(event) {
  const index = event.target.dataset.index;
  chrome.storage.sync.get(['blockedDomains'], (result) => {
    const domains = result.blockedDomains || [];
    domains.splice(index, 1);
    chrome.storage.sync.set({ blockedDomains: domains }, () => {
      showStatus('Domain gelöscht!');
      loadDomains();
      notifyBackground();
    });
  });
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Load domains
  loadDomains();

  // Save button click
  const saveButton = document.getElementById('save');
  if (saveButton) {
    saveButton.addEventListener('click', saveDomains);
  }

  // Enter key press in input
  const input = document.getElementById('domains');
  if (input) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveDomains();
      }
    });
  }
});