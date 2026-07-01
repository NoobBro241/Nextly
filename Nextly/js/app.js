/* ============================================================
   app.js — Application entry point
   Bootstraps the app: loads state, registers views, wires
   navigation, applies settings and performs the first render.
   Contains no business logic and no view markup of its own.
   ============================================================ */

import { loadState } from './storage.js';
import { registerViews, initNavigation, setApplySettingsHook, requestRender } from './router.js';
import { applySettings } from './settings.js';

import * as dashboard from './dashboard.js';
import * as goals from './goals.js';
import * as weekly from './weekly.js';
import * as habits from './habits.js';
import * as settings from './settings.js';

function boot() {
  // 1. Hydrate central state from storage.
  loadState();

  // 2. Register every view's render function with the router.
  registerViews({
    dashboard: dashboard.render,
    goals: goals.render,
    weekly: weekly.render,
    habits: habits.render,
    settings: settings.render
  });

  // 3. Global presentation step applied before each render.
  setApplySettingsHook(applySettings);

  // 4. Wire navigation (router owns view switching).
  initNavigation();

  // 5. First paint.
  requestRender();
}

document.addEventListener('DOMContentLoaded', boot);
