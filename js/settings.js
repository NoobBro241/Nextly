/* ============================================================  
   settings.js — Settings view  
   PROMPT 2: Includes User Account, Cloud Sync Status & Sign Out  
   ============================================================ */  
  
import { state } from './state.js';  
import { saveState, resetState, forceSaveToFirestore } from './storage.js';  
import { confirmDialog, showToast } from './ui.js';  
import { requestRender } from './router.js';  
import { escapeHtml } from './utils.js';  
import { auth } from './firebase.js';  
import { signOutUser } from './auth.js';  
  
export function toggleSetting(key) {  
  state.settings[key] = !state.settings[key];  
  saveState();  
}  
  
export function applySettings() {  
  document.body.classList.toggle('compact-mode', state.settings.compactMode);  
  const r = document.documentElement.style;  
  if (state.settings.compactMode) {  
    r.setProperty('--r-lg', '12px');  
    r.setProperty('--r-md', '10px');  
  } else {  
    r.setProperty('--r-lg', '16px');  
    r.setProperty('--r-md', '12px');  
  }  
}  
  
export function render(root) {  
  const user = auth.currentUser;  
  const email = user ? (user.email || 'Cloud Account') : 'Not signed in';  
  const uid = user ? user.uid : '—';  
  const syncBadge = user ? '🟢 Cloud Firestore Connected' : '🔴 Offline / Local Only';  
  
  root.innerHTML =   
    `<div class="grid grid-2">` +  
      `<div class="card">` +  
        `<div class="section-head" style="margin-bottom:20px;">` +  
          `<h3 style="font-size:0.95rem; color:#fff;">Appearance</h3>` +  
          `<div class="tiny">Dark mode is the default layout.</div>` +  
        `</div>` +  
        `<div class="settings-list">` +  
          `<div class="setting-item">` +  
            `<div class="habit-top" style="align-items:center;">` +  
              `<div><div class="habit-name" style="font-size:0.85rem;">OLED Dark Mode</div><div class="tiny">Sleek dark background and high contrast.</div></div>` +  
              `<span class="status-pill done">Active</span>` +  
            `</div>` +  
          `</div>` +  
          `<div class="setting-item">` +  
            `<div class="habit-top" style="align-items:center;">` +  
              `<div><div class="habit-name" style="font-size:0.85rem;">Compact Mode</div><div class="tiny">Reduces gaps and paddings.</div></div>` +  
              `<button class="toggle ${state.settings.compactMode ? 'active' : ''}" data-toggle-setting="compactMode" aria-label="Toggle compact mode"></button>` +  
            `</div>` +  
          `</div>` +  
        `</div>` +  
      `</div>` +  
  
      `<div class="card">` +  
        `<div class="section-head" style="margin-bottom:20px;">` +  
          `<h3 style="font-size:0.95rem; color:#fff;">Notifications & Reminders</h3>` +  
          `<div class="tiny">Managed client-side in your browser.</div>` +  
        `</div>` +  
        `<div class="settings-list">` +  
          `<div class="setting-item">` +  
            `<div class="habit-top" style="align-items:center;">` +  
              `<div><div class="habit-name" style="font-size:0.85rem;">Daily Reminders</div><div class="tiny">Browser-context reminder toggle.</div></div>` +  
              `<button class="toggle ${state.settings.notifications ? 'active' : ''}" data-toggle-setting="notifications" aria-label="Toggle reminders"></button>` +  
            `</div>` +  
          `</div>` +  
        `</div>` +  
      `</div>` +  
    `</div>` +  
  
    `<div class="card" style="margin-top:20px; border-color:var(--accent-border);">` +  
      `<div class="section-head" style="margin-bottom:16px;">` +  
        `<h3 style="font-size:0.95rem; color:#fff;">User Account & Cloud Sync</h3>` +  
        `<div class="tiny">Authoritative cloud database sync via Firebase Authentication & Cloud Firestore.</div>` +  
      `</div>` +  
      `<div class="settings-list" style="margin-bottom:16px;">` +  
        `<div class="setting-item">` +  
          `<div class="habit-top" style="align-items:center; flex-wrap:wrap; gap:8px;">` +  
            `<div>` +  
              `<div class="habit-name" style="font-size:0.88rem; color:#fff;">${escapeHtml(email)}</div>` +  
              `<div class="tiny" style="font-size:0.7rem; margin-top:2px;">UID: <span style="font-family:monospace; color:var(--text-3);">${escapeHtml(uid)}</span></div>` +  
            `</div>` +  
            `<span class="status-pill done" style="font-size:0.68rem;">${syncBadge}</span>` +  
          `</div>` +  
        `</div>` +  
      `</div>` +  
      `<div class="row-actions" style="justify-content:flex-end; gap:12px;">` +  
        `<button class="btn btn-secondary" id="forceSyncBtn" style="font-size:0.78rem;">Force Cloud Sync</button>` +  
        `<button class="btn btn-primary" id="signOutBtn" style="font-size:0.78rem; background:#fb6340; color:#fff; border:none;">Sign Out</button>` +  
      `</div>` +  
    `</div>` +  
  
    `<div class="card" style="margin-top:20px; border-color:rgba(245,54,92,0.25);">` +  
      `<div class="section-head" style="margin-bottom:16px;">` +  
        `<h3 style="font-size:0.95rem; color:#fff;">Reset Data</h3>` +  
        `<div class="tiny">Erase all habits, completions, goals, and levels. This cannot be undone.</div>` +  
      `</div>` +  
      `<button class="btn btn-danger" id="resetDataBtn">Reset All Saved Data</button>` +  
    `</div>`;  
  
  root.querySelectorAll('[data-toggle-setting]').forEach(btn => {  
    btn.addEventListener('click', () => {  
      toggleSetting(btn.dataset.toggleSetting);  
      requestRender();  
    });  
  });  
  
  root.querySelector('#forceSyncBtn')?.addEventListener('click', async () => {  
    const btn = root.querySelector('#forceSyncBtn');  
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing...'; }  
    const ok = await forceSaveToFirestore();  
    if (btn) { btn.disabled = false; btn.textContent = 'Force Cloud Sync'; }  
    if (ok) showToast("Synced with Firestore Database!");  
    else showToast("Offline: Cached locally for next sync.");  
  });  
  
  root.querySelector('#signOutBtn')?.addEventListener('click', async () => {  
    await signOutUser();  
  });  
  
  root.querySelector('#resetDataBtn').addEventListener('click', async () => {  
    const ok = await confirmDialog({  
      title: 'Reset all data',  
      message: 'Delete all Nextly data? This resets everything completely.',  
      confirmLabel: 'Reset', danger: true  
    });  
    if (ok) { resetState(); requestRender(); }  
  });  
}  
