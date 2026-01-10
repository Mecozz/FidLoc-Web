// Microsoft Forms Auto-Fill Bookmarklet for FidLoc Inventory Submissions
// 
// INSTALLATION:
// 1. Create a new bookmark in Safari/Chrome
// 2. Name it "Fill Form" or "FidLoc Submit"
// 3. In the URL/Address field, paste the MINIFIED version below
//
// USAGE:
// 1. Copy a serial number from FidLoc
// 2. Open the Microsoft Form in your browser
// 3. Tap/click the bookmarklet
// 4. It will auto-fill everything and submit!

// ============================================
// CONFIGURATION - Edit these values as needed
// ============================================
const CONFIG = {
  technicianName: "Darren Couturier",
  garage: "Concord",
  defaultStatus: "Missing",
  autoSubmit: false,  // Set to true to auto-submit after filling
  
  // Question IDs from your Microsoft Form
  questionIds: {
    technicianName: "rda892478c0b741ecb670fda088fcbc7b",
    garage: "r8076010f6735476abb0af5bfb040117e", 
    serialNumber: "rfa582ebfb11e40f3bf00d8e0a9efbe9c",
    equipmentStatus: "r4eb635e098d24e8a8de3ed2331979cdb",
    notes: "r3415631ba52f42dfaf88df455fadec32"
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// React-compatible input setter (works with controlled inputs)
function setInputValue(input, value) {
  if (!input) return false;
  
  // Get the native setter
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  
  // Set the value using native setter
  nativeInputValueSetter.call(input, value);
  
  // Dispatch events to trigger React's change detection
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  // Also try focus/blur to ensure validation runs
  input.focus();
  input.blur();
  
  return true;
}

// Find input by question ID
function findInput(questionId) {
  // Try multiple selector patterns
  const selectors = [
    `input[aria-labelledby*="${questionId}"]`,
    `textarea[aria-labelledby*="${questionId}"]`,
    `[data-automation-id="questionTitle"][id*="${questionId}"]`,
    `#QuestionId_${questionId} input`,
    `[id*="${questionId}"] input`
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  
  // Fallback: search all inputs
  const allInputs = document.querySelectorAll('input[type="text"], textarea');
  for (const input of allInputs) {
    const label = input.getAttribute('aria-labelledby') || '';
    if (label.includes(questionId)) return input;
  }
  
  return null;
}

// Click radio button by value
function selectRadio(questionId, value) {
  // Find the radio button container
  const container = document.querySelector(`[id*="${questionId}"]`) || 
                    document.querySelector(`[aria-labelledby*="${questionId}"]`);
  
  if (!container) {
    // Try finding by the value text
    const radios = document.querySelectorAll('[role="radio"], input[type="radio"]');
    for (const radio of radios) {
      const label = radio.textContent || radio.getAttribute('aria-label') || '';
      if (label.toLowerCase().includes(value.toLowerCase())) {
        radio.click();
        return true;
      }
    }
    
    // Try clicking by aria-label
    const allRadios = document.querySelectorAll('[role="radio"]');
    for (const radio of allRadios) {
      const parentText = radio.closest('[class*="question"]')?.textContent || '';
      if (parentText.toLowerCase().includes(value.toLowerCase())) {
        radio.click();
        return true;
      }
    }
  }
  
  // Find radio within container
  const radios = document.querySelectorAll('[role="radio"], [role="option"]');
  for (const radio of radios) {
    const text = radio.textContent || radio.getAttribute('aria-label') || '';
    if (text.toLowerCase().includes(value.toLowerCase())) {
      radio.click();
      return true;
    }
  }
  
  return false;
}

// Get serial from clipboard or prompt
async function getSerial() {
  // Try clipboard first
  try {
    const clipboardText = await navigator.clipboard.readText();
    if (clipboardText && clipboardText.trim().length > 0) {
      const useClipboard = confirm(`Use serial from clipboard?\n\n"${clipboardText.trim()}"\n\nClick OK to use this, or Cancel to enter manually.`);
      if (useClipboard) {
        return clipboardText.trim();
      }
    }
  } catch (e) {
    // Clipboard access denied, fall through to prompt
    console.log('Clipboard access denied, using prompt');
  }
  
  // Prompt for serial
  const serial = prompt('Enter Serial Number:');
  return serial ? serial.trim() : null;
}

// Click submit button
function clickSubmit() {
  const submitSelectors = [
    'button[type="submit"]',
    '[data-automation-id="submitButton"]',
    'button[aria-label*="Submit"]',
    '.office-form-bottom-button button',
    'button.office-form-bottom-button',
    '[class*="submit"]'
  ];
  
  for (const selector of submitSelectors) {
    const btn = document.querySelector(selector);
    if (btn) {
      btn.click();
      return true;
    }
  }
  
  // Fallback: find button with "Submit" text
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent.toLowerCase().includes('submit')) {
      btn.click();
      return true;
    }
  }
  
  return false;
}

// ============================================
// MAIN FUNCTION
// ============================================
async function autoFillForm() {
  console.log('🚀 FidLoc Auto-Fill Starting...');
  
  // Get serial number
  const serial = await getSerial();
  if (!serial) {
    alert('No serial number provided. Cancelled.');
    return;
  }
  
  console.log(`📝 Serial: ${serial}`);
  
  let filled = 0;
  let errors = [];
  
  // Fill Technician Name
  const nameInput = findInput(CONFIG.questionIds.technicianName);
  if (nameInput) {
    setInputValue(nameInput, CONFIG.technicianName);
    filled++;
    console.log('✅ Technician Name filled');
  } else {
    errors.push('Technician Name field not found');
  }
  
  // Small delay between fields
  await new Promise(r => setTimeout(r, 100));
  
  // Fill Garage
  const garageInput = findInput(CONFIG.questionIds.garage);
  if (garageInput) {
    setInputValue(garageInput, CONFIG.garage);
    filled++;
    console.log('✅ Garage filled');
  } else {
    errors.push('Garage field not found');
  }
  
  await new Promise(r => setTimeout(r, 100));
  
  // Fill Serial Number
  const serialInput = findInput(CONFIG.questionIds.serialNumber);
  if (serialInput) {
    setInputValue(serialInput, serial);
    filled++;
    console.log('✅ Serial Number filled');
  } else {
    errors.push('Serial Number field not found');
  }
  
  await new Promise(r => setTimeout(r, 100));
  
  // Select Equipment Status (Missing)
  const statusSelected = selectRadio(CONFIG.questionIds.equipmentStatus, CONFIG.defaultStatus);
  if (statusSelected) {
    filled++;
    console.log('✅ Equipment Status selected');
  } else {
    errors.push('Equipment Status radio not found');
  }
  
  // Results
  console.log(`\n📊 Results: ${filled}/4 fields filled`);
  if (errors.length > 0) {
    console.warn('⚠️ Errors:', errors);
  }
  
  // Show result
  if (filled >= 3) {
    if (CONFIG.autoSubmit) {
      await new Promise(r => setTimeout(r, 300));
      const submitted = clickSubmit();
      if (submitted) {
        console.log('🎉 Form submitted!');
      } else {
        alert(`✅ Form filled!\n\nSerial: ${serial}\n\n⚠️ Auto-submit failed. Please click Submit manually.`);
      }
    } else {
      alert(`✅ Form filled!\n\nSerial: ${serial}\n\nReview and click Submit when ready.`);
    }
  } else {
    alert(`⚠️ Only ${filled}/4 fields filled.\n\nErrors:\n${errors.join('\n')}\n\nPlease check the form and fill missing fields manually.`);
  }
}

// Run it!
autoFillForm();
