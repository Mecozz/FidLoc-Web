import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, onSnapshot, query, addDoc, Timestamp } from 'firebase/firestore';
import { MapPin, LogOut, Navigation, Copy, Search, Plus, X } from 'lucide-react';
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  // Get user's location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.log('Location access denied or unavailable');
        }
      );
    }
  }, []);

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

  // Calculate distance between two points
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const getDistanceText = (location) => {
    if (!userLocation || !location.latitude || !location.longitude) return null;
    const dist = calculateDistance(
      userLocation.lat, userLocation.lng,
      location.latitude, location.longitude
    );
    if (dist < 0.1) return '< 0.1 mi';
    if (dist < 10) return `${dist.toFixed(1)} mi`;
    return `${Math.round(dist)} mi`;
  };

  const filteredLocations = locations
    .filter(loc => {
      const matchesSearch = !searchText || 
        loc.name?.toLowerCase().includes(searchText.toLowerCase()) ||
        loc.address?.toLowerCase().includes(searchText.toLowerCase());
      const matchesType = !filterType || loc.locationType === filterType;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      // Sort by distance if we have user location
      if (userLocation) {
        const distA = calculateDistance(userLocation.lat, userLocation.lng, a.latitude, a.longitude);
        const distB = calculateDistance(userLocation.lat, userLocation.lng, b.latitude, b.longitude);
        return distA - distB;
      }
      return a.name?.localeCompare(b.name);
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

  const canAddLocations = userRole === 'owner' || userRole === 'admin' || userRole === 'contributor';

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
          <div className="header-right">
            {canAddLocations && (
              <button onClick={() => setShowAddModal(true)} className="add-button">
                <Plus size={20} />
              </button>
            )}
            <button onClick={logout} className="logout-button">
              <LogOut size={20} />
            </button>
          </div>
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
              distance={getDistanceText(location)}
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

      {/* Add Location Modal */}
      {showAddModal && (
        <AddLocationModal
          userOrg={userOrg}
          userEmail={user?.email}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

function LocationCard({ location, distance, onNavigate, onCopyAddress, isSelected, onSelect, copied }) {
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
        {distance && (
          <div className="location-distance">
            {distance}
          </div>
        )}
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

function AddLocationModal({ userOrg, userEmail, onClose }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [locationType, setLocationType] = useState('hub');
  const [notes, setNotes] = useState('');
  const [requiresLadder, setRequiresLadder] = useState(false);
  const [hasLadderBracket, setHasLadderBracket] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [coords, setCoords] = useState({ lat: '', lng: '' });
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [manualCoordsInput, setManualCoordsInput] = useState('');

  const parseManualCoords = () => {
    // Parse various formats: "42.123, -71.456" or "42.123 -71.456" or from Apple Maps
    const input = manualCoordsInput.trim();
    const match = input.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setCoords({ lat, lng });
        setUseCurrentLocation(true);
        setShowManualCoords(false);
        setManualCoordsInput('');
        return;
      }
    }
    setError('Invalid coordinates. Use format: 42.9876, -71.4567');
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported on this device.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    };
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setCoords({ lat, lng });
        setUseCurrentLocation(true);
        
        // Use free OpenStreetMap reverse geocoding
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { 'User-Agent': 'FidLoc/1.0' } }
          );
          const data = await response.json();
          if (data.display_name) {
            // Shorten the address a bit
            const parts = data.display_name.split(', ');
            const shortAddress = parts.slice(0, 4).join(', ');
            setAddress(shortAddress);
          }
        } catch (err) {
          console.log('Could not get address, using coords');
          setAddress(`Near ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
        setLoading(false);
      },
      (error) => {
        console.log('Geolocation error:', error.code, error.message);
        let errorMsg = 'Could not get location. ';
        if (error.code === 1) {
          errorMsg = 'Location access denied. Go to Settings > Safari > Location and allow for this site, then reload.';
        } else if (error.code === 2) {
          errorMsg = 'Location unavailable. Make sure Location Services is enabled in Settings.';
        } else if (error.code === 3) {
          errorMsg = 'Location request timed out. Try again.';
        }
        setError(errorMsg);
        setLoading(false);
      },
      options
    );
  };

  const geocodeAddress = async (addr) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=AIzaSyDt1X0uhHu-wUC0L51T-AS77ymlusiYh7I`
      );
      const data = await response.json();
      if (data.results && data.results[0]) {
        const loc = data.results[0].geometry.location;
        return { lat: loc.lat, lng: loc.lng };
      }
    } catch (err) {
      console.error('Geocoding error:', err);
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let finalCoords = coords;
      
      // If not using current location, geocode the address
      if (!useCurrentLocation || !coords.lat) {
        const geocoded = await geocodeAddress(address);
        if (geocoded) {
          finalCoords = geocoded;
        } else {
          setError('Could not find coordinates for that address. Please check and try again.');
          setLoading(false);
          return;
        }
      }

      // Add to Firestore
      await addDoc(collection(db, 'organizations', userOrg, 'locations'), {
        name,
        address,
        latitude: finalCoords.lat,
        longitude: finalCoords.lng,
        locationType,
        notes,
        requiresLadder: locationType === 'hub' ? requiresLadder : false,
        hasLadderBracket: locationType === 'hub' ? hasLadderBracket : false,
        createdBy: userEmail || 'Web User',
        createdAt: Timestamp.now(),
        lastModified: Timestamp.now()
      });

      onClose();
    } catch (err) {
      setError('Failed to add location. Please try again.');
      console.error(err);
    }

    setLoading(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Add Location</h2>
          <button onClick={onClose} className="close-button">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Hub - Elm St"
              required
            />
          </div>

          <div className="form-group">
            <label>Location Type *</label>
            <select value={locationType} onChange={(e) => setLocationType(e.target.value)}>
              {Object.entries(LOCATION_TYPES).map(([type, config]) => (
                <option key={type} value={type}>{config.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Address *</label>
            <input
              type="text"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setUseCurrentLocation(false); }}
              placeholder="123 Main St, City, State"
              required
            />
            <div className="location-buttons">
              <button type="button" onClick={getCurrentLocation} className="location-btn" disabled={loading}>
                📍 Use GPS
              </button>
              <button type="button" onClick={() => setShowManualCoords(!showManualCoords)} className="location-btn">
                ✏️ Enter Coords
              </button>
            </div>
            {showManualCoords && (
              <div className="manual-coords">
                <input
                  type="text"
                  value={manualCoordsInput}
                  onChange={(e) => setManualCoordsInput(e.target.value)}
                  placeholder="Paste coords: 42.9876, -71.4567"
                />
                <button type="button" onClick={parseManualCoords} className="parse-btn">
                  Set
                </button>
              </div>
            )}
            {useCurrentLocation && coords.lat && (
              <div className="coords-captured">
                ✅ GPS: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </div>
            )}
          </div>

          {locationType === 'hub' && (
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={requiresLadder}
                  onChange={(e) => setRequiresLadder(e.target.checked)}
                />
                🪜 Requires Ladder
              </label>
              {requiresLadder && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasLadderBracket}
                    onChange={(e) => setHasLadderBracket(e.target.checked)}
                  />
                  Has Ladder Bracket
                </label>
              )}
            </div>
          )}

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this location..."
              rows={3}
            />
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? 'Adding...' : 'Add Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
