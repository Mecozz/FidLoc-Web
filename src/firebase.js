import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
