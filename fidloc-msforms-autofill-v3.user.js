// ==UserScript==
// @name         FidLoc MS Forms Auto-Fill v3 (Type Simulation)
// @namespace    https://fidloc.web.app/
// @version      3.0
// @description  Auto-fills Microsoft Forms by simulating real typing
// @author       Darren Couturier
// @match        https://forms.office.com/*
// @match        https://forms.microsoft.com/*
// @grant        none
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
        typingDelay: 20, // ms between keystrokes

        questionIds: {
            technicianName: "rda892478c0b741ecb670fda088fcbc7b",
            garage: "r8076010f6735476abb0af5bfb040117e",
            serialNumber: "rfa582ebfb11e40f3bf00d8e0a9efbe9c",
            equipmentStatus: "r4eb635e098d24e8a8de3ed2331979cdb"
        },

        targetFormId: "XZI8ME5OQUqmnyZJVrSH1lwcfjB4TM5Dqw11fNLOPYxUMVNQSjU1QjhXV1dLSzZZUTdJOFhGVTRQSS4u"
    };

    // ============================================
    // SIMULATE TYPING - Character by character
    // This is what Puppeteer does and it WORKS!
    // ============================================
    async function simulateTyping(element, text) {
        if (!element) return false;

        // Focus the element first
        element.focus();
        element.click();
        await sleep(50);

        // Clear existing value
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(50);

        // Type each character with events
        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            // KeyDown event
            element.dispatchEvent(new KeyboardEvent('keydown', {
                key: char,
                code: `Key${char.toUpperCase()}`,
                charCode: char.charCodeAt(0),
                keyCode: char.charCodeAt(0),
                which: char.charCodeAt(0),
                bubbles: true,
                composed: true
            }));

            // KeyPress event
            element.dispatchEvent(new KeyboardEvent('keypress', {
                key: char,
                code: `Key${char.toUpperCase()}`,
                charCode: char.charCodeAt(0),
                keyCode: char.charCodeAt(0),
                which: char.charCodeAt(0),
                bubbles: true,
                composed: true
            }));

            // Actually add the character
            element.value += char;

            // Input event (this is what React listens to)
            element.dispatchEvent(new InputEvent('input', {
                data: char,
                inputType: 'insertText',
                bubbles: true,
                composed: true
            }));

            // KeyUp event
            element.dispatchEvent(new KeyboardEvent('keyup', {
                key: char,
                code: `Key${char.toUpperCase()}`,
                charCode: char.charCodeAt(0),
                keyCode: char.charCodeAt(0),
                which: char.charCodeAt(0),
                bubbles: true,
                composed: true
            }));

            await sleep(CONFIG.typingDelay);
        }

        // Final change event
        element.dispatchEvent(new Event('change', { bubbles: true }));

        // Blur to trigger validation
        element.blur();

        return true;
    }

    // ============================================
    // Alternative: Native setter + _valueTracker reset
    // ============================================
    function setValueWithTracker(element, value) {
        if (!element) return false;

        const lastValue = element.value;

        // Use native setter
        const nativeSetter = Object.getOwnPropertyDescriptor(
            element.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype,
            'value'
        )?.set;

        if (nativeSetter) {
            nativeSetter.call(element, value);
        } else {
            element.value = value;
        }

        // Reset React's tracker
        if (element._valueTracker) {
            element._valueTracker.setValue(lastValue);
        }

        // Fire events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        return true;
    }

    // ============================================
    // Find input element
    // ============================================
    function findInput(questionId) {
        // MS Forms uses aria-labelledby with question ID
        const selectors = [
            `input[aria-labelledby*="${questionId}"]`,
            `textarea[aria-labelledby*="${questionId}"]`
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el;
        }

        // Fallback: search all text inputs
        const inputs = document.querySelectorAll('input[data-automation-id="textInput"], textarea');
        for (const inp of inputs) {
            const label = inp.getAttribute('aria-labelledby') || '';
            if (label.includes(questionId)) return inp;
        }

        return null;
    }

    // ============================================
    // Select radio option
    // ============================================
    function selectRadio(value) {
        const options = document.querySelectorAll('[role="radio"], [role="option"], [data-automation-id="choiceItem"]');
        for (const opt of options) {
            const text = opt.textContent || opt.getAttribute('aria-label') || '';
            if (text.toLowerCase().includes(value.toLowerCase())) {
                opt.click();
                return true;
            }
        }
        return false;
    }

    // ============================================
    // Utility functions
    // ============================================
    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function isTargetForm() {
        return window.location.href.includes(CONFIG.targetFormId);
    }

    function getSerialFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('serial') || params.get('s');
    }

    // ============================================
    // UI Creation
    // ============================================
    function createUI(serial) {
        const existing = document.getElementById('fidloc-ui');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.id = 'fidloc-ui';
        div.innerHTML = `
            <style>
                #fidloc-ui {
                    position: fixed;
                    bottom: 80px;
                    right: 15px;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                }
                #fidloc-btn {
                    background: #7c3aed;
                    color: white;
                    border: none;
                    padding: 14px 20px;
                    border-radius: 25px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(124, 58, 237, 0.4);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                #fidloc-btn:active { transform: scale(0.95); }
                #fidloc-serial {
                    background: rgba(255,255,255,0.2);
                    padding: 3px 8px;
                    border-radius: 12px;
                    font-family: monospace;
                    font-size: 12px;
                }
                #fidloc-status {
                    margin-top: 10px;
                    background: white;
                    padding: 10px 14px;
                    border-radius: 10px;
                    box-shadow: 0 3px 12px rgba(0,0,0,0.15);
                    font-size: 13px;
                    display: none;
                    color: #333;
                }
            </style>
            <button id="fidloc-btn">
                ⚡ Auto-Fill
                ${serial ? `<span id="fidloc-serial">${serial}</span>` : ''}
            </button>
            <div id="fidloc-status"></div>
        `;
        document.body.appendChild(div);

        document.getElementById('fidloc-btn').onclick = () => fillForm(serial);
    }

    function showStatus(msg, isError = false) {
        const el = document.getElementById('fidloc-status');
        if (el) {
            el.style.display = 'block';
            el.style.color = isError ? '#dc2626' : '#059669';
            el.textContent = msg;
        }
    }

    // ============================================
    // MAIN FILL FUNCTION
    // ============================================
    async function fillForm(serialFromURL) {
        showStatus('⏳ Filling...');

        let serial = serialFromURL;

        // Try clipboard
        if (!serial) {
            try {
                const clip = await navigator.clipboard.readText();
                if (clip?.trim() && confirm(`Use clipboard serial?\n\n"${clip.trim()}"`)) {
                    serial = clip.trim();
                }
            } catch (e) {}
        }

        // Prompt
        if (!serial) {
            serial = prompt('Enter Serial Number:');
        }

        if (!serial?.trim()) {
            showStatus('❌ No serial', true);
            return;
        }

        serial = serial.trim().toUpperCase();
        console.log('[FidLoc] Filling with:', serial);

        let filled = 0;

        // 1. Technician Name
        const nameInput = findInput(CONFIG.questionIds.technicianName);
        if (nameInput) {
            // Try typing simulation first
            await simulateTyping(nameInput, CONFIG.technicianName);
            filled++;
            console.log('[FidLoc] ✓ Name');
        }
        await sleep(300);

        // 2. Garage
        const garageInput = findInput(CONFIG.questionIds.garage);
        if (garageInput) {
            await simulateTyping(garageInput, CONFIG.garage);
            filled++;
            console.log('[FidLoc] ✓ Garage');
        }
        await sleep(300);

        // 3. Serial Number
        const serialInput = findInput(CONFIG.questionIds.serialNumber);
        if (serialInput) {
            await simulateTyping(serialInput, serial);
            filled++;
            console.log('[FidLoc] ✓ Serial');
        }
        await sleep(300);

        // 4. Status radio
        if (selectRadio(CONFIG.defaultStatus)) {
            filled++;
            console.log('[FidLoc] ✓ Status');
        }

        // Result
        if (filled >= 3) {
            showStatus(`✅ Done! Serial: ${serial}`);
            if (CONFIG.autoSubmit) {
                await sleep(500);
                const btn = document.querySelector('button[data-automation-id="submitButton"]');
                if (btn) btn.click();
            }
        } else {
            showStatus(`⚠️ Only ${filled}/4 filled`, true);
        }
    }

    // ============================================
    // Wait for form to load
    // ============================================
    async function waitForForm() {
        for (let i = 0; i < 30; i++) {
            const inputs = document.querySelectorAll('input[data-automation-id="textInput"]');
            if (inputs.length >= 2) return true;
            await sleep(500);
        }
        return false;
    }

    // ============================================
    // INIT
    // ============================================
    async function init() {
        if (!isTargetForm()) {
            console.log('[FidLoc] Not target form');
            return;
        }

        console.log('[FidLoc] 🎯 Form detected');

        if (!await waitForForm()) {
            console.log('[FidLoc] Form inputs not found');
            return;
        }

        const serial = getSerialFromURL();
        createUI(serial);

        // Auto-fill if serial in URL
        if (serial) {
            await sleep(1500);
            fillForm(serial);
        }
    }

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();
