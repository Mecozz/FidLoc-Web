#!/usr/bin/env python3
"""
MS Forms Auto-Submit Script
Fills and submits MS Forms automatically using Playwright browser automation.
Run this on your Mac to batch-submit missing serial numbers.

Setup:
  pip3 install playwright
  playwright install chromium

Usage:
  python3 ms_forms_submit.py
"""

from playwright.sync_api import sync_playwright
import time

# ============ CONFIGURATION ============
FORM_URL = "https://forms.office.com/pages/responsepage.aspx?id=XZI8ME5OQUqmnyZJVrSH1lwcfjB4TM5Dqw11fNLOPYxUMVNQSjU1QjhXV1dLSzZZUTdJOFhGVTRQSS4u"

# Your default values
TECHNICIAN_NAME = "Darren Couturier"
GARAGE = "Concord"
EQUIPMENT_STATUS = "Missing"

# List of serial numbers to submit
SERIALS_TO_SUBMIT = [
    "SERIAL001",
    "SERIAL002", 
    "SERIAL003",
    # Add more serials here...
]

# ============ END CONFIGURATION ============


def fill_text_field(page, label_text, value):
    """Fill a text input field by its label."""
    try:
        # MS Forms uses aria-labelledby, find the input associated with the label
        # Try multiple strategies
        
        # Strategy 1: Find input with placeholder or aria-label
        inputs = page.locator('input[type="text"], input[data-automation-id="textInput"]')
        count = inputs.count()
        
        for i in range(count):
            inp = inputs.nth(i)
            # Check if this input's label contains our text
            parent = inp.locator('xpath=ancestor::div[contains(@class, "question")]')
            if parent.count() > 0:
                label = parent.locator('span, div').filter(has_text=label_text)
                if label.count() > 0:
                    inp.fill(value)
                    return True
        
        # Strategy 2: Just fill the nth text input based on position
        return False
    except Exception as e:
        print(f"  Error filling {label_text}: {e}")
        return False


def select_dropdown_option(page, label_text, option_text):
    """Select an option from a dropdown/choice field."""
    try:
        # Find the dropdown that contains the label
        dropdowns = page.locator('[role="listbox"], [role="combobox"], select')
        # For MS Forms, options are often radio buttons or list items
        option = page.locator(f'[role="option"]:has-text("{option_text}"), [role="radio"]:has-text("{option_text}")')
        if option.count() > 0:
            option.first.click()
            return True
        return False
    except Exception as e:
        print(f"  Error selecting {option_text}: {e}")
        return False


def submit_form(page, serial, technician, garage, status):
    """Fill and submit the form for one serial number."""
    print(f"\n{'='*50}")
    print(f"Submitting: {serial}")
    print(f"{'='*50}")
    
    # Navigate to form
    page.goto(FORM_URL)
    page.wait_for_load_state('networkidle')
    time.sleep(2)  # Wait for React to render
    
    # Get all text inputs
    text_inputs = page.locator('input[data-automation-id="textInput"]')
    input_count = text_inputs.count()
    print(f"  Found {input_count} text inputs")
    
    # Fill text fields (assuming order: Technician Name, Serial Number)
    # You may need to adjust indices based on your form
    if input_count >= 1:
        text_inputs.nth(0).fill(technician)
        print(f"  Filled Technician: {technician}")
        time.sleep(0.3)
    
    if input_count >= 2:
        text_inputs.nth(1).fill(serial)
        print(f"  Filled Serial: {serial}")
        time.sleep(0.3)
    
    # Handle dropdown/choice fields (Garage, Status)
    # MS Forms uses various patterns - try clicking on the option text directly
    all_options = page.locator('[role="option"], [role="radio"], .office-form-question-choice')
    
    # Try to find and click Garage option
    garage_option = page.locator(f'text="{garage}"').first
    if garage_option.is_visible():
        garage_option.click()
        print(f"  Selected Garage: {garage}")
        time.sleep(0.3)
    
    # Try to find and click Status option  
    status_option = page.locator(f'text="{status}"').first
    if status_option.is_visible():
        status_option.click()
        print(f"  Selected Status: {status}")
        time.sleep(0.3)
    
    # Find and click Submit button
    submit_btn = page.locator('[data-automation-id="submitButton"], button:has-text("Submit")')
    if submit_btn.count() > 0:
        submit_btn.first.click()
        print("  Clicked Submit!")
        time.sleep(3)  # Wait for submission
        
        # Check for success message
        if page.locator('text="Your response was submitted"').count() > 0:
            print("  ✅ SUCCESS - Response submitted!")
            return True
        else:
            print("  ⚠️  Submit clicked but no confirmation seen")
            return True
    else:
        print("  ❌ ERROR - Submit button not found")
        return False


def main():
    print("="*60)
    print("MS FORMS AUTO-SUBMIT SCRIPT")
    print("="*60)
    print(f"\nForm URL: {FORM_URL}")
    print(f"Technician: {TECHNICIAN_NAME}")
    print(f"Garage: {GARAGE}")
    print(f"Status: {EQUIPMENT_STATUS}")
    print(f"Serials to submit: {len(SERIALS_TO_SUBMIT)}")
    
    if not SERIALS_TO_SUBMIT or SERIALS_TO_SUBMIT[0] == "SERIAL001":
        print("\n⚠️  WARNING: You need to edit this script and add your actual serial numbers!")
        print("   Edit the SERIALS_TO_SUBMIT list at the top of this file.")
        return
    
    input("\nPress Enter to start (or Ctrl+C to cancel)...")
    
    with sync_playwright() as p:
        # Launch browser (headful so you can see what's happening)
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        
        success_count = 0
        fail_count = 0
        
        for serial in SERIALS_TO_SUBMIT:
            try:
                if submit_form(page, serial, TECHNICIAN_NAME, GARAGE, EQUIPMENT_STATUS):
                    success_count += 1
                else:
                    fail_count += 1
            except Exception as e:
                print(f"  ❌ EXCEPTION: {e}")
                fail_count += 1
            
            time.sleep(1)  # Brief pause between submissions
        
        browser.close()
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"✅ Successful: {success_count}")
    print(f"❌ Failed: {fail_count}")
    print(f"Total: {len(SERIALS_TO_SUBMIT)}")


if __name__ == "__main__":
    main()
