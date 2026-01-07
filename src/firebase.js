import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDt1X0uhHu-wUC0L51T-AS77ymlusiYh7I",
  authDomain: "fidloc.firebaseapp.com",
  projectId: "fidloc",
  storageBucket: "fidloc.firebasestorage.app",
  messagingSenderId: "123419074274",
  appId: "1:123419074274:web:f19113673b6e7762f488bb",
  measurementId: "G-RXR4BMMZV9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence for Firestore
// This caches all your locations locally so they're available offline
enableIndexedDbPersistence(db)
  .then(() => {
    console.log('✅ Firestore offline persistence enabled');
  })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time
      console.warn('Firestore persistence failed: multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // Browser doesn't support persistence
      console.warn('Firestore persistence not supported in this browser');
    }
  });
