import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, Timestamp, orderBy, limit, setDoc } from 'firebase/firestore';
import { MapPin, LogOut, Navigation, Copy, Search, Plus, X, Share2, List, Map as MapIcon, Wifi, WifiOff, RefreshCw, Edit2, Trash2, History, RotateCcw, Trash, Sun, Moon, Monitor, ExternalLink, Users, Settings, ChevronRight, Mail, UserPlus, Shield, UserMinus, Crown, Package, Building } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import offlineQueue from '../OfflineQueueManager';
import themeManager from '../ThemeManager';
import './Dashboard.css';

const LOCATION_TYPES = { Hub: { label: 'Hub', color: '#3b82f6' }, Garage: { label: 'Garage', color: '#22c55e' }, Hut: { label: 'Hut', color: '#f97316' }, CO: { label: 'CO', color: '#a855f7' } };

const createColoredIcon = (color, isPending = false) => {
  const strokeColor = isPending ? '#f97316' : '#1f2937';
  const strokeWidth = isPending ? 2 : 1;
  return L.divIcon({ html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="' + color + '" stroke="' + strokeColor + '" stroke-width="' + strokeWidth + '" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle fill="white" cx="12" cy="9" r="3"/></svg>', className: 'custom-marker', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] });
};

const markerIcons = { Hub: createColoredIcon('#3b82f6'), Garage: createColoredIcon('#22c55e'), Hut: createColoredIcon('#f97316'), CO: createColoredIcon('#a855f7') };
const pendingMarkerIcons = { Hub: createColoredIcon('#3b82f6', true), Garage: createColoredIcon('#22c55e', true), Hut: createColoredIcon('#f97316', true), CO: createColoredIcon('#a855f7', true) };
const normalizeType = (type) => { if (!type) return 'Hub'; const lower = type.toLowerCase(); return lower === 'hub' ? 'Hub' : lower === 'garage' ? 'Garage' : lower === 'hut' ? 'Hut' : lower === 'co' ? 'CO' : 'Hub'; };
const FILTER_TYPES = ['Hub', 'Garage', 'Hut', 'CO'];
const calculateDistance = (lat1, lon1, lat2, lon2) => { const R = 3959; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180; const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2); return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); };
const userLocationIcon = L.divIcon({ html: '<div style="width: 16px; height: 16px; background: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>', className: 'user-marker', iconSize: [16, 16], iconAnchor: [8, 8] });
const logActivity = async (userOrg, action, locationName, userEmail, changes = null) => { try { await addDoc(collection(db, 'organizations', userOrg, 'activityLog'), { action, locationName, userEmail, changes, timestamp: Timestamp.now() }); } catch (err) { console.error('Failed to log activity:', err); } };

