/* ============================================================
   habits.js — Habit domain
   Business logic (create / delete / complete / streaks / stats)
   AND the Habits view rendering. Logic is exported so other
   views (dashboard, weekly) can reuse it without duplication.
   Rendering functions only build markup + wire events; they
   delegate all data changes to the logic functions below.
   ============================================================ */

import {
  DAY_ORDER, SHORT_DAY_LABELS,
  PRIORITY_ORDER, PRIORITY_CLASS, PRIORITY_XP,
  HABIT_TYPES, HABIT_TYPE_IDS, DEFAULT_HABIT_TYPE, DIRECT_HABIT_SUGGESTIONS
} from './constants.js';
import {
  uid, getToday, formatDateKey, addDays, parseDateKey, escapeHtml, formatDaysCompact
} from './utils.js';
import { state } from './state.js';
import { saveState } from './storage.js';
import { showToast, confirmDialog, bindSingleSelect, bindMultiSelect, bindToggleSet } from './ui.js';
import { requestRender } from './router.js';
import {
  getCategories, getCategoryName, grantCategoryXP, defaultCategoryId, normalizeCategoryId
} from './categories.js';

/* ============================================================
   BUSINESS LOGIC (UI-independent)
   ============================================================ */

export function isHabitScheduledOn(habit, date) {
  return habit.days.includes(date.getDay());
}

export function isCompleted(habitId, dateKey) {
  return Boolean(state.completions[habitId]?.[dateKey]);
}

/* Whether XP has already been awarded for this habit on this calendar day. */
function hasAwardedXP(habitId, dateKey) {
  return Boolean(state.xpAwards[habitId] && Object.prototype.hasOwnProperty.call(state.xpAwards[habitId], dateKey));
}

/* A date key (YYYY-MM-DD) that lies strictly after today.
   Compared as zero-padded strings so it is timezone-safe and needs no Date
   math. Today and any past day are NOT future. */
export function isFutureDateKey(dateKey) {
  return typeof dateKey === 'string' && dateKey > formatDateKey(getToday());
}

/* A date key that is exactly today. Only today's completions earn XP. */
function isTodayDateKey(dateKey) {
  return dateKey === formatDateKey(getToday());
}

/* Toggle a habit completion for a date.

   Anti-exploit XP model (prevents farming by re-toggling, and abuse of past
   or future days):
   - XP for a habit on a given calendar day is awarded AT MOST ONCE, ever.
   - The award is recorded in state.xpAwards[habitId][dateKey]; once present,
     no completion of that same day can ever grant XP again — regardless of
     how often the user toggles or which day (past/today/future) it is.
   - Un-completing only removes the completion flag; it never removes XP and
     never clears the award ledger (so XP is never lost and never re-grantable).
   - Streaks are derived purely from completions, so this does not affect them.

   Returns whether a linked, still-active goal exists (for the hint). */
export function setCompletion(habitId, dateKey, forceValue = null) {
  const current = Boolean(state.completions[habitId]?.[dateKey]);
  const next = forceValue === null ? !current : forceValue;

  // Hard guard: a habit can only be completed for TODAY or a PAST day.
  // Marking a future day as complete is rejected here (the single domain
  // choke point both the Habits view and the Weekly planner go through), so
  // no future completion, XP, streak or level can ever be created. Re-opening
  // a future day (next === false) stays allowed so the user is never stuck.
  if (next && isFutureDateKey(dateKey)) {
    return { contributesToGoal: false, blocked: true };
  }

  if (!state.completions[habitId]) state.completions[habitId] = {};
  const habit = state.habits.find(h => h.id === habitId);
  const xpReward = habit ? (PRIORITY_XP[habit.priority] || 20) : 20;
  const categoryId = habit ? normalizeCategoryId(habit.category) : defaultCategoryId();

  if (next) {
    state.completions[habitId][dateKey] = true;
    // XP is earned ONLY for completing TODAY, and only the first time today
    // is completed (ledger-guarded). Editing a PAST day is a pure correction
    // of the completion status and grants no XP / category XP / level. Future
    // days were already rejected above. This makes back- or pre-dating
    // useless for farming XP, while streaks (derived from completions) stay
    // historically accurate.
    if (isTodayDateKey(dateKey) && !hasAwardedXP(habitId, dateKey)) {
      state.totalXP += xpReward;
      grantCategoryXP(categoryId, xpReward, { source: 'habit', habitId, dateKey });
      if (!state.xpAwards[habitId]) state.xpAwards[habitId] = {};
      state.xpAwards[habitId][dateKey] = xpReward;
    }
  } else {
    // Completion removed; earned XP and the award record both stay.
    delete state.completions[habitId][dateKey];
  }

  if (Object.keys(state.completions[habitId]).length === 0) delete state.completions[habitId];

  const contributesToGoal = Boolean(
    next && habit && Array.isArray(habit.linkedGoalIds) &&
    state.goals.some(g => habit.linkedGoalIds.includes(g.id) && !g.completed)
  );

  saveState();
  return { contributesToGoal };
}

