export const firebaseConfig = {
  apiKey: "AIzaSyDk-8XHse29MbZlW_95MxqV5zxzlLr2qDE",
  authDomain: "mt-taxi-20.firebaseapp.com",
  databaseURL: "https://mt-taxi-20-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mt-taxi-20",
  storageBucket: "mt-taxi-20.firebasestorage.app",
  messagingSenderId: "680603922942",
  appId: "1:680603922942:web:b915482d8587beac37d0af"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getDatabase, ref, get, onValue, push, set, update, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";
import { getAuth, signInWithCustomToken, signOut, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, "europe-west1");
export { ref, get, onValue, push, set, update, runTransaction, serverTimestamp, signInWithCustomToken, signOut, setPersistence, browserSessionPersistence, httpsCallable };