export default function Dashboard() {
  const { user, userOrg, userRole, logout } = useAuth();
  const { locationId } = useParams();
  const [locations, setLocations] = useState([]);
  const [pendingLocations, setPendingLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showTeamMembers, setShowTeamMembers] = useState(false);
  const [showEquipmentOrders, setShowEquipmentOrders] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState(themeManager.getTheme());
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const canEdit = userRole === 'owner' || userRole === 'admin' || userRole === 'contributor';
  const canDelete = userRole === 'owner' || userRole === 'admin';
  const canViewActivityLog = userRole === 'owner' || userRole === 'admin';
  const canAddLocations = userRole === 'owner' || userRole === 'admin' || userRole === 'contributor';
  const setThemeMode = (mode) => { themeManager.setTheme(mode); setTheme(mode); };

  useEffect(() => { const handleOnline = () => { setIsOnline(true); handleManualSync(); }; const handleOffline = () => setIsOnline(false); window.addEventListener('online', handleOnline); window.addEventListener('offline', handleOffline); return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); }; }, []);
  useEffect(() => { const loadPending = async () => setPendingLocations(await offlineQueue.getPendingLocations()); loadPending(); return offlineQueue.subscribe(setPendingLocations); }, []);
  useEffect(() => { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition((pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => {}); } }, []);
  useEffect(() => { if (!userOrg) { setLoading(false); return; } const q = query(collection(db, 'organizations', userOrg, 'locations')); return onSnapshot(q, (snap) => { const locs = snap.docs.map(d => ({ id: d.id, ...d.data() })); setLocations(locs); setLoading(false); if (locationId) { const found = locs.find(l => l.id === locationId); if (found) setSelectedLocation(found); } }, () => setLoading(false)); }, [userOrg, locationId]);

  const handleManualSync = async () => { if (!isOnline || syncing) return; setSyncing(true); try { await offlineQueue.syncQueue(); } catch {} setSyncing(false); };
  const handleEdit = (loc) => { setEditingLocation(loc); setShowEditModal(true); };
  const handleDelete = async (loc) => { if (!canDelete) return; try { const trashData = { ...loc, deletedBy: user?.email, deletedAt: Timestamp.now(), originalId: loc.id }; delete trashData.id; await setDoc(doc(db, 'organizations', userOrg, 'trash', loc.id), trashData); await deleteDoc(doc(db, 'organizations', userOrg, 'locations', loc.id)); await logActivity(userOrg, 'deleted', loc.name, user?.email, { deletedLocation: { name: loc.name, address: loc.address, locationType: loc.locationType } }); setDeleteConfirm(null); setSelectedLocation(null); } catch (err) { console.error('Delete failed:', err); } };
  const getDistanceText = (loc) => { if (!userLocation || !loc.latitude || !loc.longitude) return null; const dist = calculateDistance(userLocation.lat, userLocation.lng, loc.latitude, loc.longitude); return dist < 0.1 ? '< 0.1 mi' : dist < 10 ? dist.toFixed(1) + ' mi' : Math.round(dist) + ' mi'; };
  const allLocations = [...locations, ...pendingLocations.map(p => ({ ...p, isPending: true, id: p.pendingId }))];
  const filteredLocations = allLocations.filter(loc => (!searchText || loc.name?.toLowerCase().includes(searchText.toLowerCase()) || loc.address?.toLowerCase().includes(searchText.toLowerCase())) && (!filterType || normalizeType(loc.locationType) === filterType)).sort((a, b) => { if (a.isPending && !b.isPending) return -1; if (!a.isPending && b.isPending) return 1; if (userLocation) return calculateDistance(userLocation.lat, userLocation.lng, a.latitude, a.longitude) - calculateDistance(userLocation.lat, userLocation.lng, b.latitude, b.longitude); return (a.name || '').localeCompare(b.name || ''); });
  const handleNavigate = (loc) => window.open('https://www.google.com/maps/dir/?api=1&destination=' + loc.latitude + ',' + loc.longitude, '_blank');
  const handleCopyAddress = (addr) => { navigator.clipboard.writeText(addr); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const handleShareLocation = (loc) => { if (loc.isPending) return; navigator.clipboard.writeText(window.location.origin + '/location/' + loc.id); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); };
  const getMapCenter = () => { if (userLocation) return [userLocation.lat, userLocation.lng]; if (filteredLocations.length > 0) return [filteredLocations.reduce((s, l) => s + (l.latitude || 0), 0) / filteredLocations.length, filteredLocations.reduce((s, l) => s + (l.longitude || 0), 0) / filteredLocations.length]; return [43.1939, -71.5724]; };
  const openExternalLink = (url) => { window.open(url, '_blank'); setShowMenu(false); };

  if (!userOrg) return (<div className="no-org-container"><h2>No Organization</h2><p>You are not part of an organization yet.</p><p className="hint">Ask your team admin to send you an invite.</p><button onClick={logout} className="signout-button">Sign Out</button></div>);

  return (
    <div className="dashboard">
      <div className={`menu-overlay ${showMenu ? 'open' : ''}`} onClick={() => setShowMenu(false)}></div>
      <div className={`side-menu ${showMenu ? 'open' : ''}`}>
        <div className="menu-header"><div className="menu-logo"><MapPin size={24} color="white" /><span>FidLoc</span></div><button onClick={() => setShowMenu(false)} className="menu-close"><X size={24} /></button></div>
        <div className="menu-user"><div className="menu-user-email">{user?.email}</div><div className="menu-user-role">{userRole}</div></div>
        <div className="menu-section"><div className="menu-section-title">Appearance</div><div className="theme-selector"><button onClick={() => setThemeMode('light')} className={`theme-option ${theme === 'light' ? 'active' : ''}`}><Sun size={18} /><span>Light</span></button><button onClick={() => setThemeMode('dark')} className={`theme-option ${theme === 'dark' ? 'active' : ''}`}><Moon size={18} /><span>Dark</span></button><button onClick={() => setThemeMode('system')} className={`theme-option ${theme === 'system' ? 'active' : ''}`}><Monitor size={18} /><span>Auto</span></button></div></div>
        {canViewActivityLog && (<div className="menu-section"><div className="menu-section-title">Administration</div><button onClick={() => { setShowActivityLog(true); setShowMenu(false); }} className="menu-item"><History size={20} /><span>Activity Log</span><ChevronRight size={18} /></button>{userRole === 'owner' && (<button onClick={() => { setShowTrash(true); setShowMenu(false); }} className="menu-item"><Trash size={20} /><span>Trash</span><ChevronRight size={18} /></button>)}<button onClick={() => { setShowTeamMembers(true); setShowMenu(false); }} className="menu-item"><Users size={20} /><span>Team Members</span><ChevronRight size={18} /></button></div>)}
        <div className="menu-section"><div className="menu-section-title">Quick Links</div><button onClick={() => { setShowEquipmentOrders(true); setShowMenu(false); }} className="menu-item"><Package size={20} /><span>Equipment Orders</span><ChevronRight size={18} /></button><button onClick={() => openExternalLink('https://consolidated.com')} className="menu-item"><ExternalLink size={20} /><span>Consolidated Website</span><ChevronRight size={18} /></button><button onClick={() => {}} className="menu-item disabled"><Settings size={20} /><span>Settings</span><span className="coming-soon">Soon</span></button></div>
        <div className="menu-footer"><button onClick={logout} className="menu-logout"><LogOut size={20} /><span>Sign Out</span></button><div className="menu-version">FidLoc v1.0</div></div>
      </div>

      <header className="header"><div className="header-content"><div className="header-left"><button onClick={() => setShowMenu(true)} className="menu-button"><div className="header-icon"><MapPin size={20} color="white" /></div></button><div><h1>FidLoc</h1><span className="role-badge">{userRole}</span></div></div><div className="header-right"><div className={'status-indicator ' + (isOnline ? 'online' : 'offline')}>{isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}</div>{pendingLocations.length > 0 && isOnline && <button onClick={handleManualSync} className={'sync-button ' + (syncing ? 'syncing' : '')} disabled={syncing}><RefreshCw size={18} className={syncing ? 'spinning' : ''} /><span className="pending-count">{pendingLocations.length}</span></button>}<div className="view-toggle"><button onClick={() => setViewMode('list')} className={'toggle-btn ' + (viewMode === 'list' ? 'active' : '')}><List size={18} /></button><button onClick={() => setViewMode('map')} className={'toggle-btn ' + (viewMode === 'map' ? 'active' : '')}><MapIcon size={18} /></button></div>{canAddLocations && <button onClick={() => setShowAddModal(true)} className="add-button"><Plus size={20} /></button>}</div></div></header>

      {!isOnline && <div className="offline-banner"><WifiOff size={16} /><span>You are offline.</span></div>}
      {pendingLocations.length > 0 && isOnline && <div className="pending-banner"><RefreshCw size={16} /><span>{pendingLocations.length} pending</span><button onClick={handleManualSync} disabled={syncing}>{syncing ? 'Syncing...' : 'Sync Now'}</button></div>}

      <div className="search-section"><div className="search-box"><Search size={20} className="search-icon" /><input type="text" placeholder="Search locations..." value={searchText} onChange={(e) => setSearchText(e.target.value)} /></div><div className="filter-pills"><button onClick={() => setFilterType(null)} className={'filter-pill ' + (!filterType ? 'active' : '')}>All ({allLocations.length})</button>{FILTER_TYPES.map(type => <button key={type} onClick={() => setFilterType(filterType === type ? null : type)} className={'filter-pill ' + (filterType === type ? 'active' : '')} style={filterType === type ? { background: LOCATION_TYPES[type].color } : {}}>{LOCATION_TYPES[type].label} ({allLocations.filter(l => normalizeType(l.locationType) === type).length})</button>)}</div></div>

      {viewMode === 'map' && (<div className="map-container"><MapContainer center={getMapCenter()} zoom={10} style={{ height: '100%', width: '100%' }}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon}><Popup>Your Location</Popup></Marker>}{filteredLocations.map(loc => loc.latitude && loc.longitude && (<Marker key={loc.id} position={[loc.latitude, loc.longitude]} icon={loc.isPending ? pendingMarkerIcons[normalizeType(loc.locationType)] : markerIcons[normalizeType(loc.locationType)]}><Popup><div className="popup-content"><strong>{loc.name}</strong><br/>{loc.address}<br/><button onClick={() => handleNavigate(loc)} className="popup-nav-btn">Navigate</button></div></Popup></Marker>))}</MapContainer><div className="map-legend">{FILTER_TYPES.map(type => <div key={type} className="legend-item"><span className="legend-dot" style={{ background: LOCATION_TYPES[type].color }}></span><span>{type}</span></div>)}</div></div>)}

      {viewMode === 'list' && (<div className="locations-list">{loading ? <div className="loading"><div className="spinner"></div><p>Loading...</p></div> : filteredLocations.length === 0 ? <div className="empty-state"><MapPin size={48} /><p>No locations found</p></div> : filteredLocations.map(loc => (<LocationCard key={loc.id} location={loc} distance={getDistanceText(loc)} onNavigate={handleNavigate} onCopyAddress={handleCopyAddress} onShare={handleShareLocation} onEdit={handleEdit} onDelete={(l) => setDeleteConfirm(l)} isSelected={selectedLocation?.id === loc.id} onSelect={() => setSelectedLocation(selectedLocation?.id === loc.id ? null : loc)} copied={copied} linkCopied={linkCopied} isDuplicate={allLocations.filter(l => l.name?.toLowerCase() === loc.name?.toLowerCase() && normalizeType(l.locationType) === normalizeType(loc.locationType)).length > 1} canEdit={canEdit} canDelete={canDelete} />))}</div>)}

      {showAddModal && <AddLocationModal userOrg={userOrg} userEmail={user?.email} onClose={() => setShowAddModal(false)} existingLocations={allLocations} isOnline={isOnline} />}
      {showEditModal && editingLocation && <EditLocationModal location={editingLocation} userOrg={userOrg} userEmail={user?.email} onClose={() => { setShowEditModal(false); setEditingLocation(null); }} isOnline={isOnline} />}
      {showActivityLog && <ActivityLogModal userOrg={userOrg} onClose={() => setShowActivityLog(false)} />}
      {showTrash && <TrashModal userOrg={userOrg} userEmail={user?.email} onClose={() => setShowTrash(false)} />}
      {showTeamMembers && <TeamMembersModal userOrg={userOrg} userEmail={user?.email} userRole={userRole} currentUserId={user?.uid} onClose={() => setShowTeamMembers(false)} />}
      {showEquipmentOrders && <EquipmentOrdersModal onClose={() => setShowEquipmentOrders(false)} />}
      {deleteConfirm && <DeleteConfirmModal location={deleteConfirm} onConfirm={() => handleDelete(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
    </div>
  );
}

function LocationCard({ location, distance, onNavigate, onCopyAddress, onShare, onEdit, onDelete, isSelected, onSelect, copied, linkCopied, isDuplicate, canEdit, canDelete }) {
  const typeConfig = LOCATION_TYPES[normalizeType(location.locationType)] || LOCATION_TYPES.Hub;
  return (
    <div className={'location-card ' + (isSelected ? 'selected ' : '') + (isDuplicate ? 'duplicate ' : '') + (location.isPending ? 'pending' : '')}><button onClick={onSelect} className="location-card-main"><div className="location-icon" style={{ background: typeConfig.color + '20' }}><MapPin size={24} color={typeConfig.color} /></div><div className="location-info"><div className="location-name"><span>{location.name}</span>{location.requiresLadder && <span className="ladder-icon">🪜</span>}{location.isPending && <span className="pending-badge">Pending</span>}</div><p className="location-address">{location.address}</p><div className="location-badges"><span className="type-badge" style={{ background: typeConfig.color + '20', color: typeConfig.color }}>{typeConfig.label}</span>{location.hasLadderBracket && <span className="bracket-badge">Has Bracket</span>}</div></div>{distance && <div className="location-distance">{distance}</div>}</button>
      {isSelected && (<div className="location-details">{location.notes && <p className="location-notes">{location.notes}</p>}<div className="location-meta"><div className="location-coords">{location.latitude?.toFixed(6)}, {location.longitude?.toFixed(6)}</div>{!location.isPending && <div className="location-added-by">Added by: {location.createdBy || 'Unknown'}{location.createdAt && <span> on {(location.createdAt.toDate ? location.createdAt.toDate() : new Date(location.createdAt)).toLocaleDateString()}</span>}</div>}{location.lastModifiedBy && <div className="location-modified-by">Edited by: {location.lastModifiedBy}{location.lastModified && <span> on {(location.lastModified.toDate ? location.lastModified.toDate() : new Date(location.lastModified)).toLocaleDateString()}</span>}</div>}{location.isPending && <div className="location-added-by pending-note">Waiting to sync</div>}</div><div className="location-actions"><button onClick={() => onNavigate(location)} className="navigate-button"><Navigation size={18} /> Navigate</button><button onClick={() => onCopyAddress(location.address)} className="copy-button"><Copy size={18} /> {copied ? 'Copied!' : 'Copy'}</button>{!location.isPending && <button onClick={() => onShare(location)} className="share-button"><Share2 size={18} /> {linkCopied ? 'Copied!' : 'Share'}</button>}</div>{!location.isPending && (canEdit || canDelete) && (<div className="location-actions edit-actions">{canEdit && <button onClick={() => onEdit(location)} className="edit-button"><Edit2 size={18} /> Edit</button>}{canDelete && <button onClick={() => onDelete(location)} className="delete-button"><Trash2 size={18} /> Delete</button>}</div>)}</div>)}
    </div>
  );
}

function AddLocationModal({ userOrg, userEmail, onClose, existingLocations, isOnline }) {
  const [name, setName] = useState(''); const [address, setAddress] = useState(''); const [locationType, setLocationType] = useState(''); const [notes, setNotes] = useState(''); const [requiresLadder, setRequiresLadder] = useState(false); const [hasLadderBracket, setHasLadderBracket] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [warning, setWarning] = useState(''); const [isBlocked, setIsBlocked] = useState(false); const [coords, setCoords] = useState({ lat: '', lng: '' }); const [useCurrentLocation, setUseCurrentLocation] = useState(false); const [showManualCoords, setShowManualCoords] = useState(false); const [manualCoordsInput, setManualCoordsInput] = useState('');
  const checkDupes = (n, a, lat, lng, t) => { if (!existingLocations?.length || !t) return; const norm = s => s?.toLowerCase().replace(/\s+/g, ' ').trim() || ''; const nameMatch = existingLocations.find(l => norm(l.name) === norm(n) && norm(n) && normalizeType(l.locationType) === t); if (nameMatch) { setError('A ' + t + ' named "' + nameMatch.name + '" already exists!'); setIsBlocked(true); return; } setError(''); setIsBlocked(false); const addrMatch = existingLocations.find(l => norm(l.address) === norm(a) && norm(a) && normalizeType(l.locationType) === t); if (addrMatch) setWarning('A ' + t + ' at that address already exists'); else if (lat && lng && existingLocations.find(l => l.latitude && l.longitude && normalizeType(l.locationType) === t && calculateDistance(lat, lng, l.latitude, l.longitude) < 0.02)) setWarning('A location within 100ft exists'); else setWarning(''); };
  const getGPS = () => { if (!navigator.geolocation) { setError('GPS not supported'); return; } setLoading(true); navigator.geolocation.getCurrentPosition(async (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setUseCurrentLocation(true); try { const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + p.coords.latitude + '&lon=' + p.coords.longitude + '&zoom=18', { headers: { 'User-Agent': 'FidLoc/1.0' } }); const d = await r.json(); if (d.display_name) setAddress(d.display_name.split(', ').slice(0, 4).join(', ')); } catch { setAddress(p.coords.latitude.toFixed(5) + ', ' + p.coords.longitude.toFixed(5)); } setLoading(false); }, () => { setError('GPS failed'); setLoading(false); }, { enableHighAccuracy: true, timeout: 15000 }); };
  const parseCoords = () => { const m = manualCoordsInput.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/); if (m && Math.abs(parseFloat(m[1])) <= 90 && Math.abs(parseFloat(m[2])) <= 180) { setCoords({ lat: parseFloat(m[1]), lng: parseFloat(m[2]) }); setUseCurrentLocation(true); setShowManualCoords(false); } else setError('Invalid coords'); };
  const geocode = async (a) => { try { const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(a) + '&key=AIzaSyDt1X0uhHu-wUC0L51T-AS77ymlusiYh7I'); const d = await r.json(); return d.results?.[0] ? { lat: d.results[0].geometry.location.lat, lng: d.results[0].geometry.location.lng } : null; } catch { return null; } };
  const submit = async (e) => { e.preventDefault(); if (isBlocked) return; setLoading(true); setError(''); var finalCoords = coords; if (!useCurrentLocation || !coords.lat) { if (!isOnline) { setError('Offline - use GPS'); setLoading(false); return; } finalCoords = await geocode(address); if (!finalCoords) { setError('Could not geocode'); setLoading(false); return; } } var data = { name, address, latitude: finalCoords.lat, longitude: finalCoords.lng, locationType, notes, requiresLadder: locationType === 'Hub' ? requiresLadder : false, hasLadderBracket: locationType === 'Hub' ? hasLadderBracket : false, createdBy: userEmail, userOrg }; try { if (isOnline) { await addDoc(collection(db, 'organizations', userOrg, 'locations'), Object.assign({}, data, { createdAt: Timestamp.now(), lastModified: Timestamp.now() })); await logActivity(userOrg, 'created', name, userEmail); } else await offlineQueue.addToQueue(data); onClose(); } catch { setError('Failed to save'); } setLoading(false); };
  return (<div className="modal-overlay"><div className="modal"><div className="modal-header"><h2>Add Location</h2>{!isOnline && <span className="offline-indicator"><WifiOff size={16} /> Offline</span>}<button onClick={onClose} className="close-button"><X size={24} /></button></div><form onSubmit={submit} className="modal-form">{!isOnline && <div className="offline-notice">Offline - will sync later</div>}{error && <div className="error-message">{error}</div>}{warning && <div className="warning-message">{warning}</div>}<div className="form-group"><label>Name *</label><input value={name} onChange={e => { const upperName = e.target.value.toUpperCase(); setName(upperName); checkDupes(upperName, address, null, null, locationType); }} required /></div><div className="form-group"><label>Type *</label><select value={locationType} onChange={e => { setLocationType(e.target.value); checkDupes(name, address, coords.lat, coords.lng, e.target.value); }} required><option value="">-- Select --</option>{FILTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div><div className="form-group"><label>Address *</label><input value={address} onChange={e => { setAddress(e.target.value); setUseCurrentLocation(false); checkDupes(name, e.target.value, null, null, locationType); }} required /><div className="location-buttons"><button type="button" onClick={getGPS} className="location-btn" disabled={loading}>📍 GPS</button><button type="button" onClick={() => setShowManualCoords(!showManualCoords)} className="location-btn">✏️ Coords</button></div>{showManualCoords && <div className="manual-coords"><input value={manualCoordsInput} onChange={e => setManualCoordsInput(e.target.value)} placeholder="42.98, -71.45" /><button type="button" onClick={parseCoords} className="parse-btn">Set</button></div>}{useCurrentLocation && coords.lat && <div className="coords-captured">✅ {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</div>}</div>{locationType === 'Hub' && <div className="checkbox-group"><label className="checkbox-label"><input type="checkbox" checked={requiresLadder} onChange={e => setRequiresLadder(e.target.checked)} /> 🪜 Requires Ladder</label>{requiresLadder && <label className="checkbox-label"><input type="checkbox" checked={hasLadderBracket} onChange={e => setHasLadderBracket(e.target.checked)} /> Has Bracket</label>}</div>}<div className="form-group"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} /></div><div className="modal-actions"><button type="button" onClick={onClose} className="cancel-button">Cancel</button><button type="submit" disabled={loading || isBlocked} className="submit-button">{loading ? 'Saving...' : 'Add'}</button></div></form></div></div>);
}

