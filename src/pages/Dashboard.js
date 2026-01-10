import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, functions, auth, EmailAuthProvider, linkWithCredential } from '../firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, Timestamp, orderBy, limit, setDoc } from 'firebase/firestore';
import { MapPin, LogOut, Navigation, Copy, Search, Plus, X, Share2, List, Map as MapIcon, Wifi, WifiOff, RefreshCw, Edit2, Trash2, History, RotateCcw, Trash, Sun, Moon, Monitor, ExternalLink, Users, Settings, ChevronRight, Mail, UserPlus, Shield, UserMinus, Crown, Package, Building, ClipboardList, CheckCircle, AlertTriangle, ScanLine, StopCircle, Ruler, Clock } from 'lucide-react';
import TimeTracker from '../components/TimeTracker';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Html5Qrcode } from 'html5-qrcode';
import * as XLSX from 'xlsx';
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
const formatTimeAgo = (date) => { const now = new Date(); const diff = Math.floor((now - date) / 1000); if (diff < 60) return 'just now'; if (diff < 3600) return Math.floor(diff / 60) + ' min ago'; if (diff < 86400) return Math.floor(diff / 3600) + ' hr ago'; return Math.floor(diff / 86400) + ' day ago'; };
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
  const [showInventory, setShowInventory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDropMeasure, setShowDropMeasure] = useState(false);
  const [showTimeTracker, setShowTimeTracker] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [mapFocusLocation, setMapFocusLocation] = useState(null);
  const [recentLocations, setRecentLocations] = useState(() => { try { return JSON.parse(localStorage.getItem('fidloc_recent') || '[]'); } catch { return []; } });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(new Date());
  const [theme, setTheme] = useState(themeManager.getTheme());
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [rateLimitMessage, setRateLimitMessage] = useState(null);

  // Rate limiting for non-admin users
  const RATE_LIMIT_STORAGE_KEY = 'fidloc_rate_limits';
  const DELETE_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
  const EDIT_LIMIT = 5;
  const EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  const getRateLimits = () => {
    try { return JSON.parse(localStorage.getItem(RATE_LIMIT_STORAGE_KEY) || '{}'); } catch { return {}; }
  };

  const setRateLimits = (limits) => {
    localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(limits));
  };

  const canDeleteNow = () => {
    if (userRole === 'owner' || userRole === 'admin') return { allowed: true };
    const limits = getRateLimits();
    const lastDelete = limits.lastDelete || 0;
    const now = Date.now();
    const timeLeft = DELETE_COOLDOWN_MS - (now - lastDelete);
    if (timeLeft > 0) {
      const mins = Math.floor(timeLeft / 60000);
      const secs = Math.floor((timeLeft % 60000) / 1000);
      return { allowed: false, message: `You can delete again in ${mins}:${secs.toString().padStart(2, '0')}` };
    }
    return { allowed: true };
  };

  const recordDelete = () => {
    if (userRole === 'owner' || userRole === 'admin') return;
    const limits = getRateLimits();
    limits.lastDelete = Date.now();
    setRateLimits(limits);
  };

  const canEditNow = () => {
    if (userRole === 'owner' || userRole === 'admin') return { allowed: true };
    const limits = getRateLimits();
    const now = Date.now();
    const editTimes = (limits.editTimes || []).filter(t => now - t < EDIT_WINDOW_MS);
    if (editTimes.length >= EDIT_LIMIT) {
      const oldestEdit = Math.min(...editTimes);
      const timeLeft = EDIT_WINDOW_MS - (now - oldestEdit);
      const mins = Math.floor(timeLeft / 60000);
      const secs = Math.floor((timeLeft % 60000) / 1000);
      return { allowed: false, message: `Edit limit reached. Try again in ${mins}:${secs.toString().padStart(2, '0')}` };
    }
    return { allowed: true };
  };

  const recordEdit = () => {
    if (userRole === 'owner' || userRole === 'admin') return;
    const limits = getRateLimits();
    const now = Date.now();
    const editTimes = (limits.editTimes || []).filter(t => now - t < EDIT_WINDOW_MS);
    editTimes.push(now);
    limits.editTimes = editTimes;
    setRateLimits(limits);
  };

  const canEdit = userRole === 'owner' || userRole === 'admin' || userRole === 'contributor';
  const canDelete = userRole === 'owner' || userRole === 'admin';
  const canViewActivityLog = userRole === 'owner' || userRole === 'admin';
  const canAddLocations = userRole === 'owner' || userRole === 'admin' || userRole === 'contributor';
  const setThemeMode = (mode) => { themeManager.setTheme(mode); setTheme(mode); };

  useEffect(() => { const handleOnline = () => { setIsOnline(true); handleManualSync(); }; const handleOffline = () => setIsOnline(false); window.addEventListener('online', handleOnline); window.addEventListener('offline', handleOffline); return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); }; }, []);
  useEffect(() => { const loadPending = async () => setPendingLocations(await offlineQueue.getPendingLocations()); loadPending(); return offlineQueue.subscribe(setPendingLocations); }, []);
  useEffect(() => { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition((pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => {}); } }, []);
  useEffect(() => { if (!userOrg) { setLoading(false); return; } const q = query(collection(db, 'organizations', userOrg, 'locations')); return onSnapshot(q, (snap) => { const locs = snap.docs.map(d => ({ id: d.id, ...d.data() })); setLocations(locs); setLoading(false); setLastSynced(new Date()); if (locationId) { const found = locs.find(l => l.id === locationId); if (found) setSelectedLocation(found); } }, () => setLoading(false)); }, [userOrg, locationId]);

  const handleManualSync = async () => { if (!isOnline || syncing) return; setSyncing(true); try { await offlineQueue.syncQueue(); setLastSynced(new Date()); } catch {} setSyncing(false); };
  const handleEdit = (loc) => {
    const editCheck = canEditNow();
    if (!editCheck.allowed) {
      setRateLimitMessage(editCheck.message);
      setTimeout(() => setRateLimitMessage(null), 4000);
      return;
    }
    setEditingLocation(loc);
    setShowEditModal(true);
  };
  const handleDelete = async (loc) => {
    if (!canDelete) return;
    const deleteCheck = canDeleteNow();
    if (!deleteCheck.allowed) {
      setRateLimitMessage(deleteCheck.message);
      setTimeout(() => setRateLimitMessage(null), 4000);
      setDeleteConfirm(null);
      return;
    }
    try {
      const trashData = { ...loc, deletedBy: user?.email, deletedAt: Timestamp.now(), originalId: loc.id };
      delete trashData.id;
      await setDoc(doc(db, 'organizations', userOrg, 'trash', loc.id), trashData);
      await deleteDoc(doc(db, 'organizations', userOrg, 'locations', loc.id));
      await logActivity(userOrg, 'deleted', loc.name, user?.email, { deletedLocation: { name: loc.name, address: loc.address, locationType: loc.locationType } });
      recordDelete();
      setDeleteConfirm(null);
      setSelectedLocation(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };
  const handleShowOnMap = (loc) => { if (loc.latitude && loc.longitude) { setMapFocusLocation(loc); setViewMode('map'); } };
  const getDistanceText = (loc) => { if (!userLocation || !loc.latitude || !loc.longitude) return null; const dist = calculateDistance(userLocation.lat, userLocation.lng, loc.latitude, loc.longitude); return dist < 0.1 ? '< 0.1 mi' : dist < 10 ? dist.toFixed(1) + ' mi' : Math.round(dist) + ' mi'; };
  const allLocations = [...locations, ...pendingLocations.map(p => ({ ...p, isPending: true, id: p.pendingId }))];
  const filteredLocations = allLocations.filter(loc => (!searchText || loc.name?.toLowerCase().includes(searchText.toLowerCase()) || loc.address?.toLowerCase().includes(searchText.toLowerCase())) && (!filterType || (filterType === 'Bathroom' ? loc.hasBathroom : normalizeType(loc.locationType) === filterType))).sort((a, b) => { if (a.isPending && !b.isPending) return -1; if (!a.isPending && b.isPending) return 1; if (userLocation) return calculateDistance(userLocation.lat, userLocation.lng, a.latitude, a.longitude) - calculateDistance(userLocation.lat, userLocation.lng, b.latitude, b.longitude); return (a.name || '').localeCompare(b.name || ''); });
  const addToRecent = (loc) => { const recent = [{ id: loc.id, name: loc.name, locationType: loc.locationType, latitude: loc.latitude, longitude: loc.longitude }, ...recentLocations.filter(r => r.id !== loc.id)].slice(0, 5); setRecentLocations(recent); localStorage.setItem('fidloc_recent', JSON.stringify(recent)); };
  const handleNavigate = (loc) => { addToRecent(loc); setSelectedLocation(null); const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent); const url = isIOS ? 'maps://maps.apple.com/?daddr=' + loc.latitude + ',' + loc.longitude : 'https://www.google.com/maps/dir/?api=1&destination=' + loc.latitude + ',' + loc.longitude; window.open(url, '_blank'); };
  const handleQuickNavigate = (recentLoc) => { const fullLoc = allLocations.find(l => l.id === recentLoc.id); const lat = fullLoc?.latitude || recentLoc.latitude; const lng = fullLoc?.longitude || recentLoc.longitude; if (fullLoc) addToRecent(fullLoc); const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent); const url = isIOS ? 'maps://maps.apple.com/?daddr=' + lat + ',' + lng : 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng; window.open(url, '_blank'); };
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
        {canViewActivityLog && (<div className="menu-section"><div className="menu-section-title">Inventory</div><button onClick={() => { setShowInventory(true); setShowMenu(false); }} className="menu-item"><ClipboardList size={20} /><span>My Inventory</span><ChevronRight size={18} /></button><button onClick={() => { setShowEquipmentOrders(true); setShowMenu(false); }} className="menu-item"><Package size={20} /><span>Equipment Orders</span><ChevronRight size={18} /></button><button onClick={() => openExternalLink('https://forms.office.com/pages/responsepage.aspx?id=XZI8ME5OQUqmnyZJVrSH1lwcfjB4TM5Dqw11fNLOPYxUMVNQSjU1QjhXV1dLSzZZUTdJOFhGVTRQSS4u&route=shorturl')} className="menu-item"><ExternalLink size={20} /><span>Inventory Corrections</span><ChevronRight size={18} /></button></div>)}
        <div className="menu-section"><div className="menu-section-title">Quick Links</div><button onClick={() => { setShowDropMeasure(true); setShowMenu(false); }} className="menu-item"><Ruler size={20} /><span>Drop Measure</span><ChevronRight size={18} /></button><button onClick={() => { setShowTimeTracker(true); setShowMenu(false); }} className="menu-item"><Clock size={20} /><span>Time Tracker</span><ChevronRight size={18} /></button><button onClick={() => openExternalLink('https://cnslonline.sharepoint.com/sites/Intranet')} className="menu-item"><Building size={20} /><span>Intranet-Home</span><ChevronRight size={18} /></button><button onClick={() => openExternalLink('https://fairpoint.etadirect.com')} className="menu-item"><ExternalLink size={20} /><span>Oracle</span><ChevronRight size={18} /></button><button onClick={() => { setShowSettings(true); setShowMenu(false); }} className="menu-item"><Settings size={20} /><span>Settings</span><ChevronRight size={18} /></button></div>
        <div className="menu-section"><div className="menu-section-title">Requires VPN</div><button onClick={() => openExternalLink('http://resolve.consolidated.com/resolve/sir/index.html')} className="menu-item"><ExternalLink size={20} /><span>Resolve</span><ChevronRight size={18} /></button><button onClick={() => openExternalLink('https://consolidated.okta.com')} className="menu-item"><ExternalLink size={20} /><span>My Apps Dashboard</span><ChevronRight size={18} /></button><button onClick={() => openExternalLink('https://netcracker.consolidated.com/cci_custom/jumpStart.jsp')} className="menu-item"><ExternalLink size={20} /><span>Netcracker</span><ChevronRight size={18} /></button></div>
        <div className="menu-section"><div className="menu-section-title">VPN Setup</div><button onClick={() => { const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent); const isAndroid = /Android/.test(navigator.userAgent); if (isIOS || isAndroid) { let appOpened = false; const handleBlur = () => { appOpened = true; }; window.addEventListener('blur', handleBlur); window.location.href = 'anyconnect://'; setTimeout(() => { window.removeEventListener('blur', handleBlur); if (!appOpened && !document.hidden) { if (window.confirm('Open AnyConnect? If not installed, you can download it.')) { if (isIOS) window.open('https://apps.apple.com/app/cisco-secure-client/id1135064690', '_blank'); else window.open('https://play.google.com/store/apps/details?id=com.cisco.anyconnect.vpn.android.avf', '_blank'); } } }, 2500); } else { window.open('https://remote-nh1.consolidated.com/+CSCOE+/logon.html#form_title_text', '_blank'); } }} className="menu-item"><Shield size={20} /><span>AnyConnect VPN</span><ChevronRight size={18} /></button><div className="help-info"><div className="help-item"><strong>Server Address:</strong><br/>remote-nh1.consolidated.com/Employees</div></div></div>
        <div className="menu-footer"><button onClick={logout} className="menu-logout"><LogOut size={20} /><span>Sign Out</span></button><div className="menu-version">FidLoc v1.0</div></div>
      </div>

      <header className="header"><div className="header-content"><div className="header-left"><button onClick={() => setShowMenu(true)} className="menu-button"><div className="header-icon"><MapPin size={20} color="white" /></div></button><div><h1>FidLoc</h1><span className="role-badge">{userRole}</span></div></div><div className="header-right"><div className={'status-indicator ' + (isOnline ? 'online' : 'offline')}>{isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}</div>{pendingLocations.length > 0 && isOnline && <button onClick={handleManualSync} className={'sync-button ' + (syncing ? 'syncing' : '')} disabled={syncing}><RefreshCw size={18} className={syncing ? 'spinning' : ''} /><span className="pending-count">{pendingLocations.length}</span></button>}<div className="view-toggle"><button onClick={() => setViewMode('list')} className={'toggle-btn ' + (viewMode === 'list' ? 'active' : '')}><List size={18} /></button><button onClick={() => setViewMode('map')} className={'toggle-btn ' + (viewMode === 'map' ? 'active' : '')}><MapIcon size={18} /></button></div>{canAddLocations && <button onClick={() => setShowAddModal(true)} className="add-button"><Plus size={20} /></button>}</div></div></header>

      {!isOnline && <div className="offline-banner"><WifiOff size={16} /><span>You are offline</span><span className="last-synced">Last synced: {formatTimeAgo(lastSynced)}</span></div>}
      {pendingLocations.length > 0 && isOnline && <div className="pending-banner"><RefreshCw size={16} /><span>{pendingLocations.length} pending</span><button onClick={handleManualSync} disabled={syncing}>{syncing ? 'Syncing...' : 'Sync Now'}</button></div>}

      {recentLocations.length > 0 && !searchText && !filterType && <div className="recent-section"><div className="recent-header"><History size={16} /><span>Recent</span></div><div className="recent-chips">{recentLocations.map(loc => <button key={loc.id} onClick={() => handleQuickNavigate(loc)} className="recent-chip" style={{ borderColor: LOCATION_TYPES[normalizeType(loc.locationType)]?.color }}><span className="recent-name">{loc.name}</span><Navigation size={14} /></button>)}</div></div>}

      <div className="search-section"><div className="search-box"><Search size={20} className="search-icon" /><input type="text" placeholder="Search locations..." value={searchText} onChange={(e) => setSearchText(e.target.value)} /></div><div className="filter-pills-wrapper"><div className="filter-pills"><button onClick={() => setFilterType(null)} className={'filter-pill ' + (!filterType ? 'active' : '')}>All ({allLocations.length})</button><button onClick={() => setFilterType(filterType === 'Bathroom' ? null : 'Bathroom')} className={'filter-pill ' + (filterType === 'Bathroom' ? 'active' : '')} style={filterType === 'Bathroom' ? { background: '#3b82f6' } : {}}>🚻 ({allLocations.filter(l => l.hasBathroom).length})</button><button onClick={() => setFilterType(filterType === 'Hub' ? null : 'Hub')} className={'filter-pill ' + (filterType === 'Hub' ? 'active' : '')} style={filterType === 'Hub' ? { background: LOCATION_TYPES.Hub.color } : {}}>{LOCATION_TYPES.Hub.label} ({allLocations.filter(l => normalizeType(l.locationType) === 'Hub').length})</button><button onClick={() => setFilterType(filterType === 'Hut' ? null : 'Hut')} className={'filter-pill ' + (filterType === 'Hut' ? 'active' : '')} style={filterType === 'Hut' ? { background: LOCATION_TYPES.Hut.color } : {}}>{LOCATION_TYPES.Hut.label} ({allLocations.filter(l => normalizeType(l.locationType) === 'Hut').length})</button><button onClick={() => setFilterType(filterType === 'CO' ? null : 'CO')} className={'filter-pill ' + (filterType === 'CO' ? 'active' : '')} style={filterType === 'CO' ? { background: LOCATION_TYPES.CO.color } : {}}>{LOCATION_TYPES.CO.label} ({allLocations.filter(l => normalizeType(l.locationType) === 'CO').length})</button><button onClick={() => setFilterType(filterType === 'Garage' ? null : 'Garage')} className={'filter-pill ' + (filterType === 'Garage' ? 'active' : '')} style={filterType === 'Garage' ? { background: LOCATION_TYPES.Garage.color } : {}}>{LOCATION_TYPES.Garage.label} ({allLocations.filter(l => normalizeType(l.locationType) === 'Garage').length})</button></div><div className="scroll-hint">→</div></div></div>

      {viewMode === 'map' && (<div className="map-container"><MapContainer center={mapFocusLocation ? [mapFocusLocation.latitude, mapFocusLocation.longitude] : getMapCenter()} zoom={mapFocusLocation ? 15 : 10} style={{ height: '100%', width: '100%' }} key={mapFocusLocation?.id || 'default'}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon}><Popup>Your Location</Popup></Marker>}{filteredLocations.map(loc => loc.latitude && loc.longitude && (<Marker key={loc.id} position={[loc.latitude, loc.longitude]} icon={loc.isPending ? pendingMarkerIcons[normalizeType(loc.locationType)] : markerIcons[normalizeType(loc.locationType)]}><Popup><div className="popup-content"><div className="popup-name">{loc.name || 'Unnamed'}</div><div className="popup-header">{loc.requiresLadder && <span className="popup-ladder">🪜</span>}{loc.hasLadderBracket && <span className="popup-bracket">✓</span>}{loc.hasBathroom && <span className="popup-bathroom">🚻</span>}</div><span className="popup-type" style={{ color: LOCATION_TYPES[normalizeType(loc.locationType)]?.color }}>{normalizeType(loc.locationType)}{loc.requiresLadder && ' • Needs Ladder'}{loc.hasLadderBracket && ' • Has Bracket'}{loc.hasBathroom && ' • Bathroom'}</span><div className="popup-address">{loc.address}</div>{loc.notes && <div className="popup-notes">{loc.notes}</div>}<button onClick={() => handleNavigate(loc)} className="popup-nav-btn"><Navigation size={14} /> Navigate</button></div></Popup></Marker>))}</MapContainer><div className="map-legend">{FILTER_TYPES.map(type => <div key={type} className="legend-item"><span className="legend-dot" style={{ background: LOCATION_TYPES[type].color }}></span><span>{type}</span></div>)}</div></div>)}

      {viewMode === 'list' && (<div className="locations-list">{loading ? <div className="loading"><div className="spinner"></div><p>Loading...</p></div> : filteredLocations.length === 0 ? <div className="empty-state"><MapPin size={48} /><p>No locations found</p></div> : filteredLocations.map(loc => (<LocationCard key={loc.id} location={loc} distance={getDistanceText(loc)} onNavigate={handleNavigate} onCopyAddress={handleCopyAddress} onShare={handleShareLocation} onEdit={handleEdit} onDelete={(l) => setDeleteConfirm(l)} onShowOnMap={handleShowOnMap} isSelected={selectedLocation?.id === loc.id} onSelect={() => setSelectedLocation(selectedLocation?.id === loc.id ? null : loc)} copied={copied} linkCopied={linkCopied} isDuplicate={allLocations.filter(l => l.name?.toLowerCase() === loc.name?.toLowerCase() && normalizeType(l.locationType) === normalizeType(loc.locationType)).length > 1} canEdit={canEdit} canDelete={canDelete} canViewMeta={canViewActivityLog} />))}</div>)}

      {showAddModal && <AddLocationModal userOrg={userOrg} userEmail={user?.email} onClose={() => setShowAddModal(false)} existingLocations={allLocations} isOnline={isOnline} />}
      {showEditModal && editingLocation && <EditLocationModal location={editingLocation} userOrg={userOrg} userEmail={user?.email} onClose={() => { setShowEditModal(false); setEditingLocation(null); }} onSaveSuccess={recordEdit} isOnline={isOnline} />}
      {showActivityLog && <ActivityLogModal userOrg={userOrg} userRole={userRole} onClose={() => setShowActivityLog(false)} />}
      {showTrash && <TrashModal userOrg={userOrg} userEmail={user?.email} onClose={() => setShowTrash(false)} />}
      {showTeamMembers && <TeamMembersModal userOrg={userOrg} userEmail={user?.email} userRole={userRole} currentUserId={user?.uid} onClose={() => setShowTeamMembers(false)} />}
      {showEquipmentOrders && <EquipmentOrdersModal onClose={() => setShowEquipmentOrders(false)} />}
      {showInventory && <InventoryModal userId={user?.uid} onClose={() => setShowInventory(false)} />}
      {showSettings && <SettingsModal user={user} locations={locations} onClose={() => setShowSettings(false)} />}
      {showDropMeasure && <DropMeasureModal onClose={() => setShowDropMeasure(false)} />}
      {showTimeTracker && <TimeTracker userId={user?.uid} onClose={() => setShowTimeTracker(false)} />}
      {deleteConfirm && <DeleteConfirmModal location={deleteConfirm} onConfirm={() => handleDelete(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
      {rateLimitMessage && <div className="rate-limit-toast">{rateLimitMessage}</div>}
    </div>
  );
}

function LocationCard({ location, distance, onNavigate, onCopyAddress, onShare, onEdit, onDelete, onShowOnMap, isSelected, onSelect, copied, linkCopied, isDuplicate, canEdit, canDelete, canViewMeta }) {
  const typeConfig = LOCATION_TYPES[normalizeType(location.locationType)] || LOCATION_TYPES.Hub;
  return (
    <div className={'location-card ' + (isSelected ? 'selected ' : '') + (isDuplicate ? 'duplicate ' : '') + (location.isPending ? 'pending' : '')}><button onClick={onSelect} className="location-card-main"><div className="location-icon" style={{ background: typeConfig.color + '20' }}><MapPin size={24} color={typeConfig.color} /></div><div className="location-info"><div className="location-name"><span>{location.name}</span>{location.requiresLadder && <span className="ladder-icon">🪜</span>}{location.isPending && <span className="pending-badge">Pending</span>}</div><p className="location-address">{location.address}</p><div className="location-badges"><span className="type-badge" style={{ background: typeConfig.color + '20', color: typeConfig.color }}>{typeConfig.label}</span>{location.hasLadderBracket && <span className="bracket-badge">Has Bracket</span>}{location.hasBathroom && <span className="bathroom-badge">🚻 Bathroom</span>}</div>{location.notes && !isSelected && <p className="location-notes-preview">{location.notes.length > 50 ? location.notes.substring(0, 50) + '...' : location.notes}</p>}</div>{distance && <div className="location-distance">{distance}</div>}</button>
      {isSelected && (<div className="location-details">{location.notes && <p className="location-notes">{location.notes}</p>}<div className="location-meta"><div className="location-coords">{location.latitude?.toFixed(6)}, {location.longitude?.toFixed(6)}</div>{canViewMeta && !location.isPending && <div className="location-added-by">Added by: {location.createdBy || 'Unknown'}{location.createdAt && <span> on {(location.createdAt.toDate ? location.createdAt.toDate() : new Date(location.createdAt)).toLocaleDateString()}</span>}</div>}{canViewMeta && location.lastModifiedBy && <div className="location-modified-by">Edited by: {location.lastModifiedBy}{location.lastModified && <span> on {(location.lastModified.toDate ? location.lastModified.toDate() : new Date(location.lastModified)).toLocaleDateString()}</span>}</div>}{location.isPending && <div className="location-added-by pending-note">Waiting to sync</div>}</div><div className="location-actions"><button onClick={() => onNavigate(location)} className="navigate-button"><Navigation size={18} /> Navigate</button><button onClick={() => onShowOnMap(location)} className="map-button"><MapIcon size={18} /> Map</button><button onClick={() => onCopyAddress(location.address)} className="copy-button"><Copy size={18} /> {copied ? 'Copied!' : 'Copy'}</button>{!location.isPending && <button onClick={() => onShare(location)} className="share-button"><Share2 size={18} /> {linkCopied ? 'Copied!' : 'Share'}</button>}</div>{!location.isPending && (canEdit || canDelete) && (<div className="location-actions edit-actions">{canEdit && <button onClick={() => onEdit(location)} className="edit-button"><Edit2 size={18} /> Edit</button>}{canDelete && <button onClick={() => onDelete(location)} className="delete-button"><Trash2 size={18} /> Delete</button>}</div>)}</div>)}
    </div>
  );
}

function AddLocationModal({ userOrg, userEmail, onClose, existingLocations, isOnline }) {
  const [name, setName] = useState(''); const [address, setAddress] = useState(''); const [locationType, setLocationType] = useState(''); const [notes, setNotes] = useState(''); const [requiresLadder, setRequiresLadder] = useState(false); const [hasLadderBracket, setHasLadderBracket] = useState(false); const [hasBathroom, setHasBathroom] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [warning, setWarning] = useState(''); const [isBlocked, setIsBlocked] = useState(false); const [coords, setCoords] = useState({ lat: '', lng: '' }); const [useCurrentLocation, setUseCurrentLocation] = useState(false); const [showManualCoords, setShowManualCoords] = useState(false); const [manualCoordsInput, setManualCoordsInput] = useState('');
  const checkDupes = (n, a, lat, lng, t) => { if (!existingLocations?.length || !t) return; const norm = s => s?.toLowerCase().replace(/\s+/g, ' ').trim() || ''; const nameMatch = existingLocations.find(l => norm(l.name) === norm(n) && norm(n) && normalizeType(l.locationType) === t); if (nameMatch) { setError('A ' + t + ' named "' + nameMatch.name + '" already exists!'); setIsBlocked(true); return; } setError(''); setIsBlocked(false); const addrMatch = existingLocations.find(l => norm(l.address) === norm(a) && norm(a) && normalizeType(l.locationType) === t); if (addrMatch) setWarning('A ' + t + ' at that address already exists'); else if (lat && lng && existingLocations.find(l => l.latitude && l.longitude && normalizeType(l.locationType) === t && calculateDistance(lat, lng, l.latitude, l.longitude) < 0.02)) setWarning('A location within 100ft exists'); else setWarning(''); };
  const getGPS = () => { if (!navigator.geolocation) { setError('GPS not supported on this device'); return; } setLoading(true); setError(''); navigator.geolocation.getCurrentPosition(async (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setUseCurrentLocation(true); try { const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + p.coords.latitude + '&lon=' + p.coords.longitude + '&zoom=18', { headers: { 'User-Agent': 'FidLoc/1.0' } }); const d = await r.json(); if (d.display_name) setAddress(d.display_name.split(', ').slice(0, 4).join(', ')); } catch { setAddress(p.coords.latitude.toFixed(5) + ', ' + p.coords.longitude.toFixed(5)); } setLoading(false); }, (err) => { if (err.code === 1) setError('Location permission denied. Go to Settings > Safari > Location and allow for this site.'); else if (err.code === 2) setError('GPS unavailable. Make sure Location Services is ON in Settings > Privacy > Location Services.'); else if (err.code === 3) setError('GPS timed out. Try again outside with clear sky.'); else setError('GPS failed: ' + err.message); setLoading(false); }, { enableHighAccuracy: true, timeout: 15000 }); };
  const parseCoords = () => { const m = manualCoordsInput.match(/(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/); if (m && Math.abs(parseFloat(m[1])) <= 90 && Math.abs(parseFloat(m[2])) <= 180) { setCoords({ lat: parseFloat(m[1]), lng: parseFloat(m[2]) }); setUseCurrentLocation(true); setShowManualCoords(false); } else setError('Invalid coords'); };
  const geocode = async (a) => { try { const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(a) + '&key=AIzaSyDt1X0uhHu-wUC0L51T-AS77ymlusiYh7I'); const d = await r.json(); return d.results?.[0] ? { lat: d.results[0].geometry.location.lat, lng: d.results[0].geometry.location.lng } : null; } catch { return null; } };
  const submit = async (e) => { e.preventDefault(); if (isBlocked) return; setLoading(true); setError(''); var finalCoords = coords; if (!useCurrentLocation || !coords.lat) { if (!isOnline) { setError('Offline - use GPS'); setLoading(false); return; } finalCoords = await geocode(address); if (!finalCoords) { setError('Could not geocode'); setLoading(false); return; } } var data = { name, address, latitude: finalCoords.lat, longitude: finalCoords.lng, locationType, notes, requiresLadder: locationType === 'Hub' ? requiresLadder : false, hasLadderBracket: locationType === 'Hub' ? hasLadderBracket : false, hasBathroom: (locationType === 'CO' || locationType === 'Garage') ? hasBathroom : false, createdBy: userEmail, userOrg }; try { if (isOnline) { await addDoc(collection(db, 'organizations', userOrg, 'locations'), Object.assign({}, data, { createdAt: Timestamp.now(), lastModified: Timestamp.now() })); await logActivity(userOrg, 'created', name, userEmail); } else await offlineQueue.addToQueue(data); onClose(); } catch { setError('Failed to save'); } setLoading(false); };
  return (<div className="modal-overlay"><div className="modal"><div className="modal-header"><h2>Add Location</h2>{!isOnline && <span className="offline-indicator"><WifiOff size={16} /> Offline</span>}<button onClick={onClose} className="close-button"><X size={24} /></button></div><form onSubmit={submit} className="modal-form">{!isOnline && <div className="offline-notice">Offline - will sync later</div>}{error && <div className="error-message">{error}</div>}{warning && <div className="warning-message">{warning}</div>}<div className="form-group"><label>Name *</label><input value={name} onChange={e => { const upperName = e.target.value.toUpperCase(); setName(upperName); checkDupes(upperName, address, null, null, locationType); }} required /></div><div className="form-group"><label>Type *</label><select value={locationType} onChange={e => { setLocationType(e.target.value); checkDupes(name, address, coords.lat, coords.lng, e.target.value); }} required><option value="">-- Select --</option>{FILTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div><div className="form-group"><label>Address *</label><input value={address} onChange={e => { setAddress(e.target.value); setUseCurrentLocation(false); checkDupes(name, e.target.value, null, null, locationType); }} required /><div className="location-buttons"><button type="button" onClick={getGPS} className="location-btn" disabled={loading}>📍 GPS</button><button type="button" onClick={() => setShowManualCoords(!showManualCoords)} className="location-btn">✏️ Coords</button></div>{showManualCoords && <div className="manual-coords"><input value={manualCoordsInput} onChange={e => setManualCoordsInput(e.target.value)} placeholder="42.98, -71.45" /><button type="button" onClick={parseCoords} className="parse-btn">Set</button></div>}{useCurrentLocation && coords.lat && <div className="coords-captured">✅ {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</div>}</div>{locationType === 'Hub' && <div className="checkbox-group"><label className="checkbox-label"><input type="checkbox" checked={requiresLadder} onChange={e => setRequiresLadder(e.target.checked)} /> 🪜 Requires Ladder</label>{requiresLadder && <label className="checkbox-label"><input type="checkbox" checked={hasLadderBracket} onChange={e => setHasLadderBracket(e.target.checked)} /> Has Bracket</label>}</div>}{(locationType === 'CO' || locationType === 'Garage') && <div className="checkbox-group"><label className="checkbox-label"><input type="checkbox" checked={hasBathroom} onChange={e => setHasBathroom(e.target.checked)} /> 🚻 Has Bathroom</label></div>}<div className="form-group"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} /></div><div className="modal-actions"><button type="button" onClick={onClose} className="cancel-button">Cancel</button><button type="submit" disabled={loading || isBlocked} className="submit-button">{loading ? 'Saving...' : 'Add'}</button></div></form></div></div>);
}

function EditLocationModal({ location, userOrg, userEmail, onClose, onSaveSuccess, isOnline }) {
  const [name, setName] = useState((location.name || '').toUpperCase()); const [address, setAddress] = useState(location.address || ''); const [locationType, setLocationType] = useState(location.locationType || 'Hub'); const [notes, setNotes] = useState(location.notes || ''); const [requiresLadder, setRequiresLadder] = useState(location.requiresLadder || false); const [hasLadderBracket, setHasLadderBracket] = useState(location.hasLadderBracket || false); const [hasBathroom, setHasBathroom] = useState(location.hasBathroom || false); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const submit = async (e) => { e.preventDefault(); if (!isOnline) { setError('Must be online to edit'); return; } setLoading(true); setError(''); var changes = []; if (name !== location.name) changes.push({ field: 'name', before: location.name, after: name }); if (address !== location.address) changes.push({ field: 'address', before: location.address, after: address }); if (locationType !== location.locationType) changes.push({ field: 'type', before: location.locationType, after: locationType }); if (notes !== (location.notes || '')) changes.push({ field: 'notes', before: location.notes || '(empty)', after: notes || '(empty)' }); if (requiresLadder !== location.requiresLadder) changes.push({ field: 'requiresLadder', before: location.requiresLadder ? 'Yes' : 'No', after: requiresLadder ? 'Yes' : 'No' }); if (hasLadderBracket !== location.hasLadderBracket) changes.push({ field: 'hasLadderBracket', before: location.hasLadderBracket ? 'Yes' : 'No', after: hasLadderBracket ? 'Yes' : 'No' }); if (hasBathroom !== location.hasBathroom) changes.push({ field: 'hasBathroom', before: location.hasBathroom ? 'Yes' : 'No', after: hasBathroom ? 'Yes' : 'No' }); if (!changes.length) { onClose(); return; } try { await updateDoc(doc(db, 'organizations', userOrg, 'locations', location.id), { name, address, locationType, notes, requiresLadder: locationType === 'Hub' ? requiresLadder : false, hasLadderBracket: locationType === 'Hub' ? hasLadderBracket : false, hasBathroom: (locationType === 'CO' || locationType === 'Garage') ? hasBathroom : false, lastModified: Timestamp.now(), lastModifiedBy: userEmail }); await logActivity(userOrg, 'edited', name, userEmail, changes); if (onSaveSuccess) onSaveSuccess(); onClose(); } catch { setError('Failed to save'); } setLoading(false); };
  return (<div className="modal-overlay"><div className="modal"><div className="modal-header"><h2>Edit Location</h2><button onClick={onClose} className="close-button"><X size={24} /></button></div><form onSubmit={submit} className="modal-form">{error && <div className="error-message">{error}</div>}{!isOnline && <div className="error-message">Must be online to edit</div>}<div className="form-group"><label>Name *</label><input value={name} onChange={e => setName(e.target.value.toUpperCase())} required /></div><div className="form-group"><label>Type *</label><select value={locationType} onChange={e => setLocationType(e.target.value)} required>{FILTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div><div className="form-group"><label>Address *</label><input value={address} onChange={e => setAddress(e.target.value)} required /></div>{locationType === 'Hub' && <div className="checkbox-group"><label className="checkbox-label"><input type="checkbox" checked={requiresLadder} onChange={e => setRequiresLadder(e.target.checked)} /> 🪜 Requires Ladder</label>{requiresLadder && <label className="checkbox-label"><input type="checkbox" checked={hasLadderBracket} onChange={e => setHasLadderBracket(e.target.checked)} /> Has Bracket</label>}</div>}{(locationType === 'CO' || locationType === 'Garage') && <div className="checkbox-group"><label className="checkbox-label"><input type="checkbox" checked={hasBathroom} onChange={e => setHasBathroom(e.target.checked)} /> 🚻 Has Bathroom</label></div>}<div className="form-group"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} /></div><div className="modal-actions"><button type="button" onClick={onClose} className="cancel-button">Cancel</button><button type="submit" disabled={loading || !isOnline} className="submit-button">{loading ? 'Saving...' : 'Save Changes'}</button></div></form></div></div>);
}

function ActivityLogModal({ userOrg, userRole, onClose }) {
  const [activities, setActivities] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [clearing, setClearing] = useState(false);
  useEffect(() => { const q = query(collection(db, 'organizations', userOrg, 'activityLog'), orderBy('timestamp', 'desc'), limit(50)); return onSnapshot(q, (snap) => { setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); setError(''); }, (err) => { console.error('Activity log error:', err); setError('Unable to load activity log.'); setLoading(false); }); }, [userOrg]);
  const clearActivityLog = async () => { if (!window.confirm('Clear all activity log entries? This cannot be undone.')) return; setClearing(true); setError(''); try { const toDelete = [...activities]; for (const a of toDelete) { await deleteDoc(doc(db, 'organizations', userOrg, 'activityLog', a.id)); } } catch (err) { console.error('Clear activity log failed:', err); setError('Failed to clear: ' + err.message); } setClearing(false); };
  var formatTime = (ts) => ts ? (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleString() : ''; var getIcon = (a) => a === 'created' ? '➕' : a === 'edited' ? '✏️' : a === 'deleted' ? '🗑️' : a === 'restored' ? '♻️' : '📝'; var getColor = (a) => a === 'created' ? '#22c55e' : a === 'edited' ? '#3b82f6' : a === 'deleted' ? '#ef4444' : a === 'restored' ? '#22c55e' : '#9ca3af';
  return (<div className="modal-overlay"><div className="modal activity-modal"><div className="modal-header"><h2><History size={20} /> Activity Log</h2><div className="modal-header-actions">{userRole === 'owner' && activities.length > 0 && <button onClick={clearActivityLog} disabled={clearing} className="clear-log-btn">{clearing ? 'Clearing...' : 'Clear All'}</button>}<button onClick={onClose} className="close-button"><X size={24} /></button></div></div><div className="activity-log-content">{loading ? <div className="loading"><div className="spinner"></div></div> : error ? <div className="error-message">{error}</div> : activities.length === 0 ? <div className="empty-state"><p>No activity yet</p></div> : (<div className="activity-list">{activities.map(a => (<div key={a.id} className="activity-item"><div className="activity-icon" style={{ background: getColor(a.action) + '20', color: getColor(a.action) }}>{getIcon(a.action)}</div><div className="activity-details"><div className="activity-summary"><strong>{a.userEmail}</strong> {a.action} <strong>{a.locationName}</strong></div><div className="activity-time">{formatTime(a.timestamp)}</div>{a.changes && a.changes.length > 0 && <div className="activity-changes">{a.changes.map((c, i) => <div key={i} className="change-item"><span className="change-field">{c.field}:</span><span className="change-before">{String(c.before)}</span><span className="change-arrow">→</span><span className="change-after">{String(c.after)}</span></div>)}</div>}{a.action === 'deleted' && a.changes && a.changes.deletedLocation && <div className="activity-changes deleted-info"><div className="change-item">Deleted: {a.changes.deletedLocation.name} ({a.changes.deletedLocation.locationType})</div></div>}</div></div>))}</div>)}</div></div></div>);
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
      const loadedMembers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMembers(loadedMembers);
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
      const newInviteRef = await addDoc(collection(db, 'invites'), { email: inviteEmail.toLowerCase().trim(), role: inviteRole, organizationId: userOrg, invitedBy: userEmail, status: 'pending', createdAt: Timestamp.now() });
      // Immediately add to local state for instant UI update
      setInvites(prev => [...prev, { id: newInviteRef.id, email: inviteEmail.toLowerCase().trim(), role: inviteRole, organizationId: userOrg, invitedBy: userEmail, status: 'pending', createdAt: new Date() }]);
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
      // Immediately remove from local state (onSnapshot should also catch this, but this ensures instant UI update)
      setInvites(prev => prev.filter(inv => inv.id !== inviteId));
    } catch (err) {
      console.error('Cancel invite failed:', err);
      setError('Failed to cancel invite.');
    }
    setCancelingInvite(null);
  };

  const changeRole = async (memberId, newRole) => {
    if (!isOwner) return;
    setChangingRole(memberId);
    setError('');
    try {
      const memberRef = doc(db, 'organizations', userOrg, 'members', memberId);
      await updateDoc(memberRef, { role: newRole });
      // Immediately update local state
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
    } catch (err) {
      console.error('Change role failed:', err);
      setError('Failed to change role: ' + err.message);
    }
    setChangingRole(null);
  };

  const removeMember = async (member) => {
    if (!isOwner || member.id === currentUserId) return;
    setRemoving(member.id);
    setError('');
    try {
      await deleteDoc(doc(db, 'organizations', userOrg, 'members', member.id));
      // Immediately remove from local state
      setMembers(prev => prev.filter(m => m.id !== member.id));
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

function InventoryModal({ userId, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [scannedItems, setScannedItems] = useState([]);
  const [bufferItems, setBufferItems] = useState([]);
  const [copiedSerials, setCopiedSerials] = useState(new Set());
  const [quickLookup, setQuickLookup] = useState('');
  const [quickMatches, setQuickMatches] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [manualSerial, setManualSerial] = useState('');
  const [lastScanned, setLastScanned] = useState(null);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [lastCopied, setLastCopied] = useState(null);
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const lastScannedCodeRef = useRef(null);
  const lastScanTimeRef = useRef(0);
  const bufferFileRef = useRef(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Load saved inventory from localStorage (will move to Firebase later)
  useEffect(() => {
    const saved = localStorage.getItem(`inventory_${userId}`);
    if (saved) {
      const data = JSON.parse(saved);
      setScannedItems(data.scannedItems || []);
      setBufferItems(data.bufferItems || []);
    }
  }, [userId]);

  // Save to localStorage whenever items change
  useEffect(() => {
    if (userId) {
      localStorage.setItem(`inventory_${userId}`, JSON.stringify({ scannedItems, bufferItems }));
    }
  }, [scannedItems, bufferItems, userId]);

  // Quick lookup by last 4 digits
  const handleQuickLookup = (value) => {
    const search = value.toUpperCase();
    setQuickLookup(search);
    if (search.length >= 3) {
      const matches = bufferItems.filter(item => 
        item.serial.endsWith(search) || item.serial.includes(search)
      ).filter(item => !scannedItems.find(s => s.serial === item.serial));
      setQuickMatches(matches);
    } else {
      setQuickMatches([]);
    }
  };

  const addFromQuickMatch = (serial) => {
    if (scannedItems.find(i => i.serial === serial)) {
      alert('Already on truck!');
      return;
    }
    playBeep(true);
    setScannedItems(prev => [...prev, { serial, scannedAt: new Date().toISOString() }]);
    setQuickLookup('');
    setQuickMatches([]);
    setLastScanned({ serial, status: 'added' });
  };

  const addManualItem = () => {
    if (!manualSerial.trim()) return;
    const serial = manualSerial.trim().toUpperCase();
    if (scannedItems.find(i => i.serial === serial)) {
      alert('Item already scanned!');
      return;
    }
    setScannedItems([...scannedItems, { serial, scannedAt: new Date().toISOString() }]);
    setManualSerial('');
  };

  // Beep sound generator
  const playBeep = (success = true) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      if (success) {
        oscillator.frequency.value = 1200;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
      } else {
        oscillator.frequency.value = 300;
        oscillator.type = 'square';
        gainNode.gain.value = 0.2;
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.3);
      }
    } catch (e) { console.log('Audio not supported'); }
  };

  const scannedItemsRef = useRef(scannedItems);
  useEffect(() => { scannedItemsRef.current = scannedItems; }, [scannedItems]);

  const addScannedSerial = (serial, isFromScanner = false) => {
    const cleanSerial = serial.trim().toUpperCase();
    if (scannedItemsRef.current.find(i => i.serial === cleanSerial)) {
      if (isFromScanner) playBeep(false);
      setLastScanned({ serial: cleanSerial, status: 'duplicate' });
      return;
    }
    playBeep(true);
    setScannedItems(prev => [...prev, { serial: cleanSerial, scannedAt: new Date().toISOString() }]);
    setLastScanned({ serial: cleanSerial, status: 'added' });
  };

  const startScanner = async () => {
    try {
      const html5QrCode = new Html5Qrcode("barcode-reader");
      html5QrCodeRef.current = html5QrCode;
      
      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 100 },
          aspectRatio: 3.0
        },
        (decodedText) => {
          // Extract serial number - look for SN: prefix or just use the code
          let serial = decodedText;
          if (decodedText.includes('SN:')) {
            serial = decodedText.split('SN:')[1].split(/[\s,]/)[0];
          }
          const cleanSerial = serial.trim().toUpperCase();
          
          // Prevent rapid re-scans of same barcode - 5 second cooldown
          const now = Date.now();
          if (cleanSerial === lastScannedCodeRef.current && now - lastScanTimeRef.current < 5000) {
            return; // Same code scanned within 5 seconds, ignore completely
          }
          
          lastScannedCodeRef.current = cleanSerial;
          lastScanTimeRef.current = now;
          addScannedSerial(cleanSerial, true);
        },
        () => {} // ignore errors during scanning
      );
      setScanning(true);
    } catch (err) {
      console.error('Scanner error:', err);
      alert('Could not start camera. Make sure you gave camera permission.');
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
    setScanning(false);
    setLastScanned(null);
  };

  // Cleanup scanner when modal closes or tab changes
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'scan' && scanning) {
      stopScanner();
    }
  }, [activeTab]);

  // AI-powered buffer sheet reader using Claude
  const processBufferWithAI = async (file) => {
    setAiProcessing(true);
    
    try {
      let content = [];
      const fileType = file.type;
      const fileName = file.name.toLowerCase();
      
      // Handle Excel files with XLSX library
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_csv(firstSheet);
        content = [{
          type: 'text',
          text: `This is a buffer sheet in spreadsheet format. Extract serial numbers ONLY from the FIRST column (Serial No column). Ignore all other columns. Serial numbers for ONTs start with "ADTN" followed by alphanumeric characters. Serial numbers for routers start with "8612", "854", or "841" followed by alphanumeric characters. Return ONLY the serial numbers, one per line, nothing else.\n\nData:\n${data}`
        }];
      }
      // Handle CSV as text
      else if (fileName.endsWith('.csv')) {
        const text = await file.text();
        content = [{
          type: 'text',
          text: `This is a buffer sheet in spreadsheet format. Extract serial numbers ONLY from the FIRST column (Serial No column). Ignore all other columns. Serial numbers for ONTs start with "ADTN" followed by alphanumeric characters. Serial numbers for routers start with "8612", "854", or "841" followed by alphanumeric characters. Return ONLY the serial numbers, one per line, nothing else.\n\nData:\n${text}`
        }];
      }
      // Handle PDF as base64
      else if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(file);
        });
        content = [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64
            }
          },
          {
            type: 'text',
            text: 'This is a buffer sheet showing equipment inventory. Extract serial numbers ONLY from the FIRST/LEFT column labeled "Serial No". Ignore all other columns. Serial numbers for ONTs start with "ADTN" followed by alphanumeric characters. Serial numbers for routers start with "8612", "854", or "841" followed by alphanumeric characters. Return ONLY the serial numbers from the first column, one per line, nothing else. No explanations, no headers, just the serial numbers.'
          }
        ];
      }
      // Handle images - compress first
      else {
        const compressImage = (file) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 2000;
                if (width > maxDim || height > maxDim) {
                  if (width > height) {
                    height = (height / width) * maxDim;
                    width = maxDim;
                  } else {
                    width = (width / height) * maxDim;
                    height = maxDim;
                  }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                resolve(base64);
              };
              img.src = e.target.result;
            };
            reader.readAsDataURL(file);
          });
        };
        
        const base64 = await compressImage(file);
        content = [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64
            }
          },
          {
            type: 'text',
            text: 'This is a buffer sheet showing equipment inventory in a table format. Extract serial numbers ONLY from the FIRST/LEFT column labeled "Serial No". Ignore all other columns. Serial numbers for ONTs start with "ADTN" followed by alphanumeric characters. Serial numbers for routers start with "8612", "854", or "841" followed by alphanumeric characters. Return ONLY the serial numbers from the first column, one per line, nothing else. No explanations, no headers, just the serial numbers.'
          }
        ];
      }
      
      // Call Firebase Cloud Function
      const processBufferSheet = httpsCallable(functions, 'processBufferSheet');
      const result = await processBufferSheet({ content, fileType: file.type });
      
      const serials = result.data.serials || [];
      
      if (serials.length === 0) {
        alert('No serial numbers found in image. Make sure the buffer sheet is clearly visible.');
      } else {
        let addedCount = 0;
        serials.forEach(serial => {
          if (!bufferItems.find(i => i.serial === serial)) {
            setBufferItems(prev => [...prev, { serial, part: 'Unknown' }]);
            addedCount++;
          }
        });
        alert(`Found ${serials.length} serial numbers, added ${addedCount} new items.`);
      }
    } catch (err) {
      console.error('AI processing error:', err);
      alert('Failed to process image: ' + (err.message || 'Unknown error'));
    }
    
    setAiProcessing(false);
    if (bufferFileRef.current) bufferFileRef.current.value = '';
  };

  const removeScannedItem = (serial) => {
    setScannedItems(scannedItems.filter(i => i.serial !== serial));
  };

  const clearScannedItems = () => {
    if (window.confirm('Clear all scanned items?')) {
      setScannedItems([]);
    }
  };

  const clearBufferItems = () => {
    if (window.confirm('Clear buffer sheet data?')) {
      setBufferItems([]);
    }
  };

  // Comparison logic
  const getComparison = () => {
    const scannedSerials = new Set(scannedItems.map(i => i.serial));
    const bufferSerials = new Set(bufferItems.map(i => i.serial));
    
    const matched = scannedItems.filter(i => bufferSerials.has(i.serial));
    const missing = bufferItems.filter(i => !scannedSerials.has(i.serial));
    const extra = scannedItems.filter(i => !bufferSerials.has(i.serial));
    
    return { matched, missing, extra };
  };

  const comparison = getComparison();

  return (
    <div className="modal-overlay">
      <div className="modal inventory-modal">
        <div className="modal-header">
          <h2><ClipboardList size={20} /> My Inventory</h2>
          <button onClick={onClose} className="close-button"><X size={24} /></button>
        </div>
        
        <div className="inventory-tabs">
          <button onClick={() => setActiveTab('overview')} className={`inv-tab ${activeTab === 'overview' ? 'active' : ''}`}>Overview</button>
          <button onClick={() => setActiveTab('scan')} className={`inv-tab ${activeTab === 'scan' ? 'active' : ''}`}>Scan Truck</button>
          <button onClick={() => setActiveTab('buffer')} className={`inv-tab ${activeTab === 'buffer' ? 'active' : ''}`}>Buffer Sheet</button>
          <button onClick={() => setActiveTab('compare')} className={`inv-tab ${activeTab === 'compare' ? 'active' : ''}`}>Compare</button>
          {comparison.missing.length > 0 && (
            <button onClick={() => setActiveTab('submit')} className={`inv-tab submit-tab ${activeTab === 'submit' ? 'active' : ''}`}>
              Submit ({comparison.missing.length})
            </button>
          )}
        </div>

        <div className="inventory-content">
          {activeTab === 'overview' && (
            <div className="inv-overview">
              <div className="inv-stats">
                <div className="inv-stat">
                  <div className="inv-stat-number">{scannedItems.length}</div>
                  <div className="inv-stat-label">On Truck</div>
                </div>
                <div className="inv-stat">
                  <div className="inv-stat-number">{bufferItems.length}</div>
                  <div className="inv-stat-label">On Buffer</div>
                </div>
                <div className="inv-stat matched">
                  <div className="inv-stat-number">{comparison.matched.length}</div>
                  <div className="inv-stat-label">Matched</div>
                </div>
                <div className="inv-stat missing">
                  <div className="inv-stat-number">{comparison.missing.length}</div>
                  <div className="inv-stat-label">Missing</div>
                </div>
              </div>
              
              <div className="inv-instructions">
                <h3>How to use:</h3>
                <ol>
                  <li><strong>Scan Truck</strong> - Scan barcodes or enter serial numbers for equipment on your truck</li>
                  <li><strong>Buffer Sheet</strong> - Take photo of your buffer sheet to import what should be on your truck</li>
                  <li><strong>Compare</strong> - See what's missing, extra, or matched</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'scan' && (
            <div className="inv-scan">
              {bufferItems.length > 0 && (
                <div className="quick-lookup-section">
                  <h3>⚡ Quick Add (Last 3-4 digits)</h3>
                  <p className="scan-hint">Type the last few digits to find from warehouse list</p>
                  <div className="quick-lookup-input">
                    <input 
                      type="text" 
                      value={quickLookup} 
                      onChange={e => handleQuickLookup(e.target.value)}
                      placeholder="e.g. 8617"
                      maxLength={6}
                    />
                    {quickLookup && <button onClick={() => { setQuickLookup(''); setQuickMatches([]); }} className="clear-input-btn"><X size={18} /></button>}
                  </div>
                  {quickLookup.length >= 3 && (
                    <div className="quick-matches">
                      {quickMatches.length > 0 ? (
                        quickMatches.map((item, idx) => (
                          <button key={idx} onClick={() => addFromQuickMatch(item.serial)} className="quick-match-btn">
                            <span className="match-serial">{item.serial.slice(0, -quickLookup.length)}<strong>{item.serial.slice(-quickLookup.length)}</strong></span>
                            <span className="match-add">+ Add</span>
                          </button>
                        ))
                      ) : (
                        <div className="no-match">
                          <p>No match in warehouse list</p>
                          <button onClick={() => { setManualSerial(quickLookup); setQuickLookup(''); setQuickMatches([]); }} className="scan-instead-btn">
                            <ScanLine size={16} /> Scan full barcode to add as Extra
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="scanner-section">
                <h3>📷 Barcode Scanner</h3>
                <div id="barcode-reader" ref={scannerRef}></div>
                {!scanning ? (
                  <button onClick={startScanner} className="start-scanner-btn">
                    <ScanLine size={20} /> Start Barcode Scanner
                  </button>
                ) : (
                  <button onClick={stopScanner} className="stop-scanner-btn">
                    <StopCircle size={20} /> Stop Scanner
                  </button>
                )}
                {lastScanned && (
                  <div className={`last-scanned ${lastScanned.status}`}>
                    {lastScanned.status === 'added' ? '✅' : '⚠️'} {lastScanned.serial}
                    {lastScanned.status === 'duplicate' && ' (already scanned)'}
                  </div>
                )}
              </div>

              <div className="scan-input-section">
                <h3>✏️ Manual Entry</h3>
                <p className="scan-hint">Type or paste full serial number</p>
                <div className="manual-input">
                  <input 
                    type="text" 
                    value={manualSerial} 
                    onChange={e => setManualSerial(e.target.value.toUpperCase())}
                    placeholder="e.g. ADTN2516571E"
                    onKeyPress={e => e.key === 'Enter' && addManualItem()}
                  />
                  <button onClick={addManualItem} className="add-serial-btn">Add</button>
                </div>
              </div>

              <div className="scanned-list">
                <div className="scanned-header">
                  <h3>Scanned Items ({scannedItems.length})</h3>
                  {scannedItems.length > 0 && <button onClick={clearScannedItems} className="clear-btn">Clear All</button>}
                </div>
                {scannedItems.length === 0 ? (
                  <p className="empty-list">No items scanned yet</p>
                ) : (
                  <div className="item-list">
                    {scannedItems.map((item, idx) => (
                      <div key={idx} className="scanned-item">
                        <span className="item-serial">{item.serial}</span>
                        <button onClick={() => removeScannedItem(item.serial)} className="remove-item-btn"><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'buffer' && (
            <div className="inv-buffer">
              <div className="ai-scan-section">
                <h3>🤖 Scan Buffer Sheet with AI</h3>
                <p className="scan-hint">Take a photo or upload a file (PDF, Excel, image) - AI will extract serial numbers</p>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  ref={bufferFileRef}
                  onChange={e => e.target.files[0] && processBufferWithAI(e.target.files[0])}
                  style={{ display: 'none' }}
                  id="ai-buffer-photo"
                />
                <input 
                  type="file" 
                  accept=".pdf,.xlsx,.xls,.csv,image/*"
                  onChange={e => e.target.files[0] && processBufferWithAI(e.target.files[0])}
                  style={{ display: 'none' }}
                  id="ai-buffer-file"
                />
                <div className="ai-btn-group">
                  <label htmlFor="ai-buffer-photo" className={`ai-scan-btn ${aiProcessing ? 'processing' : ''}`}>
                    {aiProcessing ? '🤖 AI Reading...' : '📷 Take Photo'}
                  </label>
                  <label htmlFor="ai-buffer-file" className={`ai-scan-btn upload-btn ${aiProcessing ? 'processing' : ''}`}>
                    {aiProcessing ? '🤖 AI Reading...' : '📄 Upload File'}
                  </label>
                </div>
              </div>

              <div className="buffer-manual">
                <h4>Or Paste Manually</h4>
                <p className="scan-hint">Paste serial numbers (one per line)</p>
                <textarea 
                  placeholder="ADTN2516571E&#10;8612A14510019131&#10;ADTN25181D71"
                  rows={4}
                  id="buffer-paste"
                ></textarea>
                <button onClick={() => {
                  const text = document.getElementById('buffer-paste').value;
                  const serials = text.split(/[\n,\s]+/).map(s => s.trim().toUpperCase()).filter(s => s.length > 5);
                  const newItems = serials.filter(s => !bufferItems.find(b => b.serial === s)).map(s => ({ serial: s, part: 'Unknown' }));
                  setBufferItems([...bufferItems, ...newItems]);
                  document.getElementById('buffer-paste').value = '';
                  if (newItems.length > 0) alert(`Added ${newItems.length} items`);
                  else if (serials.length > 0) alert('All items already in list');
                  else alert('No serial numbers found');
                }} className="add-serial-btn">Add to Buffer</button>
              </div>

              <div className="buffer-list">
                <div className="scanned-header">
                  <h3>Buffer Items ({bufferItems.length})</h3>
                  {bufferItems.length > 0 && <button onClick={clearBufferItems} className="clear-btn">Clear All</button>}
                </div>
                {bufferItems.length === 0 ? (
                  <p className="empty-list">No buffer items yet</p>
                ) : (
                  <div className="item-list">
                    {bufferItems.map((item, idx) => (
                      <div key={idx} className="buffer-item">
                        <span className="item-serial">{item.serial}</span>
                        {item.part && item.part !== 'Unknown' && <span className="item-part">{item.part}</span>}
                        <button onClick={() => setBufferItems(bufferItems.filter(b => b.serial !== item.serial))} className="remove-item-btn"><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'compare' && (
            <div className="inv-compare">
              {scannedItems.length === 0 && bufferItems.length === 0 ? (
                <div className="compare-empty">
                  <p>Add items to both your truck scan and buffer sheet to compare.</p>
                </div>
              ) : (
                <>
                  <div className="compare-summary">
                    <div className="summary-stat truck"><span className="stat-num">{scannedItems.length}</span><span className="stat-label">On Truck</span></div>
                    <div className="summary-stat buffer"><span className="stat-num">{bufferItems.length}</span><span className="stat-label">Warehouse Says</span></div>
                    <div className="summary-stat matched"><span className="stat-num">{comparison.matched.length}</span><span className="stat-label">✓ Matched</span></div>
                    <div className="summary-stat missing"><span className="stat-num">{comparison.missing.length}</span><span className="stat-label">Missing</span></div>
                    <div className="summary-stat extra"><span className="stat-num">{comparison.extra.length}</span><span className="stat-label">Extra</span></div>
                  </div>

                  {comparison.missing.length > 0 && (
                    <div className="compare-section missing-section">
                      <div className="section-header">
                        <h3>🔴 Missing ({comparison.missing.length})</h3>
                        <span className="copied-count">{copiedSerials.size} of {comparison.missing.length} copied</span>
                      </div>
                      <p className="section-hint">Tap to copy → paste into website</p>
                      <div className="missing-items">
                        {comparison.missing.map((item, idx) => (
                          <button 
                            key={idx} 
                            className={`missing-item ${copiedSerials.has(item.serial) ? 'copied' : ''} ${lastCopied === item.serial ? 'just-copied' : ''}`}
                            onClick={() => {
                              navigator.clipboard.writeText(item.serial);
                              setCopiedSerials(prev => new Set([...prev, item.serial]));
                              setLastCopied(item.serial);
                              setTimeout(() => setLastCopied(null), 1500);
                            }}
                          >
                            <span className="missing-serial">{item.serial}</span>
                            <span className="copy-status">{copiedSerials.has(item.serial) ? '✓' : '📋'}</span>
                          </button>
                        ))}
                      </div>
                      {copiedSerials.size > 0 && copiedSerials.size < comparison.missing.length && (
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${(copiedSerials.size / comparison.missing.length) * 100}%` }}></div>
                        </div>
                      )}
                      {copiedSerials.size === comparison.missing.length && comparison.missing.length > 0 && (
                        <div className="all-done">🎉 All missing items copied!</div>
                      )}
                      <button onClick={() => setCopiedSerials(new Set())} className="reset-copied-btn">Reset Copied Status</button>
                    </div>
                  )}

                  {comparison.extra.length > 0 && (
                    <div className="compare-section extra-section">
                      <h3>🟡 Extra on Truck ({comparison.extra.length})</h3>
                      <p className="section-hint">On your truck but not on warehouse list</p>
                      <div className="compare-items">
                        {comparison.extra.map((item, idx) => (
                          <div key={idx} className="compare-item extra">{item.serial}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {comparison.matched.length > 0 && (
                    <div className="compare-section matched-section">
                      <h3>🟢 Matched ({comparison.matched.length})</h3>
                      <div className="compare-items collapsed">
                        {comparison.matched.map((item, idx) => (
                          <div key={idx} className="compare-item matched">{item.serial}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'submit' && (
            <div className="inv-submit">
              <div className="submit-instructions">
                <h3>📋 Report Missing Equipment</h3>
                <p>Tap a serial to copy, then paste into the form.</p>
              </div>

              <div className="missing-serials-box">
                <div className="serials-header">
                  <span>Missing ({comparison.missing.length})</span>
                  <button 
                    onClick={() => {
                      const serials = comparison.missing.map(i => i.serial).join('\n');
                      navigator.clipboard.writeText(serials);
                      playBeep(true);
                      alert('Copied ' + comparison.missing.length + ' serials!');
                    }}
                    className="copy-all-btn"
                  >
                    📋 Copy All
                  </button>
                </div>
                <div className="serials-list-mobile">
                  {comparison.missing.map((item, idx) => (
                    <button 
                      key={idx} 
                      className={`serial-row-btn ${copiedSerials.has(item.serial) ? 'copied' : ''}`}
                      onClick={() => {
                        navigator.clipboard.writeText(item.serial);
                        setCopiedSerials(prev => new Set([...prev, item.serial]));
                        playBeep(true);
                      }}
                    >
                      <span className="serial-text">{item.serial}</span>
                      <span className="copy-indicator">{copiedSerials.has(item.serial) ? '✓' : '📋'}</span>
                    </button>
                  ))}
                </div>
                <div className="copy-progress">
                  {copiedSerials.size} of {comparison.missing.length} copied
                </div>
              </div>

              <button 
                onClick={() => window.open('https://forms.office.com/pages/responsepage.aspx?id=XZI8ME5OQUqmnyZJVrSH1lwcfjB4TM5Dqw11fNLOPYxUMVNQSjU1QjhXV1dLSzZZUTdJOFhGVTRQSS4u', '_blank')}
                className="open-form-btn"
              >
                🌐 Open Inventory Form
              </button>
              
              <p className="extension-hint">
                On desktop? Use the <a href="https://chrome.google.com/webstore/detail/fidloc-ms-forms-filler/edhengdfeoehfecdljhonmkghkdlkcee" target="_blank" rel="noopener noreferrer">Chrome extension</a> for faster entry.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function SettingsModal({ user, locations, onClose }) {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  // Check if user has password auth linked
  const hasPasswordAuth = user?.providerData?.some(p => p.providerId === 'password');
  const hasAppleAuth = user?.providerData?.some(p => p.providerId === 'apple.com');
  const hasGoogleAuth = user?.providerData?.some(p => p.providerId === 'google.com');

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    
    setSettingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, newPassword);
      await linkWithCredential(auth.currentUser, credential);
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowSetPassword(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('Link password error:', err);
      if (err.code === 'auth/provider-already-linked') {
        setPasswordError('You already have a password set for this account');
      } else if (err.code === 'auth/requires-recent-login') {
        setPasswordError('Please sign out and sign back in, then try again');
      } else {
        setPasswordError(err.message || 'Failed to set password');
      }
    }
    setSettingPassword(false);
  };

  const exportCSV = () => {
    if (!locations || locations.length === 0) { alert('No locations to export'); return; }
    const headers = ['Name', 'Address', 'Type', 'Latitude', 'Longitude', 'Created'];
    const rows = locations.map(loc => [
      loc.name || '',
      loc.address || '',
      loc.locationType || '',
      loc.lat || '',
      loc.lng || '',
      loc.createdAt?.toDate?.()?.toLocaleDateString() || ''
    ]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `fidloc-locations-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!locations || locations.length === 0) { alert('No locations to export'); return; }
    const content = locations.map(loc => `${loc.name}\n${loc.address || 'No address'}\nType: ${loc.locationType || 'Unknown'}\nCoords: ${loc.lat}, ${loc.lng}\n`).join('\n---\n\n');
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>FidLoc Locations</title><style>body{font-family:Arial,sans-serif;padding:20px;} h1{color:#3b82f6;} pre{white-space:pre-wrap;}</style></head><body><h1>FidLoc Locations Export</h1><p>Exported: ${new Date().toLocaleString()}</p><p>Total: ${locations.length} locations</p><hr><pre>${content}</pre></body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const clearCache = () => {
    if (window.confirm('Clear local settings? This will reset your theme preference and other cached data.\n\nNote: Your inventory data will be preserved.')) {
      const inventoryData = localStorage.getItem('fidloc-inventory');
      localStorage.clear();
      if (inventoryData) localStorage.setItem('fidloc-inventory', inventoryData);
      alert('Cache cleared! The page will reload.');
      window.location.reload();
    }
  };

  const reportBug = () => {
    const choice = window.confirm('How would you like to report?\n\nOK = Email\nCancel = Text Message');
    if (choice) {
      const subject = encodeURIComponent('FidLoc Bug Report');
      const body = encodeURIComponent(`Bug Description:\n\n\nSteps to Reproduce:\n1. \n2. \n3. \n\nExpected Behavior:\n\n\nActual Behavior:\n\n\n---\nApp Version: 1.0.0\nUser: ${user?.email || 'Unknown'}\nDevice: ${navigator.userAgent}`);
      window.open(`mailto:darrencouturier@live.com?subject=${subject}&body=${body}`, '_blank');
    } else {
      const body = encodeURIComponent(`FidLoc Bug Report\n\nUser: ${user?.email || 'Unknown'}\n\nBug:\n`);
      window.open(`sms:6039488812?body=${body}`, '_blank');
    }
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{showPrivacy ? 'Privacy Policy' : 'Settings'}</h2>
          <button onClick={() => showPrivacy ? setShowPrivacy(false) : onClose()} className="close-btn"><X size={24} /></button>
        </div>
        <div className="modal-body settings-body">
          
          {showPrivacy ? (
            <div className="privacy-content">
              <h3>FidLoc Privacy Policy</h3>
              <p><strong>Last Updated:</strong> January 2025</p>
              
              <h4>Information We Collect</h4>
              <p>FidLoc collects the following information to provide our service:</p>
              <ul>
                <li><strong>Account Information:</strong> Email address and display name for authentication</li>
                <li><strong>Location Data:</strong> GPS coordinates and addresses you save as drop locations</li>
                <li><strong>Device Information:</strong> Browser type and device info for troubleshooting</li>
                <li><strong>Inventory Data:</strong> Equipment serial numbers you scan or enter</li>
              </ul>

              <h4>How We Use Your Information</h4>
              <ul>
                <li>To provide and maintain the FidLoc service</li>
                <li>To allow team collaboration on shared locations</li>
                <li>To sync your data across devices</li>
                <li>To improve the app based on usage patterns</li>
              </ul>

              <h4>Data Storage</h4>
              <p>Your data is stored securely in Google Firebase servers. Location data is associated with your organization and shared with team members you invite.</p>

              <h4>Data Sharing</h4>
              <p>We do not sell or share your personal information with third parties. Your location data is only visible to members of your organization.</p>

              <h4>Your Rights</h4>
              <ul>
                <li>Export your data at any time using the Export feature</li>
                <li>Delete your account by contacting support</li>
                <li>Clear local cached data from Settings</li>
              </ul>

              <h4>Contact</h4>
              <p>For privacy questions, contact: darrencouturier@live.com</p>
              
              <button onClick={() => setShowPrivacy(false)} className="settings-btn">Back to Settings</button>
            </div>
          ) : (
            <>
              <div className="settings-section">
                <h3>Profile</h3>
                <div className="settings-item">
                  <span className="settings-label">Display Name</span>
                  <span className="settings-value coming">{user?.displayName || 'Not set'}</span>
                </div>
                <div className="settings-item">
                  <span className="settings-label">Email</span>
                  <span className="settings-value">{user?.email}</span>
                </div>
                <div className="settings-item">
                  <span className="settings-label">Sign-in Methods</span>
                  <span className="settings-value">
                    {hasAppleAuth && '🍎 Apple '}
                    {hasGoogleAuth && '🔵 Google '}
                    {hasPasswordAuth && '🔑 Password'}
                    {!hasAppleAuth && !hasGoogleAuth && !hasPasswordAuth && 'Unknown'}
                  </span>
                </div>
                {!hasPasswordAuth && (hasAppleAuth || hasGoogleAuth) && (
                  <button onClick={() => setShowSetPassword(true)} className="settings-btn">Set Password for Web Login</button>
                )}
                {hasPasswordAuth && (
                  <button onClick={async () => {
                    try {
                      await sendPasswordResetEmail(auth, user.email);
                      alert('Password reset email sent! Check your inbox.');
                    } catch (err) {
                      alert('Failed to send reset email: ' + err.message);
                    }
                  }} className="settings-btn">Reset Password</button>
                )}
              </div>

              <div className="settings-section">
                <h3>Preferences</h3>
                <div className="settings-item">
                  <span className="settings-label">Default View</span>
                  <span className="settings-value coming">Coming Soon</span>
                </div>
                <div className="settings-item">
                  <span className="settings-label">Default Map Type</span>
                  <span className="settings-value coming">Coming Soon</span>
                </div>
                <div className="settings-item">
                  <span className="settings-label">Sort Locations By</span>
                  <span className="settings-value coming">Coming Soon</span>
                </div>
                <div className="settings-item">
                  <span className="settings-label">Show Distance</span>
                  <span className="settings-value coming">Coming Soon</span>
                </div>
              </div>

              <div className="settings-section">
                <h3>Notifications</h3>
                <div className="settings-item">
                  <span className="settings-label">New Team Member</span>
                  <span className="settings-value coming">Coming Soon</span>
                </div>
                <div className="settings-item">
                  <span className="settings-label">Location Updates</span>
                  <span className="settings-value coming">Coming Soon</span>
                </div>
                <div className="settings-item">
                  <span className="settings-label">Equipment Orders</span>
                  <span className="settings-value coming">Coming Soon</span>
                </div>
              </div>

              <div className="settings-section">
                <h3>Data</h3>
                <button onClick={exportCSV} className="settings-btn">Export Locations (CSV)</button>
                <button onClick={exportPDF} className="settings-btn">Export Locations (PDF)</button>
                <button onClick={clearCache} className="settings-btn danger">Clear Local Cache</button>
              </div>

              <div className="settings-section">
                <h3>About</h3>
                <div className="settings-item">
                  <span className="settings-label">Version</span>
                  <span className="settings-value">1.0.0</span>
                </div>
                <button className="settings-btn disabled" disabled>What's New</button>
                <button onClick={reportBug} className="settings-btn">Report a Bug</button>
                <button onClick={() => setShowPrivacy(true)} className="settings-btn">Privacy Policy</button>
              </div>
            </>
          )}

        </div>
      </div>
      
      {showSetPassword && (
        <div className="confirm-overlay" onClick={() => setShowSetPassword(false)}>
          <div className="confirm-dialog" style={{ maxWidth: '350px' }} onClick={e => e.stopPropagation()}>
            <h3>🔑 Set Password</h3>
            <p style={{ marginBottom: '16px', color: '#888', fontSize: '13px' }}>
              Create a password to sign in on the web without Apple/Google.
            </p>
            {passwordSuccess ? (
              <div style={{ color: '#22c55e', textAlign: 'center', padding: '20px' }}>
                ✅ Password set successfully!<br/>You can now sign in with email & password.
              </div>
            ) : (
              <form onSubmit={handleSetPassword}>
                {passwordError && <div style={{ color: '#ef4444', marginBottom: '12px', fontSize: '13px' }}>{passwordError}</div>}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" style={{ width: '100%', padding: '10px', background: '#0f0f23', border: '1px solid #333', borderRadius: '6px', color: '#fff' }} required minLength={6} />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm password" style={{ width: '100%', padding: '10px', background: '#0f0f23', border: '1px solid #333', borderRadius: '6px', color: '#fff' }} required />
                </div>
                <div className="confirm-actions">
                  <button type="button" onClick={() => { setShowSetPassword(false); setPasswordError(''); setNewPassword(''); setConfirmPassword(''); }} className="cancel-button">Cancel</button>
                  <button type="submit" disabled={settingPassword} className="submit-button">{settingPassword ? 'Setting...' : 'Set Password'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function DropMeasureModal({ onClose }) {
  const [phase, setPhase] = useState('ready'); // ready, walking1, marked, walking2, complete
  const [accuracy, setAccuracy] = useState(null);
  const [distance1, setDistance1] = useState(null);
  const [distance2, setDistance2] = useState(null);
  const [pathPoints, setPathPoints] = useState([]);
  const [markPoint, setMarkPoint] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [error, setError] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const phaseRef = useRef(phase);

  // Keep ref in sync with state
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [watchId]);

  const calculatePathDistance = (points) => {
    if (points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const R = 20902231; // Earth radius in feet
      const dLat = (points[i].lat - points[i-1].lat) * Math.PI / 180;
      const dLon = (points[i].lng - points[i-1].lng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(points[i-1].lat * Math.PI / 180) * Math.cos(points[i].lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
      total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    return total;
  };

  const handleStart = () => {
    if (!navigator.geolocation) {
      setError('GPS not available on this device');
      return;
    }
    setError(null);
    setPhase('walking1');
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const startPt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPathPoints([startPt]);
        setCurrentPos(startPt);
        setAccuracy(Math.round(pos.coords.accuracy * 3.281));
        
        // Start watching position
        const id = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude, accuracy: acc } = position.coords;
            setAccuracy(Math.round(acc * 3.281));
            setCurrentPos({ lat: latitude, lng: longitude });
            
            // Add point if accuracy is decent and we're walking
            if (acc <= 20 && (phaseRef.current === 'walking1' || phaseRef.current === 'walking2')) {
              setPathPoints(prev => [...prev, { lat: latitude, lng: longitude }]);
            }
          },
          (err) => {
            if (err.code === 1) setError('Location permission denied');
            else if (err.code === 2) setError('GPS unavailable - check Location Services');
            else setError('GPS error: ' + err.message);
          },
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
        );
        setWatchId(id);
      },
      (err) => {
        if (err.code === 1) setError('Location permission denied');
        else if (err.code === 2) setError('GPS unavailable - check Location Services');
        else if (err.code === 3) setError('GPS timed out - try outside');
        else setError('GPS error');
        setPhase('ready');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleMark = () => {
    const dist = calculatePathDistance(pathPoints);
    setDistance1(Math.round(dist));
    setMarkPoint(currentPos);
    setPhase('marked');
  };

  const handleContinue = () => {
    setPathPoints(markPoint ? [markPoint] : [currentPos]);
    setPhase('walking2');
  };

  const handleEnd = () => {
    const dist = calculatePathDistance(pathPoints);
    setDistance2(Math.round(dist));
    setPhase('complete');
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
  };

  const handleReset = () => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setPhase('ready');
    setAccuracy(null);
    setDistance1(null);
    setDistance2(null);
    setPathPoints([]);
    setMarkPoint(null);
    setCurrentPos(null);
    setError(null);
  };

  const liveDistance = calculatePathDistance(pathPoints);
  const avgDistance = distance1 && distance2 ? Math.round((distance1 + distance2) / 2) : null;
  const variance = distance1 && distance2 ? Math.abs(distance1 - distance2) : null;
  const recommendedDrop = avgDistance ? Math.ceil((avgDistance * 1.15) / 50) * 50 : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal drop-measure-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Ruler size={24} /> Drop Measure</h2>
          <button onClick={onClose} className="close-btn"><X size={24} /></button>
        </div>
        <div className="modal-body drop-measure-body">
          
          {error && <div className="measure-error">{error}</div>}
          
          {phase === 'ready' && (
            <div className="measure-phase">
              <div className="measure-instructions">
                <h3>How to Measure</h3>
                <ol>
                  <li>Stand at the <strong>house/NID</strong></li>
                  <li>Tap <strong>Start</strong> and walk to the FDT/pole</li>
                  <li>Tap <strong>Mark</strong> when you arrive</li>
                  <li>Walk back to the house</li>
                  <li>Tap <strong>End</strong> to get your measurement</li>
                </ol>
                <p className="measure-tip">Walking it twice improves accuracy!</p>
              </div>
              <button onClick={handleStart} className="measure-btn start-btn">
                <Navigation size={24} />
                Start at House
              </button>
            </div>
          )}

          {phase === 'walking1' && (
            <div className="measure-phase">
              <div className="measure-status">
                <div className="status-icon walking">
                  <Navigation size={32} className="pulse" />
                </div>
                <h3>Walking to FDT/Pole...</h3>
                <div className="accuracy-display">
                  GPS Accuracy: <span className={accuracy <= 33 ? 'good' : accuracy <= 66 ? 'ok' : 'poor'}>{accuracy || '--'} ft</span>
                </div>
                <div className="distance-live">
                  Distance: {Math.round(liveDistance)} ft
                </div>
              </div>
              <button onClick={handleMark} className="measure-btn mark-btn">
                <MapPin size={24} />
                Mark FDT/Pole
              </button>
            </div>
          )}

          {phase === 'marked' && (
            <div className="measure-phase">
              <div className="measure-status">
                <div className="status-icon marked">
                  <CheckCircle size={32} />
                </div>
                <h3>First Leg Complete!</h3>
                <div className="distance-result">
                  <span className="distance-label">Distance:</span>
                  <span className="distance-value">{distance1} ft</span>
                </div>
                <p>Now walk back to the house for a more accurate reading.</p>
              </div>
              <button onClick={handleContinue} className="measure-btn continue-btn">
                <RotateCcw size={24} />
                Walk Back to House
              </button>
            </div>
          )}

          {phase === 'walking2' && (
            <div className="measure-phase">
              <div className="measure-status">
                <div className="status-icon walking">
                  <Navigation size={32} className="pulse" />
                </div>
                <h3>Walking back to House...</h3>
                <div className="accuracy-display">
                  GPS Accuracy: <span className={accuracy <= 33 ? 'good' : accuracy <= 66 ? 'ok' : 'poor'}>{accuracy || '--'} ft</span>
                </div>
                <div className="distance-live">
                  Distance: {Math.round(liveDistance)} ft
                </div>
                <div className="first-leg-reminder">
                  First leg: {distance1} ft
                </div>
              </div>
              <button onClick={handleEnd} className="measure-btn end-btn">
                <StopCircle size={24} />
                End at House
              </button>
            </div>
          )}

          {phase === 'complete' && (
            <div className="measure-phase">
              <div className="measure-results">
                <div className="status-icon complete">
                  <CheckCircle size={32} />
                </div>
                <h3>Measurement Complete!</h3>
                
                <div className="results-grid">
                  <div className="result-item">
                    <span className="result-label">Walk 1 (to FDT)</span>
                    <span className="result-value">{distance1} ft</span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">Walk 2 (to House)</span>
                    <span className="result-value">{distance2} ft</span>
                  </div>
                  <div className="result-item average">
                    <span className="result-label">Average</span>
                    <span className="result-value">{avgDistance} ft</span>
                  </div>
                  {variance > 20 && (
                    <div className="result-warning">
                      <AlertTriangle size={16} />
                      Measurements differ by {variance} ft - consider re-measuring
                    </div>
                  )}
                </div>

                <div className="recommended-drop">
                  <span className="rec-label">Recommended Drop</span>
                  <span className="rec-value">{recommendedDrop} ft</span>
                  <span className="rec-note">(includes 15% slack)</span>
                </div>
              </div>
              <button onClick={handleReset} className="measure-btn reset-btn">
                <RotateCcw size={24} />
                New Measurement
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
