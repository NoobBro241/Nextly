/* ============================================================
   dashboard.js — Dashboard view
   Answers: what to do today, goal progress, what needs attention.
   Composes data from habits.js + goals.js selectors. Contains
   no business logic of its own — only layout + event wiring.
   ============================================================ */

import { PRIORITY_CLASS } from './constants.js';
import {
  getToday, formatDateKey, escapeHtml,
  getLevelAndProgress, getRankTitle
} from './utils.js';
import { state } from './state.js';
import {
  isCompleted, getHabitsScheduledOn, getTodayFocusHabit, toggleHabitCompletion
} from './habits.js';
import { getActiveGoals, getLastReflection, hasReflectionToday } from './goals.js';
import { getCategorySummaries, getCategoryName } from './categories.js';

/* Monochrome system: every category bar uses the same neutral fill. */
function categoryFill() { return 'var(--text-1)'; }

/* Per-category-id glyph. Falls back to a neutral tag icon for any id
   without a dedicated glyph (e.g. the Uncategorized bucket). */
function categoryIconSvg(categoryId) {
  const icons = {
    fitness: '<path d="M6.5 6.5l11 11M21 21l-1-1M3 3l1 1M18 22l4-4M2 6l4-4M14.5 5.5l4 4M5.5 14.5l4 4"/>',
    health: '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 10-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/>',
    mindset: '<path d="M12 2a7 7 0 00-7 7c0 2.4 1.2 4 2.5 5.2.8.8 1.5 1.6 1.5 2.8v1h6v-1c0-1.2.7-2 1.5-2.8C16.8 13 18 11.4 18 9a7 7 0 00-6-7z"/><line x1="9" y1="21" x2="15" y2="21"/>',
    learning: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    business: '<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3"/>',
    career: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>',
    finance: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
    relationships: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
    creativity: '<circle cx="13.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="11.5" r="2.5"/><circle cx="17" cy="13" r="2.5"/><path d="M12 2a10 10 0 100 20 2 2 0 002-2c0-1-.5-1.5-1-2s-1-1-1-2a2 2 0 012-2h2"/>',
    lifestyle: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    uncategorized: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[categoryId] || icons.uncategorized}</svg>`;
}

export function render(root) {
  const today = getToday();
  const todayKey = formatDateKey(today);

  const focusHabit = getTodayFocusHabit();
  const todaysHabits = getHabitsScheduledOn(today);
  const completedToday = todaysHabits.filter(h => isCompleted(h.id, todayKey)).length;
  const progress = todaysHabits.length ? Math.round((completedToday / todaysHabits.length) * 100) : 0;

  const levelData = getLevelAndProgress(state.totalXP);
  const rankTitle = getRankTitle(levelData.level);

  root.innerHTML = `
    <div class="grid grid-2-equal">
      ${renderWorkspace(levelData, rankTitle)}
      <div class="grid" style="align-content:start; gap:20px;">
        ${renderFocus(focusHabit)}
        ${renderTodaysHabits(todaysHabits, todayKey)}
        ${renderActiveGoals()}
        ${renderCompletion(completedToday, todaysHabits.length, progress)}
      </div>
    </div>
    ${renderCategoryMastery()}`;

  root.querySelector('[data-complete-focus]')?.addEventListener('click', (e) => {
    toggleHabitCompletion(e.currentTarget.dataset.completeFocus, todayKey, true);
  });
  root.querySelectorAll('[data-toggle-today]').forEach(btn => {
    btn.addEventListener('click', () => toggleHabitCompletion(btn.dataset.toggleToday, todayKey));
  });
}

function renderWorkspace(levelData, rankTitle) {
  return `
    <div class="card">
      <div class="card-header">
        <div><h3>My Workspace</h3><p>Level ${levelData.level} · ${rankTitle}</p></div>
        <div class="card-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
      </div>
      <div class="avatar-room-viewport">
        <div class="blueprint-grid-overlay"></div>
        <div class="full-body-canvas-placeholder">
          <div class="blueprint-floor"></div>
          <svg class="avatar-room-silhouette" viewBox="0 0 100 200" fill="none" stroke="currentColor">
            <circle cx="50" cy="35" r="14" stroke-width="2" />
            <line x1="50" y1="49" x2="50" y2="58" stroke-width="2.5" />
            <path d="M28 72 C32 58, 68 58, 72 72 L66 125 L34 125 Z" stroke-width="2" />
            <path d="M28 72 L18 115" stroke-width="2" stroke-linecap="round" />
            <path d="M72 72 L82 115" stroke-width="2.5" stroke-linecap="round" />
            <line x1="38" y1="125" x2="38" y2="185" stroke-width="3" stroke-linecap="round" />
            <line x1="62" y1="125" x2="62" y2="185" stroke-width="3" stroke-linecap="round" />
          </svg>
          <div class="avatar-label-glow"><span class="pulse-dot"></span>Future Avatar &amp; Room Space</div>
        </div>
      </div>
      <div style="width:100%; margin-top:24px;">
        <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--text-3); font-weight:700; margin-bottom:6px; letter-spacing:0.05em;">
          <span>XP PROGRESSION</span>
          <span>${levelData.xpInCurrentLevel} / ${levelData.xpRequiredForNext} XP</span>
        </div>
        <div class="progress-bar" style="height:8px;"><div class="progress-fill" data-fill="${levelData.percent}" style="width:0%"></div></div>
      </div>
    </div>`;
}

function renderFocus(focusHabit) {
  return `
    <div class="card">
      <div class="card-header"><div><h3>Daily Focus</h3><p>Top scheduled task based on priority.</p></div></div>
      ${focusHabit ? `
        <div style="margin:4px 0 12px;">
          <span class="priority-pill ${PRIORITY_CLASS[focusHabit.priority]}">${focusHabit.priority} Priority</span>
          <h3 style="font-size:1.25rem; margin-top:8px; font-weight:700; color:#fff;">${escapeHtml(focusHabit.name)}</h3>
          <div class="tiny" style="margin-top:4px;">Category: <strong style="color:var(--text-2);">${escapeHtml(getCategoryName(focusHabit.category))}</strong></div>
        </div>
        <button class="btn btn-primary" style="width:100%;" data-complete-focus="${focusHabit.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          Complete Habit
        </button>`
      : `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span style="font-weight:700; color:var(--text-2);">Routines cleared</span></div>`}
    </div>`;
}

function renderTodaysHabits(todaysHabits, todayKey) {
  const body = todaysHabits.length ? `
    <div class="habit-list">
      ${todaysHabits.map(habit => {
        const done = isCompleted(habit.id, todayKey);
        return `
          <div class="habit-item" style="padding:12px;">
            <div class="habit-top">
              <div>
                <div class="habit-name" style="font-size:0.82rem;">${escapeHtml(habit.name)}</div>
                <div class="tiny" style="font-size:0.68rem;">${escapeHtml(getCategoryName(habit.category))}</div>
              </div>
              <span class="status-pill ${done ? 'done' : ''}">${done ? 'Done' : 'Pending'}</span>
            </div>
            <div class="row-actions" style="justify-content:space-between; width:100%;">
              <span class="priority-pill ${PRIORITY_CLASS[habit.priority]}">${habit.priority}</span>
              <button class="btn btn-secondary" style="padding:5px 10px; font-size:0.72rem;" data-toggle-today="${habit.id}">${done ? 'Reset' : 'Complete'}</button>
            </div>
          </div>`;
      }).join('')}
    </div>`
    : `<p class="empty-state-text">You don't have any habits scheduled today.</p>`;

  return `
    <div class="card">
      <div class="card-header"><div><h3>Today's Habits</h3><p>Direct triggers for today's schedule.</p></div></div>
      ${body}
    </div>`;
}

