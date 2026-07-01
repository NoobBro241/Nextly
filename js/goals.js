/* ============================================================
   goals.js — Long-term goal domain
   Unified single-percentage progress model.
   Business logic (create / delete / reflect) + Goals view.
   No checkpoints, no weighted formulas — one progress value.
   ============================================================ */

import {
  GOAL_DIFFICULTIES, GOAL_DIFFICULTY_CLASS, GOAL_MILESTONES
} from './constants.js';
import {
  uid, getToday, addDays, clampNum, computeGoalXP, getMilestoneXP,
  getReachedMilestones, escapeHtml, formatReflectionDate
} from './utils.js';
import { state } from './state.js';
import { saveState } from './storage.js';
import { showToast, confirmDialog, bindSingleSelect, bindMultiSelect } from './ui.js';
import { requestRender } from './router.js';
import {
  getCategories, getCategoryName, grantCategoryXP, defaultCategoryId, normalizeCategoryId
} from './categories.js';
import { isCompleted, isHabitScheduledOn } from './habits.js';

/* ---- View-only UI state ----
   Which goal cards are expanded ("Show more"). This is transient UI state
   (not persisted): goals start collapsed for a clean overview. Stored by
   goal id so each card expands independently. */
const expandedGoals = new Set();

/* ============================================================
   BUSINESS LOGIC (UI-independent)
   ============================================================ */

export function getGoalXP(goal) {
  return computeGoalXP(goal.durationMonths, goal.difficulty);
}

export function getGoalTimeProgress(goal) {
  const start = new Date(goal.createdAt);
  const now = getToday();
  const end = addDays(start, goal.durationMonths * 30);
  const total = end - start;
  const elapsed = now - start;
  const timeProgress = total > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : 0;
  const daysLeft = Math.max(0, Math.round((end - now) / (1000 * 60 * 60 * 24)));
  return { timeProgress, daysLeft };
}

/* XP already earned from milestones for this goal (sum of unlocked). */
export function getEarnedGoalXP(goal) {
  return (goal.unlockedMilestones || []).reduce(
    (sum, m) => sum + getMilestoneXP(goal.durationMonths, goal.difficulty, m), 0
  );
}

/* The XP reward for a single milestone of this goal. */
export function getGoalMilestoneXP(goal, milestone) {
  return getMilestoneXP(goal.durationMonths, goal.difficulty, milestone);
}

/* ---- Player XP grant ----------------------------------------------------
   The single funnel for the player's overall total XP (level/rank on the
   dashboard). Milestone rewards flow through here as the goal progresses.
   IMPORTANT: goals do NOT grant CATEGORY XP during progress — the category
   reward is paid exactly once when the goal first reaches 100% (see
   applyGoalProgress). `meta` carries context for future consumers. */
export function grantXP(amount, /* eslint-disable-next-line no-unused-vars */ meta = {}) {
  if (!amount) return 0;
  state.totalXP += amount;
  return amount;
}

/* The category reward granted to a goal's category on first completion.
   Uses the full goal XP so a finished goal meaningfully advances its
   category level. Kept here so the rule lives next to the goal logic. */
export function getGoalCategoryReward(goal) {
  return getGoalXP(goal);
}

export function getLastReflection(goal) {
  return goal.reflections?.length ? goal.reflections[goal.reflections.length - 1] : null;
}

export function hasReflectionToday(goal) {
  const todayKey = getToday().toISOString().slice(0, 10);
  return Boolean(goal.reflections?.some(r => r.date.startsWith(todayKey)));
}

export function getActiveGoals() {
  return state.goals.filter(g => !g.completed);
}

export function createGoal({ title, description, category, durationMonths, difficulty, linkedHabitIds }) {
  state.goals.push({
    id: uid(),
    title,
    description: description || '',
    category: normalizeCategoryId(category),
    durationMonths,
    difficulty,
    currentProgress: 0,
    highestProgress: 0,
    unlockedMilestones: [],
    categoryRewardClaimed: false,
    linkedHabitIds: Array.isArray(linkedHabitIds) ? linkedHabitIds : [],
    reflections: [],
    createdAt: new Date().toISOString(),
    completed: false
  });
  saveState();
}

