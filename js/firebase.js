/* ============================================================  
   firebase.js — Firebase Cloud Infrastructure Setup  
   CDN ES-Module initialization for GitHub Pages & Live Server  
   (No Bundler / No Build Step required).  
  
   PROMPT 1 & 2: Foundation & Setup  
   - Initializes Firebase App with user's config  
   - Initializes Firebase Authentication (Email/Password ready)  
   - Initializes Cloud Firestore Database  
   - Initializes Google Analytics with reliable event logging  
   ============================================================ */  
  
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";  
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";  
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";  
import { getAnalytics, isSupported, logEvent } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";  
  
// Your web app's Firebase configuration  
const firebaseConfig = {  
  apiKey: "AIzaSyBv3E2e7jzG3ZQ6e4yMbpniMyjc252AM7o",  
  authDomain: "nextly-c7941.firebaseapp.com",  
  projectId: "nextly-c7941",  
  storageBucket: "nextly-c7941.firebasestorage.app",  
  messagingSenderId: "839157627334",  
  appId: "1:839157627334:web:c47eeb0542c47f28ac9ac7",  
  measurementId: "G-F3TLTW7FPP"  
};  
  
// Initialize Firebase App  
export const app = initializeApp(firebaseConfig);  
  
// Initialize Firebase Authentication  
export const auth = getAuth(app);  
  
// Initialize Cloud Firestore  
export const db = getFirestore(app);  
  
// Initialize Google Analytics reliably  
export let analytics = null;  
export const analyticsPromise = isSupported().then((supported) => {  
  if (supported) {  
    analytics = getAnalytics(app);  
    console.log("📊 [Nextly] Google Analytics active & ready for events");  
    return analytics;  
  }  
  return null;  
}).catch(() => {  
  // Silent catch for sandbox/iframe previews without external network access  
  return null;  
});  
  
/* Safe, reliable helper to log events to Firebase Analytics.  
   Awaits analytics initialization so events triggered right after boot  
   (like sign_up or login) are guaranteed to be recorded. */  
export async function logAnalyticsEvent(eventName, eventParams = {}) {  
  try {  
    const ga = analytics || await analyticsPromise;  
    if (ga) {  
      logEvent(ga, eventName, eventParams);  
      console.log(`📊 [Nextly Analytics] Logged event '${eventName}':`, eventParams);  
    } else {  
      console.log(`📊 [Nextly Analytics] (Offline/Sandbox) Event '${eventName}':`, eventParams);  
    }  
  } catch (err) {  
    console.warn("⚠️ [Nextly Analytics] Could not log event:", err);  
  }  
}  
  
console.log("🔥 [Nextly] Firebase App initialized:", app.name);  
console.log("🔐 [Nextly] Firebase Auth connected");  
console.log("💾 [Nextly] Firestore Database connected");  
