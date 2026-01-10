// ==UserScript==
// @name         FidLoc MS Forms Auto-Fill
// @namespace    https://fidloc.web.app/
// @version      1.0
// @description  Auto-fills Microsoft Forms for FidLoc inventory submissions
// @author       Darren Couturier
// @match        https://forms.office.com/*
// @match        https://forms.microsoft.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        technicianName: "Darren Couturier",
        garage: "Concord",
        defaultStatus: "Missing",
        autoSubmit: false,

        // Your specific form's question IDs
        questionIds: {
            technicianName: "rda892478c0b741ecb670fda088fcbc7b",
            garage: "r8076010f6735476abb0af5bfb040117e",
            serialNumber: "rfa582ebfb11e40f3bf00d8e0a9efbe9c",
            equipmentStatus: "r4eb635e098d24e8a8de3ed2331979cdb"
        },

        // Target form ID (partial match)
        targetFormId: "XZI8ME5OQUqmnyZJVrSH1lwcfjB4TM5Dqw11fNLOPYxUMVNQSjU1QjhXV1dLSzZZUTdJOFhGVTRQSS4u"
    };

    // ============================================
    // Check if this is the right form
    // ============================================
    function isTargetForm() {
        return window.location.href.includes(CONFIG.targetFormId);
    }

    // ============================================
    // Get serial from URL parameter
    // ============================================
    function getSerialFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('serial') || params.get('s') || null;
    }

    // ============================================
    // React-compatible input setter
    // ============================================
    function setInputValue(input, value) {
        if (!input) return false;

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        )?.set;

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, value);
        } else {
            input.value = value;
        }

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        return true;
    }

    // ============================================
    // Find input by question ID
    // ============================================
    function findInput(questionId) {
        const selectors = [
            `input[aria-labelledby*="${questionId}"]`,
            `textarea[aria-labelledby*="${questionId}"]`,
            `[id*="${questionId}"] input`,
            `[id*="${questionId}"] textarea`
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) return el;
        }

        // Fallback search
        const allInputs = document.querySelectorAll('input[type="text"], textarea');
        for (const input of allInputs) {
            const label = input.getAttribute('aria-labelledby') || '';
            if (label.includes(questionId)) return input;
        }

        return null;
    }

    // ============================================
    // Select radio button
    // ============================================
    function selectRadio(questionId, value) {
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

    // ============================================
    // Create floating UI button
    // ============================================
    function createUI(serial) {
        // Remove existing UI
        const existing = document.getElementById('fidloc-autofill-ui');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'fidloc-autofill-ui';
        container.innerHTML = `
            <style>
                #fidloc-autofill-ui {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                .fidloc-btn {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 15px 25px;
                    border-radius: 12px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .fidloc-btn:active {
                    transform: scale(0.95);
                }
                .fidloc-serial {
                    background: rgba(255,255,255,0.2);
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-family: monospace;
                    font-size: 14px;
                }
                .fidloc-status {
                    margin-top: 10px;
                    background: white;
                    padding: 10px 15px;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    font-size: 14px;
                    display: none;
                }
            </style>
            <button class="fidloc-btn" id="fidloc-fill-btn">
                ⚡ Auto-Fill
                ${serial ? `<span class="fidloc-serial">${serial}</span>` : ''}
            </button>
            <div class="fidloc-status" id="fidloc-status"></div>
        `;

        document.body.appendChild(container);

        document.getElementById('fidloc-fill-btn').addEventListener('click', () => {
            fillForm(serial);
        });
    }

    // ============================================
    // Fill the form
    // ============================================
    async function fillForm(serialFromURL) {
        const statusEl = document.getElementById('fidloc-status');
        const showStatus = (msg, isError = false) => {
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.color = isError ? '#e74c3c' : '#27ae60';
                statusEl.textContent = msg;
            }
        };

        // Get serial - from URL, clipboard, or prompt
        let serial = serialFromURL;

        if (!serial) {
            try {
                const clip = await navigator.clipboard.readText();
                if (clip && clip.trim()) {
                    if (confirm(`Use from clipboard?\n\n"${clip.trim()}"`)) {
                        serial = clip.trim();
                    }
                }
            } catch (e) {
                console.log('Clipboard unavailable');
            }
        }

        if (!serial) {
            serial = prompt('Enter Serial Number:');
        }

        if (!serial || !serial.trim()) {
            showStatus('❌ No serial provided', true);
            return;
        }

        serial = serial.trim();
        showStatus('⏳ Filling form...');

        let filled = 0;

        // Fill Technician Name
        const nameInput = findInput(CONFIG.questionIds.technicianName);
        if (nameInput && setInputValue(nameInput, CONFIG.technicianName)) {
            filled++;
        }

        await new Promise(r => setTimeout(r, 150));

        // Fill Garage
        const garageInput = findInput(CONFIG.questionIds.garage);
        if (garageInput && setInputValue(garageInput, CONFIG.garage)) {
            filled++;
        }

        await new Promise(r => setTimeout(r, 150));

        // Fill Serial Number
        const serialInput = findInput(CONFIG.questionIds.serialNumber);
        if (serialInput && setInputValue(serialInput, serial)) {
            filled++;
        }

        await new Promise(r => setTimeout(r, 150));

        // Select Status
        if (selectRadio(CONFIG.questionIds.equipmentStatus, CONFIG.defaultStatus)) {
            filled++;
        }

        if (filled >= 3) {
            showStatus(`✅ Filled! Serial: ${serial}`);
        } else {
            showStatus(`⚠️ Only ${filled}/4 fields filled`, true);
        }
    }

    // ============================================
    // Wait for form to load
    // ============================================
    function waitForForm() {
        return new Promise((resolve) => {
            const check = () => {
                const inputs = document.querySelectorAll('input[type="text"], textarea');
                if (inputs.length >= 2) {
                    resolve();
                } else {
                    setTimeout(check, 500);
                }
            };
            check();
        });
    }

    // ============================================
    // MAIN
    // ============================================
    async function main() {
        // Only run on the target form
        if (!isTargetForm()) {
            console.log('[FidLoc] Not the target form, skipping');
            return;
        }

        console.log('[FidLoc] 🎯 Target form detected!');

        // Wait for form to load
        await waitForForm();
        console.log('[FidLoc] Form loaded');

        // Check for serial in URL
        const serialFromURL = getSerialFromURL();
        if (serialFromURL) {
            console.log('[FidLoc] Serial from URL:', serialFromURL);
        }

        // Create UI
        createUI(serialFromURL);

        // If serial in URL, auto-fill after short delay
        if (serialFromURL) {
            setTimeout(() => {
                fillForm(serialFromURL);
            }, 1000);
        }
    }

    // Run when page is ready
    if (document.readyState === 'complete') {
        main();
    } else {
        window.addEventListener('load', main);
    }

})();
