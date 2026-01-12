import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import './SplitterManager.css';

const SPLITTER_TYPES = ['XGS-PON', 'G-PON', 'B-PON', 'Unknown'];
const SPLITTER_LETTERS = 'ABCDEFGHIJKLMNOP'.split('');

export function SplitterManager({ splitters = [], onUpdate, readOnly = false }) {
  const [expanded, setExpanded] = useState(false);
  const [newLetter, setNewLetter] = useState('');
  const [newType, setNewType] = useState('XGS-PON');
  const [newSerial, setNewSerial] = useState('');

  const usedLetters = splitters.map(s => s.letter);
  const availableLetters = SPLITTER_LETTERS.filter(l => !usedLetters.includes(l));

  const addSplitter = () => {
    if (!newLetter || !newSerial || newSerial.length !== 4) return;
    const updated = [...splitters, {
      letter: newLetter,
      type: newType,
      serial: newSerial.toUpperCase()
    }].sort((a, b) => a.letter.localeCompare(b.letter));
    onUpdate(updated);
    setNewLetter('');
    setNewSerial('');
  };

  const removeSplitter = (letter) => {
    onUpdate(splitters.filter(s => s.letter !== letter));
  };

  const updateSplitter = (letter, field, value) => {
    const updated = splitters.map(s => 
      s.letter === letter ? { ...s, [field]: value } : s
    );
    onUpdate(updated);
  };

  if (readOnly) {
    if (!splitters || splitters.length === 0) return null;
    return (
      <div className="splitter-display">
        <button className="splitter-toggle" onClick={() => setExpanded(!expanded)}>
          <span>📡 Splitters ({splitters.length})</span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {expanded && (
          <div className="splitter-list readonly">
            {splitters.map(s => (
              <div key={s.letter} className="splitter-item">
                <span className="splitter-letter">{s.letter}</span>
                <span className={`splitter-type ${s.type.toLowerCase().replace('-', '')}`}>{s.type}</span>
                <span className="splitter-serial">{s.serial}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="splitter-manager">
      <div className="splitter-header">
        <label>📡 Splitters</label>
        <span className="splitter-count">{splitters.length} added</span>
      </div>
      
      {splitters.length > 0 && (
        <div className="splitter-list">
          {splitters.map(s => (
            <div key={s.letter} className="splitter-item editable">
              <span className="splitter-letter">{s.letter}</span>
              <select 
                value={s.type} 
                onChange={e => updateSplitter(s.letter, 'type', e.target.value)}
                className="splitter-type-select"
              >
                {SPLITTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                type="text"
                value={s.serial}
                onChange={e => updateSplitter(s.letter, 'serial', e.target.value.toUpperCase().slice(0, 4))}
                className="splitter-serial-input"
                maxLength={4}
              />
              <button onClick={() => removeSplitter(s.letter)} className="splitter-remove">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {availableLetters.length > 0 && (
        <div className="splitter-add">
          <select 
            value={newLetter} 
            onChange={e => setNewLetter(e.target.value)}
            className="splitter-letter-select"
          >
            <option value="">Letter</option>
            {availableLetters.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select 
            value={newType} 
            onChange={e => setNewType(e.target.value)}
            className="splitter-type-select"
          >
            {SPLITTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="text"
            value={newSerial}
            onChange={e => setNewSerial(e.target.value.toUpperCase())}
            placeholder="Last 4"
            className="splitter-serial-input"
            maxLength={4}
          />
          <button 
            onClick={addSplitter} 
            disabled={!newLetter || newSerial.length !== 4}
            className="splitter-add-btn"
          >
            <Plus size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
