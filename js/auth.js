/* ============================================================  
   auth.js — Authentication Domain & Lifecycle Controller  
   PROMPT 2: Complete Firebase Authentication & User Isolation.  
   - Handles Registration, Login, Logout, Password Reset  
   - Restores session automatically across page reloads  
   - Creates root Firestore document (users/{uid}) on signup  
   - Logs standard Google Analytics events (sign_up, login, sign_out)  
   ============================================================ */  
  
import { auth, db, logAnalyticsEvent } from './firebase.js';  
import {  
  onAuthStateChanged,  
  signInWithEmailAndPassword,  
  createUserWithEmailAndPassword,  
  signOut,  
  sendPasswordResetEmail  
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";  
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";  
import { state, replaceState, createDefaultState } from './state.js';  
import { loadStateFromFirestore, forceSaveToFirestore, setCurrentUserId } from './storage.js';  
import { requestRender } from './router.js';  
import { showToast } from './ui.js';  
import { applySettings } from './settings.js';  
  
let currentAuthMode = 'signin'; // 'signin' or 'signup'  
  
export function initAuth() {  
  wireAuthUI();  
  
  // Requirement 2 & 5: Restore session after page reload & isolate data by UID  
  onAuthStateChanged(auth, async (user) => {  
    const authScreen = document.getElementById('authScreen');  
    const sidebarBadge = document.getElementById('sidebarUserBadge');  
    const sidebarEmail = document.getElementById('sidebarUserEmail');  
  
    if (!user) {  
      console.log("🔐 [Nextly Auth] No active session. Showing Auth Screen.");  
      setCurrentUserId(null);  
      document.body.classList.add('auth-active');  
      if (sidebarBadge) sidebarBadge.style.display = 'none';  
      replaceState(createDefaultState());  
      applySettings();  
    } else {  
      console.log("🔐 [Nextly Auth] Session active for UID:", user.uid, `(${user.email})`);  
      setCurrentUserId(user.uid);  
  
      // Load authoritative Cloud Firestore document  
      const loaded = await loadStateFromFirestore(user.uid);  
      if (!loaded) {  
        // Fallback: Ensure Firestore document exists if loading returned empty  
        console.log("🆕 [Nextly Auth] Initializing fresh Cloud Firestore document for UID:", user.uid);  
        const freshState = createDefaultState();  
        const initialDoc = {  
          email: user.email || 'user@nextly.app',  
          createdAt: new Date().toISOString(),  
          updatedAt: new Date().toISOString(),  
          ...freshState  
        };  
        try {  
          await setDoc(doc(db, 'users', user.uid), initialDoc, { merge: true });  
        } catch (err) {  
          console.warn("⚠️ [Nextly Auth] Offline/error creating initial Firestore doc:", err);  
        }  
        replaceState(freshState);  
      }  
  
      // Transition from Auth Screen to Dashboard  
      document.body.classList.remove('auth-active');  
      if (sidebarBadge) sidebarBadge.style.display = 'flex';  
      if (sidebarEmail) sidebarEmail.textContent = user.email || 'Cloud Account';  
  
      applySettings();  
      requestRender();  
    }  
  });  
}  
  
function wireAuthUI() {  
  const form = document.getElementById('authForm');  
  const emailInput = document.getElementById('authEmail');  
  const passInput = document.getElementById('authPassword');  
  const errorBox = document.getElementById('authError');  
  const submitBtn = document.getElementById('authSubmitBtn');  
  const forgotBtn = document.getElementById('authForgotBtn');  
  const tabButtons = document.querySelectorAll('[data-auth-tab]');  
  
  if (!form) return;  
  
  // Tab switching: Sign In vs Create Account  
  tabButtons.forEach(btn => {  
    btn.addEventListener('click', () => {  
      tabButtons.forEach(b => b.classList.remove('active'));  
      btn.classList.add('active');  
      currentAuthMode = btn.dataset.authTab;  
      if (errorBox) errorBox.style.display = 'none';  
  
      if (currentAuthMode === 'signin') {  
        if (submitBtn) submitBtn.textContent = 'Sign In';  
        if (forgotBtn) forgotBtn.style.display = 'inline-block';  
      } else {  
        if (submitBtn) submitBtn.textContent = 'Create Account';  
        if (forgotBtn) forgotBtn.style.display = 'none';  
      }  
    });  
  });  
  
  // Form submission  
  form.addEventListener('submit', async (e) => {  
    e.preventDefault();  
    const email = emailInput ? emailInput.value.trim() : '';  
    const password = passInput ? passInput.value : '';  
  
    if (!email || !password) return;  
    if (errorBox) errorBox.style.display = 'none';  
  
    if (submitBtn) {  
      submitBtn.disabled = true;  
      submitBtn.textContent = currentAuthMode === 'signin' ? 'Signing in...' : 'Creating account...';  
    }  
  
    try {  
      if (currentAuthMode === 'signin') {  
        await signInWithEmailAndPassword(auth, email, password);  
        logAnalyticsEvent('login', { method: 'email' });  
        showToast(`Welcome back, ${email}!`);  
      } else {  
        const userCred = await createUserWithEmailAndPassword(auth, email, password);  
        // Requirement 4 & 5: Immediately create isolated user doc in Firestore on signup  
        const initialDoc = {  
          email: userCred.user.email,  
          createdAt: new Date().toISOString(),  
          updatedAt: new Date().toISOString(),  
          ...createDefaultState()  
        };  
        await setDoc(doc(db, 'users', userCred.user.uid), initialDoc);  
        logAnalyticsEvent('sign_up', { method: 'email' });  
        showToast("Account created & Cloud Sync active!");  
      }  
    } catch (err) {  
      console.error("🔐 [Nextly Auth] Error:", err);  
      if (errorBox) {  
        errorBox.textContent = formatAuthError(err);  
        errorBox.style.display = 'block';  
      }  
    } finally {  
      if (submitBtn) {  
        submitBtn.disabled = false;  
        submitBtn.textContent = currentAuthMode === 'signin' ? 'Sign In' : 'Create Account';  
      }  
    }  
  });  
  
  // Forgot Password  
  if (forgotBtn) {  
    forgotBtn.addEventListener('click', async () => {  
      const email = emailInput ? emailInput.value.trim() : '';  
      if (!email) {  
        if (errorBox) {  
          errorBox.textContent = "Please enter your email address above to receive a password reset link.";  
          errorBox.style.display = 'block';  
        }  
        if (emailInput) emailInput.focus();  
        return;  
      }  
      if (errorBox) errorBox.style.display = 'none';  
      forgotBtn.disabled = true;  
      forgotBtn.textContent = "Sending link...";  
      try {  
        await sendPasswordResetEmail(auth, email);  
        showToast(`Password reset email sent to ${email}!`);  
      } catch (err) {  
        if (errorBox) {  
          errorBox.textContent = formatAuthError(err);  
          errorBox.style.display = 'block';  
        }  
      } finally {  
        forgotBtn.disabled = false;  
        forgotBtn.textContent = "Forgot Password?";  
      }  
    });  
  }  
}  
  
function formatAuthError(err) {  
  const code = err.code || '';  
  switch (code) {  
    case 'auth/email-already-in-use':  
      return "An account with this email address already exists. Please sign in instead.";  
    case 'auth/invalid-email':  
      return "Please enter a valid email address.";  
    case 'auth/user-not-found':  
    case 'auth/invalid-credential':  
    case 'auth/wrong-password':  
      return "Invalid email address or password. Please try again.";  
    case 'auth/weak-password':  
      return "Password is too weak. Please use at least 6 characters.";  
    case 'auth/too-many-requests':  
      return "Too many unsuccessful attempts. Please wait a few minutes and try again.";  
    default:  
      return err.message || "An authentication error occurred. Please try again.";  
  }  
}  
  
export async function signOutUser() {  
  try {  
    await forceSaveToFirestore(); // Push any pending state before leaving  
  } catch (e) { /* silent */ }  
  try {  
    await signOut(auth);  
    logAnalyticsEvent('sign_out');  
    showToast("Signed out successfully.");  
  } catch (err) {  
    console.error("🔐 [Nextly Auth] Sign out error:", err);  
    showToast("Error signing out.");  
  }  
}  
