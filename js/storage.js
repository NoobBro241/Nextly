/* ============================================================  
   storage.js — Cloud Firestore & Offline Mirror Persistence  
   PROMPT 2: Cloud Firestore is the Authoritative Primary Storage.  
   LocalStorage is ONLY used for UI settings and UID-isolated  
   offline cache (never mixes data between different users!).  
   ============================================================ */  
  
import { STORAGE_KEY, DAY_ORDER } from './constants.js';  
import { getToday } from './utils.js';  
import {  
  state, replaceState, createDefaultState, fromPersisted  
} from './state.js';  
import { db } from './firebase.js';  
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";  
  
let currentUserId = null;  
let saveTimeout = null;  
  
export function setCurrentUserId(uid) {  
  currentUserId = uid;  
}  
  
export function getCurrentUserId() {  
  return currentUserId;  
}  
  
function defaultDayIndex() {  
  const idx = DAY_ORDER.indexOf(getToday().getDay());  
  return idx === -1 ? 0 : idx;  
}  
  
/* Load state synchronously from offline/global cache on initial boot.  
   When a user logs in, loadStateFromFirestore(uid) is called to hydrate  
   authoritative cloud data. */  
export function loadState() {  
  const fallbackDay = defaultDayIndex();  
  try {  
    // Load global UI settings (theme, compactMode, notifications)  
    const globalRaw = localStorage.getItem('nextly.global.settings');  
    if (globalRaw) {  
      const globalSettings = JSON.parse(globalRaw);  
      Object.assign(state.settings, globalSettings);  
    }  
  
    // If a user is already authenticated in memory, load their offline mirror  
    if (currentUserId) {  
      const userCache = localStorage.getItem(`nextly.cache.${currentUserId}`);  
      if (userCache) {  
        const parsed = JSON.parse(userCache);  
        return replaceState(fromPersisted(parsed, fallbackDay));  
      }  
    }  
  } catch (err) {  
    console.warn("⚠️ [Nextly] Offline cache read error:", err);  
  }  
  
  // Default fresh state if no user or cache  
  const fresh = createDefaultState();  
  fresh.selectedDayIndex = fallbackDay;  
  return replaceState(fresh);  
}  
  
/* Authoritative load from Cloud Firestore for a specific user ID.  
   Returns true if document existed and was loaded, false if new user. */  
export async function loadStateFromFirestore(uid) {  
  if (!uid) return false;  
  const fallbackDay = defaultDayIndex();  
  try {  
    const userDocRef = doc(db, 'users', uid);  
    const snap = await getDoc(userDocRef);  
    if (snap.exists()) {  
      const data = snap.data();  
      const restored = fromPersisted(data, fallbackDay);  
      replaceState(restored);  
      // Mirror to UID-isolated offline cache  
      try {  
        localStorage.setItem(`nextly.cache.${uid}`, JSON.stringify(state));  
      } catch (e) { /* silent quota catch */ }  
      console.log("☁️ [Nextly] Successfully loaded authoritative state from Cloud Firestore for UID:", uid);  
      return true;  
    } else {  
      console.log("ℹ️ [Nextly] No Firestore document found for UID:", uid, "(New user setup required)");  
      return false;  
    }  
  } catch (err) {  
    console.error("🔥 [Nextly] Firestore connection error / offline. Loading from offline cache:", err);  
    // Fallback to offline cache if cloud network fails  
    try {  
      const userCache = localStorage.getItem(`nextly.cache.${uid}`);  
      if (userCache) {  
        const parsed = JSON.parse(userCache);  
        replaceState(fromPersisted(parsed, fallbackDay));  
        showOfflineToast();  
        return true;  
      }  
    } catch (e) { /* silent catch */ }  
    return false;  
  }  
}  
  
function showOfflineToast() {  
  const tc = document.getElementById('toastContainer');  
  if (!tc) return;  
  const t = document.createElement('div');  
  t.className = 'toast show';  
  t.innerHTML = `<span class="toast-dot" style="background:#fb6340;"></span><span>Offline Mode: Loaded cached cloud data</span>`;  
  tc.appendChild(t);  
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);  
}  
  
/* Triggered synchronously by domain modules whenever user data mutates.  
   1. Updates UID-isolated local offline mirror immediately.  
   2. Schedules a debounced background write to Cloud Firestore. */  
export function saveState() {  
  // Always persist UI settings globally so theme survives sign out  
  try {  
    localStorage.setItem('nextly.global.settings', JSON.stringify(state.settings));  
  } catch (e) { /* silent */ }  
  
  if (!currentUserId) return;  
  
  // 1. Mirror to UID-isolated offline cache (never mixes with other UIDs!)  
  try {  
    localStorage.setItem(`nextly.cache.${currentUserId}`, JSON.stringify(state));  
  } catch (e) { /* silent */ }  
  
  // 2. Debounce cloud write (prevents spamming Firestore on sliders/typing)  
  if (saveTimeout) clearTimeout(saveTimeout);  
  saveTimeout = setTimeout(async () => {  
    await forceSaveToFirestore(currentUserId);  
  }, 600);  
}  
  
/* Immediate Cloud Firestore sync (used on logout or manual sync button). */  
export async function forceSaveToFirestore(uid = currentUserId) {  
  if (!uid) return;  
  try {  
    if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }  
    const userDocRef = doc(db, 'users', uid);  
    const payload = {  
      ...state,  
      updatedAt: new Date().toISOString()  
    };  
    await setDoc(userDocRef, payload, { merge: true });  
    console.log("💾 [Nextly] Cloud Firestore synced for UID:", uid);  
    return true;  
  } catch (err) {  
    console.warn("🔥 [Nextly] Cloud Firestore write failed (saved to offline cache):", err);  
    return false;  
  }  
}  
  
/* Reset current user's data (wipes authoritative cloud doc and offline cache). */  
export async function resetState() {  
  if (currentUserId) {  
    try {  
      localStorage.removeItem(`nextly.cache.${currentUserId}`);  
    } catch (e) { /* silent */ }  
  }  
  const fresh = createDefaultState();  
  fresh.selectedDayIndex = defaultDayIndex();  
  replaceState(fresh);  
  if (currentUserId) {  
    await forceSaveToFirestore(currentUserId);  
  }  
  return state;  
}  
