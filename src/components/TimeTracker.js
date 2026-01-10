import { useState, useEffect } from 'react';
import { X, Clock, Settings, Plus, Trash2, Download, AlertTriangle, ChevronRight, ChevronDown, Calendar, DollarSign } from 'lucide-react';
import './TimeTracker.css';

const STORAGE_KEY = 'fidloc_timetracker';

export default function TimeTracker({ userId, onClose }) {
  const [activeTab, setActiveTab] = useState('entry');
  const [settings, setSettings] = useState(null);
  const [entries, setEntries] = useState([]);
  const [showSetup, setShowSetup] = useState(false);

  // Load data from localStorage
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

  // Save to localStorage whenever data changes
  useEffect(() => {
    if (settings !== null || entries.length > 0) {
      localStorage.setItem(STORAGE_KEY + '_' + userId, JSON.stringify({ settings, entries }));
    }
  }, [settings, entries, userId]);

  // Show setup if no settings
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
    const headers = ['Date', 'Regular Hours', 'OT Hours', 'Double Time', 'Weekend', 'Regular Pay', 'OT Pay', 'DT Pay', 'Total Pay', 'Notes'];
    const rows = entries.map(e => {
      const calc = calculatePay(e, settings);
      return [e.date, e.regularHours || 0, e.otHours || 0, e.dtHours || 0, e.isWeekend ? 'Yes' : 'No', calc.regularPay.toFixed(2), calc.otPay.toFixed(2), calc.dtPay.toFixed(2), calc.totalPay.toFixed(2), e.notes || ''];
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
        <div className="storage-warning"><AlertTriangle size={16} /><span>Data stored locally. Clearing browser data will erase your entries.</span></div>
        {showSetup ? (
          <SetupScreen onSave={handleSaveSettings} existingSettings={settings} onCancel={() => settings && setShowSetup(false)} />
        ) : (
          <>
            <div className="tt-tabs">
              <button onClick={() => setActiveTab('entry')} className={`tt-tab ${activeTab === 'entry' ? 'active' : ''}`}><Plus size={16} /> Add</button>
              <button onClick={() => setActiveTab('history')} className={`tt-tab ${activeTab === 'history' ? 'active' : ''}`}><Calendar size={16} /> History</button>
              <button onClick={() => setActiveTab('summary')} className={`tt-tab ${activeTab === 'summary' ? 'active' : ''}`}><DollarSign size={16} /> Summary</button>
              <button onClick={() => setShowSetup(true)} className="tt-tab settings-tab"><Settings size={16} /></button>
            </div>
            <div className="tt-content">
              {activeTab === 'entry' && <EntryForm settings={settings} onAdd={addEntry} />}
              {activeTab === 'history' && <HistoryView entries={entries} settings={settings} onDelete={deleteEntry} />}
              {activeTab === 'summary' && <SummaryView entries={entries} settings={settings} />}
            </div>
            <div className="tt-footer">
              <button onClick={exportToCSV} className="tt-footer-btn"><Download size={16} /> Export</button>
              <button onClick={clearAllData} className="tt-footer-btn danger"><Trash2 size={16} /> Clear All</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SetupScreen({ onSave, existingSettings, onCancel }) {
  const [baseRate, setBaseRate] = useState(existingSettings?.baseRate || '');
  const [weekendDiff, setWeekendDiff] = useState(existingSettings?.weekendDiff || '10');
  const [otMultiplier, setOtMultiplier] = useState(existingSettings?.otMultiplier || '1.5');
  const [dtMultiplier, setDtMultiplier] = useState(existingSettings?.dtMultiplier || '2.0');
  const [trackingMode, setTrackingMode] = useState(existingSettings?.trackingMode || 'all');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!baseRate || parseFloat(baseRate) <= 0) { alert('Please enter a valid base hourly rate'); return; }
    onSave({ baseRate: parseFloat(baseRate), weekendDiff: parseFloat(weekendDiff) || 0, otMultiplier: parseFloat(otMultiplier) || 1.5, dtMultiplier: parseFloat(dtMultiplier) || 2.0, trackingMode });
  };

  return (
    <div className="tt-setup">
      <h3>{existingSettings ? 'Edit Settings' : 'Setup Your Pay Rates'}</h3>
      <p className="setup-hint">Enter your pay info. You can change this later.</p>
      <form onSubmit={handleSubmit} className="setup-form">
        <div className="setup-section">
          <h4>What do you want to track?</h4>
          <div className="tracking-options">
            <label className={`tracking-option ${trackingMode === 'all' ? 'selected' : ''}`}>
              <input type="radio" name="tracking" value="all" checked={trackingMode === 'all'} onChange={() => setTrackingMode('all')} />
              <span className="option-title">All Hours</span>
              <span className="option-desc">Regular + OT + Double Time</span>
            </label>
            <label className={`tracking-option ${trackingMode === 'ot' ? 'selected' : ''}`}>
              <input type="radio" name="tracking" value="ot" checked={trackingMode === 'ot'} onChange={() => setTrackingMode('ot')} />
              <span className="option-title">Overtime Only</span>
              <span className="option-desc">Just OT + Double Time</span>
            </label>
          </div>
        </div>
        <div className="setup-section">
          <h4>Pay Rates</h4>
          <div className="form-row">
            <div className="form-group"><label>Base Hourly Rate *</label><div className="input-with-prefix"><span>$</span><input type="number" step="0.01" value={baseRate} onChange={e => setBaseRate(e.target.value)} placeholder="38.18" required /></div></div>
            <div className="form-group"><label>Weekend Diff %</label><div className="input-with-suffix"><input type="number" step="0.1" value={weekendDiff} onChange={e => setWeekendDiff(e.target.value)} placeholder="10" /><span>%</span></div></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>OT Multiplier</label><div className="input-with-suffix"><input type="number" step="0.1" value={otMultiplier} onChange={e => setOtMultiplier(e.target.value)} placeholder="1.5" /><span>x</span></div></div>
            <div className="form-group"><label>Double Time</label><div className="input-with-suffix"><input type="number" step="0.1" value={dtMultiplier} onChange={e => setDtMultiplier(e.target.value)} placeholder="2.0" /><span>x</span></div></div>
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

function EntryForm({ settings, onAdd }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [regularHours, setRegularHours] = useState('');
  const [otHours, setOtHours] = useState('');
  const [dtHours, setDtHours] = useState('');
  const [isWeekend, setIsWeekend] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const d = new Date(date + 'T12:00:00');
    setIsWeekend(d.getDay() === 0 || d.getDay() === 6);
  }, [date]);

  if (!settings) return <div className="loading">Loading...</div>;

  const handleSubmit = (e) => {
    e.preventDefault();
    const reg = parseFloat(regularHours) || 0;
    const ot = parseFloat(otHours) || 0;
    const dt = parseFloat(dtHours) || 0;
    if (reg === 0 && ot === 0 && dt === 0) { alert('Please enter at least some hours'); return; }
    onAdd({ date, regularHours: settings.trackingMode === 'ot' ? 0 : reg, otHours: ot, dtHours: dt, isWeekend, notes });
    setRegularHours(''); setOtHours(''); setDtHours(''); setNotes('');
    alert('Entry added!');
  };

  const previewCalc = calculatePay({ regularHours: settings.trackingMode === 'ot' ? 0 : (parseFloat(regularHours) || 0), otHours: parseFloat(otHours) || 0, dtHours: parseFloat(dtHours) || 0, isWeekend }, settings);

  return (
    <form onSubmit={handleSubmit} className="entry-form">
      <div className="form-group"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
      <div className="weekend-toggle"><label className={`toggle-label ${isWeekend ? 'active' : ''}`}><input type="checkbox" checked={isWeekend} onChange={e => setIsWeekend(e.target.checked)} /><span>Weekend (+{settings.weekendDiff}%)</span></label></div>
      {settings.trackingMode === 'all' && <div className="form-group"><label>Regular Hours</label><input type="number" step="0.25" value={regularHours} onChange={e => setRegularHours(e.target.value)} placeholder="8" /></div>}
      <div className="form-row">
        <div className="form-group"><label>OT Hours ({settings.otMultiplier}x)</label><input type="number" step="0.25" value={otHours} onChange={e => setOtHours(e.target.value)} placeholder="0" /></div>
        <div className="form-group"><label>Double Time ({settings.dtMultiplier}x)</label><input type="number" step="0.25" value={dtHours} onChange={e => setDtHours(e.target.value)} placeholder="0" /></div>
      </div>
      <div className="form-group"><label>Notes (optional)</label><input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Snow day, Holiday..." /></div>
      <div className="pay-preview">
        <div className="preview-title">Estimated Pay</div>
        <div className="preview-breakdown">
          {settings.trackingMode === 'all' && previewCalc.regularPay > 0 && <div className="preview-row"><span>Regular:</span><span>${previewCalc.regularPay.toFixed(2)}</span></div>}
          {previewCalc.otPay > 0 && <div className="preview-row"><span>OT:</span><span>${previewCalc.otPay.toFixed(2)}</span></div>}
          {previewCalc.dtPay > 0 && <div className="preview-row"><span>DT:</span><span>${previewCalc.dtPay.toFixed(2)}</span></div>}
          {isWeekend && previewCalc.weekendBonus > 0 && <div className="preview-row bonus"><span>Weekend Bonus:</span><span>+${previewCalc.weekendBonus.toFixed(2)}</span></div>}
        </div>
        <div className="preview-total"><span>Total:</span><span>${previewCalc.totalPay.toFixed(2)}</span></div>
      </div>
      <button type="submit" className="add-entry-btn"><Plus size={18} /> Add Entry</button>
    </form>
  );
}

function HistoryView({ entries, settings, onDelete }) {
  const [expandedWeek, setExpandedWeek] = useState(null);
  
  if (!settings) return <div className="loading">Loading...</div>;
  if (entries.length === 0) return <div className="empty-history"><Calendar size={48} /><p>No entries yet</p></div>;

  const groupedByWeek = entries.reduce((acc, entry) => {
    const d = new Date(entry.date + 'T12:00:00');
    const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    if (!acc[weekKey]) acc[weekKey] = [];
    acc[weekKey].push(entry);
    return acc;
  }, {});

  return (
    <div className="history-view">
      {Object.keys(groupedByWeek).sort((a, b) => b.localeCompare(a)).map(weekKey => {
        const weekEntries = groupedByWeek[weekKey].sort((a, b) => b.date.localeCompare(a.date));
        const weekStart = new Date(weekKey + 'T12:00:00');
        const weekTotal = weekEntries.reduce((sum, e) => sum + calculatePay(e, settings).totalPay, 0);
        const totalHours = weekEntries.reduce((sum, e) => sum + (e.regularHours || 0) + (e.otHours || 0) + (e.dtHours || 0), 0);
        const isExpanded = expandedWeek === weekKey;

        return (
          <div key={weekKey} className="week-group">
            <button className="week-header" onClick={() => setExpandedWeek(isExpanded ? null : weekKey)}>
              <div className="week-title">{isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}<span>Week of {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div>
              <div className="week-summary"><span className="week-hours">{totalHours}h</span><span className="week-pay">${weekTotal.toFixed(2)}</span></div>
            </button>
            {isExpanded && <div className="week-entries">{weekEntries.map(entry => {
              const calc = calculatePay(entry, settings);
              const d = new Date(entry.date + 'T12:00:00');
              return (
                <div key={entry.id} className="history-entry">
                  <div className="entry-date"><span className="date-day">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span><span className="date-num">{d.getDate()}</span>{entry.isWeekend && <span className="weekend-badge">WE</span>}</div>
                  <div className="entry-hours">{entry.regularHours > 0 && <span>{entry.regularHours}h</span>}{entry.otHours > 0 && <span className="ot">{entry.otHours}h OT</span>}{entry.dtHours > 0 && <span className="dt">{entry.dtHours}h DT</span>}</div>
                  <div className="entry-pay">${calc.totalPay.toFixed(2)}</div>
                  <button onClick={() => onDelete(entry.id)} className="delete-entry-btn"><Trash2 size={16} /></button>
                </div>
              );
            })}</div>}
          </div>
        );
      })}
    </div>
  );
}

function SummaryView({ entries, settings }) {
  if (!settings) return <div className="loading">Loading...</div>;
  const now = new Date();
  const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - now.getDay()); thisWeekStart.setHours(0, 0, 0, 0);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisYearStart = new Date(now.getFullYear(), 0, 1);

  const calcPeriod = (startDate) => {
    const periodEntries = entries.filter(e => new Date(e.date + 'T12:00:00') >= startDate);
    return {
      totalHours: periodEntries.reduce((sum, e) => sum + (e.regularHours || 0) + (e.otHours || 0) + (e.dtHours || 0), 0),
      otHours: periodEntries.reduce((sum, e) => sum + (e.otHours || 0) + (e.dtHours || 0), 0),
      totalPay: periodEntries.reduce((sum, e) => sum + calculatePay(e, settings).totalPay, 0),
      count: periodEntries.length
    };
  };

  const thisWeek = calcPeriod(thisWeekStart);
  const thisMonth = calcPeriod(thisMonthStart);
  const thisYear = calcPeriod(thisYearStart);

  return (
    <div className="summary-view">
      <div className="summary-card"><h4>This Week</h4><div className="summary-stats"><div className="stat"><span className="stat-value">{thisWeek.totalHours}</span><span className="stat-label">Hours</span></div><div className="stat"><span className="stat-value">{thisWeek.otHours}</span><span className="stat-label">OT/DT</span></div><div className="stat highlight"><span className="stat-value">${thisWeek.totalPay.toFixed(2)}</span><span className="stat-label">Pay</span></div></div></div>
      <div className="summary-card"><h4>This Month</h4><div className="summary-stats"><div className="stat"><span className="stat-value">{thisMonth.totalHours}</span><span className="stat-label">Hours</span></div><div className="stat"><span className="stat-value">{thisMonth.otHours}</span><span className="stat-label">OT/DT</span></div><div className="stat highlight"><span className="stat-value">${thisMonth.totalPay.toFixed(2)}</span><span className="stat-label">Pay</span></div></div></div>
      <div className="summary-card"><h4>This Year</h4><div className="summary-stats"><div className="stat"><span className="stat-value">{thisYear.totalHours}</span><span className="stat-label">Hours</span></div><div className="stat"><span className="stat-value">{thisYear.otHours}</span><span className="stat-label">OT/DT</span></div><div className="stat highlight"><span className="stat-value">${thisYear.totalPay.toFixed(2)}</span><span className="stat-label">Pay</span></div></div></div>
    </div>
  );
}

function calculatePay(entry, settings) {
  if (!settings) return { regularPay: 0, otPay: 0, dtPay: 0, weekendBonus: 0, totalPay: 0 };
  const baseRate = settings.baseRate;
  const weekendMultiplier = entry.isWeekend ? (1 + settings.weekendDiff / 100) : 1;
  const effectiveRate = baseRate * weekendMultiplier;
  const regularPay = (entry.regularHours || 0) * effectiveRate;
  const otPay = (entry.otHours || 0) * effectiveRate * settings.otMultiplier;
  const dtPay = (entry.dtHours || 0) * effectiveRate * settings.dtMultiplier;
  const basePay = (entry.regularHours || 0) * baseRate + (entry.otHours || 0) * baseRate * settings.otMultiplier + (entry.dtHours || 0) * baseRate * settings.dtMultiplier;
  const weekendBonus = entry.isWeekend ? (regularPay + otPay + dtPay) - basePay : 0;
  return { regularPay, otPay, dtPay, weekendBonus, totalPay: regularPay + otPay + dtPay };
}
