// background.js - Service worker for the extension

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('FidLoc MS Forms Filler installed');
  
  // Set default values
  chrome.storage.local.get(['techName'], (result) => {
    if (!result.techName) {
      chrome.storage.local.set({
        techName: 'Darren Couturier',
        garage: 'Concord',
        status: 'Missing',
        serialQueue: [],
        currentIndex: 0
      });
    }
  });
});

// Handle any background tasks if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatus') {
    chrome.storage.local.get(['serialQueue', 'currentIndex'], (result) => {
      sendResponse({
        queueLength: (result.serialQueue || []).length,
        currentIndex: result.currentIndex || 0
      });
    });
    return true;
  }
});
