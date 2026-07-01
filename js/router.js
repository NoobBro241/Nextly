/* ============================================================
   router.js — Navigation controller
   The ONLY module that controls which view is shown.
   - Registers a render function per view id.
   - Updates nav active states, titles and view visibility.
   - Exposes requestRender() so domain logic can trigger a
     refresh without importing view modules (breaks cycles).
   It does not contain view markup or business logic itself.
   ============================================================ */

import { NAV_ITEMS, PAGE_META, DEFAULT_VIEW } from './constants.js';
import { getToday, formatLongDate } from './utils.js';
import { state } from './state.js';
import { saveState } from './storage.js';
import { dom, animateProgress } from './ui.js';

/* Registry: view id -> render(root) function. Filled by registerViews(). */
const views = new Map();
let applySettingsHook = () => {};

/* Allow app.js to inject a global "apply settings" step before each render. */
export function setApplySettingsHook(fn) { applySettingsHook = fn || (() => {}); }

/* Register the view renderers. Called once from app.js. */
export function registerViews(map) {
  Object.entries(map).forEach(([id, fn]) => views.set(id, fn));
}

/* Wire nav buttons (desktop + mobile). Called once from app.js. */
export function initNavigation() {
  dom.navButtons().forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });
}

/* Switch to a view and re-render. */
export function navigate(viewId) {
  if (!NAV_ITEMS.some(i => i.id === viewId)) viewId = DEFAULT_VIEW;
  if (state.activeView === viewId) return;
  state.activeView = viewId;
  saveState();
  requestRender();
}

/* Re-render the chrome and the active view. This is the single
   render entry point used across the whole app. */
export function requestRender() {
  applySettingsHook();
  renderChrome();
  renderActiveView();
  animateProgress();
}

/* ---------- private ---------- */
function renderChrome() {
  if (dom.todayChip) dom.todayChip.textContent = formatLongDate(getToday());

  const meta = PAGE_META[state.activeView] || PAGE_META[DEFAULT_VIEW];
  if (dom.pageTitle) dom.pageTitle.textContent = meta.title;
  if (dom.pageSubtitle) dom.pageSubtitle.textContent = meta.subtitle;
  if (dom.mobilePageTitle) dom.mobilePageTitle.textContent = meta.title;

  dom.navButtons().forEach(b => b.classList.toggle('active', b.dataset.view === state.activeView));
  dom.views().forEach(v => v.classList.toggle('active', v.dataset.view === state.activeView));
}

function renderActiveView() {
  const renderView = views.get(state.activeView);
  const root = dom.view(state.activeView);
  if (renderView && root) renderView(root);
}
