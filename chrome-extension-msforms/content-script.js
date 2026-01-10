// content-script.js - Runs on MS Forms pages
// This script handles the actual form filling

console.log('🔧 FidLoc MS Forms Filler loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fillForm') {
    fillMSForm(request.data)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
});

async function fillMSForm(data) {
  console.log('📝 Filling form with:', data);
  
  try {
    // Wait a moment for any dynamic loading
    await sleep(500);
    
    // Find all text inputs using the data-automation-id attribute that MS Forms uses
    let textInputs = document.querySelectorAll('input[data-automation-id="textInput"]');
    
    // Fallback to just input[type="text"] if that doesn't work
    if (textInputs.length === 0) {
      textInputs = document.querySelectorAll('input[type="text"]');
    }
    
    // Last fallback - any input that's not radio/checkbox/hidden
    if (textInputs.length === 0) {
      textInputs = document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])');
    }
    
    console.log('📝 Found ' + textInputs.length + ' text inputs');
    
    if (textInputs.length < 3) {
      // Maybe form isn't fully loaded, wait and retry
      console.log('⏳ Waiting for form to load...');
      await sleep(2000);
      textInputs = document.querySelectorAll('input[data-automation-id="textInput"]');
      console.log('📝 After wait, found ' + textInputs.length + ' text inputs');
    }
    
    if (textInputs.length === 0) {
      return { success: false, error: 'No text inputs found on page' };
    }
    
    // Based on the actual form structure:
    // Field 0: TECHNICIAN NAME
    // Field 1: CONTRACTOR FIRM NAME or GARAGE  
    // Field 2: SERIAL NUMBER
    
    // Fill technician name (first text input)
    if (textInputs.length >= 1 && data.techName) {
      await fillInput(textInputs[0], data.techName);
      console.log('✅ Filled technician name:', data.techName);
    }
    
    // Fill garage/contractor firm (second text input)
    if (textInputs.length >= 2 && data.garage) {
      await fillInput(textInputs[1], data.garage);
      console.log('✅ Filled garage:', data.garage);
    }
    
    // Fill serial number (third text input)
    if (textInputs.length >= 3 && data.serial) {
      await fillInput(textInputs[2], data.serial);
      console.log('✅ Filled serial number:', data.serial);
    }
    
    // Handle Equipment Status radio buttons (Missing/Installed)
    await sleep(300);
    if (data.status) {
      const radioClicked = await selectRadioByValue(data.status);
      if (radioClicked) {
        console.log('✅ Selected status:', data.status);
      }
    }
    
    // Small delay to let React update
    await sleep(500);
    
    return { success: true, message: 'Form filled! Review and click Submit.' };
    
  } catch (err) {
    console.error('❌ Fill error:', err);
    return { success: false, error: err.message };
  }
}

// Fill an input field properly for React forms
async function fillInput(input, value) {
  console.log('📝 Filling input with:', value);
  
  // Focus the input
  input.focus();
  input.click();
  await sleep(100);
  
  // Select all existing text and clear it
  input.select();
  
  // Use native setter to bypass React's controlled input
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  nativeInputValueSetter.call(input, value);
  
  // Dispatch events that React listens for
  input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  
  // Trigger blur to finalize
  await sleep(100);
  input.blur();
  
  console.log('📝 Input value is now:', input.value);
}

// Select a radio button by its value attribute
async function selectRadioByValue(value) {
  console.log('🔘 Looking for radio with value:', value);
  
  // Find radio by value attribute (MS Forms uses value="Missing" and value="Installed")
  const radio = document.querySelector('input[type="radio"][value="' + value + '"]');
  
  if (radio) {
    radio.click();
    console.log('✅ Clicked radio with value:', value);
    return true;
  }
  
  // Fallback: find by aria-labelledby text content
  const radios = document.querySelectorAll('input[type="radio"]');
  for (const r of radios) {
    const labelId = r.getAttribute('aria-labelledby');
    if (labelId) {
      const labels = labelId.split(' ');
      for (const lid of labels) {
        const labelEl = document.getElementById(lid);
        if (labelEl && labelEl.textContent.toLowerCase().includes(value.toLowerCase())) {
          r.click();
          console.log('✅ Clicked radio via label:', value);
          return true;
        }
      }
    }
  }
  
  console.log('⚠️ Could not find radio for:', value);
  return false;
}

// Sleep helper
function sleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

// Log when page is ready
window.addEventListener('load', function() {
  console.log('🔧 FidLoc MS Forms Filler ready on:', window.location.href);
});
