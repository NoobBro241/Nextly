/* ============================================================
   settings.js — Settings view
   Toggles app preferences and exposes the data reset action.
   Storage access is delegated to storage.js via resetState().
   ============================================================ */

import { state } from './state.js';
import { saveState, resetState } from './storage.js';
import { confirmDialog } from './ui.js';
import { requestRender } from './router.js';

/* ---------- business logic ---------- */
export function toggleSetting(key) {
  state.settings[key] = !state.settings[key];
  saveState();
}

/* Apply settings that affect global presentation (compact mode).
   Called by app.js on every render. */
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

/* ---------- rendering ---------- */
export function render(root) {
  root.innerHTML = `
    <div class="grid grid-2">
      <div class="card">
        <div class="section-head" style="margin-bottom:20px;">
          <h3 style="font-size:0.95rem; color:#fff;">Appearance</h3>
          <div class="tiny">Dark mode is the default layout.</div>
        </div>
        <div class="settings-list">
          <div class="setting-item">
            <div class="habit-top" style="align-items:center;">
              <div><div class="habit-name" style="font-size:0.85rem;">OLED Dark Mode</div><div class="tiny">Sleek dark background and high contrast.</div></div>
              <span class="status-pill done">Active</span>
            </div>
          </div>
          <div class="setting-item">
            <div class="habit-top" style="align-items:center;">
              <div><div class="habit-name" style="font-size:0.85rem;">Compact Mode</div><div class="tiny">Reduces gaps and paddings.</div></div>
              <button class="toggle ${state.settings.compactMode ? 'active' : ''}" data-toggle-setting="compactMode" aria-label="Toggle compact mode"></button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="section-head" style="margin-bottom:20px;">
          <h3 style="font-size:0.95rem; color:#fff;">Notifications &amp; Sync</h3>
          <div class="tiny">Managed fully client-side.</div>
        </div>
        <div class="settings-list">
          <div class="setting-item">
            <div class="habit-top" style="align-items:center;">
              <div><div class="habit-name" style="font-size:0.85rem;">Daily Reminders</div><div class="tiny">Browser-context reminder toggle.</div></div>
              <button class="toggle ${state.settings.notifications ? 'active' : ''}" data-toggle-setting="notifications" aria-label="Toggle reminders"></button>
            </div>
          </div>
          <div class="setting-item">
            <div class="habit-top" style="align-items:center;">
              <div><div class="habit-name" style="font-size:0.85rem;">Local Storage</div><div class="tiny">Data is stored in your browser.</div></div>
              <span class="status-pill done">Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:20px; border-color:rgba(245,54,92,0.25);">
      <div class="section-head" style="margin-bottom:16px;">
        <h3 style="font-size:0.95rem; color:#fff;">Reset Data</h3>
        <div class="tiny">Erase all habits, completions, goals, and levels. This cannot be undone.</div>
      </div>
      <button class="btn btn-danger" id="resetDataBtn">Reset All Saved Data</button>
    </div>`;

  root.querySelectorAll('[data-toggle-setting]').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleSetting(btn.dataset.toggleSetting);
      requestRender();
    });
  });

  root.querySelector('#resetDataBtn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Reset all data',
      message: 'Delete all Habitfy data? This resets everything completely.',
      confirmLabel: 'Reset', danger: true
    });
    if (ok) { resetState(); requestRender(); }
  });
}