export function deleteGoal(goalId) {
  state.goals = state.goals.filter(g => g.id !== goalId);
  state.habits.forEach(h => {
    if (Array.isArray(h.linkedGoalIds)) h.linkedGoalIds = h.linkedGoalIds.filter(id => id !== goalId);
  });
  saveState();
}

/* Update a goal's progress (the single source of truth) and unlock any
   milestones reached for the first time. This is the one place milestone
   rewards are granted, so the rules below always hold:
   - Progress can move up OR down freely (0–100%).
   - Each milestone (5/10/15/20/30/50/75/100%) unlocks ONCE per goal and is
     recorded in goal.unlockedMilestones; its XP is granted exactly once.
   - Dropping below a milestone keeps its XP and its unlocked state.
   - Re-reaching a milestone grants no further XP.
   - Reaching 100% the first time grants completion XP and marks the goal
     "Completed"; dropping below 100% reverts it to "Active" (no XP removed).
   - highestProgress records the maximum progress ever reached.
   Returns { xpGained, milestonesHit:[], reached100, reverted }. */
export function applyGoalProgress(goal, newProgressRaw) {
  const wasCompleted = goal.completed;
  const newProgress = clampNum(newProgressRaw, 0, 100, goal.currentProgress);

  goal.currentProgress = newProgress;
  goal.highestProgress = Math.max(goal.highestProgress || 0, newProgress);

  // Unlock every milestone the highest progress has reached but not yet claimed.
  const reached = getReachedMilestones(goal.highestProgress);
  const newlyUnlocked = reached.filter(m => !goal.unlockedMilestones.includes(m));

  let xpGained = 0;
  newlyUnlocked.forEach(m => {
    goal.unlockedMilestones.push(m);
    xpGained += grantXP(getGoalMilestoneXP(goal, m), {
      source: 'goal-milestone', goalId: goal.id, category: goal.category, milestone: m
    });
  });
  goal.unlockedMilestones.sort((a, b) => a - b);

  // Category reward: paid EXACTLY ONCE, the first time the goal reaches 100%.
  // Persisted via categoryRewardClaimed so re-reaching 100% never pays again.
  // (Progress along the way grants the category nothing — only completion does.)
  let categoryXPGained = 0;
  if (goal.highestProgress >= 100 && !goal.categoryRewardClaimed) {
    goal.categoryRewardClaimed = true;
    categoryXPGained = grantCategoryXP(goal.category, getGoalCategoryReward(goal), {
      source: 'goal-completion', goalId: goal.id
    });
  }

  // Status is derived from live progress: completed only while at 100%.
  goal.completed = newProgress >= 100;

  return {
    xpGained,
    categoryXPGained,
    milestonesHit: newlyUnlocked,
    reached100: newProgress >= 100 && !wasCompleted,
    reverted: wasCompleted && newProgress < 100
  };
}

/* Add a daily reflection entry and apply its progress value. */
export function addReflection(goalId, text, newProgressRaw) {
  const goal = state.goals.find(g => g.id === goalId);
  if (!goal) return { xpGained: 0, categoryXPGained: 0, milestonesHit: [], reached100: false, reverted: false };

  const newProgress = clampNum(newProgressRaw, 0, 100, goal.currentProgress);
  goal.reflections.push({
    id: uid(),
    date: new Date().toISOString(),
    text: (text || '').trim() || 'Progress updated.',
    progress: newProgress
  });

  const result = applyGoalProgress(goal, newProgress);
  saveState();
  return result;
}

/* ============================================================
   RENDERING (presentation only)
   ============================================================ */
export function render(root) {
  root.innerHTML = `
    <div class="goals-layout">
      ${renderCreateForm()}
      <div class="grid" style="align-content:start;">
        <div class="section-head">
          <h3 style="font-size:1.05rem; color:#fff; font-weight:700;">Active Goals</h3>
          <div class="tiny">Add a daily reflection and set how far you've come.</div>
        </div>
        <div id="goalsLedgerContainer"></div>
      </div>
    </div>`;

  bindCreateForm(root);
  renderLedger(root.querySelector('#goalsLedgerContainer'));
}

