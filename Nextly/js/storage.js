/* ============================================================
   storage.js — Persistence layer
   The ONLY module permitted to access localStorage.
   Responsible for loading, saving and resetting state.
   Knows nothing about the DOM.
   ============================================================ */

import { STORAGE_KEY, DAY_ORDER } from './constants.js';
import { getToday } from './utils.js';
import {
  state, replaceState, createDefaultState, fromPersisted
} from './state.js';

function defaultDayIndex() {
  const idx = DAY_ORDER.indexOf(getToday().getDay());
  return idx === -1 ? 0 : idx;
}

/* Load persisted state into the live state object. Returns the state. */
export function loadState() {
  const fallbackDay = defaultDayIndex();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = createDefaultState();
      fresh.selectedDayIndex = fallbackDay;
      return replaceState(fresh);
    }
    const parsed = JSON.parse(raw);
    return replaceState(fromPersisted(parsed, fallbackDay));
  } catch {
    const fresh = createDefaultState();
    fresh.selectedDayIndex = fallbackDay;
    return replaceState(fresh);
  }
}

/* Persist the current state. */
export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // Storage may be unavailable (private mode / quota). Fail silently.
    console.warn('Habitfy: unable to persist state.', err);
  }
}

/* Wipe persisted data and reset the live state to defaults. */
export function resetState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Habitfy: unable to clear storage.', err);
  }
  const fresh = createDefaultState();
  fresh.selectedDayIndex = defaultDayIndex();
  replaceState(fresh);
  saveState();
  return state;
}
