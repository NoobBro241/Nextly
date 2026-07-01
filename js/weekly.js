/* ============================================================
   weekly.js — Weekly planner view
   A real calendar-week navigator: Prev / Next move by whole
   calendar weeks (Monday–Sunday) and re-render the full grid.
   The selected week lives in state.weeklyWeekStart (ISO Monday
   date-key, null = current week). All data changes are still
   delegated to habits.js logic.
   ============================================================ */

import { DAY_ORDER, PRIORITY_CLASS } from './constants.js';
import {
  getToday, startOfWeek, addWeeks, formatDateKey, parseDateKey,
  formatWeekHeader, monthShort, weekdayLabel, escapeHtml
} from './utils.js';
import { state } from './state.js';
import { saveState } from './storage.js';
import { requestRender } from './router.js';
import { isCompleted, getHabitsScheduledOn, toggleHabitCompletion, isFutureDateKey } from './habits.js';
import { getCategoryName } from './categories.js';

/* Resolve the Monday of the currently selected week.
   Falls back to the current calendar week when no week is stored. */
function getSelectedWeekStart() {
  if (state.weeklyWeekStart) {
    return startOfWeek(parseDateKey(state.weeklyWeekStart));
  }
  return startOfWeek(getToday());
}

/* Persist a new selected week (stored as its Monday date-key). */
function setSelectedWeekStart(date) {
  state.weeklyWeekStart = formatDateKey(startOfWeek(date));
  saveState();
  requestRender();
}

export function render(root) {
  const today = getToday();
  const todayKey = formatDateKey(today);
  const weekStart = getSelectedWeekStart();
  const weekDays = DAY_ORDER.map((_, index) => addDayOffset(weekStart, index));
  const currentWeekStart = startOfWeek(today);
  const isCurrentWeek = formatDateKey(weekStart) === formatDateKey(currentWeekStart);

  root.innerHTML = `
    <div class="card weekly-shell">
      <div class="weekly-header">
        <div>
          <div class="label">Calendar Week Planner</div>
          <h3 style="margin:4px 0 0; font-size:1.15rem; letter-spacing:-0.02em; color:#fff; font-weight:700;">${formatWeekHeader(weekDays)}</h3>
        </div>
        <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.01); border:1px solid var(--border); padding:4px 10px; border-radius:8px;">
          <button class="btn btn-secondary" data-week-step="-1" title="Previous week" style="padding:6px 10px; font-size:0.75rem;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg> Prev
          </button>
          <button class="btn ${isCurrentWeek ? 'btn-secondary' : 'btn-primary'}" data-week-today ${isCurrentWeek ? 'disabled' : ''} style="padding:6px 12px; font-size:0.72rem; min-width:70px; ${isCurrentWeek ? 'opacity:0.55; cursor:default;' : ''}">
            ${isCurrentWeek ? 'This Week' : 'Today'}
          </button>
          <button class="btn btn-secondary" data-week-step="1" title="Next week" style="padding:6px 10px; font-size:0.75rem;">
            Next <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <div class="week-grid">
        ${weekDays.map(date => renderDayColumn(date, todayKey)).join('')}
      </div>
    </div>`;

  root.querySelectorAll('[data-week-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = Number(btn.dataset.weekStep);
      setSelectedWeekStart(addWeeks(weekStart, step));
    });
  });

  root.querySelector('[data-week-today]')?.addEventListener('click', () => {
    state.weeklyWeekStart = null; // back to the live current week
    saveState();
    requestRender();
  });

  root.querySelectorAll('[data-toggle-habit][data-date-key]').forEach(btn => {
    btn.addEventListener('click', () => toggleHabitCompletion(btn.dataset.toggleHabit, btn.dataset.dateKey));
  });
}

/* Local day offset helper (weekStart + index days). */
function addDayOffset(weekStart, index) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + index);
  d.setHours(12, 0, 0, 0);
  return d;
}

function renderDayColumn(date, todayKey) {
  const dateKey = formatDateKey(date);
  const habits = getHabitsScheduledOn(date);
  const isToday = dateKey === todayKey;
  const isFuture = isFutureDateKey(dateKey);
  const classes = [
    'day-column',
    isToday ? 'active-day today' : 'inactive-day',
    isFuture ? 'future-day' : ''
  ].filter(Boolean).join(' ');

  return `
    <div class="${classes}">
      <div class="day-head">
        <div class="day-name">${weekdayLabel(date)}</div>
        <div class="day-date">${date.getDate()} ${monthShort(date)}</div>
      </div>
      <div class="day-habits">
        ${habits.length ? habits.map(habit => {
          const done = isCompleted(habit.id, dateKey);
          // Future days cannot be completed. If it's already done (e.g. legacy
          // data) the user may still re-open it; otherwise the action is locked.
          const lockComplete = isFuture && !done;
          const btnLabel = done ? 'Reopen' : (isFuture ? 'Upcoming' : 'Complete');
          return `
            <div class="plan-item ${done ? 'completed' : ''}">
              <div class="plan-top">
                <div>
                  <div class="plan-name">${escapeHtml(habit.name)}</div>
                  <div class="tiny">${escapeHtml(getCategoryName(habit.category))}</div>
                </div>
                <span class="priority-pill ${PRIORITY_CLASS[habit.priority]}">${habit.priority[0]}</span>
              </div>
              <div class="row-actions" style="margin-top:auto; width:100%;">
                <button class="btn btn-secondary" style="width:100%; font-size:0.7rem; padding:6px 8px;" data-toggle-habit="${habit.id}" data-date-key="${dateKey}"${lockComplete ? ' disabled title="You can only complete today or past days."' : ''}>
                  ${btnLabel}
                </button>
              </div>
            </div>`;
        }).join('') : `<div class="empty-state" style="padding:16px; font-size:0.75rem; height:100%;">Rest Day</div>`}
      </div>
    </div>`;
}