function renderCreateForm() {
  const livePreview = computeGoalXP(3, 'Medium');
  return `
    <div class="card">
      <div class="section-head" style="margin-bottom:20px;">
        <h3 style="font-size:1rem; font-weight:700; color:#fff;">Create Long-Term Goal</h3>
        <div class="tiny">One simple system for every goal — you decide your progress.</div>
      </div>

      <form id="goalForm" class="grid" autocomplete="off" style="gap:16px;">
        <div class="field">
          <label for="goalTitle">Goal Title</label>
          <input id="goalTitle" name="goalTitle" type="text" maxlength="80" placeholder="e.g. Save Money, Learn German, Read 20 Books" required />
        </div>

        <div class="field">
          <label for="goalDescription">Description <span style="text-transform:none; color:var(--text-3); font-weight:500;">(optional)</span></label>
          <textarea id="goalDescription" name="goalDescription" maxlength="300" placeholder="What is this goal about?"></textarea>
        </div>

        <input type="hidden" name="goalDuration" id="hiddenGoalDuration" value="3" />
        <input type="hidden" name="goalDifficulty" id="hiddenGoalDifficulty" value="Medium" />
        <input type="hidden" name="goalCategory" id="hiddenGoalCategory" value="${defaultCategoryId()}" />

        <div class="field">
          <label>Category</label>
          <div class="category-select-grid multi-select-habits-grid" id="goalCategorySelector" style="grid-template-columns:repeat(3,1fr); max-height:none;">
            ${getCategories().map((cat, i) => `
              <button type="button" class="habit-checkbox-btn ${i === 0 ? 'active' : ''}" data-value="${cat.id}" style="justify-content:center;">
                <span>${escapeHtml(cat.name)}</span>
              </button>`).join('')}
          </div>
        </div>

        <div class="field">
          <label>Estimated Duration</label>
          <div class="custom-segmented-control duration-segmented-control" id="goalDurationSelector">
            ${[1, 2, 3, 6, 9, 12].map(m => `<button type="button" class="segment-btn ${m === 3 ? 'active' : ''}" data-value="${m}">${m}M</button>`).join('')}
          </div>
        </div>

        <div class="field">
          <label>Difficulty</label>
          <div class="custom-segmented-control difficulty-segmented-control" id="goalDifficultySelector">
            ${GOAL_DIFFICULTIES.map(d => `<button type="button" class="segment-btn ${d === 'Medium' ? 'active' : ''}" data-value="${d}">${d}</button>`).join('')}
          </div>
        </div>

        <div class="field">
          <label>Link Habits (Optional)</label>
          <div class="multi-select-habits-grid" id="goalLinkedHabitsSelector"></div>
        </div>

        <div class="goal-badge xp" id="liveGoalXpDisplay" style="width:100%; text-align:center; padding:10px; font-size:0.78rem;">
          XP Reward: +${livePreview} XP
        </div>

        <button type="submit" class="btn btn-primary" style="width:100%;">Create Goal</button>
      </form>
    </div>`;
}

function bindCreateForm(root) {
  const durationInput = root.querySelector('#hiddenGoalDuration');
  const difficultyInput = root.querySelector('#hiddenGoalDifficulty');
  const xpDisplay = root.querySelector('#liveGoalXpDisplay');

  const updateXpPreview = () => {
    xpDisplay.textContent = `XP Reward: +${computeGoalXP(Number(durationInput.value), difficultyInput.value)} XP`;
  };
  bindSingleSelect(root.querySelector('#goalDurationSelector'), durationInput, updateXpPreview);
  bindSingleSelect(root.querySelector('#goalDifficultySelector'), difficultyInput, updateXpPreview);

  // Category single-select (reuses the habit-checkbox button styling).
  const categoryInput = root.querySelector('#hiddenGoalCategory');
  bindSingleSelect(root.querySelector('#goalCategorySelector'), categoryInput);

  // Linked habits multi-select
  const habitsSelector = root.querySelector('#goalLinkedHabitsSelector');
  let getSelectedHabits = () => [];
  if (state.habits.length === 0) {
    habitsSelector.innerHTML = `<div style="grid-column:span 2; font-size:0.8rem; color:var(--text-3);">No habits available. Create one first.</div>`;
  } else {
    habitsSelector.innerHTML = state.habits.map(h => `
      <button type="button" class="habit-checkbox-btn" data-habit-id="${h.id}">
        <span class="check-dot"></span><span>${escapeHtml(h.name)}</span>
      </button>`).join('');
    getSelectedHabits = bindMultiSelect(habitsSelector, 'data-habit-id');
  }

  const form = root.querySelector('#goalForm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = form.querySelector('#goalTitle').value.trim();
    if (!title) return;

    createGoal({
      title,
      description: form.querySelector('#goalDescription').value.trim(),
      category: categoryInput.value,
      durationMonths: Number(durationInput.value),
      difficulty: difficultyInput.value,
      linkedHabitIds: getSelectedHabits()
    });
    requestRender();
  });
}