function EditLocationModal({ location, userOrg, userEmail, onClose, isOnline }) {
  const [name, setName] = useState((location.name || '').toUpperCase()); const [address, setAddress] = useState(location.address || ''); const [locationType, setLocationType] = useState(location.locationType || 'Hub'); const [notes, setNotes] = useState(location.notes || ''); const [requiresLadder, setRequiresLadder] = useState(location.requiresLadder || false); const [hasLadderBracket, setHasLadderBracket] = useState(location.hasLadderBracket || false); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const submit = async (e) => { e.preventDefault(); if (!isOnline) { setError('Must be online to edit'); return; } setLoading(true); setError(''); var changes = []; if (name !== location.name) changes.push({ field: 'name', before: location.name, after: name }); if (address !== location.address) changes.push({ field: 'address', before: location.address, after: address }); if (locationType !== location.locationType) changes.push({ field: 'type', before: location.locationType, after: locationType }); if (notes !== (location.notes || '')) changes.push({ field: 'notes', before: location.notes || '(empty)', after: notes || '(empty)' }); if (requiresLadder !== location.requiresLadder) changes.push({ field: 'requiresLadder', before: location.requiresLadder ? 'Yes' : 'No', after: requiresLadder ? 'Yes' : 'No' }); if (hasLadderBracket !== location.hasLadderBracket) changes.push({ field: 'hasLadderBracket', before: location.hasLadderBracket ? 'Yes' : 'No', after: hasLadderBracket ? 'Yes' : 'No' }); if (!changes.length) { onClose(); return; } try { await updateDoc(doc(db, 'organizations', userOrg, 'locations', location.id), { name, address, locationType, notes, requiresLadder: locationType === 'Hub' ? requiresLadder : false, hasLadderBracket: locationType === 'Hub' ? hasLadderBracket : false, lastModified: Timestamp.now(), lastModifiedBy: userEmail }); await logActivity(userOrg, 'edited', name, userEmail, changes); onClose(); } catch { setError('Failed to save'); } setLoading(false); };
  return (<div className="modal-overlay"><div className="modal"><div className="modal-header"><h2>Edit Location</h2><button onClick={onClose} className="close-button"><X size={24} /></button></div><form onSubmit={submit} className="modal-form">{error && <div className="error-message">{error}</div>}{!isOnline && <div className="error-message">Must be online to edit</div>}<div className="form-group"><label>Name *</label><input value={name} onChange={e => setName(e.target.value.toUpperCase())} required /></div><div className="form-group"><label>Type *</label><select value={locationType} onChange={e => setLocationType(e.target.value)} required>{FILTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div><div className="form-group"><label>Address *</label><input value={address} onChange={e => setAddress(e.target.value)} required /></div>{locationType === 'Hub' && <div className="checkbox-group"><label className="checkbox-label"><input type="checkbox" checked={requiresLadder} onChange={e => setRequiresLadder(e.target.checked)} /> 🪜 Requires Ladder</label>{requiresLadder && <label className="checkbox-label"><input type="checkbox" checked={hasLadderBracket} onChange={e => setHasLadderBracket(e.target.checked)} /> Has Bracket</label>}</div>}<div className="form-group"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} /></div><div className="modal-actions"><button type="button" onClick={onClose} className="cancel-button">Cancel</button><button type="submit" disabled={loading || !isOnline} className="submit-button">{loading ? 'Saving...' : 'Save Changes'}</button></div></form></div></div>);
}

