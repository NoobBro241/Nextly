/* ============================================================
   ui.js — Reusable UI components
   Toasts, confirm dialogs, progress animations and generic
   form-control binders. These are presentation utilities that
   any view can reuse. They do not contain business logic.
   ============================================================ */

import { escapeHtml } from './utils.js';

/* ---------- DOM element registry (centralized lookups) ---------- */
export const dom = {
  get toastContainer() { return document.getElementById('toastContainer'); },
  get todayChip() { return document.getElementById('todayChip'); },
  get pageTitle() { return document.getElementById('pageTitle'); },
  get pageSubtitle() { return document.getElementById('pageSubtitle'); },
  get mobilePageTitle() { return document.getElementById('mobilePageTitle'); },
  view(id) { return document.getElementById(`view-${id}`); },
  views() { return document.querySelectorAll('.view'); },
  navButtons() { return document.querySelectorAll('.nav-btn[data-view], .mobile-nav-btn[data-view]'); }
};

/* ---------- Toast ---------- */
export function showToast(message) {
  const container = dom.toastContainer;
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

/* ---------- Confirm dialog ----------
   Promise-based modal. Resolves true/false.
   Falls back to native confirm if the DOM is unavailable. */
export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    if (typeof document === 'undefined' || !document.body) {
      resolve(typeof confirm === 'function' ? confirm(message || title) : true);
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-content" role="dialog" aria-modal="true">
        <h3>${escapeHtml(title)}</h3>
        ${message ? `<p class="tiny" style="font-size:0.86rem; color:var(--text-2); line-height:1.5;">${escapeHtml(message)}</p>` : ''}
        <div class="row-actions" style="justify-content:flex-end; gap:8px; margin-top:4px;">
          <button class="btn btn-text" data-dialog-cancel>Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-dialog-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;

    const close = (result) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };

    backdrop.querySelector('[data-dialog-cancel]').addEventListener('click', () => close(false));
    backdrop.querySelector('[data-dialog-confirm]').addEventListener('click', () => close(true));
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(false); });
    document.addEventListener('keydown', onKey);

    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-dialog-confirm]').focus();
  });
}

/* ---------- Progress animations ----------
   Animates progress bars (data-fill) and count-up numbers
   (data-countup) within a root. Respects reduced motion. */
export function animateProgress(root = document) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.querySelectorAll('.progress-fill[data-fill]').forEach(el => {
    const target = clampPct(el.dataset.fill);
    if (reduce) { el.style.width = target + '%'; return; }
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.width = target + '%'; }));
  });

  root.querySelectorAll('[data-countup]').forEach(el => {
    const target = clampPct(el.dataset.countup);
    if (reduce || target === 0) { el.textContent = target + '%'; return; }
    const duration = 650;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      el.textContent = Math.round(target * eased) + '%';
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target + '%';
    };
    requestAnimationFrame(step);
  });
}

function clampPct(v) {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
}

/* ---------- Generic form-control binders ---------- */

/* Single-select segmented / chip control that writes the chosen
   value into a hidden input and optionally calls back. */
export function bindSingleSelect(container, hiddenInput, onChange) {
  if (!container) return;
  const buttons = container.querySelectorAll('[data-value]');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (hiddenInput) hiddenInput.value = btn.dataset.value;
      if (typeof onChange === 'function') onChange(btn.dataset.value);
    });
  });
}

/* Multi-select chip group. Maintains a Set of chosen ids and
   returns a getter so the caller can read the current selection. */
export function bindMultiSelect(container, attr) {
  const selected = new Set();
  if (!container) return () => [];
  container.querySelectorAll(`[${attr}]`).forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute(attr);
      if (selected.has(id)) { selected.delete(id); btn.classList.remove('active'); }
      else { selected.add(id); btn.classList.add('active'); }
    });
  });
  return () => Array.from(selected);
}

/* Toggle-set control (e.g. weekday buttons). Mutates a provided Set
   and keeps the buttons' active state in sync. */
export function bindToggleSet(container, selectedSet, attr = 'data-day', parse = Number) {
  if (!container) return;
  const sync = () => container.querySelectorAll(`[${attr}]`).forEach(btn => {
    btn.classList.toggle('active', selectedSet.has(parse(btn.getAttribute(attr))));
  });
  sync();
  container.querySelectorAll(`[${attr}]`).forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parse(btn.getAttribute(attr));
      if (selectedSet.has(val)) selectedSet.delete(val); else selectedSet.add(val);
      sync();
    });
  });
}