function renderLedger(ledger) {
  if (state.goals.length === 0) {
    ledger.innerHTML = `
      <div class="empty-state" style="padding:40px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        <span>No goals yet. Create your first goal on the left.</span>
      </div>`;
    return;
  }
  ledger.innerHTML = state.goals.map(renderGoalCard).join('');
  bindLedgerEvents(ledger);
}

/* Milestone tick marks rendered along the progress bar. A tick is
   "unlocked" once its XP has been awarded for this goal. */
function renderMilestoneTicks(goal) {
  return `
    <div class="goal-milestone-track" aria-hidden="true">
      ${GOAL_MILESTONES.map(m => {
        const unlocked = goal.unlockedMilestones.includes(m);
        const reached = goal.currentProgress >= m;
        const cls = ['goal-milestone-tick', unlocked ? 'claimed' : '', reached ? 'reached' : ''].filter(Boolean).join(' ');
        return `<span class="${cls}" style="left:${m}%;" title="${m}% milestone"></span>`;
      }).join('')}
    </div>`;
}

/* The explicit milestone list shown on the goal card.
   - Unlocked milestones get a check icon and an accent (highlighted) style.
   - Milestones reached by the current progress but (edge case) not yet
     unlocked are shown as reached.
   - Everything else stays greyed out, with its XP reward as a hint. */
function renderMilestoneList(goal) {
  const unlockedCount = goal.unlockedMilestones.length;
  const items = GOAL_MILESTONES.map(m => {
    const unlocked = goal.unlockedMilestones.includes(m);
    const reached = goal.currentProgress >= m;
    const state = unlocked ? 'unlocked' : (reached ? 'reached' : 'locked');
    const mXP = getGoalMilestoneXP(goal, m);
    const icon = unlocked
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
      : `<span class="goal-milestone-dot"></span>`;
    return `
      <div class="goal-milestone-item ${state}" title="${m}% · +${mXP} XP">
        <span class="goal-milestone-mark">${icon}</span>
        <span class="goal-milestone-pct">${m}%</span>
        <span class="goal-milestone-xp">+${mXP} XP</span>
      </div>`;
  }).join('');

  return `
    <div class="goal-milestones">
      <div class="goal-milestones-head">
        <span class="label">Milestones</span>
        <span class="tiny">${unlockedCount} / ${GOAL_MILESTONES.length} unlocked</span>
      </div>
      <div class="goal-milestones-grid">${items}</div>
    </div>`;
}