function ActivityLogModal({ userOrg, onClose }) {
  const [activities, setActivities] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { const q = query(collection(db, 'organizations', userOrg, 'activityLog'), orderBy('timestamp', 'desc'), limit(50)); return onSnapshot(q, (snap) => { setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); }, (err) => { console.error('Activity log error:', err); setError('Unable to load activity log.'); setLoading(false); }); }, [userOrg]);
  var formatTime = (ts) => ts ? (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleString() : ''; var getIcon = (a) => a === 'created' ? '➕' : a === 'edited' ? '✏️' : a === 'deleted' ? '🗑️' : a === 'restored' ? '♻️' : '📝'; var getColor = (a) => a === 'created' ? '#22c55e' : a === 'edited' ? '#3b82f6' : a === 'deleted' ? '#ef4444' : a === 'restored' ? '#22c55e' : '#9ca3af';
  return (<div className="modal-overlay"><div className="modal activity-modal"><div className="modal-header"><h2><History size={20} /> Activity Log</h2><button onClick={onClose} className="close-button"><X size={24} /></button></div><div className="activity-log-content">{loading ? <div className="loading"><div className="spinner"></div></div> : error ? <div className="error-message">{error}</div> : activities.length === 0 ? <div className="empty-state"><p>No activity yet</p></div> : (<div className="activity-list">{activities.map(a => (<div key={a.id} className="activity-item"><div className="activity-icon" style={{ background: getColor(a.action) + '20', color: getColor(a.action) }}>{getIcon(a.action)}</div><div className="activity-details"><div className="activity-summary"><strong>{a.userEmail}</strong> {a.action} <strong>{a.locationName}</strong></div><div className="activity-time">{formatTime(a.timestamp)}</div>{a.changes && a.changes.length > 0 && <div className="activity-changes">{a.changes.map((c, i) => <div key={i} className="change-item"><span className="change-field">{c.field}:</span><span className="change-before">{String(c.before)}</span><span className="change-arrow">→</span><span className="change-after">{String(c.after)}</span></div>)}</div>}{a.action === 'deleted' && a.changes && a.changes.deletedLocation && <div className="activity-changes deleted-info"><div className="change-item">Deleted: {a.changes.deletedLocation.name} ({a.changes.deletedLocation.locationType})</div></div>}</div></div>))}</div>)}</div></div></div>);
}