export function createHabit({ name, days, category, priority, linkedGoalIds, habitType, influenceTag }) {
  const type = HABIT_TYPE_IDS.includes(habitType) ? habitType : DEFAULT_HABIT_TYPE;
  state.habits.push({
    id: uid(),
    name, days, priority,
    category: normalizeCategoryId(category),
    habitType: type,
    // influenceTag is the stable avatar key for 'direct' habits ('custom'
    // when user-typed); null for general habits.
    influenceTag: type === 'direct' ? (influenceTag || 'custom') : null,
    linkedGoalIds: Array.isArray(linkedGoalIds) ? linkedGoalIds : [],
    createdAt: new Date().toISOString()
  });
  saveState();
}

export function deleteHabit(habitId) {
  state.habits = state.habits.filter(h => h.id !== habitId);
  delete state.completions[habitId];
  delete state.xpAwards[habitId];
  state.goals.forEach(goal => {
    if (Array.isArray(goal.linkedHabitIds)) {
      goal.linkedHabitIds = goal.linkedHabitIds.filter(id => id !== habitId);
    }
  });
  saveState();
}

/* ---------- selectors / derived data (pure over state) ---------- */
export function sortByPriority(habits) {
  return [...habits].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    return p !== 0 ? p : a.name.localeCompare(b.name, 'en');
  });
}

export function getHabitsScheduledOn(date) {
  return sortByPriority(state.habits.filter(h => isHabitScheduledOn(h, date)));
}

