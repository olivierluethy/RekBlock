function getDomain(input) {
    // Regex to validate domain with TLD (e.g., youtube.com, 20min.ch)
    const domainRegex = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
    let domain = input.trim();
  
    // Remove protocol and path if present
    try {
      let url = new URL(input.startsWith('http') ? input : `http://${input}`);
      domain = url.hostname;
    } catch (e) {
      // If URL parsing fails, use input as is for regex check
    }
  
    // Check if the domain matches the regex
    if (domainRegex.test(domain)) {
      return domain;
    }
    return null;
  }
  
  function renderBlockedList(blocked) {
    const ul = document.getElementById('blockedList');
    ul.innerHTML = '';
    blocked.forEach((pattern, index) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${pattern}</span>
                      <div>
                        <button class="action-btn" data-index="${index}">Edit</button>
                        <button class="action-btn delete" data-index="${index}">Delete</button>
                      </div>`;
      ul.appendChild(li);
    });
  
    // Add event listeners for edit and delete buttons
    document.querySelectorAll('.action-btn').forEach(button => {
      button.addEventListener('click', function() {
        const index = parseInt(this.dataset.index);
        if (this.classList.contains('delete')) {
          // Delete URL
          chrome.storage.sync.get('blocked', function(data) {
            let blocked = data.blocked || [];
            blocked.splice(index, 1);
            chrome.storage.sync.set({blocked: blocked}, function() {
              renderBlockedList(blocked);
            });
          });
        } else {
          // Edit URL
          chrome.storage.sync.get('blocked', function(data) {
            let blocked = data.blocked || [];
            const pattern = blocked[index];
            // Extract domain from pattern (remove *://)
            const domain = pattern.replace(/^\*:\/\/(.+)$/, '$1');
            document.getElementById('urlInput').value = domain;
            document.getElementById('urlInput').dataset.editIndex = index;
            document.getElementById('addButton').textContent = 'Save';
          });
        }
      });
    });
  }
  
  document.addEventListener('DOMContentLoaded', function() {
    // Load blocked URLs from storage and display them
    chrome.storage.sync.get('blocked', function(data) {
      renderBlockedList(data.blocked || []);
    });
  
    // Handle adding or editing a blocked URL
    document.getElementById('addButton').addEventListener('click', function() {
      const input = document.getElementById('urlInput').value.trim();
      const editIndex = document.getElementById('urlInput').dataset.editIndex;
      const domain = getDomain(input);
  
      if (!domain) {
        alert('Invalid domain. Please enter a valid domain with a TLD (e.g., reddit.com, 20min.ch).');
        return;
      }
  
      const pattern = `*://${domain}`;
  
      chrome.storage.sync.get('blocked', function(data) {
        let blocked = data.blocked || [];
  
        if (editIndex !== undefined && editIndex !== '') {
          // Editing an existing URL
          const index = parseInt(editIndex);
          if (blocked.includes(pattern) && blocked.indexOf(pattern) !== index) {
            alert('This domain is already blocked');
            return;
          }
          blocked[index] = pattern;
        } else {
          // Adding a new URL
          if (blocked.includes(pattern)) {
            alert('This domain is already blocked');
            return;
          }
          blocked.push(pattern);
        }
  
        chrome.storage.sync.set({blocked: blocked}, function() {
          const ul = document.getElementById('blockedList');
          if (editIndex === undefined || editIndex === '') {
            // Add new URL with animation
            const li = document.createElement('li');
            li.innerHTML = `<span>${pattern}</span>
                            <div>
                              <button class="action-btn" data-index="${blocked.length - 1}">Edit</button>
                              <button class="action-btn delete" data-index="${blocked.length - 1}">Delete</button>
                            </div>`;
            li.classList.add('new');
            ul.appendChild(li);
            setTimeout(() => li.classList.remove('new'), 1000);
            alert(`Successfully blocked ${domain} and its subdomains.`);
          } else {
            // Re-render list for edit
            renderBlockedList(blocked);
            alert(`Successfully updated to ${domain} and its subdomains.`);
          }
          // Reset input and button
          document.getElementById('urlInput').value = '';
          document.getElementById('urlInput').dataset.editIndex = '';
          document.getElementById('addButton').textContent = 'Add';
        });
      });
    });
  });