function TrashModal({ userOrg, userEmail, onClose }) {
  const [trashedItems, setTrashedItems] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [restoring, setRestoring] = useState(null); const [permDeleting, setPermDeleting] = useState(null);
  useEffect(() => { const q = query(collection(db, 'organizations', userOrg, 'trash'), orderBy('deletedAt', 'desc')); return onSnapshot(q, (snap) => { setTrashedItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); }, (err) => { console.error('Trash load error:', err); setError('Unable to load trash.'); setLoading(false); }); }, [userOrg]);
  const handleRestore = async (item) => { setRestoring(item.id); try { const restoreData = { ...item }; delete restoreData.deletedBy; delete restoreData.deletedAt; delete restoreData.originalId; delete restoreData.id; restoreData.restoredBy = userEmail; restoreData.restoredAt = Timestamp.now(); await setDoc(doc(db, 'organizations', userOrg, 'locations', item.id), restoreData); await deleteDoc(doc(db, 'organizations', userOrg, 'trash', item.id)); await logActivity(userOrg, 'restored', item.name, userEmail); } catch (err) { console.error('Restore failed:', err); setError('Failed to restore.'); } setRestoring(null); };
  const handlePermanentDelete = async (item) => { setPermDeleting(item.id); try { await deleteDoc(doc(db, 'organizations', userOrg, 'trash', item.id)); await logActivity(userOrg, 'permanently deleted', item.name, userEmail); } catch (err) { console.error('Permanent delete failed:', err); setError('Failed to delete.'); } setPermDeleting(null); };
  var formatTime = (ts) => ts ? (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleString() : '';
  return (<div className="modal-overlay"><div className="modal trash-modal"><div className="modal-header"><h2><Trash size={20} /> Trash</h2><button onClick={onClose} className="close-button"><X size={24} /></button></div><div className="trash-content">{loading ? <div className="loading"><div className="spinner"></div></div> : error ? <div className="error-message">{error}</div> : trashedItems.length === 0 ? <div className="empty-state"><Trash size={48} /><p>Trash is empty</p></div> : (<div className="trash-list">{trashedItems.map(item => (<div key={item.id} className="trash-item"><div className="trash-item-info"><div className="trash-item-name">{item.name}</div><div className="trash-item-type">{normalizeType(item.locationType)}</div><div className="trash-item-address">{item.address}</div><div className="trash-item-meta">Deleted by {item.deletedBy} on {formatTime(item.deletedAt)}</div></div><div className="trash-item-actions"><button onClick={() => handleRestore(item)} disabled={restoring === item.id} className="restore-button"><RotateCcw size={16} /> {restoring === item.id ? 'Restoring...' : 'Restore'}</button><button onClick={() => handlePermanentDelete(item)} disabled={permDeleting === item.id} className="perm-delete-button"><Trash2 size={16} /> {permDeleting === item.id ? 'Deleting...' : 'Delete Forever'}</button></div></div>))}</div>)}</div></div></div>);
}

