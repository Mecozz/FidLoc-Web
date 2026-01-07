import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { MapPin, LogOut, Navigation, Copy, Search } from 'lucide-react';
import './Dashboard.css';

const LOCATION_TYPES = {
  hub: { label: 'Hub', color: '#3b82f6' },
  garage: { label: 'Garage', color: '#22c55e' },
  hut: { label: 'Hut', color: '#f97316' },
  co: { label: 'CO', color: '#a855f7' }
};

export default function Dashboard() {
  const { user, userOrg, userRole, logout } = useAuth();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userOrg) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'organizations', userOrg, 'locations'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const locs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLocations(locs);
      setLoading(false);
    }, (error) => {
      console.error('Error loading locations:', error);
      setLoading(false);
    });

    return unsubscribe;
  }, [userOrg]);

  const filteredLocations = locations.filter(loc => {
    const matchesSearch = !searchText || 
      loc.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      loc.address?.toLowerCase().includes(searchText.toLowerCase());
    const matchesType = !filterType || loc.locationType === filterType;
    return matchesSearch && matchesType;
  });

  const handleNavigate = (location) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
    window.open(url, '_blank');
  };

  const handleCopyAddress = (address) => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!userOrg) {
    return (
      <div className="no-org-container">
        <h2>No Organization</h2>
        <p>You're not part of an organization yet.</p>
        <p className="hint">Ask your team admin to send you an invite, then accept it in the iOS app.</p>
        <button onClick={logout} className="signout-button">Sign Out</button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <div className="header-icon">
              <MapPin size={20} color="white" />
            </div>
            <div>
              <h1>FidLoc</h1>
              <span className="role-badge">{userRole}</span>
            </div>
          </div>
          <button onClick={logout} className="logout-button">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Search & Filter */}
      <div className="search-section">
        <div className="search-box">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search locations..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        <div className="filter-pills">
          <button
            onClick={() => setFilterType(null)}
            className={`filter-pill ${!filterType ? 'active' : ''}`}
          >
            All ({locations.length})
          </button>
          {Object.entries(LOCATION_TYPES).map(([type, config]) => {
            const count = locations.filter(l => l.locationType === type).length;
            return (
              <button
                key={type}
                onClick={() => setFilterType(filterType === type ? null : type)}
                className={`filter-pill ${filterType === type ? 'active' : ''}`}
                style={filterType === type ? { background: config.color } : {}}
              >
                {config.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Locations List */}
      <div className="locations-list">
        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Loading locations...</p>
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="empty-state">
            <MapPin size={48} color="#4b5563" />
            <p>No locations found</p>
          </div>
        ) : (
          filteredLocations.map(location => (
            <LocationCard
              key={location.id}
              location={location}
              onNavigate={handleNavigate}
              onCopyAddress={handleCopyAddress}
              isSelected={selectedLocation?.id === location.id}
              onSelect={() => setSelectedLocation(
                selectedLocation?.id === location.id ? null : location
              )}
              copied={copied}
            />
          ))
        )}
      </div>
    </div>
  );
}

function LocationCard({ location, onNavigate, onCopyAddress, isSelected, onSelect, copied }) {
  const typeConfig = LOCATION_TYPES[location.locationType] || LOCATION_TYPES.hub;

  return (
    <div className={`location-card ${isSelected ? 'selected' : ''}`}>
      <button onClick={onSelect} className="location-card-main">
        <div className="location-icon" style={{ background: `${typeConfig.color}20` }}>
          <MapPin size={24} color={typeConfig.color} />
        </div>
        <div className="location-info">
          <div className="location-name">
            <span>{location.name}</span>
            {location.requiresLadder && <span className="ladder-icon">🪜</span>}
          </div>
          <p className="location-address">{location.address}</p>
          <div className="location-badges">
            <span className="type-badge" style={{ background: `${typeConfig.color}20`, color: typeConfig.color }}>
              {typeConfig.label}
            </span>
            {location.hasLadderBracket && (
              <span className="bracket-badge">Has Bracket</span>
            )}
          </div>
        </div>
      </button>

      {isSelected && (
        <div className="location-details">
          {location.notes && <p className="location-notes">{location.notes}</p>}
          <div className="location-coords">
            {location.latitude?.toFixed(6)}, {location.longitude?.toFixed(6)}
          </div>
          <div className="location-actions">
            <button onClick={() => onNavigate(location)} className="navigate-button">
              <Navigation size={18} />
              Navigate
            </button>
            <button onClick={() => onCopyAddress(location.address)} className="copy-button">
              <Copy size={18} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
