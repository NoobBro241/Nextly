/* ============================================================  
   app.js — Application entry point  
   ============================================================ */  
  
import { loadState } from './storage.js';  
import { registerViews, initNavigation, setApplySettingsHook, requestRender } from './router.js';  
import { applySettings } from './settings.js';  
import './firebase.js'; // PROMPT 1 & 2: Initialize Firebase infrastructure  
import { initAuth } from './auth.js'; // PROMPT 2: Initialize Firebase Authentication & Cloud Sync lifecycle  
  
import * as dashboard from './dashboard.js';  
import * as goals from './goals.js';  
import * as weekly from './weekly.js';  
import * as habits from './habits.js';  
import * as settings from './settings.js';  
  
function boot() {  
  // 1. Hydrate central state (from local cache/defaults first).  
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
  
  // 5. Initialize Firebase Authentication & Cloud Sync lifecycle (PROMPT 2).  
  initAuth();  
  
  // 6. First paint.  
  requestRender();  
}  
  
document.addEventListener('DOMContentLoaded', boot);  