function TeamMembersModal({ userOrg, userEmail, userRole, currentUserId, onClose }) {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [sending, setSending] = useState(false);
  const [changingRole, setChangingRole] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [cancelingInvite, setCancelingInvite] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const isOwner = userRole === 'owner';
  const isAdminOrOwner = userRole === 'owner' || userRole === 'admin';

  useEffect(() => {
    const membersQuery = query(collection(db, 'organizations', userOrg, 'members'));
    const unsubMembers = onSnapshot(membersQuery, (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error('Members load error:', err);
      setError('Unable to load members.');
      setLoading(false);
    });

    const invitesQuery = query(collection(db, 'invites'), orderBy('createdAt', 'desc'));
    const unsubInvites = onSnapshot(invitesQuery, (snap) => {
      const orgInvites = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(inv => inv.organizationId === userOrg && inv.status === 'pending');
      setInvites(orgInvites);
    }, () => {});

    return () => { unsubMembers(); unsubInvites(); };
  }, [userOrg]);

  const sendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSending(true);
    setError('');
    try {
      const existingMember = members.find(m => m.email?.toLowerCase() === inviteEmail.toLowerCase());
      if (existingMember) { setError('This person is already a member.'); setSending(false); return; }
      const existingInvite = invites.find(i => i.email?.toLowerCase() === inviteEmail.toLowerCase());
      if (existingInvite) { setError('An invite is already pending for this email.'); setSending(false); return; }
      await addDoc(collection(db, 'invites'), { email: inviteEmail.toLowerCase().trim(), role: inviteRole, organizationId: userOrg, invitedBy: userEmail, status: 'pending', createdAt: Timestamp.now() });
      setInviteEmail('');
      setShowInviteForm(false);
    } catch (err) {
      console.error('Invite failed:', err);
      setError('Failed to send invite.');
    }
    setSending(false);
  };

  const cancelInvite = async (inviteId) => {
    setCancelingInvite(inviteId);
    try {
      await deleteDoc(doc(db, 'invites', inviteId));
    } catch (err) {
      console.error('Cancel invite failed:', err);
      setError('Failed to cancel invite.');
    }
    setCancelingInvite(null);
  };

  const changeRole = async (memberId, newRole) => {
    if (!isOwner) return;
    setChangingRole(memberId);
    try {
      await updateDoc(doc(db, 'organizations', userOrg, 'members', memberId), { role: newRole });
    } catch (err) {
      console.error('Change role failed:', err);
      setError('Failed to change role.');
    }
    setChangingRole(null);
  };

  const removeMember = async (member) => {
    if (!isOwner || member.id === currentUserId) return;
    setRemoving(member.id);
    setError('');
    try {
      console.log('Removing member:', member.id, member.email);
      await deleteDoc(doc(db, 'organizations', userOrg, 'members', member.id));
      console.log('Member removed successfully');
      setConfirmRemove(null);
    } catch (err) {
      console.error('Remove member failed:', err);
      setError('Failed to remove member: ' + err.message);
    }
    setRemoving(null);
  };

  const getRoleIcon = (role) => { if (role === 'owner') return <Crown size={16} color="#f59e0b" />; if (role === 'admin') return <Shield size={16} color="#3b82f6" />; return null; };
  const getRoleColor = (role) => { if (role === 'owner') return '#f59e0b'; if (role === 'admin') return '#3b82f6'; if (role === 'contributor') return '#22c55e'; return '#64748b'; };
  const formatTime = (ts) => ts ? (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleDateString() : '';

  return (
    <div className="modal-overlay">
      <div className="modal team-modal">
        <div className="modal-header">
          <h2><Users size={20} /> Team Members</h2>
          <button onClick={onClose} className="close-button"><X size={24} /></button>
        </div>
        <div className="team-content">
          {error && <div className="error-message">{error}</div>}
          
          {isAdminOrOwner && (
            <div className="invite-section">
              {!showInviteForm ? (
                <button onClick={() => setShowInviteForm(true)} className="invite-button"><UserPlus size={18} /> Invite Team Member</button>
              ) : (
                <form onSubmit={sendInvite} className="invite-form">
                  <div className="invite-form-row">
                    <div className="invite-input-group"><Mail size={18} /><input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@example.com" required /></div>
                    <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}><option value="viewer">Viewer</option><option value="contributor">Contributor</option>{isOwner && <option value="admin">Admin</option>}</select>
                  </div>
                  <div className="invite-form-actions">
                    <button type="button" onClick={() => setShowInviteForm(false)} className="cancel-btn">Cancel</button>
                    <button type="submit" disabled={sending} className="send-btn">{sending ? 'Sending...' : 'Send Invite'}</button>
                  </div>
                </form>
              )}
            </div>
          )}

          {invites.length > 0 && (
            <div className="pending-invites">
              <div className="section-title">Pending Invites</div>
              {invites.map(invite => (
                <div key={invite.id} className="invite-item">
                  <div className="invite-info"><div className="invite-email">{invite.email}</div><div className="invite-meta">Invited as {invite.role} • {formatTime(invite.createdAt)}</div></div>
                  {isAdminOrOwner && (<button onClick={() => cancelInvite(invite.id)} disabled={cancelingInvite === invite.id} className="cancel-invite-btn">{cancelingInvite === invite.id ? '...' : <X size={16} />}</button>)}
                </div>
              ))}
            </div>
          )}

          <div className="members-list">
            <div className="section-title">Members ({members.length})</div>
            {loading ? <div className="loading"><div className="spinner"></div></div> : members.length === 0 ? <div className="empty-state"><p>No members</p></div> : (
              members.sort((a, b) => { const roleOrder = { owner: 0, admin: 1, contributor: 2, viewer: 3 }; return (roleOrder[a.role] || 4) - (roleOrder[b.role] || 4); }).map(member => (
                <div key={member.id} className="member-item">
                  <div className="member-avatar">{(member.email || '?')[0].toUpperCase()}</div>
                  <div className="member-info">
                    <div className="member-email">{member.email}{member.id === currentUserId && <span className="you-badge">You</span>}</div>
                    <div className="member-role" style={{ color: getRoleColor(member.role) }}>{getRoleIcon(member.role)} {member.role}</div>
                  </div>
                  {isOwner && member.id !== currentUserId && member.role !== 'owner' && (
                    <div className="member-actions">
                      <select value={member.role} onChange={e => changeRole(member.id, e.target.value)} disabled={changingRole === member.id} className="role-select"><option value="viewer">Viewer</option><option value="contributor">Contributor</option><option value="admin">Admin</option></select>
                      <button onClick={() => setConfirmRemove(member)} disabled={removing === member.id} className="remove-btn" title="Remove member"><UserMinus size={16} /></button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="role-legend">
            <div className="legend-title">Role Permissions</div>
            <div className="legend-item"><Crown size={14} color="#f59e0b" /> <strong>Owner</strong> - Full access, manage team, delete org</div>
            <div className="legend-item"><Shield size={14} color="#3b82f6" /> <strong>Admin</strong> - Manage locations, view activity, invite users</div>
            <div className="legend-item"><span className="dot" style={{background: '#22c55e'}}></span> <strong>Contributor</strong> - Add and edit locations</div>
            <div className="legend-item"><span className="dot" style={{background: '#64748b'}}></span> <strong>Viewer</strong> - View locations only</div>
          </div>
        </div>
      </div>

      {confirmRemove && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h3>Remove Team Member?</h3>
            <p>Are you sure you want to remove <strong>{confirmRemove.email}</strong> from the team?</p>
            <p className="confirm-warning">They will lose access to all locations and will need a new invite to rejoin.</p>
            <div className="confirm-actions">
              <button onClick={() => setConfirmRemove(null)} className="cancel-button">Cancel</button>
              <button onClick={() => removeMember(confirmRemove)} disabled={removing === confirmRemove.id} className="confirm-remove-button">{removing === confirmRemove.id ? 'Removing...' : 'Remove Member'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeleteConfirmModal({ location, onConfirm, onCancel }) {
  return (<div className="modal-overlay"><div className="modal delete-modal"><div className="modal-header"><h2>🗑️ Move to Trash?</h2></div><div className="delete-modal-content"><p>Move <strong>{location.name}</strong> to trash?</p><p className="delete-warning">You can restore it later from the trash.</p></div><div className="modal-actions"><button onClick={onCancel} className="cancel-button">Cancel</button><button onClick={onConfirm} className="delete-confirm-button">Move to Trash</button></div></div></div>);
}

function EquipmentOrdersModal({ onClose }) {
  const garages = [
    { name: 'Concord', url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=XZI8ME5OQUqmnyZJVrSH1ovVVh7nbY9NlmxUTGr4zoZUMVBJRUg5OVE5RlJYQjVLV1pDTUNMRkFXWi4u', active: true },
    { name: 'Nashua', url: null, active: false },
    { name: 'Greenland', url: null, active: false },
    { name: 'Keene', url: null, active: false },
    { name: 'Laconia', url: null, active: false }
  ];

  const handleGarageClick = (garage) => {
    if (garage.active && garage.url) {
      window.open(garage.url, '_blank');
      onClose();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal equipment-modal">
        <div className="modal-header">
          <h2><Package size={20} /> Equipment Orders</h2>
          <button onClick={onClose} className="close-button"><X size={24} /></button>
        </div>
        <div className="equipment-content">
          <p className="equipment-instructions">Select your garage to open the equipment order form:</p>
          <div className="garage-list">
            {garages.map(garage => (
              <button
                key={garage.name}
                onClick={() => handleGarageClick(garage)}
                className={`garage-item ${garage.active ? 'active' : 'disabled'}`}
                disabled={!garage.active}
              >
                <Building size={20} />
                <span className="garage-name">{garage.name}</span>
                {garage.active ? (
                  <ChevronRight size={18} />
                ) : (
                  <span className="coming-soon">Coming Soon</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
