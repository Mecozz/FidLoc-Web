// popup.js - FidLoc MS Forms Filler Extension
console.log('Popup JS loaded!');

document.addEventListener('DOMContentLoaded', async function() {
  console.log('DOM Content Loaded');
  
  try {
    // Load saved settings
    const stored = await chrome.storage.local.get([
      'techName', 'garage', 'status', 'serialQueue', 'currentIndex'
    ]);
    
    console.log('Loaded stored data:', stored);
    
    if (stored.techName) document.getElementById('techName').value = stored.techName;
    if (stored.garage) document.getElementById('garage').value = stored.garage;
    if (stored.status) document.getElementById('status').value = stored.status;
    
    // Update queue display if we have items
    if (stored.serialQueue && stored.serialQueue.length > 0) {
      updateQueueDisplay(stored.serialQueue, stored.currentIndex || 0);
    }
    
    // Save defaults button
    document.getElementById('saveDefaults').addEventListener('click', async function() {
      console.log('Save defaults clicked');
      await chrome.storage.local.set({
        techName: document.getElementById('techName').value,
        garage: document.getElementById('garage').value,
        status: document.getElementById('status').value
      });
      showStatus('Defaults saved!', 'success');
    });
    
    // Load queue button
    document.getElementById('loadQueue').addEventListener('click', async function() {
      console.log('Load queue clicked');
      const serialsText = document.getElementById('serials').value.trim();
      if (!serialsText) {
        showStatus('Please paste some serial numbers first', 'error');
        return;
      }
      
      // Parse serials - one per line, remove empty lines and whitespace
      const serials = serialsText
        .split('\n')
        .map(function(s) { return s.trim(); })
        .filter(function(s) { return s.length > 0; });
      
      if (serials.length === 0) {
        showStatus('No valid serial numbers found', 'error');
        return;
      }
      
      await chrome.storage.local.set({
        serialQueue: serials,
        currentIndex: 0
      });
      
      updateQueueDisplay(serials, 0);
      showStatus('Loaded ' + serials.length + ' serial numbers!', 'success');
    });
    
    // Fill next button
    document.getElementById('fillNext').addEventListener('click', async function() {
      console.log('Fill next clicked');
      const stored = await chrome.storage.local.get([
        'techName', 'garage', 'status', 'serialQueue', 'currentIndex'
      ]);
      
      const queue = stored.serialQueue || [];
      const index = stored.currentIndex || 0;
      
      if (index >= queue.length) {
        showStatus('Queue complete! All serials submitted.', 'success');
        return;
      }
      
      const serial = queue[index];
      const data = {
        techName: stored.techName || '',
        garage: stored.garage || 'Concord',
        status: stored.status || 'Missing',
        serial: serial
      };
      
      // Send message to content script
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        
        if (!tab.url.includes('forms.office.com')) {
          showStatus('Please open the MS Forms page first!', 'error');
          return;
        }
        
        chrome.tabs.sendMessage(tab.id, {
          action: 'fillForm',
          data: data
        }, function(response) {
          if (chrome.runtime.lastError) {
            showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
            return;
          }
          
          if (response && response.success) {
            // Move to next item
            const newIndex = index + 1;
            chrome.storage.local.set({ currentIndex: newIndex });
            updateQueueDisplay(queue, newIndex);
            
            if (newIndex >= queue.length) {
              showStatus('All done! Queue complete!', 'success');
            } else {
              showStatus('Filled! ' + (queue.length - newIndex) + ' remaining', 'info');
            }
          } else {
            showStatus('Fill failed: ' + (response ? response.error : 'Unknown error'), 'error');
          }
        });
      } catch (err) {
        showStatus('Error: ' + err.message, 'error');
      }
    });
    
    // Skip button
    document.getElementById('skipOne').addEventListener('click', async function() {
      console.log('Skip clicked');
      const stored = await chrome.storage.local.get(['serialQueue', 'currentIndex']);
      const queue = stored.serialQueue || [];
      const newIndex = (stored.currentIndex || 0) + 1;
      
      await chrome.storage.local.set({ currentIndex: newIndex });
      updateQueueDisplay(queue, newIndex);
      showStatus('Skipped', 'info');
    });
    
    // Clear queue button
    document.getElementById('clearQueue').addEventListener('click', async function() {
      console.log('Clear queue clicked');
      await chrome.storage.local.set({ serialQueue: [], currentIndex: 0 });
      document.getElementById('queueSection').style.display = 'none';
      document.getElementById('serials').value = '';
      showStatus('Queue cleared', 'info');
    });
    
    console.log('All event listeners attached!');
    
  } catch (err) {
    console.error('Error initializing popup:', err);
  }
});

function updateQueueDisplay(queue, index) {
  var section = document.getElementById('queueSection');
  var currentNum = document.getElementById('currentNum');
  var totalNum = document.getElementById('totalNum');
  var nextSerial = document.getElementById('nextSerial');
  
  if (queue.length > 0) {
    section.style.display = 'block';
    currentNum.textContent = Math.min(index + 1, queue.length);
    totalNum.textContent = queue.length;
    
    if (index < queue.length) {
      nextSerial.textContent = queue[index];
    } else {
      nextSerial.textContent = 'All done!';
    }
  } else {
    section.style.display = 'none';
  }
}

function showStatus(message, type) {
  var statusEl = document.getElementById('statusMsg');
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
  
  // Auto-hide after 5 seconds
  setTimeout(function() {
    statusEl.className = 'status';
  }, 5000);
}
