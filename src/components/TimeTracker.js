import { useState, useEffect } from 'react';
import { X, Clock, Settings, Plus, Trash2, Download, AlertTriangle, ChevronRight, ChevronDown, Calendar, DollarSign, Edit2, Check } from 'lucide-react';
import './TimeTracker.css';

const STORAGE_KEY = 'fidloc_timetracker';

export default function TimeTracker({ userId, onClose }) {
  const [activeTab, setActiveTab] = useState('entry');
  const [settings, setSettings] = useState(null);
  const [entries, setEntries] = useState([]);
  const [showSetup, setShowSetup] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_' + userId);
    if (saved) {
      const data = JSON.parse(saved);
      setSettings(data.settings || null);
      setEntries(data.entries || []);
    }
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [userId]);

  useEffect(() => {
    if (settings !== null || entries.length > 0) {
      localStorage.setItem(STORAGE_KEY + '_' + userId, JSON.stringify({ settings, entries }));
    }
  }, [settings, entries, userId]);

  useEffect(() => {
    if (settings === null) setShowSetup(true);
  }, [settings]);

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    setShowSetup(false);
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

  const clearAllData = () => {
    if (window.confirm('⚠️ Delete ALL time tracking data?\n\nThis cannot be undone!')) {
      setEntries([]);
      setSettings(null);
      localStorage.removeItem(STORAGE_KEY + '_' + userId);
      setShowSetup(true);
    }
  };

  const exportToCSV = () => {
    if (entries.length === 0) { alert('No entries to export'); return; }
    const headers = ['Date', 'Hours Worked', 'Weekend', 'Regular Pay', 'OT Pay', 'DT Pay', 'Total Pay', 'Notes'];
    const rows = entries.map(e => {
      const calc = calculateWeekPay([e], settings);
      return [e.date, e.hoursWorked || 0, e.isWeekend ? 'Yes' : 'No', calc.regularPay.toFixed(2), calc.otPay.toFixed(2), calc.dtPay.toFixed(2), calc.totalPay.toFixed(2), e.notes || ''];
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
        <div className="storage-warning"><AlertTriangle size={16} /><span>Data stored locally in this browser only.</span></div>
        {showSetup ? (
          <SetupScreen onSave={handleSaveSettings} existingSettings={settings} onCancel={() => settings && setShowSetup(false)} />
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

function SetupScreen({ onSave, existingSettings, onCancel }) {
  const [schedule, setSchedule] = useState(existingSettings?.schedule || '5x8');
  const [baseRate, setBaseRate] = useState(existingSettings?.baseRate || '');
  const [weekendDiff, setWeekendDiff] = useState(existingSettings?.weekendDiff ?? '10');
  const [otThreshold, setOtThreshold] = useState(existingSettings?.otThreshold || '40');
  const [dtThreshold, setDtThreshold] = useState(existingSettings?.dtThreshold || '52');
  const [otMultiplier, setOtMultiplier] = useState(existingSettings?.otMultiplier || '1.5');
  const [dtMultiplier, setDtMultiplier] = useState(existingSettings?.dtMultiplier || '2.0');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!baseRate || parseFloat(baseRate) <= 0) { alert('Please enter a valid base hourly rate'); return; }
    onSave({
      schedule,
      baseRate: parseFloat(baseRate),
      weekendDiff: parseFloat(weekendDiff) || 0,
      otThreshold: parseFloat(otThreshold) || 40,
      dtThreshold: parseFloat(dtThreshold) || 52,
      otMultiplier: parseFloat(otMultiplier) || 1.5,
      dtMultiplier: parseFloat(dtMultiplier) || 2.0
    });
  };

  return (
    <div className="tt-setup">
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
            <div className="form-group">
              <label>Weekend Differential</label>
              <div className="input-with-suffix"><input type="number" step="0.1" value={weekendDiff} onChange={e => setWeekendDiff(e.target.value)} placeholder="10" /><span>%</span></div>
            </div>
          </div>
        </div>

        <div className="setup-section">
          <h4>Overtime Rules</h4>
          <p className="setup-hint">Hours are auto-calculated: Regular → OT → Double Time</p>
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
  const [isWeekend, setIsWeekend] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const d = new Date(date + 'T12:00:00');
    setIsWeekend(d.getDay() === 0 || d.getDay() === 6);
  }, [date]);

  if (!settings) return <div className="loading">Loading...</div>;

  // Get week entries for this date to calculate running total
  const weekStart = getWeekStart(new Date(date + 'T12:00:00'));
  const weekEntries = entries.filter(e => {
    const entryWeekStart = getWeekStart(new Date(e.date + 'T12:00:00'));
    return entryWeekStart.getTime() === weekStart.getTime();
  });
  const weekHoursSoFar = weekEntries.reduce((sum, e) => sum + (e.hoursWorked || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const hours = parseFloat(hoursWorked) || 0;
    if (hours <= 0) { alert('Please enter hours worked'); return; }
    onAdd({ date, hoursWorked: hours, isWeekend, notes });
    setHoursWorked('');
    setNotes('');
  };

  // Quick buttons based on schedule
  const quickButtons = settings.schedule === '4x10' ? [10, 12, 8] : [8, 10, 12];

  // Preview calculation
  const previewHours = parseFloat(hoursWorked) || 0;
  const previewWeekTotal = weekHoursSoFar + previewHours;
  const previewEntry = { date, hoursWorked: previewHours, isWeekend };
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

      <div className="weekend-toggle">
        <label className={`toggle-label ${isWeekend ? 'active' : ''}`}>
          <input type="checkbox" checked={isWeekend} onChange={e => setIsWeekend(e.target.checked)} />
          <span>Weekend (+{settings.weekendDiff}%)</span>
        </label>
      </div>

      <div className="form-group">
        <label>Hours Worked</label>
        <input type="number" step="0.25" value={hoursWorked} onChange={e => setHoursWorked(e.target.value)} placeholder="10" />
        <div className="quick-buttons">
          {quickButtons.map(h => (
            <button key={h} type="button" onClick={() => setHoursWorked(h.toString())} className="quick-btn">{h}h</button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Notes (optional)</label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Day off work, Holiday..." />
      </div>

      {previewHours > 0 && (
        <div className="pay-preview">
          <div className="preview-title">This Entry</div>
          <div className="preview-breakdown">
            <div className="preview-row"><span>Hours:</span><span>{previewHours}h → Week: {previewWeekTotal}h</span></div>
            {previewCalc.regularHours > 0 && <div className="preview-row"><span>Regular ({previewCalc.regularHours}h):</span><span>${previewCalc.regularPay.toFixed(2)}</span></div>}
            {previewCalc.otHours > 0 && <div className="preview-row ot"><span>OT ({previewCalc.otHours}h × {settings.otMultiplier}):</span><span>${previewCalc.otPay.toFixed(2)}</span></div>}
            {previewCalc.dtHours > 0 && <div className="preview-row dt"><span>DT ({previewCalc.dtHours}h × {settings.dtMultiplier}):</span><span>${previewCalc.dtPay.toFixed(2)}</span></div>}
            {isWeekend && <div className="preview-row bonus"><span>Weekend Bonus:</span><span>+${previewCalc.weekendBonus.toFixed(2)}</span></div>}
          </div>
          <div className="preview-total"><span>Week Total:</span><span>${previewCalc.totalPay.toFixed(2)}</span></div>
        </div>
      )}

      <button type="submit" className="add-entry-btn"><Plus size={18} /> Add Entry</button>
    </form>
  );
}

function EditEntryForm({ entry, settings, onSave, onCancel }) {
  const [date, setDate] = useState(entry.date);
  const [hoursWorked, setHoursWorked] = useState(entry.hoursWorked?.toString() || '');
  const [isWeekend, setIsWeekend] = useState(entry.isWeekend || false);
  const [notes, setNotes] = useState(entry.notes || '');

  useEffect(() => {
    const d = new Date(date + 'T12:00:00');
    setIsWeekend(d.getDay() === 0 || d.getDay() === 6);
  }, [date]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const hours = parseFloat(hoursWorked) || 0;
    if (hours <= 0) { alert('Please enter hours worked'); return; }
    onSave({ date, hoursWorked: hours, isWeekend, notes });
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

        <div className="weekend-toggle">
          <label className={`toggle-label ${isWeekend ? 'active' : ''}`}>
            <input type="checkbox" checked={isWeekend} onChange={e => setIsWeekend(e.target.checked)} />
            <span>Weekend (+{settings.weekendDiff}%)</span>
          </label>
        </div>

        <div className="form-group">
          <label>Hours Worked</label>
          <input type="number" step="0.25" value={hoursWorked} onChange={e => setHoursWorked(e.target.value)} placeholder="10" />
          <div className="quick-buttons">
            {quickButtons.map(h => (
              <button key={h} type="button" onClick={() => setHoursWorked(h.toString())} className="quick-btn">{h}h</button>
            ))}
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
        const totalHours = weekEntries.reduce((sum, e) => sum + (e.hoursWorked || 0), 0);
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
                <span className="week-pay">${weekCalc.totalPay.toFixed(2)}</span>
              </div>
            </button>
            {isExpanded && (
              <div className="week-entries">
                <div className="week-breakdown">
                  <span>Reg: {weekCalc.regularHours}h</span>
                  <span>OT: {weekCalc.otHours}h</span>
                  <span>DT: {weekCalc.dtHours}h</span>
                </div>
                {weekEntries.map(entry => {
                  const d = new Date(entry.date + 'T12:00:00');
                  return (
                    <div key={entry.id} className="history-entry">
                      <div className="entry-date">
                        <span className="date-day">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                        <span className="date-num">{d.getDate()}</span>
                        {entry.isWeekend && <span className="weekend-badge">WE</span>}
                      </div>
                      <div className="entry-hours">
                        <span>{entry.hoursWorked}h</span>
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
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisYearStart = new Date(now.getFullYear(), 0, 1);

  const calcPeriod = (startDate, endDate = new Date()) => {
    const periodEntries = entries.filter(e => {
      const d = new Date(e.date + 'T12:00:00');
      return d >= startDate && d <= endDate;
    });
    
    // Group by week for proper OT calculation
    const byWeek = {};
    periodEntries.forEach(e => {
      const ws = getWeekStart(new Date(e.date + 'T12:00:00')).toISOString();
      if (!byWeek[ws]) byWeek[ws] = [];
      byWeek[ws].push(e);
    });
    
    let totalPay = 0, totalHours = 0, otHours = 0, dtHours = 0;
    Object.values(byWeek).forEach(weekEntries => {
      const calc = calculateWeekPay(weekEntries, settings);
      totalPay += calc.totalPay;
      totalHours += calc.regularHours + calc.otHours + calc.dtHours;
      otHours += calc.otHours;
      dtHours += calc.dtHours;
    });
    
    return { totalHours, otHours, dtHours, totalPay, count: periodEntries.length };
  };

  const thisWeek = calcPeriod(thisWeekStart);
  const thisMonth = calcPeriod(thisMonthStart);
  const thisYear = calcPeriod(thisYearStart);

  return (
    <div className="summary-view">
      <div className="summary-card highlight">
        <h4>This Week</h4>
        <div className="summary-stats">
          <div className="stat"><span className="stat-value">{thisWeek.totalHours}</span><span className="stat-label">Total Hrs</span></div>
          <div className="stat"><span className="stat-value">{thisWeek.otHours}</span><span className="stat-label">OT</span></div>
          <div className="stat"><span className="stat-value">{thisWeek.dtHours}</span><span className="stat-label">DT</span></div>
          <div className="stat big"><span className="stat-value">${thisWeek.totalPay.toFixed(2)}</span><span className="stat-label">Pay</span></div>
        </div>
      </div>
      <div className="summary-card">
        <h4>This Month</h4>
        <div className="summary-stats">
          <div className="stat"><span className="stat-value">{thisMonth.totalHours}</span><span className="stat-label">Hours</span></div>
          <div className="stat"><span className="stat-value">{thisMonth.otHours + thisMonth.dtHours}</span><span className="stat-label">OT/DT</span></div>
          <div className="stat big"><span className="stat-value">${thisMonth.totalPay.toFixed(2)}</span><span className="stat-label">Pay</span></div>
        </div>
      </div>
      <div className="summary-card">
        <h4>This Year</h4>
        <div className="summary-stats">
          <div className="stat"><span className="stat-value">{thisYear.totalHours}</span><span className="stat-label">Hours</span></div>
          <div className="stat"><span className="stat-value">{thisYear.otHours + thisYear.dtHours}</span><span className="stat-label">OT/DT</span></div>
          <div className="stat big"><span className="stat-value">${thisYear.totalPay.toFixed(2)}</span><span className="stat-label">Pay</span></div>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function calculateWeekPay(weekEntries, settings) {
  if (!settings || !weekEntries.length) return { regularHours: 0, otHours: 0, dtHours: 0, regularPay: 0, otPay: 0, dtPay: 0, weekendBonus: 0, totalPay: 0 };

  const { baseRate, weekendDiff, otThreshold, dtThreshold, otMultiplier, dtMultiplier } = settings;
  
  // Sort entries by date
  const sorted = [...weekEntries].sort((a, b) => a.date.localeCompare(b.date));
  
  let runningHours = 0;
  let regularHours = 0, otHours = 0, dtHours = 0;
  let regularPay = 0, otPay = 0, dtPay = 0, weekendBonus = 0;

  sorted.forEach(entry => {
    const hours = entry.hoursWorked || 0;
    const weekendMult = entry.isWeekend ? (1 + weekendDiff / 100) : 1;
    const effectiveRate = baseRate * weekendMult;
    
    // Calculate how this entry's hours split between regular/OT/DT
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
    
    const entryRegularPay = entryRegular * effectiveRate;
    const entryOTPay = entryOT * effectiveRate * otMultiplier;
    const entryDTPay = entryDT * effectiveRate * dtMultiplier;
    
    regularPay += entryRegularPay;
    otPay += entryOTPay;
    dtPay += entryDTPay;
    
    if (entry.isWeekend) {
      const basePay = entryRegular * baseRate + entryOT * baseRate * otMultiplier + entryDT * baseRate * dtMultiplier;
      weekendBonus += (entryRegularPay + entryOTPay + entryDTPay) - basePay;
    }
  });

  return {
    regularHours: Math.round(regularHours * 100) / 100,
    otHours: Math.round(otHours * 100) / 100,
    dtHours: Math.round(dtHours * 100) / 100,
    regularPay,
    otPay,
    dtPay,
    weekendBonus,
    totalPay: regularPay + otPay + dtPay
  };
}
