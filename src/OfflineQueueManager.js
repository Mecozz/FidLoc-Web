// OfflineQueueManager.js
// Handles saving locations when offline and syncing when back online

import { db } from './firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

const DB_NAME = 'FidLocOffline';
const DB_VERSION = 1;
const STORE_NAME = 'pendingLocations';

class OfflineQueueManager {
  constructor() {
    this.db = null;
    this.listeners = [];
    this.init();
    this.setupOnlineListener();
  }

  // Initialize IndexedDB
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ Offline queue initialized');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          console.log('✅ Offline queue store created');
        }
      };
    });
  }

  // Listen for online/offline status
  setupOnlineListener() {
    window.addEventListener('online', () => {
      console.log('📶 Back online - syncing queue...');
      this.syncQueue();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Went offline');
    });
  }

  // Add a location to the offline queue
  async addToQueue(locationData) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const pendingLocation = {
        ...locationData,
        pendingId: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        queuedAt: new Date().toISOString()
      };

      const request = store.add(pendingLocation);

      request.onsuccess = () => {
        console.log('✅ Location added to offline queue:', pendingLocation.name);
        this.notifyListeners();
        resolve(pendingLocation);
      };

      request.onerror = () => {
        console.error('Failed to add to queue:', request.error);
        reject(request.error);
      };
    });
  }

  // Get all pending locations
  async getPendingLocations() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // Remove a location from the queue (after successful sync)
  async removeFromQueue(id) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        this.notifyListeners();
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // Sync all pending locations to Firestore
  async syncQueue() {
    if (!navigator.onLine) {
      console.log('Still offline, cannot sync');
      return { synced: 0, failed: 0 };
    }

    const pending = await this.getPendingLocations();
    if (pending.length === 0) {
      console.log('No pending locations to sync');
      return { synced: 0, failed: 0 };
    }

    console.log(`Syncing ${pending.length} pending locations...`);
    let synced = 0;
    let failed = 0;

    for (const location of pending) {
      try {
        // Prepare the data for Firestore (remove queue-specific fields)
        const { id, pendingId, queuedAt, userOrg, ...firestoreData } = location;

        // Add to Firestore
        await addDoc(collection(db, 'organizations', userOrg, 'locations'), {
          ...firestoreData,
          createdAt: Timestamp.now(),
          lastModified: Timestamp.now()
        });

        // Remove from queue
        await this.removeFromQueue(id);
        synced++;
        console.log(`✅ Synced: ${location.name}`);
      } catch (error) {
        console.error(`Failed to sync ${location.name}:`, error);
        failed++;
      }
    }

    console.log(`Sync complete: ${synced} synced, ${failed} failed`);
    return { synced, failed };
  }

  // Subscribe to queue changes
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notifyListeners() {
    this.getPendingLocations().then(pending => {
      this.listeners.forEach(callback => callback(pending));
    });
  }

  // Check if we're online
  isOnline() {
    return navigator.onLine;
  }
}

// Singleton instance
const offlineQueue = new OfflineQueueManager();
export default offlineQueue;
