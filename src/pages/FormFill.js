import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import './FormFill.css';

// Microsoft Form URL
const FORM_URL = 'https://forms.office.com/pages/responsepage.aspx?id=XZI8ME5OQUqmnyZJVrSH1lwcfjB4TM5Dqw11fNLOPYxUMVNQSjU1QjhXV1dLSzZZUTdJOFhGVTRQSS4u';

// Question IDs from the form
const QUESTION_IDS = {
  technicianName: 'rda892478c0b741ecb670fda088fcbc7b',
  garage: 'r8076010f6735476abb0af5bfb040117e',
  serialNumber: 'rfa582ebfb11e40f3bf00d8e0a9efbe9c',
  equipmentStatus: 'r4eb635e098d24e8a8de3ed2331979cdb',
  notes: 'r3415631ba52f42dfaf88df455fadec32'
};

function FormFill() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const [copied, setCopied] = useState(false);
  
  const serial = searchParams.get('serial') || '';
  const name = searchParams.get('name') || 'Darren Couturier';
  const garage = searchParams.get('garage') || 'Concord';
  const equipStatus = searchParams.get('status') || 'Missing';
  
  // Generate the auto-fill script
  const generateScript = () => {
    return `(async function() {
  const data = {
    name: '${name.replace(/'/g, "\\'")}',
    garage: '${garage.replace(/'/g, "\\'")}',
    serial: '${serial.replace(/'/g, "\\'")}',
    status: '${equipStatus.replace(/'/g, "\\'")}'
  };
  
  const ids = {
    n: '${QUESTION_IDS.technicianName}',
    g: '${QUESTION_IDS.garage}',
    s: '${QUESTION_IDS.serialNumber}',
    e: '${QUESTION_IDS.equipmentStatus}'
  };
  
  function setV(i, v) {
    if (!i) return false;
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    s.call(i, v);
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  
  function find(id) {
    let e = document.querySelector('input[aria-labelledby*="' + id + '"]');
    if (e) return e;
    e = document.querySelector('textarea[aria-labelledby*="' + id + '"]');
    return e;
  }
  
  function radio(v) {
    const r = document.querySelectorAll('[role="radio"]');
    for (const x of r) {
      if ((x.textContent || '').includes(v)) {
        x.click();
        return true;
      }
    }
    return false;
  }
  
  // Wait for form to load
  let attempts = 0;
  while (!find(ids.n) && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  
  let filled = 0;
  if (setV(find(ids.n), data.name)) filled++;
  await new Promise(r => setTimeout(r, 50));
  if (setV(find(ids.g), data.garage)) filled++;
  await new Promise(r => setTimeout(r, 50));
  if (setV(find(ids.s), data.serial)) filled++;
  await new Promise(r => setTimeout(r, 50));
  if (radio(data.status)) filled++;
  
  if (filled >= 3) {
    console.log('✅ FidLoc Auto-Fill: ' + filled + '/4 fields filled!');
  } else {
    alert('⚠️ Only ' + filled + '/4 fields filled. Please check manually.');
  }
})();`;
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(generateScript());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = generateScript();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openForm = () => {
    window.open(FORM_URL, '_blank');
    setStatus('opened');
  };

  useEffect(() => {
    if (serial) {
      setStatus('ready');
      // Auto-open after a short delay
      const timer = setTimeout(() => {
        openForm();
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setStatus('no-serial');
    }
  }, [serial]);

  if (status === 'no-serial') {
    return (
      <div className="form-fill-page">
        <div className="form-fill-container">
          <div className="form-fill-logo">📋</div>
          <h1>FidLoc Form Fill</h1>
          <p className="subtitle">Auto-fill Microsoft Forms</p>
          
          <div className="status-box error">
            ⚠️ No serial number provided
          </div>
          
          <p className="help-text">
            This page should be opened from FidLoc with a serial number in the URL.
          </p>
          
          <div className="instructions">
            <h3>How to use:</h3>
            <ol>
              <li>Go to FidLoc web app</li>
              <li>Navigate to Submit tab</li>
              <li>Tap a serial number</li>
              <li>It will open this page automatically!</li>
            </ol>
          </div>
          
          <a href="/" className="btn btn-primary">
            ← Back to FidLoc
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="form-fill-page">
      <div className="form-fill-container">
        <div className="form-fill-logo">📋</div>
        <h1>FidLoc Form Fill</h1>
        <p className="subtitle">Auto-fill Microsoft Forms</p>
        
        <div className="info-card">
          <div className="info-row">
            <span className="info-label">Technician</span>
            <span className="info-value">{name}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Garage</span>
            <span className="info-value">{garage}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Status</span>
            <span className="info-value">{equipStatus}</span>
          </div>
        </div>
        
        <div className="serial-highlight">{serial}</div>
        
        {status === 'ready' && (
          <div className="status-box loading">
            <span className="spinner"></span>
            Opening form...
          </div>
        )}
        
        {status === 'opened' && (
          <>
            <div className="status-box success">
              ✅ Form opened in new tab!
            </div>
            
            <div className="instructions">
              <h3>📋 To auto-fill the form:</h3>
              <ol>
                <li>Go to the form tab that just opened</li>
                <li>Press <strong>F12</strong> (or right-click → Inspect)</li>
                <li>Click the <strong>Console</strong> tab</li>
                <li>Paste the script and press <strong>Enter</strong></li>
              </ol>
              
              <button 
                className={`btn btn-copy ${copied ? 'copied' : ''}`}
                onClick={copyScript}
              >
                {copied ? '✅ Copied!' : '📋 Copy Auto-Fill Script'}
              </button>
            </div>
          </>
        )}
        
        <div className="button-row">
          <button className="btn btn-primary" onClick={openForm}>
            📝 Open Form
          </button>
          <a href="/" className="btn btn-secondary">
            ← Back to FidLoc
          </a>
        </div>
      </div>
    </div>
  );
}

export default FormFill;