function renderActiveGoals() {
  const activeGoals = getActiveGoals();
  const body = activeGoals.length ? `
    <div style="display:flex; flex-direction:column; gap:12px;">
      ${activeGoals.map(goal => {
        const last = getLastReflection(goal);
        const loggedToday = hasReflectionToday(goal);
        const lastText = last
          ? `<div class="reflection-log-text">${escapeHtml(last.text || 'Progress updated.')}</div>`
          : `<div class="reflection-log-text" style="font-style:italic; color:var(--text-3);">No reflections yet.</div>`;
        return `
          <div class="goal-mini">
            <div class="goal-mini-head">
              <div>
                <h4>${escapeHtml(goal.title)}</h4>
                <span class="tiny">${escapeHtml(getCategoryName(goal.category))} · ${goal.difficulty} · ${goal.durationMonths} ${goal.durationMonths === 1 ? 'month' : 'months'}</span>
              </div>
              <span class="goal-mini-percent" data-countup="${goal.currentProgress}">0%</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" data-fill="${goal.currentProgress}" style="width:0%"></div></div>
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                <span class="label" style="font-size:0.58rem;">Last Reflection</span>
                <span style="font-size:0.6rem; font-weight:700; color:${loggedToday ? 'var(--text-3)' : 'var(--accent-strong)'};">
                  ${loggedToday ? 'Logged today' : 'No log today'}
                </span>
              </div>
              ${lastText}
            </div>
          </div>`;
      }).join('')}
    </div>`
    : `<p class="empty-state-text">No active goals. Set a goal to stay motivated.</p>`;

  return `
    <div class="card">
      <div class="card-header"><div><h3>Active Goals</h3><p>Progress and latest reflections.</p></div></div>
      ${body}
    </div>`;
}

function renderCompletion(completedToday, scheduledToday, progress) {
  return `
    <div class="card">
      <div class="card-header"><div><h3>Today's Completion</h3><p>Routine check-in details.</p></div></div>
      <div class="stats-list">
        <div class="stat-item"><span class="label">Completed Today</span><strong>${completedToday} / ${scheduledToday}</strong></div>
        <div class="stat-item">
          <span class="label">Daily Performance</span><strong>${progress}%</strong>
          <div class="progress-container"><div class="progress-bar"><div class="progress-fill" data-fill="${progress}" style="width:0%"></div></div></div>
        </div>
      </div>
    </div>`;
}

/* Categories card — the foundation surface for XP / levels (and, later,
   the avatar / room / achievement systems). Driven entirely by the
   category domain's view model. */
function renderCategoryMastery() {
  const categories = getCategorySummaries();
  return `
    <div class="card category-mastery-section">
      <div class="card-header">
        <div><h3>Categories</h3><p>Level, XP and progress for each life category.</p></div>
        <div class="card-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
      </div>
      <div class="category-mastery-grid">
        ${categories.map(cat => `
          <div class="category-mastery-card">
            <div class="category-mastery-header">
              <div class="category-mastery-icon">${categoryIconSvg(cat.id)}</div>
              <span class="category-mastery-title">${escapeHtml(cat.name)}</span>
              <span class="category-mastery-level">Lvl ${cat.level}</span>
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; font-size:0.62rem; color:var(--text-3); font-weight:700; margin-bottom:2px;">
                <span>${cat.xpIntoLevel} / ${cat.xpForNext} XP</span><span>${cat.percent}%</span>
              </div>
              <div class="progress-bar" style="height:3px;">
                <div class="progress-fill" style="width:${cat.percent}%; background:${categoryFill()};"></div>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}