function renderGoalCard(goal) {
  const time = getGoalTimeProgress(goal);
  const xp = getGoalXP(goal);
  const earnedXP = getEarnedGoalXP(goal);
  const diffClass = GOAL_DIFFICULTY_CLASS[goal.difficulty];
  const linkedHabits = state.habits.filter(h => goal.linkedHabitIds.includes(h.id));
  const todayKey = getToday().toISOString().slice(0, 10);

  const linkedHabitsHTML = linkedHabits.length ? `
    <div>
      <span class="label" style="margin-bottom:6px; display:block;">Linked Habits</span>
      <div class="goal-linked-habits">
        ${linkedHabits.map(h => {
          const done = isCompleted(h.id, todayKey);
          const scheduled = isHabitScheduledOn(h, getToday());
          const statusLabel = done ? 'Done today' : (scheduled ? 'Pending' : 'Off today');
          return `
            <div class="goal-linked-habit ${done ? 'done' : ''}">
              <span class="dot"></span><span>${escapeHtml(h.name)}</span>
              <span class="lh-status">${statusLabel}</span>
            </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const last = getLastReflection(goal);
  const lastReflectionHTML = last ? `
    <div class="goal-last-reflection">
      <div class="ref-meta"><span class="label">Last Reflection</span><span>${formatReflectionDate(new Date(last.date))} · ${last.progress}%</span></div>
      <div class="ref-text">${escapeHtml(last.text || 'Progress updated.')}</div>
    </div>` : `
    <div class="goal-last-reflection empty">
      <span class="label">Last Reflection</span>
      <div class="ref-text">No reflection yet. Add today's reflection to begin.</div>
    </div>`;

  const historyHTML = goal.reflections.length > 1 ? `
    <details>
      <summary class="tiny" style="cursor:pointer; user-select:none; padding:4px 0;">View reflection history (${goal.reflections.length})</summary>
      <div class="goal-reflections-history" style="margin-top:8px;">
        ${goal.reflections.slice().reverse().map(r => `
          <div class="goal-reflection-log-item">
            <div class="reflection-log-meta"><span>${formatReflectionDate(new Date(r.date))}</span><span class="reflection-log-delta">${r.progress}%</span></div>
            <div class="reflection-log-text">${escapeHtml(r.text || 'Progress updated.')}</div>
          </div>`).join('')}
      </div>
    </details>` : '';

  // The reflection button is ALWAYS available — progress can move up or down
  // at any time, so a goal is never permanently locked.
  const actionHTML = `
    <button class="btn ${goal.completed ? 'btn-secondary' : 'btn-secondary'}" style="width:100%;" data-open-reflection="${goal.id}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      Update Progress / Reflect
    </button>`;

  const statusPill = goal.completed
    ? `<span class="goal-badge complete">Completed</span>`
    : `<span class="goal-badge active">Active</span>`;

  // Show the all-time peak when progress has since dropped below it.
  const peakHTML = (goal.highestProgress > goal.currentProgress)
    ? `<span class="goal-peak">Peak ${goal.highestProgress}%</span>`
    : '';

  const completedBannerHTML = goal.completed
    ? `<div class="goal-completed-banner">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
         Goal reached 100% · ${earnedXP} XP earned
       </div>`
    : '';

  const isExpanded = expandedGoals.has(goal.id);

  // Collapsed by default: only the title is shown. All other goal details
  // live inside .goal-details and are revealed by the "Show more" toggle.
  const detailsHTML = `
    <div class="goal-details">
      <div class="goal-meta-row" style="margin-top:4px;">
        <span class="goal-badge">${escapeHtml(getCategoryName(goal.category))}</span>
        <span class="goal-badge ${diffClass}">${goal.difficulty}</span>
        <span class="goal-badge">${goal.durationMonths} ${goal.durationMonths === 1 ? 'Month' : 'Months'}</span>
        <span class="goal-badge xp">+${xp} XP</span>
      </div>
      ${goal.description ? `<p class="goal-desc">${escapeHtml(goal.description)}</p>` : ''}

      <div class="goal-progress-section">
        <div class="goal-progress-header">
          <span class="goal-progress-label">Progress ${peakHTML}</span>
          <span class="goal-progress-percent" data-countup="${goal.currentProgress}">0%</span>
        </div>
        <div class="progress-bar goal-progress-bar">
          <div class="progress-fill" data-fill="${goal.currentProgress}" style="width:0%"></div>
          ${renderMilestoneTicks(goal)}
        </div>
        <div class="goal-duration-info">
          <span>${100 - goal.currentProgress}% remaining</span>
          <span>${earnedXP} / ${xp} XP earned</span>
        </div>
      </div>

      ${renderMilestoneList(goal)}

      ${completedBannerHTML}
      ${linkedHabitsHTML}
      ${lastReflectionHTML}
      ${historyHTML}
      <div data-reflection-slot="${goal.id}"></div>
      ${actionHTML}
    </div>`;

  const toggleHTML = `
    <button class="btn btn-secondary goal-toggle" style="width:100%;" data-toggle-goal="${goal.id}" aria-expanded="${isExpanded}">
      ${isExpanded ? 'Show less' : 'Show more'}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform:rotate(${isExpanded ? 180 : 0}deg); transition:transform var(--t-mid) var(--ease);"><polyline points="6 9 12 15 18 9"/></svg>
    </button>`;

  return `
    <div class="goal-card ${goal.completed ? 'is-completed' : ''} ${isExpanded ? 'expanded' : 'collapsed'}" data-goal-card="${goal.id}">
      <div class="goal-header">
        <div style="min-width:0;">
          <h4 class="goal-title">${escapeHtml(goal.title)}</h4>
          ${isExpanded ? '' : `<span class="tiny goal-collapsed-hint">${statusPill} · ${goal.currentProgress}%</span>`}
        </div>
        <button class="btn btn-text" data-delete-goal="${goal.id}" title="Delete goal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>

      ${isExpanded ? `<div style="margin-top:2px;">${statusPill}</div>${detailsHTML}` : ''}
      ${toggleHTML}
    </div>`;
}

