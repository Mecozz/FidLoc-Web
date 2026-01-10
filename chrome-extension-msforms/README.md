# FidLoc MS Forms Filler - Chrome Extension

A Chrome extension to auto-fill Microsoft Forms with missing equipment serial numbers from FidLoc inventory reconciliation.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select this folder: `/Users/darren/Desktop/fidloc-web/chrome-extension-msforms`
5. The extension icon should appear in your toolbar

## Usage

### Setup (One Time)
1. Click the extension icon
2. Enter your default values:
   - Technician Name: `Darren Couturier`
   - Garage: `Concord`
   - Status: `Missing`
3. Click **Save Defaults**

### Submitting Serial Numbers
1. In FidLoc, run your inventory comparison to get missing serial numbers
2. Copy the list of missing serial numbers
3. Click the extension icon
4. Paste serial numbers into the text area (one per line)
5. Click **Load Queue**
6. Open the MS Forms equipment order form in a new tab
7. Click **Fill Next & Submit** to auto-fill and submit each serial

The extension will:
- Fill in your technician name
- Fill in the serial number
- Select the garage
- Select the status (Missing)
- Click Submit
- Click "Submit another response" to prepare for the next one

### Tips
- Keep the extension popup open while processing the queue
- If a form field doesn't fill correctly, you can manually adjust and continue
- Use **Skip** to skip a problematic serial number
- Use **Clear All** to reset the queue

## How It Works

The extension injects JavaScript into the MS Forms page that:
1. Finds text input fields and fills them with your data
2. Finds choice/dropdown options and clicks them
3. Clicks the submit button
4. Waits for confirmation
5. Clicks "Submit another response" to reset the form

Since MS Forms uses React, the extension dispatches proper input events to trigger React's state updates.

## Troubleshooting

**Form fields not filling?**
- Make sure you're on the correct MS Forms page
- Try refreshing the form page
- Check the browser console (F12) for error messages

**Extension not showing?**
- Make sure Developer mode is enabled
- Try reloading the extension

**Submit not working?**
- The form may have changed - check field selectors
- Try manually clicking submit after fields are filled

## Files

- `manifest.json` - Extension configuration
- `popup.html` / `popup.js` - The extension popup UI
- `content-script.js` - Script that runs on MS Forms pages
- `background.js` - Service worker for background tasks

## Form URL

This extension is configured for:
```
https://forms.office.com/pages/responsepage.aspx?id=XZI8ME5OQUqmnyZJVrSH1lwcfjB4TM5Dqw11fNLOPYxUMVNQSjU1QjhXV1dLSzZZUTdJOFhGVTRQSS4u
```

If your form URL is different, you may need to update the `host_permissions` in `manifest.json`.
