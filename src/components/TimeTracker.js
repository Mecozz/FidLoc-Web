import { useState, useEffect, useCallback } from 'react';
import { X, Clock, Settings, Plus, Trash2, Download, AlertTriangle, ChevronRight, ChevronDown, Calendar, DollarSign, Edit2, Check, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './TimeTracker.css';

const STORAGE_KEY = 'fidloc_timetracker';

export default function TimeTracker({ userId, onClose }) {
  const [activeTab, setActiveTab] = useState('entry');
  const [settings, setSettings] = useState(null);
  const [entries, setEntries] = useState([]);
  const [showSetup, setShowSetup] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  // Load data - check Firebase first if sync enabled, then localStorage
  useEffect(() => {
    const loadData = async () => {
      // First check localStorage for sync preference
      const localData = localStorage.getItem(STORAGE_KEY + '_' + userId);
      let localSettings = null;
      let localEntries = [];
      
      if (localData) {
        const parsed = JSON.parse(localData);
        localSettings = parsed.settings || null;
        localEntries = parsed.entries || [];
        setSyncEnabled(parsed.syncEnabled || false);
      }

      // If sync is enabled, try to load from Firebase
      if (localSettings?.syncEnabled) {
        try {
          const docRef = doc(db, 'timetracker', userId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const firebaseData = docSnap.data();
            setSettings(firebaseData.settings || localSettings);
            setEntries(firebaseData.entries || localEntries);
            setSyncEnabled(true);
            setLastSync(firebaseData.lastSync || null);
            return;
          }
        } catch (err) {
          console.error('Firebase load error:', err);
        }
      }

      // Fall back to localStorage
      setSettings(localSettings);
      setEntries(localEntries);
    };

    loadData();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [userId]);

  // Save to localStorage (always) and Firebase (if enabled)
  const saveData = useCallback(async (newSettings, newEntries, newSyncEnabled) => {
    const data = { settings: newSettings, entries: newEntries, syncEnabled: newSyncEnabled };
    localStorage.setItem(STORAGE_KEY + '_' + userId, JSON.stringify(data));

    if (newSyncEnabled && userId) {
      setSyncing(true);
      try {
        const docRef = doc(db, 'timetracker', userId);
        await setDoc(docRef, {
          settings: newSettings,
          entries: newEntries,
          lastSync: new Date().toISOString(),
          userId
        });
        setLastSync(new Date().toISOString());
      } catch (err) {
        console.error('Firebase save error:', err);
      }
      setSyncing(false);
    }
  }, [userId]);

  // Auto-save when data changes
  useEffect(() => {
    if (settings !== null || entries.length > 0) {
      saveData(settings, entries, syncEnabled);
    }
  }, [settings, entries, syncEnabled, saveData]);

  useEffect(() => {
    if (settings === null) setShowSetup(true);
  }, [settings]);

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    setShowSetup(false);
  };

  const toggleSync = async () => {
    const newSyncEnabled = !syncEnabled;
    setSyncEnabled(newSyncEnabled);
    
    if (newSyncEnabled) {
      // Sync current data to Firebase
      await saveData(settings, entries, true);
    }
  };

  const forceSync = async () => {
    if (!syncEnabled) return;
    setSyncing(true);
    try {
      const docRef = doc(db, 'timetracker', userId);
      await setDoc(docRef, {
        settings,
        entries,
        lastSync: new Date().toISOString(),
        userId
      });
      setLastSync(new Date().toISOString());
    } catch (err) {
      console.error('Force sync error:', err);
      alert('Sync failed. Check your connection.');
    }
    setSyncing(false);
  };

  const addEntry = (entry) => {
    setEntries([...entries, { ...entry, id: Date.now() }]);
  };

  const updateEntry = (id, updatedEntry) => {
    setEntries(entries.map(e => e.id === id ? { ...updatedEntry, id } : e));
    setEditingEntry(null);
  };

  const deleteEntry = (id) => {
    if (window.confirm('Delete this entry?')) {
      setEntries(entries.filter(e => e.id !== id));
    }
  };

  const clearAllData = async () => {
    if (window.confirm('⚠️ Delete ALL time tracking data?\n\nThis cannot be undone!')) {
      setEntries([]);
      setSettings(null);
      localStorage.removeItem(STORAGE_KEY + '_' + userId);
      
      if (syncEnabled && userId) {
        try {
          const docRef = doc(db, 'timetracker', userId);
          await setDoc(docRef, { settings: null, entries: [], lastSync: new Date().toISOString(), userId });
        } catch (err) {
          console.error('Firebase clear error:', err);
        }
      }
      setShowSetup(true);
    }
  };

  const exportToCSV = () => {
    if (entries.length === 0) { alert('No entries to export'); return; }
    const headers = ['Date', 'Hours Worked', 'Weekend', 'Regular Pay', 'OT Pay', 'DT Pay', 'Total Pay', 'Notes'];
    const rows = entries.map(e => {
      const calc = calculateWeekPay([e], settings);
      return [e.date, e.hoursWorked || 0, e.shiftDiff || 'none', calc.regularPay.toFixed(2), calc.otPay.toFixed(2), calc.dtPay.toFixed(2), calc.totalPay.toFixed(2), e.notes || ''];
    });
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `time-tracker-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay">
      <div className="modal timetracker-modal">
        <div className="modal-header">
          <h2><Clock size={20} /> Time Tracker</h2>
          <button onClick={onClose} className="close-button"><X size={24} /></button>
        </div>
        
        <div className={`sync-status ${syncEnabled ? 'enabled' : 'disabled'}`}>
          {syncEnabled ? (
            <>
              <Cloud size={14} />
              <span>Cloud Sync {syncing ? 'syncing...' : 'on'}</span>
              <button onClick={forceSync} className="sync-btn" disabled={syncing}>
                <RefreshCw size={12} className={syncing ? 'spinning' : ''} />
              </button>
            </>
          ) : (
            <>
              <CloudOff size={14} />
              <span>Local only</span>
            </>
          )}
          <button onClick={toggleSync} className="toggle-sync-btn">
            {syncEnabled ? 'Disable' : 'Enable'} Sync
          </button>
        </div>

        {showSetup ? (
          <SetupScreen onSave={handleSaveSettings} existingSettings={settings} onCancel={() => settings && setShowSetup(false)} entries={entries} onUpdateEntries={setEntries} />
        ) : editingEntry ? (
          <EditEntryForm entry={editingEntry} settings={settings} onSave={(updated) => updateEntry(editingEntry.id, updated)} onCancel={() => setEditingEntry(null)} />
        ) : (
          <>
            <div className="tt-tabs">
              <button onClick={() => setActiveTab('entry')} className={`tt-tab ${activeTab === 'entry' ? 'active' : ''}`}><Plus size={16} /> Add</button>
              <button onClick={() => setActiveTab('history')} className={`tt-tab ${activeTab === 'history' ? 'active' : ''}`}><Calendar size={16} /> History</button>
              <button onClick={() => setActiveTab('summary')} className={`tt-tab ${activeTab === 'summary' ? 'active' : ''}`}><DollarSign size={16} /> Summary</button>
              <button onClick={() => setShowSetup(true)} className="tt-tab settings-tab"><Settings size={16} /></button>
            </div>
            <div className="tt-content">
              {activeTab === 'entry' && <EntryForm settings={settings} entries={entries} onAdd={addEntry} />}
              {activeTab === 'history' && <HistoryView entries={entries} settings={settings} onDelete={deleteEntry} onEdit={setEditingEntry} />}
              {activeTab === 'summary' && <SummaryView entries={entries} settings={settings} />}
            </div>
            <div className="tt-footer">
              <button onClick={exportToCSV} className="tt-footer-btn"><Download size={16} /> Export CSV</button>
              <button onClick={clearAllData} className="tt-footer-btn danger"><Trash2 size={16} /> Clear All</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SetupScreen({ onSave, existingSettings, onCancel, entries, onUpdateEntries }) {
  const [schedule, setSchedule] = useState(existingSettings?.schedule || '5x8');
  const [baseRate, setBaseRate] = useState(existingSettings?.baseRate?.toString() || '');
  const [otThreshold, setOtThreshold] = useState(existingSettings?.otThreshold?.toString() || '40');
  const [dtThreshold, setDtThreshold] = useState(existingSettings?.dtThreshold?.toString() || '52');
  const [otMultiplier, setOtMultiplier] = useState(existingSettings?.otMultiplier?.toString() || '1.5');
  const [dtMultiplier, setDtMultiplier] = useState(existingSettings?.dtMultiplier?.toString() || '2.0');
  
  // For rate change dialog
  const [showRateChangeDialog, setShowRateChangeDialog] = useState(false);
  const [rateChangeStartDate, setRateChangeStartDate] = useState('');
  const [pendingSettings, setPendingSettings] = useState(null);

  const rateChanged = existingSettings && parseFloat(baseRate) !== existingSettings.baseRate;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!baseRate || parseFloat(baseRate) <= 0) { alert('Please enter a valid base hourly rate'); return; }
    
    const newSettings = {
      schedule,
      baseRate: parseFloat(baseRate),
      otThreshold: parseFloat(otThreshold) || 40,
      dtThreshold: parseFloat(dtThreshold) || 52,
      otMultiplier: parseFloat(otMultiplier) || 1.5,
      dtMultiplier: parseFloat(dtMultiplier) || 2.0
    };
    
    // If rate changed and we have entries, ask for start date
    if (rateChanged && entries && entries.length > 0) {
      setPendingSettings(newSettings);
      // Default to start of next week (Sunday)
      const nextSunday = new Date();
      nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()));
      setRateChangeStartDate(nextSunday.toISOString().split('T')[0]);
      setShowRateChangeDialog(true);
    } else {
      onSave(newSettings);
    }
  };

  const applyRateChange = () => {
    if (!rateChangeStartDate) { alert('Please select a start date'); return; }
    
    // Update entries from the start date forward with new rate
    const startDate = new Date(rateChangeStartDate + 'T00:00:00');
    const updatedEntries = entries.map(entry => {
      const entryDate = new Date(entry.date + 'T12:00:00');
      if (entryDate >= startDate) {
        return {
          ...entry,
          baseRate: pendingSettings.baseRate
        };
      }
      return entry;
    });
    
    onUpdateEntries(updatedEntries);
    onSave(pendingSettings);
    setShowRateChangeDialog(false);
  };

  return (
    <div className="tt-setup">
      {showRateChangeDialog && (
        <div className="rate-change-dialog">
          <div className="rate-change-content">
            <h4>💰 Rate Change</h4>
            <p>You're changing from <strong>${existingSettings?.baseRate?.toFixed(2)}</strong> to <strong>${parseFloat(baseRate).toFixed(2)}</strong>/hr</p>
            <p>When does the new rate start?</p>
            <div className="form-group">
              <label>Start Date (entries from this date forward will use new rate)</label>
              <input 
                type="date" 
                value={rateChangeStartDate} 
                onChange={e => setRateChangeStartDate(e.target.value)} 
              />
            </div>
            <div className="rate-change-actions">
              <button type="button" onClick={() => setShowRateChangeDialog(false)} className="cancel-btn">Cancel</button>
              <button type="button" onClick={applyRateChange} className="save-btn">Apply New Rate</button>
            </div>
          </div>
        </div>
      )}
      <h3>{existingSettings ? 'Edit Settings' : 'Setup Time Tracker'}</h3>
      <form onSubmit={handleSubmit} className="setup-form">
        <div className="setup-section">
          <h4>What's your schedule?</h4>
          <div className="schedule-options">
            <label className={`schedule-option ${schedule === '5x8' ? 'selected' : ''}`}>
              <input type="radio" name="schedule" value="5x8" checked={schedule === '5x8'} onChange={() => setSchedule('5x8')} />
              <span className="option-title">5 x 8</span>
              <span className="option-desc">Mon-Fri, 8hr days</span>
            </label>
            <label className={`schedule-option ${schedule === '4x10' ? 'selected' : ''}`}>
              <input type="radio" name="schedule" value="4x10" checked={schedule === '4x10'} onChange={() => setSchedule('4x10')} />
              <span className="option-title">4 x 10</span>
              <span className="option-desc">4 days, 10hr days</span>
            </label>
            <label className={`schedule-option ${schedule === 'custom' ? 'selected' : ''}`}>
              <input type="radio" name="schedule" value="custom" checked={schedule === 'custom'} onChange={() => setSchedule('custom')} />
              <span className="option-title">Custom</span>
              <span className="option-desc">Varies weekly</span>
            </label>
          </div>
        </div>
        
        <div className="setup-section">
          <h4>Pay Rate</h4>
          <div className="form-row">
            <div className="form-group">
              <label>Base Hourly Rate *</label>
              <div className="input-with-prefix"><span>$</span><input type="number" step="0.01" value={baseRate} onChange={e => setBaseRate(e.target.value)} placeholder="38.18" required /></div>
            </div>
          </div>
          <p className="setup-hint">Shift differential (+10%) is selected per entry when adding hours.</p>
        </div>

        <div className="setup-section">
          <h4>Overtime Rules</h4>
          <p className="setup-hint">Work week: Sunday - Saturday. Hours auto-calculated per week.</p>
          <div className="form-row">
            <div className="form-group">
              <label>OT starts after</label>
              <div className="input-with-suffix"><input type="number" value={otThreshold} onChange={e => setOtThreshold(e.target.value)} /><span>hrs/wk</span></div>
            </div>
            <div className="form-group">
              <label>OT Rate</label>
              <div className="input-with-suffix"><input type="number" step="0.1" value={otMultiplier} onChange={e => setOtMultiplier(e.target.value)} /><span>x</span></div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Double Time after</label>
              <div className="input-with-suffix"><input type="number" value={dtThreshold} onChange={e => setDtThreshold(e.target.value)} /><span>hrs/wk</span></div>
            </div>
            <div className="form-group">
              <label>DT Rate</label>
              <div className="input-with-suffix"><input type="number" step="0.1" value={dtMultiplier} onChange={e => setDtMultiplier(e.target.value)} /><span>x</span></div>
            </div>
          </div>
        </div>

        <div className="setup-actions">
          {onCancel && <button type="button" onClick={onCancel} className="cancel-btn">Cancel</button>}
          <button type="submit" className="save-btn">Save Settings</button>
        </div>
      </form>
    </div>
  );
}

function EntryForm({ settings, entries, onAdd }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [hoursWorked, setHoursWorked] = useState('');
  const [shiftDiff, setShiftDiff] = useState('none'); // 'none', 'base', 'all'
  const [isHoliday, setIsHoliday] = useState(false);
  const [notes, setNotes] = useState('');

  if (!settings) return <div className="loading">Loading...</div>;

  const weekStart = getWeekStart(new Date(date + 'T12:00:00'));
  const weekEntries = entries.filter(e => {
    const entryWeekStart = getWeekStart(new Date(e.date + 'T12:00:00'));
    return entryWeekStart.getTime() === weekStart.getTime();
  });
  const weekHoursSoFar = weekEntries.reduce((sum, e) => sum + (e.hoursWorked || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const hours = parseFloat(hoursWorked) || 0;
    if (hours <= 0 && !isHoliday) { alert('Please enter hours worked'); return; }
    onAdd({ 
      date, 
      hoursWorked: hours, 
      shiftDiff,
      isHoliday, 
      notes,
      baseRate: settings.baseRate
    });
    setHoursWorked('');
    setShiftDiff('none');
    setIsHoliday(false);
    setNotes('');
  };

  const quickButtons = settings.schedule === '4x10' ? [10, 12, 8] : [8, 10, 12];
  const previewHours = parseFloat(hoursWorked) || 0;
  const previewWeekTotal = weekHoursSoFar + previewHours;
  const previewEntry = { date, hoursWorked: previewHours, shiftDiff, isHoliday };
  const previewCalc = calculateWeekPay([...weekEntries, previewEntry], settings);

  return (
    <form onSubmit={handleSubmit} className="entry-form">
      <div className="week-status">
        <span>Week Total: <strong>{weekHoursSoFar}h</strong></span>
        {weekHoursSoFar >= settings.dtThreshold && <span className="status-dt">Double Time!</span>}
        {weekHoursSoFar >= settings.otThreshold && weekHoursSoFar < settings.dtThreshold && <span className="status-ot">In OT</span>}
      </div>

      <div className="form-group">
        <label>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </div>

      <div className="form-group">
        <label>Shift Differential (+10%)</label>
        <div className="shift-diff-options">
          <label className={`shift-option ${shiftDiff === 'none' ? 'selected' : ''}`}>
            <input type="radio" name="shiftDiff" value="none" checked={shiftDiff === 'none'} onChange={() => setShiftDiff('none')} />
            <span>None</span>
          </label>
          <label className={`shift-option ${shiftDiff === 'base' ? 'selected' : ''}`}>
            <input type="radio" name="shiftDiff" value="base" checked={shiftDiff === 'base'} onChange={() => setShiftDiff('base')} />
            <span>First 40hrs</span>
          </label>
          <label className={`shift-option ${shiftDiff === 'all' ? 'selected' : ''}`}>
            <input type="radio" name="shiftDiff" value="all" checked={shiftDiff === 'all'} onChange={() => setShiftDiff('all')} />
            <span>All Hours</span>
          </label>
        </div>
      </div>

      <div className="holiday-toggle">
        <label className={`toggle-label holiday ${isHoliday ? 'active' : ''}`}>
          <input type="checkbox" checked={isHoliday} onChange={e => setIsHoliday(e.target.checked)} />
          <span>🎄 Holiday (+10hrs bonus)</span>
        </label>
      </div>

      <div className="form-group">
        <label>Hours Worked {isHoliday && '(0 if day off)'}</label>
        <input type="number" step="0.25" value={hoursWorked} onChange={e => setHoursWorked(e.target.value)} placeholder={isHoliday ? "0" : "10"} />
        <div className="quick-buttons">
          {quickButtons.map(h => (
            <button key={h} type="button" onClick={() => setHoursWorked(h.toString())} className="quick-btn">{h}h</button>
          ))}
          {isHoliday && <button type="button" onClick={() => setHoursWorked('0')} className="quick-btn">0h</button>}
        </div>
      </div>

      <div className="form-group">
        <label>Notes (optional)</label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Day off work, Holiday..." />
      </div>

      {(previewHours > 0 || isHoliday) && (
        <div className="pay-preview">
          <div className="preview-title">This Entry</div>
          <div className="preview-breakdown">
            <div className="preview-row"><span>Hours:</span><span>{previewHours}h → Week: {previewWeekTotal}h</span></div>
            {previewCalc.regularHours > 0 && <div className="preview-row"><span>Regular ({previewCalc.regularHours}h):</span><span>${previewCalc.regularPay.toFixed(2)}</span></div>}
            {previewCalc.otHours > 0 && <div className="preview-row ot"><span>OT ({previewCalc.otHours}h × {settings.otMultiplier}):</span><span>${previewCalc.otPay.toFixed(2)}</span></div>}
            {previewCalc.dtHours > 0 && <div className="preview-row dt"><span>DT ({previewCalc.dtHours}h × {settings.dtMultiplier}):</span><span>${previewCalc.dtPay.toFixed(2)}</span></div>}
            {previewCalc.shiftDiffBonus > 0 && <div className="preview-row bonus"><span>Shift Diff (+10%):</span><span>+${previewCalc.shiftDiffBonus.toFixed(2)}</span></div>}
            {isHoliday && <div className="preview-row holiday"><span>🎄 Holiday (10h):</span><span>+${(settings.baseRate * 10).toFixed(2)}</span></div>}
          </div>
          <div className="preview-total"><span>Week Total:</span><span>${(previewCalc.totalPay + (isHoliday ? settings.baseRate * 10 : 0)).toFixed(2)}</span></div>
        </div>
      )}

      <button type="submit" className="add-entry-btn"><Plus size={18} /> Add Entry</button>
    </form>
  );
}

function EditEntryForm({ entry, settings, onSave, onCancel }) {
  const [date, setDate] = useState(entry.date);
  const [hoursWorked, setHoursWorked] = useState(entry.hoursWorked?.toString() || '');
  const [shiftDiff, setShiftDiff] = useState(entry.shiftDiff || 'none');
  const [isHoliday, setIsHoliday] = useState(entry.isHoliday || false);
  const [notes, setNotes] = useState(entry.notes || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    const hours = parseFloat(hoursWorked) || 0;
    if (hours <= 0 && !isHoliday) { alert('Please enter hours worked'); return; }
    onSave({ 
      date, 
      hoursWorked: hours, 
      shiftDiff,
      isHoliday, 
      notes,
      baseRate: entry.baseRate || settings.baseRate
    });
  };

  const quickButtons = settings.schedule === '4x10' ? [10, 12, 8] : [8, 10, 12];

  return (
    <div className="edit-entry-form">
      <h3><Edit2 size={18} /> Edit Entry</h3>
      <form onSubmit={handleSubmit} className="entry-form">
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </div>

        <div className="form-group">
          <label>Shift Differential (+10%)</label>
          <div className="shift-diff-options">
            <label className={`shift-option ${shiftDiff === 'none' ? 'selected' : ''}`}>
              <input type="radio" name="editShiftDiff" value="none" checked={shiftDiff === 'none'} onChange={() => setShiftDiff('none')} />
              <span>None</span>
            </label>
            <label className={`shift-option ${shiftDiff === 'base' ? 'selected' : ''}`}>
              <input type="radio" name="editShiftDiff" value="base" checked={shiftDiff === 'base'} onChange={() => setShiftDiff('base')} />
              <span>First 40hrs</span>
            </label>
            <label className={`shift-option ${shiftDiff === 'all' ? 'selected' : ''}`}>
              <input type="radio" name="editShiftDiff" value="all" checked={shiftDiff === 'all'} onChange={() => setShiftDiff('all')} />
              <span>All Hours</span>
            </label>
          </div>
        </div>

        <div className="holiday-toggle">
          <label className={`toggle-label holiday ${isHoliday ? 'active' : ''}`}>
            <input type="checkbox" checked={isHoliday} onChange={e => setIsHoliday(e.target.checked)} />
            <span>🎄 Holiday (+10hrs bonus)</span>
          </label>
        </div>

        <div className="form-group">
          <label>Hours Worked {isHoliday && '(0 if day off)'}</label>
          <input type="number" step="0.25" value={hoursWorked} onChange={e => setHoursWorked(e.target.value)} placeholder={isHoliday ? "0" : "10"} />
          <div className="quick-buttons">
            {quickButtons.map(h => (
              <button key={h} type="button" onClick={() => setHoursWorked(h.toString())} className="quick-btn">{h}h</button>
            ))}
            {isHoliday && <button type="button" onClick={() => setHoursWorked('0')} className="quick-btn">0h</button>}
          </div>
        </div>

        <div className="form-group">
          <label>Notes (optional)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Day off work, Holiday..." />
        </div>

        <div className="edit-actions">
          <button type="button" onClick={onCancel} className="cancel-btn">Cancel</button>
          <button type="submit" className="save-btn"><Check size={16} /> Save Changes</button>
        </div>
      </form>
    </div>
  );
}

function HistoryView({ entries, settings, onDelete, onEdit }) {
  const [expandedWeek, setExpandedWeek] = useState(null);
  
  if (!settings) return <div className="loading">Loading...</div>;
  if (entries.length === 0) return <div className="empty-history"><Calendar size={48} /><p>No entries yet</p></div>;

  const groupedByWeek = entries.reduce((acc, entry) => {
    const weekStart = getWeekStart(new Date(entry.date + 'T12:00:00'));
    const weekKey = weekStart.toISOString().split('T')[0];
    if (!acc[weekKey]) acc[weekKey] = [];
    acc[weekKey].push(entry);
    return acc;
  }, {});

  return (
    <div className="history-view">
      {Object.keys(groupedByWeek).sort((a, b) => b.localeCompare(a)).map(weekKey => {
        const weekEntries = groupedByWeek[weekKey].sort((a, b) => a.date.localeCompare(b.date));
        const weekStart = new Date(weekKey + 'T12:00:00');
        const weekCalc = calculateWeekPay(weekEntries, settings);
        const totalHours = weekEntries.reduce((sum, e) => sum + (e.hoursWorked || 0) + (e.isHoliday ? 10 : 0), 0);
        const isExpanded = expandedWeek === weekKey;

        return (
          <div key={weekKey} className="week-group">
            <button className="week-header" onClick={() => setExpandedWeek(isExpanded ? null : weekKey)}>
              <div className="week-title">
                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <span>Week of {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="week-summary">
                <span className="week-hours">{totalHours}h</span>
                {weekCalc.otHours > 0 && <span className="week-ot">{weekCalc.otHours}h OT</span>}
                {weekCalc.dtHours > 0 && <span className="week-dt">{weekCalc.dtHours}h DT</span>}
                {weekCalc.holidayHours > 0 && <span className="week-holiday">🎄{weekCalc.holidayHours}h</span>}
                <span className="week-pay">${weekCalc.totalPay.toFixed(2)}</span>
              </div>
            </button>
            {isExpanded && (
              <div className="week-entries">
                <div className="week-breakdown">
                  <span>Reg: {weekCalc.regularHours}h</span>
                  <span>OT: {weekCalc.otHours}h</span>
                  <span>DT: {weekCalc.dtHours}h</span>
                  {weekCalc.holidayHours > 0 && <span>🎄: {weekCalc.holidayHours}h</span>}
                </div>
                {weekEntries.map(entry => {
                  const d = new Date(entry.date + 'T12:00:00');
                  return (
                    <div key={entry.id} className="history-entry">
                      <div className="entry-date">
                        <span className="date-day">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                        <span className="date-num">{d.getDate()}</span>
                        {entry.shiftDiff && entry.shiftDiff !== 'none' && <span className="shift-badge">+10%</span>}
                        {entry.isHoliday && <span className="holiday-badge">🎄</span>}
                      </div>
                      <div className="entry-hours">
                        <span>{entry.hoursWorked}h{entry.isHoliday && ' +10h'}</span>
                        {entry.notes && <span className="entry-note" title={entry.notes}>📝</span>}
                      </div>
                      <div className="entry-actions">
                        <button onClick={() => onEdit(entry)} className="edit-entry-btn" title="Edit"><Edit2 size={14} /></button>
                        <button onClick={() => onDelete(entry.id)} className="delete-entry-btn" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SummaryView({ entries, settings }) {
  if (!settings) return <div className="loading">Loading...</div>;
  
  const now = new Date();
  const thisWeekStart = getWeekStart(now);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);
  thisWeekEnd.setHours(23, 59, 59, 999);
  
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisYearStart = new Date(now.getFullYear(), 0, 1);

  const calcPeriod = (startDate, endDate) => {
    // Get entries that fall within the period
    const periodEntries = entries.filter(e => {
      const d = new Date(e.date + 'T12:00:00');
      return d >= startDate && d <= endDate;
    });
    
    // Find which weeks have entries in this period
    const weeksInPeriod = new Set();
    periodEntries.forEach(e => {
      const ws = getWeekStart(new Date(e.date + 'T12:00:00')).toISOString();
      weeksInPeriod.add(ws);
    });
    
    // For each week that touches the period, get ALL entries from that complete week
    // This ensures OT/DT is calculated correctly across the full week
    const byWeek = {};
    entries.forEach(e => {
      const ws = getWeekStart(new Date(e.date + 'T12:00:00')).toISOString();
      if (weeksInPeriod.has(ws)) {
        if (!byWeek[ws]) byWeek[ws] = [];
        byWeek[ws].push(e);
      }
    });
    
    let totalPay = 0, totalHours = 0, otHours = 0, dtHours = 0, holidayHours = 0;
    Object.values(byWeek).forEach(weekEntries => {
      const calc = calculateWeekPay(weekEntries, settings);
      totalPay += calc.totalPay;
      totalHours += calc.regularHours + calc.otHours + calc.dtHours + calc.holidayHours;
      otHours += calc.otHours;
      dtHours += calc.dtHours;
      holidayHours += calc.holidayHours;
    });
    
    return { totalHours, otHours, dtHours, holidayHours, totalPay, count: periodEntries.length };
  };

  const thisWeek = calcPeriod(thisWeekStart, thisWeekEnd);
  const thisMonth = calcPeriod(thisMonthStart, thisWeekEnd);
  const thisYear = calcPeriod(thisYearStart, thisWeekEnd);

  return (
    <div className="summary-view">
      <div className="summary-card highlight">
        <h4>This Week</h4>
        <div className="summary-stats">
          <div className="stat"><span className="stat-value">{thisWeek.totalHours}</span><span className="stat-label">Total</span></div>
          <div className="stat"><span className="stat-value">{thisWeek.otHours}</span><span className="stat-label">OT</span></div>
          <div className="stat"><span className="stat-value">{thisWeek.dtHours}</span><span className="stat-label">DT</span></div>
          <div className="stat"><span className="stat-value">{thisWeek.otHours + thisWeek.dtHours}</span><span className="stat-label">OT+DT</span></div>
          <div className="stat big"><span className="stat-value">${thisWeek.totalPay.toFixed(2)}</span><span className="stat-label">Pay</span></div>
        </div>
      </div>
      <div className="summary-card">
        <h4>This Month</h4>
        <div className="summary-stats">
          <div className="stat"><span className="stat-value">{thisMonth.totalHours}</span><span className="stat-label">Total</span></div>
          <div className="stat"><span className="stat-value">{thisMonth.otHours}</span><span className="stat-label">OT</span></div>
          <div className="stat"><span className="stat-value">{thisMonth.dtHours}</span><span className="stat-label">DT</span></div>
          <div className="stat"><span className="stat-value">{thisMonth.otHours + thisMonth.dtHours}</span><span className="stat-label">OT+DT</span></div>
          <div className="stat big"><span className="stat-value">${thisMonth.totalPay.toFixed(2)}</span><span className="stat-label">Pay</span></div>
        </div>
      </div>
      <div className="summary-card">
        <h4>This Year</h4>
        <div className="summary-stats">
          <div className="stat"><span className="stat-value">{thisYear.totalHours}</span><span className="stat-label">Total</span></div>
          <div className="stat"><span className="stat-value">{thisYear.otHours}</span><span className="stat-label">OT</span></div>
          <div className="stat"><span className="stat-value">{thisYear.dtHours}</span><span className="stat-label">DT</span></div>
          <div className="stat"><span className="stat-value">{thisYear.otHours + thisYear.dtHours}</span><span className="stat-label">OT+DT</span></div>
          <div className="stat big"><span className="stat-value">${thisYear.totalPay.toFixed(2)}</span><span className="stat-label">Pay</span></div>
        </div>
      </div>
    </div>
  );
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function calculateWeekPay(weekEntries, settings) {
  if (!settings || !weekEntries.length) return { regularHours: 0, otHours: 0, dtHours: 0, holidayHours: 0, regularPay: 0, otPay: 0, dtPay: 0, holidayPay: 0, shiftDiffBonus: 0, totalPay: 0 };

  const { baseRate: defaultBaseRate, otThreshold, dtThreshold, otMultiplier, dtMultiplier } = settings;
  
  const sorted = [...weekEntries].sort((a, b) => a.date.localeCompare(b.date));
  
  let runningHours = 0;
  let regularHours = 0, otHours = 0, dtHours = 0, holidayHours = 0;
  let regularPay = 0, otPay = 0, dtPay = 0, holidayPay = 0, shiftDiffBonus = 0;

  sorted.forEach(entry => {
    const entryBaseRate = entry.baseRate || defaultBaseRate;
    const shiftDiff = entry.shiftDiff || 'none'; // 'none', 'base', 'all'
    
    const hours = entry.hoursWorked || 0;
    
    // Holiday bonus: 10 hours at entry's base rate
    if (entry.isHoliday) {
      holidayHours += 10;
      holidayPay += entryBaseRate * 10;
    }
    
    let entryRegular = 0, entryOT = 0, entryDT = 0;
    
    for (let h = 0; h < hours; h += 0.25) {
      const hourIncrement = Math.min(0.25, hours - h);
      const totalSoFar = runningHours + h;
      
      if (totalSoFar >= dtThreshold) {
        entryDT += hourIncrement;
      } else if (totalSoFar >= otThreshold) {
        entryOT += hourIncrement;
      } else {
        entryRegular += hourIncrement;
      }
    }
    
    runningHours += hours;
    regularHours += entryRegular;
    otHours += entryOT;
    dtHours += entryDT;
    
    // Base pay without any differential
    const baseRegularPay = entryRegular * entryBaseRate;
    const baseOTPay = entryOT * entryBaseRate * otMultiplier;
    const baseDTPay = entryDT * entryBaseRate * dtMultiplier;
    
    let entryRegularPay, entryOTPay, entryDTPay, entryShiftBonus = 0;
    
    if (shiftDiff === 'all') {
      // 10% on all hours including OT/DT
      entryRegularPay = baseRegularPay * 1.1;
      entryOTPay = baseOTPay * 1.1;
      entryDTPay = baseDTPay * 1.1;
      entryShiftBonus = (entryRegularPay + entryOTPay + entryDTPay) - (baseRegularPay + baseOTPay + baseDTPay);
    } else if (shiftDiff === 'base') {
      // 10% only on first 40hrs (regular hours)
      entryRegularPay = baseRegularPay * 1.1;
      entryOTPay = baseOTPay;
      entryDTPay = baseDTPay;
      entryShiftBonus = entryRegularPay - baseRegularPay;
    } else {
      // No differential
      entryRegularPay = baseRegularPay;
      entryOTPay = baseOTPay;
      entryDTPay = baseDTPay;
    }
    
    regularPay += entryRegularPay;
    otPay += entryOTPay;
    dtPay += entryDTPay;
    shiftDiffBonus += entryShiftBonus;
  });

  return {
    regularHours: Math.round(regularHours * 100) / 100,
    otHours: Math.round(otHours * 100) / 100,
    dtHours: Math.round(dtHours * 100) / 100,
    holidayHours,
    regularPay,
    otPay,
    dtPay,
    holidayPay,
    shiftDiffBonus,
    totalPay: regularPay + otPay + dtPay + holidayPay
  };
}
