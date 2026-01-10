// ==UserScript==
// @name         FidLoc MS Forms Auto-Fill v2
// @namespace    https://fidloc.web.app/
// @version      2.0
// @description  Auto-fills Microsoft Forms for FidLoc inventory submissions - React compatible
// @author       Darren Couturier
// @match        https://forms.office.com/*
// @match        https://forms.microsoft.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION - EDIT THESE FOR YOUR FORM
    // ============================================
    const CONFIG = {
        technicianName: "Darren Couturier",
        garage: "Concord",
        defaultStatus: "Missing",
        autoSubmit: false,

        // Your form's question IDs (from the DOM)
        questionIds: {
            technicianName: "rda892478c0b741ecb670fda088fcbc7b",
            garage: "r8076010f6735476abb0af5bfb040117e",
            serialNumber: "rfa582ebfb11e40f3bf00d8e0a9efbe9c",
            equipmentStatus: "r4eb635e098d24e8a8de3ed2331979cdb"
        },

        // Target form ID (to only run on YOUR form)
        targetFormId: "XZI8ME5OQUqmnyZJVrSH1lwcfjB4TM5Dqw11fNLOPYxUMVNQSjU1QjhXV1dLSzZZUTdJOFhGVTRQSS4u"
    };

    // ============================================
    // REACT-COMPATIBLE VALUE SETTER
    // This is the KEY - MS Forms uses React and
    // simply setting .value doesn't trigger React's
    // internal state update. We need to:
    // 1. Use the native setter to bypass React
    // 2. Reset the _valueTracker
    // 3. Dispatch proper events
    // ============================================
    function setReactInputValue(input, value) {
        if (!input) return false;

        // Store last value for tracker reset
        const lastValue = input.value;

        // Get the native value setter (bypasses React's override)
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        )?.set;

        const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        )?.set;

        // Use appropriate setter based on element type
        const setter = input.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter;

        if (setter) {
            setter.call(input, value);
        } else {
            input.value = value;
        }

        // CRITICAL: Reset React's value tracker
        // React uses _valueTracker to detect if value actually changed
        const tracker = input._valueTracker;
        if (tracker) {
            tracker.setValue(lastValue);
        }

        // Dispatch events that React listens to
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Some forms also need focus/blur
        input.focus();
        setTimeout(() => input.blur(), 50);

        return true;
    }

    // ============================================
    // Find input by question ID
    // ============================================
    function findInput(questionId) {
        // MS Forms uses aria-labelledby with the question ID
        const selectors = [
            `input[aria-labelledby*="${questionId}"]`,
            `textarea[aria-labelledby*="${questionId}"]`,
            `[id*="${questionId}"] input`,
            `[id*="${questionId}"] textarea`,
            `input[data-automation-id="textInput"]`
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                const labelledBy = el.getAttribute('aria-labelledby') || '';
                if (labelledBy.includes(questionId)) {
                    return el;
                }
            }
            if (elements.length > 0 && selector.includes(questionId)) {
                return elements[0];
            }
        }

        return null;
    }

    // ============================================
    // Select radio button / choice
    // ============================================
    function selectRadio(questionId, value) {
        // Find all radio-like elements
        const radios = document.querySelectorAll('[role="radio"], [role="option"], [data-automation-id="choiceOption"]');

        for (const radio of radios) {
            const text = radio.textContent || radio.getAttribute('aria-label') || '';
            if (text.toLowerCase().includes(value.toLowerCase())) {
                radio.click();
                return true;
            }
        }

        // Try finding by question container
        const container = document.querySelector(`[id*="${questionId}"]`);
        if (container) {
            const options = container.querySelectorAll('[role="radio"], [role="option"]');
            for (const opt of options) {
                const text = opt.textContent || '';
                if (text.toLowerCase().includes(value.toLowerCase())) {
                    opt.click();
                    return true;
                }
            }
        }

        return false;
    }

    // ============================================
    // Check if this is the target form
    // ============================================
    function isTargetForm() {
        return window.location.href.includes(CONFIG.targetFormId);
    }

    // ============================================
    // Get serial from URL params
    // ============================================
    function getSerialFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('serial') || params.get('s') || null;
    }

    // ============================================
    // Create floating UI
    // ============================================
    function createUI(serial) {
        const existing = document.getElementById('fidloc-ui');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'fidloc-ui';
        container.innerHTML = `
            <style>
                #fidloc-ui {
                    position: fixed;
                    bottom: 80px;
                    right: 20px;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                }
                #fidloc-btn {
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: white;
                    border: none;
                    padding: 16px 24px;
                    border-radius: 50px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.5);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                #fidloc-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 25px rgba(99, 102, 241, 0.6);
                }
                #fidloc-btn:active {
                    transform: scale(0.95);
                }
                .fidloc-serial {
                    background: rgba(255,255,255,0.2);
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-family: monospace;
                    font-size: 13px;
                }
                #fidloc-status {
                    margin-top: 12px;
                    background: white;
                    padding: 12px 16px;
                    border-radius: 12px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                    font-size: 14px;
                    display: none;
                    max-width: 250px;
                }
                .fidloc-success { color: #10b981; }
                .fidloc-error { color: #ef4444; }
                .fidloc-info { color: #6366f1; }
            </style>
            <button id="fidloc-btn">
                ⚡ Fill Form
                ${serial ? `<span class="fidloc-serial">${serial}</span>` : ''}
            </button>
            <div id="fidloc-status"></div>
        `;

        document.body.appendChild(container);

        document.getElementById('fidloc-btn').addEventListener('click', () => {
            fillForm(serial);
        });
    }

    // ============================================
    // Show status message
    // ============================================
    function showStatus(msg, type = 'info') {
        const el = document.getElementById('fidloc-status');
        if (el) {
            el.style.display = 'block';
            el.className = `fidloc-${type}`;
            el.textContent = msg;
            if (type === 'success') {
                setTimeout(() => { el.style.display = 'none'; }, 5000);
            }
        }
    }

    // ============================================
    // MAIN FILL FUNCTION
    // ============================================
    async function fillForm(serialFromURL) {
        showStatus('⏳ Filling form...', 'info');

        let serial = serialFromURL;

        // Try clipboard if no URL serial
        if (!serial) {
            try {
                const clip = await navigator.clipboard.readText();
                if (clip && clip.trim()) {
                    if (confirm(`Use serial from clipboard?\n\n"${clip.trim()}"`)) {
                        serial = clip.trim();
                    }
                }
            } catch (e) {
                console.log('[FidLoc] Clipboard unavailable');
            }
        }

        // Prompt if still no serial
        if (!serial) {
            serial = prompt('Enter Serial Number:');
        }

        if (!serial || !serial.trim()) {
            showStatus('❌ No serial provided', 'error');
            return;
        }

        serial = serial.trim();
        console.log('[FidLoc] Filling with serial:', serial);

        let filled = 0;
        let errors = [];

        // 1. Fill Technician Name
        const nameInput = findInput(CONFIG.questionIds.technicianName);
        if (nameInput) {
            if (setReactInputValue(nameInput, CONFIG.technicianName)) {
                filled++;
                console.log('[FidLoc] ✓ Technician Name');
            }
        } else {
            errors.push('Name field not found');
        }

        await sleep(200);

        // 2. Fill Garage
        const garageInput = findInput(CONFIG.questionIds.garage);
        if (garageInput) {
            if (setReactInputValue(garageInput, CONFIG.garage)) {
                filled++;
                console.log('[FidLoc] ✓ Garage');
            }
        } else {
            errors.push('Garage field not found');
        }

        await sleep(200);

        // 3. Fill Serial Number
        const serialInput = findInput(CONFIG.questionIds.serialNumber);
        if (serialInput) {
            if (setReactInputValue(serialInput, serial)) {
                filled++;
                console.log('[FidLoc] ✓ Serial Number');
            }
        } else {
            errors.push('Serial field not found');
        }

        await sleep(200);

        // 4. Select Equipment Status
        if (selectRadio(CONFIG.questionIds.equipmentStatus, CONFIG.defaultStatus)) {
            filled++;
            console.log('[FidLoc] ✓ Equipment Status');
        } else {
            errors.push('Status radio not found');
        }

        // Report results
        if (filled >= 3) {
            showStatus(`✅ Filled ${filled}/4 fields! Serial: ${serial}`, 'success');
        } else {
            showStatus(`⚠️ Only ${filled}/4 filled. ${errors.join(', ')}`, 'error');
        }

        // Auto-submit if enabled
        if (CONFIG.autoSubmit && filled >= 3) {
            await sleep(500);
            const submitBtn = document.querySelector('button[data-automation-id="submitButton"]') ||
                              document.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.click();
                showStatus('🚀 Submitted!', 'success');
            }
        }
    }

    // ============================================
    // Utility
    // ============================================
    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // ============================================
    // Wait for form to load
    // ============================================
    function waitForForm() {
        return new Promise((resolve) => {
            let attempts = 0;
            const check = () => {
                attempts++;
                const inputs = document.querySelectorAll('input[data-automation-id="textInput"], input[aria-label]');
                if (inputs.length >= 2) {
                    resolve(true);
                } else if (attempts < 30) {
                    setTimeout(check, 500);
                } else {
                    resolve(false);
                }
            };
            check();
        });
    }

    // ============================================
    // INITIALIZE
    // ============================================
    async function init() {
        // Only run on target form
        if (!isTargetForm()) {
            console.log('[FidLoc] Not target form, skipping');
            return;
        }

        console.log('[FidLoc] 🎯 Target form detected!');

        // Wait for form inputs to load
        const loaded = await waitForForm();
        if (!loaded) {
            console.log('[FidLoc] Form inputs not found');
            return;
        }

        console.log('[FidLoc] Form loaded, creating UI');

        // Check for serial in URL
        const serial = getSerialFromURL();

        // Create UI button
        createUI(serial);

        // Auto-fill if serial in URL
        if (serial) {
            console.log('[FidLoc] Auto-filling from URL serial:', serial);
            setTimeout(() => fillForm(serial), 1500);
        }
    }

    // Run on load
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();
