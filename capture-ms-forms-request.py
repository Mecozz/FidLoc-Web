#!/usr/bin/env python3
"""
MS Forms Request Capture Script
This script opens MS Forms and captures the exact network request when you submit.
We'll use this to reverse-engineer the API.

Setup:
  pip3 install playwright
  playwright install chromium

Usage:
  python3 capture-ms-forms-request.py
"""

from playwright.sync_api import sync_playwright
import json
import time

FORM_URL = "https://forms.office.com/pages/responsepage.aspx?id=XZI8ME5OQUqmnyZJVrSH1lwcfjB4TM5Dqw11fNLOPYxUMVNQSjU1QjhXV1dLSzZZUTdJOFhGVTRQSS4u"

def main():
    print("="*70)
    print("MS FORMS REQUEST CAPTURE TOOL")
    print("="*70)
    print("\nThis will open the form in a browser.")
    print("Fill it out manually and click Submit.")
    print("We'll capture the exact request that gets sent.\n")
    
    captured_requests = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, devtools=True)
        context = browser.new_context()
        page = context.new_page()
        
        # Capture ALL network requests
        def handle_request(request):
            url = request.url
            method = request.method
            
            # We're looking for POST requests to forms.office.com
            if 'forms.office.com' in url and method == 'POST':
                print(f"\n{'='*60}")
                print(f"🎯 CAPTURED POST REQUEST!")
                print(f"{'='*60}")
                print(f"URL: {url}")
                print(f"Method: {method}")
                print(f"Headers: {json.dumps(dict(request.headers), indent=2)}")
                
                post_data = request.post_data
                if post_data:
                    print(f"\n📦 POST DATA:")
                    try:
                        # Try to parse as JSON
                        parsed = json.loads(post_data)
                        print(json.dumps(parsed, indent=2))
                    except:
                        print(post_data[:2000])  # First 2000 chars if not JSON
                
                captured_requests.append({
                    'url': url,
                    'method': method,
                    'headers': dict(request.headers),
                    'post_data': post_data
                })
                print(f"{'='*60}\n")
        
        def handle_response(response):
            url = response.url
            if 'forms.office.com' in url and 'response' in url.lower():
                print(f"\n📥 RESPONSE from: {url}")
                print(f"Status: {response.status}")
                try:
                    body = response.text()
                    print(f"Body preview: {body[:500]}...")
                except:
                    pass
        
        page.on('request', handle_request)
        page.on('response', handle_response)
        
        print(f"Opening form: {FORM_URL}")
        page.goto(FORM_URL)
        
        print("\n" + "="*70)
        print("👆 FILL OUT THE FORM AND CLICK SUBMIT")
        print("Watch this console for the captured request!")
        print("Press Ctrl+C when done to exit")
        print("="*70 + "\n")
        
        try:
            # Keep browser open until user closes it or Ctrl+C
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        
        browser.close()
    
    # Save captured requests to file
    if captured_requests:
        output_file = '/Users/darren/Desktop/fidloc-web/captured-ms-forms-requests.json'
        with open(output_file, 'w') as f:
            json.dump(captured_requests, f, indent=2)
        print(f"\n✅ Saved {len(captured_requests)} captured requests to:")
        print(f"   {output_file}")
    else:
        print("\n⚠️  No POST requests to forms.office.com were captured.")
        print("   Make sure you submitted the form!")


if __name__ == "__main__":
    main()