function renderReflectionForm(goal) {
  return `
    <div class="reflection-form">
      <span class="label">Daily Reflection</span>
      <div class="field">
        <label for="refText-${goal.id}">What did you do today?</label>
        <textarea id="refText-${goal.id}" placeholder="Briefly describe your progress..."></textarea>
      </div>
      <div class="field">
        <label>Update Progress</label>
        <div class="reflection-slider-row">
          <input type="range" class="reflection-range" min="0" max="100" value="${goal.currentProgress}" data-ref-range="${goal.id}" />
          <input type="number" class="reflection-percent-input" min="0" max="100" value="${goal.currentProgress}" data-ref-percent="${goal.id}" />
          <span class="reflection-percent-suffix">%</span>
        </div>
      </div>
      <div class="row-actions" style="justify-content:flex-end; gap:8px;">
        <button class="btn btn-text" data-cancel-reflection="${goal.id}">Cancel</button>
        <button class="btn btn-primary" data-save-reflection="${goal.id}">Save Reflection</button>
      </div>
    </div>`;
}

function bindLedgerEvents(ledger) {
  // Show more / Show less — toggles a single card independently.
  ledger.querySelectorAll('[data-toggle-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleGoal;
      if (expandedGoals.has(id)) expandedGoals.delete(id);
      else expandedGoals.add(id);
      requestRender();
    });
  });

  ledger.querySelectorAll('[data-delete-goal]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const goal = state.goals.find(g => g.id === btn.dataset.deleteGoal);
      if (!goal) return;
      const ok = await confirmDialog({
        title: 'Delete goal',
        message: `Delete goal "${goal.title}"? This cannot be undone.`,
        confirmLabel: 'Delete', danger: true
      });
      if (ok) { deleteGoal(goal.id); requestRender(); }
    });
  });

  ledger.querySelectorAll('[data-open-reflection]').forEach(btn => {
    btn.addEventListener('click', () => {
      const goal = state.goals.find(g => g.id === btn.dataset.openReflection);
      if (!goal) return;
      const slot = ledger.querySelector(`[data-reflection-slot="${goal.id}"]`);
      if (!slot) return;
      slot.innerHTML = renderReflectionForm(goal);
      btn.style.display = 'none';
      bindReflectionForm(slot, goal, btn);
      slot.querySelector(`#refText-${goal.id}`)?.focus?.();
    });
  });
}

function bindReflectionForm(slot, goal, openBtn) {
  const range = slot.querySelector(`[data-ref-range="${goal.id}"]`);
  const percent = slot.querySelector(`[data-ref-percent="${goal.id}"]`);

  const sync = (val) => { const v = clampNum(val, 0, 100, 0); range.value = v; percent.value = v; };
  range.addEventListener('input', () => sync(range.value));
  percent.addEventListener('input', () => sync(percent.value));
  percent.addEventListener('blur', () => sync(percent.value));

  slot.querySelector(`[data-cancel-reflection="${goal.id}"]`).addEventListener('click', () => {
    slot.innerHTML = '';
    if (openBtn) openBtn.style.display = '';
  });

  slot.querySelector(`[data-save-reflection="${goal.id}"]`).addEventListener('click', () => {
    const text = slot.querySelector(`#refText-${goal.id}`)?.value || '';
    const result = addReflection(goal.id, text, percent.value);

    if (result.reached100) {
      const catName = getCategoryName(goal.category);
      const catPart = result.categoryXPGained ? ` · ${catName} +${result.categoryXPGained} XP` : '';
      showToast(`Goal reached 100%! +${result.xpGained} XP${catPart}`);
    } else if (result.milestonesHit.length) {
      const top = Math.max(...result.milestonesHit);
      showToast(`Milestone ${top}% unlocked · +${result.xpGained} XP`);
    } else if (result.reverted) {
      showToast('Goal reopened — progress dropped below 100%.');
    } else {
      showToast('Reflection saved.');
    }
    requestRender();
  });
}