function getScheduledDatesBetween(habit, fromDate, toDate) {
  const dates = [];
  let cursor = new Date(fromDate);
  cursor.setHours(12, 0, 0, 0);
  while (cursor <= toDate) {
    if (isHabitScheduledOn(habit, cursor)) dates.push(formatDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function getHabitCurrentStreak(habit) {
  const today = getToday();
  let cursor = today, streak = 0;
  for (let guard = 0; guard < 370; guard++) {
    if (!isHabitScheduledOn(habit, cursor)) { cursor = addDays(cursor, -1); continue; }
    if (isCompleted(habit.id, formatDateKey(cursor))) { streak += 1; cursor = addDays(cursor, -1); continue; }
    if (formatDateKey(cursor) === formatDateKey(today)) { cursor = addDays(cursor, -1); continue; }
    break;
  }
  return streak;
}

export function getHabitLongestStreak(habit) {
  const completions = Object.keys(state.completions[habit.id] || {}).sort();
  if (!completions.length) return 0;
  const scheduled = getScheduledDatesBetween(habit, parseDateKey(completions[0]), parseDateKey(completions[completions.length - 1]));
  let longest = 0, current = 0;
  for (const dateKey of scheduled) {
    if (isCompleted(habit.id, dateKey)) { current += 1; longest = Math.max(longest, current); }
    else current = 0;
  }
  return longest;
}

export function getTodayFocusHabit() {
  const today = getToday();
  const todayKey = formatDateKey(today);
  return sortByPriority(
    state.habits.filter(h => isHabitScheduledOn(h, today) && !isCompleted(h.id, todayKey))
  )[0] || null;
}

export function getCompletionCount(habitId) {
  return Object.keys(state.completions[habitId] || {}).length;
}

/* ---------- shared command used by several views ----------
   Completes/uncompletes a habit and triggers a re-render + hint. */
export function toggleHabitCompletion(habitId, dateKey, forceValue = null) {
  const { contributesToGoal, blocked } = setCompletion(habitId, dateKey, forceValue);
  if (blocked) {
    showToast("You can't complete a habit for a future day.");
    return; // nothing changed, no re-render needed
  }
  if (contributesToGoal) showToast("Today's habit contributed to your goal.");
  requestRender();
}

/* ============================================================
   RENDERING (presentation only)
   ============================================================ */
export function render(root) {
  const todayKey = formatDateKey(getToday());
  const sortedHabits = sortByPriority(state.habits);
  const todaysHabits = sortedHabits.filter(h => isHabitScheduledOn(h, getToday()));

  root.innerHTML = `
    <div class="grid grid-2">
      ${renderCreateForm()}
      ${renderTodayRoutine(todaysHabits, todayKey)}
    </div>
    ${renderAllHabits(sortedHabits)}`;

  bindCreateForm(root);
  bindHabitActions(root, todayKey);
}

function renderCreateForm() {
  return `
    <div class="card">
      <div class="section-head" style="margin-bottom:20px;">
        <h3 style="font-size:1.1rem; font-weight:700; color:#fff;">Create New Habit</h3>
        <div class="tiny">Every habit is mapped to your weekly schedule.</div>
      </div>

      <form id="habitForm" class="grid" autocomplete="off" style="gap:16px;">
        <input type="hidden" name="habitType" id="hiddenHabitType" value="${DEFAULT_HABIT_TYPE}" />
        <input type="hidden" name="habitInfluenceTag" id="hiddenHabitInfluenceTag" value="" />
        <input type="hidden" name="habitCategory" id="hiddenHabitCategory" value="${defaultCategoryId()}" />
        <input type="hidden" name="habitPriority" id="hiddenHabitPriority" value="Medium" />

        <div class="field">
          <label>Habit Type</label>
          <div class="custom-segmented-control" id="habitTypeSelector">
            ${HABIT_TYPES.map((t, i) => `<button type="button" class="segment-btn ${t.id === DEFAULT_HABIT_TYPE ? 'active' : ''}" data-value="${t.id}">${t.name}</button>`).join('')}
          </div>
          <div class="tiny" id="habitTypeHint" style="margin-top:6px;">${HABIT_TYPES.find(t => t.id === DEFAULT_HABIT_TYPE).hint}</div>
        </div>

        <div class="field" id="directSuggestionsField" style="display:none;">
          <label>Quick Pick <span style="text-transform:none; color:var(--text-3); font-weight:500;">(or type your own below)</span></label>
          <div class="multi-select-habits-grid" id="directSuggestions" style="grid-template-columns:repeat(2,1fr);">
            ${DIRECT_HABIT_SUGGESTIONS.map(s => `
              <button type="button" class="habit-checkbox-btn" data-influence="${s.influenceTag}" data-name="${escapeHtml(s.name)}" data-category="${s.category}" style="justify-content:center;">
                <span>${escapeHtml(s.name)}</span>
              </button>`).join('')}
          </div>
        </div>

        <div class="field">
          <label for="habitName">Habit Name</label>
          <input id="habitName" name="habitName" type="text" maxlength="80" placeholder="e.g. Read 20 pages" required />
        </div>

        <div class="field">
          <label>Category</label>
          <div class="category-select-grid multi-select-habits-grid" id="habitCategorySelector" style="grid-template-columns:repeat(3,1fr); max-height:none;">
            ${getCategories().map((cat, i) => `
              <button type="button" class="habit-checkbox-btn ${i === 0 ? 'active' : ''}" data-value="${cat.id}" style="justify-content:center;">
                <span>${escapeHtml(cat.name)}</span>
              </button>`).join('')}
          </div>
        </div>

        <div class="field">
          <label>Priority (Affects XP)</label>
          <div class="custom-segmented-control" id="habitPrioritySelector">
            <button type="button" class="segment-btn" data-value="Low">Low</button>
            <button type="button" class="segment-btn active" data-value="Medium">Med</button>
            <button type="button" class="segment-btn" data-value="High">High</button>
            <button type="button" class="segment-btn" data-value="Extreme">Extreme</button>
          </div>
        </div>

        <div class="field">
          <label>Link to Goals (Optional)</label>
          <div class="tiny" style="margin-bottom:6px;">Completing this habit will hint that it contributed to the goal.</div>
          <div class="multi-select-habits-grid" id="habitLinkedGoalsSelector"></div>
        </div>

        <div class="field">
          <label>Weekly Schedule</label>
          <div class="weekday-selector" id="weekdaySelector">
            ${DAY_ORDER.map(day => `<button type="button" class="weekday-btn" data-day="${day}">${SHORT_DAY_LABELS[day]}</button>`).join('')}
          </div>
        </div>

        <button type="submit" class="btn btn-primary" style="width:100%;">Create Habit</button>
      </form>
    </div>`;
}

function renderTodayRoutine(todaysHabits, todayKey) {
  return `
    <div class="card">
      <div class="card-header"><div><h3>Today's Routine</h3><p>Direct triggers for today's schedule.</p></div></div>
      <div class="habit-list">
        ${todaysHabits.length ? todaysHabits.map(habit => {
          const done = isCompleted(habit.id, todayKey);
          return `
            <div class="habit-item" style="padding:12px;">
              <div class="habit-top">
                <div>
                  <div class="habit-name" style="font-size:0.8rem;">${escapeHtml(habit.name)}</div>
                  <div class="tiny" style="font-size:0.68rem;">${escapeHtml(getCategoryName(habit.category))}</div>
                </div>
                <span class="status-pill ${done ? 'done' : ''}" style="font-size:0.62rem;">${done ? 'Done' : 'Pending'}</span>
              </div>
              <div class="row-actions" style="justify-content:space-between; width:100%;">
                <span class="priority-pill ${PRIORITY_CLASS[habit.priority]}" style="font-size:0.6rem;">${habit.priority}</span>
                <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.7rem;" data-toggle-today="${habit.id}">${done ? 'Reset' : 'Complete'}</button>
              </div>
            </div>`;
        }).join('') : `<div class="empty-state">No active habits scheduled today.</div>`}
      </div>
    </div>`;
}

function renderAllHabits(sortedHabits) {
  return `
    <div class="card" style="margin-top:20px;">
      <div class="section-head" style="margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:12px;">
        <h3 style="font-size:0.95rem; font-weight:700; color:#fff;">All Registered Habits</h3>
        <div class="tiny">Deleting a habit erases its history.</div>
      </div>
      ${sortedHabits.length ? `
        <div class="habit-list">
          ${sortedHabits.map(habit => `
            <div class="habit-item">
              <div class="habit-top">
                <div>
                  <div class="habit-name" style="font-size:0.88rem;">${escapeHtml(habit.name)}</div>
                  <div class="tiny">Category: <strong style="color:#fff;">${escapeHtml(getCategoryName(habit.category))}</strong> · Schedule: <strong style="color:var(--accent);">${formatDaysCompact(habit.days)}</strong></div>
                </div>
                <span class="priority-pill ${PRIORITY_CLASS[habit.priority]}">${habit.priority}</span>
              </div>
              <div class="meta-row">
                <span class="meta-chip">${habit.habitType === 'direct' ? 'Direct Influence' : 'General'}</span>
                <span class="meta-chip">Streak: ${getHabitCurrentStreak(habit)}d</span>
                <span class="meta-chip">Total: ${getCompletionCount(habit.id)}</span>
                <button class="btn btn-danger" style="padding:6px 12px; font-size:0.72rem; margin-left:auto;" data-delete-habit="${habit.id}">Delete</button>
              </div>
            </div>`).join('')}
        </div>`
        : `<div class="empty-state" style="padding:40px;">No habits recorded yet. Create your first habit above.</div>`}
    </div>`;
}

function bindCreateForm(root) {
  // Category single-select
  bindSingleSelect(root.querySelector('#habitCategorySelector'), root.querySelector('#hiddenHabitCategory'));
  // Priority single-select
  bindSingleSelect(root.querySelector('#habitPrioritySelector'), root.querySelector('#hiddenHabitPriority'));

  // Habit type select: toggles the direct-influence quick-pick suggestions.
  const typeInput = root.querySelector('#hiddenHabitType');
  const influenceInput = root.querySelector('#hiddenHabitInfluenceTag');
  const suggestionsField = root.querySelector('#directSuggestionsField');
  const typeHint = root.querySelector('#habitTypeHint');
  const categoryButtons = root.querySelectorAll('#habitCategorySelector [data-value]');
  const suggestionButtons = root.querySelectorAll('#directSuggestions [data-influence]');

  const selectCategoryButton = (catId) => {
    categoryButtons.forEach(b => b.classList.toggle('active', b.dataset.value === catId));
    root.querySelector('#hiddenHabitCategory').value = catId;
  };

  bindSingleSelect(root.querySelector('#habitTypeSelector'), typeInput, (typeId) => {
    const isDirect = typeId === 'direct';
    suggestionsField.style.display = isDirect ? '' : 'none';
    const meta = HABIT_TYPES.find(t => t.id === typeId);
    if (typeHint && meta) typeHint.textContent = meta.hint;
    // A direct habit defaults to a custom influence tag until a suggestion
    // is picked; general habits carry no influence tag.
    influenceInput.value = isDirect ? 'custom' : '';
    if (!isDirect) suggestionButtons.forEach(b => b.classList.remove('active'));
  });

  // Quick-pick a predefined direct habit: fills name, influence tag and a
  // sensible category. The name stays freely editable afterwards.
  const nameInput = root.querySelector('#habitName');
  suggestionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      suggestionButtons.forEach(b => b.classList.toggle('active', b === btn));
      nameInput.value = btn.dataset.name;
      influenceInput.value = btn.dataset.influence;
      selectCategoryButton(btn.dataset.category);
    });
  });
  // Typing a custom name clears the active suggestion -> stored as 'custom'.
  nameInput.addEventListener('input', () => {
    if (typeInput.value !== 'direct') return;
    const match = [...suggestionButtons].find(b => b.dataset.name === nameInput.value);
    if (!match) {
      suggestionButtons.forEach(b => b.classList.remove('active'));
      influenceInput.value = 'custom';
    }
  });

  // Linked goals multi-select
  const goalsSelector = root.querySelector('#habitLinkedGoalsSelector');
  const activeGoals = state.goals.filter(g => !g.completed);
  let getSelectedGoals = () => [];
  if (activeGoals.length === 0) {
    goalsSelector.innerHTML = `<div style="grid-column:span 2; font-size:0.8rem; color:var(--text-3);">No active goals yet. Create goals first to link habits.</div>`;
  } else {
    goalsSelector.innerHTML = activeGoals.map(g => `
      <button type="button" class="habit-checkbox-btn" data-goal-id="${g.id}">
        <span class="check-dot"></span><span>${escapeHtml(g.title)}</span>
      </button>`).join('');
    getSelectedGoals = bindMultiSelect(goalsSelector, 'data-goal-id');
  }

  // Weekday toggle-set (default Mon–Fri)
  const selectedDays = new Set([1, 2, 3, 4, 5]);
  bindToggleSet(root.querySelector('#weekdaySelector'), selectedDays, 'data-day', Number);

  root.querySelector('#habitForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.habitName.value.trim();
    const category = root.querySelector('#hiddenHabitCategory').value;
    const priority = root.querySelector('#hiddenHabitPriority').value;
    const habitType = root.querySelector('#hiddenHabitType').value;
    const influenceTag = root.querySelector('#hiddenHabitInfluenceTag').value || null;
    const days = [...selectedDays].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));

    if (!name || !days.length) {
      await confirmDialog({ title: 'Missing details', message: 'Please enter a name and select at least one weekday.', confirmLabel: 'OK' });
      return;
    }

    createHabit({ name, days, category, priority, habitType, influenceTag, linkedGoalIds: getSelectedGoals() });
    requestRender();
  });
}

function bindHabitActions(root, todayKey) {
  root.querySelectorAll('[data-toggle-today]').forEach(btn => {
    btn.addEventListener('click', () => toggleHabitCompletion(btn.dataset.toggleToday, todayKey));
  });
  root.querySelectorAll('[data-delete-habit]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const habit = state.habits.find(h => h.id === btn.dataset.deleteHabit);
      if (!habit) return;
      const ok = await confirmDialog({
        title: 'Delete habit',
        message: `Delete "${habit.name}"? This permanently removes all its records.`,
        confirmLabel: 'Delete', danger: true
      });
      if (ok) { deleteHabit(habit.id); requestRender(); }
    });
  });
}
