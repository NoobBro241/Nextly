/* ============================================================
   state.js — Central application state
   Single source of truth for runtime data.
   - Holds the state object.
   - Provides normalization/migration of persisted data.
   - NO localStorage access (that belongs to storage.js).
   - NO DOM access (that belongs to ui/views).
   ============================================================ */

import {
  ALL_CATEGORIES, CATEGORY_BY_ID, UNCATEGORIZED, LEGACY_CATEGORY_MAP,
  NAV_ITEMS, DEFAULT_VIEW,
  GOAL_DIFFICULTIES, LEGACY_DIFFICULTY_MAP, GOAL_MILESTONES,
  HABIT_TYPE_IDS, DEFAULT_HABIT_TYPE
} from './constants.js';
import { uid, clampNum } from './utils.js';

/* Resolve any stored category value (new id, legacy name, or missing)
   to a valid category id. Missing/unknown -> 'uncategorized'. */
export function migrateCategoryId(value) {
  if (value && CATEGORY_BY_ID[value]) return value;           // already a valid id
  if (value && LEGACY_CATEGORY_MAP[value]) return LEGACY_CATEGORY_MAP[value]; // old name
  return UNCATEGORIZED.id;
}

/* ---------- default shape ---------- */
export function createDefaultState() {
  return {
    habits: [],
    goals: [],
    completions: {},
    // Anti-exploit ledger: records that XP for a habit on a calendar day has
    // ALREADY been awarded. Shape: { [habitId]: { [dateKey]: awardedXP } }.
    // Once an entry exists, toggling that day never awards XP again.
    xpAwards: {},
    settings: { theme: 'dark', notifications: false, compactMode: false },
    activeView: DEFAULT_VIEW,
    totalXP: 0,
    categoryXP: emptyCategoryXP(),
    selectedDayIndex: 0,
    weeklyWeekStart: null, // ISO date-key of the selected week's Monday; null = current week
    /* ---- Reserved scaffolding for upcoming systems ----
       Intentionally empty now. Declared so future features can populate
       them without a state migration:
         avatar   -> appearance / stat model driven by 'direct' habits
         room      -> room / environment model
         insights  -> AI analysis outputs
         analytics -> data for progress graphs over time */
    avatar: null,
    room: null,
    insights: null,
    analytics: null
  };
}

/* Category XP is keyed by category id (including the Uncategorized bucket). */
function emptyCategoryXP() {
  return ALL_CATEGORIES.reduce((acc, c) => { acc[c.id] = 0; return acc; }, {});
}

/* ---------- the live state object ----------
   Mutated in place so module imports keep a stable reference. */
export const state = createDefaultState();

/* Replace the entire state contents (used on load / reset). */
export function replaceState(next) {
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, next);
  return state;
}

/* ---------- normalization (migration of persisted data) ----------
   Accepts both the new id-keyed store and the legacy name-keyed store.
   Old keys are migrated to ids (and summed if several map to the same id),
   so accumulated XP is never lost. */
export function normalizeCategoryXP(raw) {
  const base = emptyCategoryXP();
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      const id = migrateCategoryId(key);
      base[id] = (base[id] || 0) + (Number(value) || 0);
    }
  }
  return base;
}

/* Normalize a goal into the unified percent model. Migrates any legacy
   shape (numeric / checklist / money / weight) down to a single progress
   value and discards their type-specific fields.
   Canonical goal fields: currentProgress, highestProgress, unlockedMilestones.
   Older saves used `progress` / `claimedMilestones` — both are migrated. */
export function normalizeGoal(goal) {
  // Accept the new field (currentProgress) and the legacy field (progress).
  let currentProgress = typeof goal.currentProgress === 'number'
    ? goal.currentProgress
    : (typeof goal.progress === 'number' ? goal.progress : null);

  if (currentProgress === null) {
    if (goal.goalType === 'numeric' && goal.targetValue) {
      currentProgress = Math.round((Number(goal.currentValue) || 0) / (Number(goal.targetValue) || 1) * 100);
    } else if (goal.goalType === 'checklist' && Array.isArray(goal.subtasks) && goal.subtasks.length) {
      const done = goal.subtasks.filter(s => s.done).length;
      currentProgress = Math.round(done / goal.subtasks.length * 100);
    } else {
      currentProgress = 0;
    }
  }
  currentProgress = clampNum(currentProgress, 0, 100, 0);

  const difficulty = GOAL_DIFFICULTIES.includes(goal.difficulty)
    ? goal.difficulty
    : (LEGACY_DIFFICULTY_MAP[goal.difficulty] || 'Medium');

  const category = migrateCategoryId(goal.category);

  // Whether this goal has already paid its 100% category reward (must persist
  // so re-reaching 100% never pays the category twice). Derived for legacy
  // goals: if already at 100%, treat the reward as paid.
  const categoryRewardClaimed = typeof goal.categoryRewardClaimed === 'boolean'
    ? goal.categoryRewardClaimed
    : currentProgress >= 100;

  // Highest progress ever reached (never below the current progress).
  const highestProgress = clampNum(goal.highestProgress, 0, 100, currentProgress);

  // Milestones already unlocked for this goal (only valid known thresholds).
  // Accepts the new field (unlockedMilestones) and the legacy one (claimedMilestones).
  const rawUnlocked = Array.isArray(goal.unlockedMilestones)
    ? goal.unlockedMilestones
    : (Array.isArray(goal.claimedMilestones) ? goal.claimedMilestones : []);
  const unlockedMilestones = rawUnlocked
    .filter(m => GOAL_MILESTONES.includes(m))
    .sort((a, b) => a - b);

  return {
    id: goal.id || uid(),
    title: goal.title || 'Untitled Goal',
    description: typeof goal.description === 'string' ? goal.description : '',
    category,
    durationMonths: clampNum(goal.durationMonths, 1, 12, 3),
    difficulty,
    currentProgress,
    highestProgress: Math.max(highestProgress, currentProgress),
    unlockedMilestones,
    categoryRewardClaimed,
    linkedHabitIds: Array.isArray(goal.linkedHabitIds) ? goal.linkedHabitIds : [],
    reflections: Array.isArray(goal.reflections) ? goal.reflections.map(r => ({
      id: r.id || uid(),
      date: r.date || new Date().toISOString(),
      text: typeof r.text === 'string' ? r.text : '',
      progress: typeof r.progress === 'number' ? r.progress : currentProgress
    })) : [],
    createdAt: goal.createdAt || new Date().toISOString(),
    // Status is derived from the live progress: completed only while at 100%.
    completed: currentProgress >= 100
  };
}

export function normalizeHabit(h) {
  // Habit type: validate; legacy habits (no type) default to 'general'.
  const habitType = HABIT_TYPE_IDS.includes(h.habitType) ? h.habitType : DEFAULT_HABIT_TYPE;
  // influenceTag only meaningful for 'direct' habits (avatar key); 'custom'
  // for a user-typed direct habit, null for general habits.
  let influenceTag = typeof h.influenceTag === 'string' ? h.influenceTag : null;
  if (habitType !== 'direct') influenceTag = null;
  else if (!influenceTag) influenceTag = 'custom';

  return {
    ...h,
    category: migrateCategoryId(h.category),
    habitType,
    influenceTag,
    linkedGoalIds: Array.isArray(h.linkedGoalIds) ? h.linkedGoalIds : []
  };
}

/* Build a fully-validated state object from raw (parsed) persisted data. */
export function fromPersisted(parsed, fallbackDayIndex = 0) {
  return {
    habits: Array.isArray(parsed.habits) ? parsed.habits.map(normalizeHabit) : [],
    goals: Array.isArray(parsed.goals) ? parsed.goals.map(normalizeGoal) : [],
    completions: (parsed.completions && typeof parsed.completions === 'object') ? parsed.completions : {},
    settings: {
      theme: 'dark',
      notifications: Boolean(parsed.settings?.notifications),
      compactMode: Boolean(parsed.settings?.compactMode)
    },
    activeView: NAV_ITEMS.some(i => i.id === parsed.activeView) ? parsed.activeView : DEFAULT_VIEW,
    totalXP: typeof parsed.totalXP === 'number' ? parsed.totalXP : 0,
    categoryXP: normalizeCategoryXP(parsed.categoryXP),
    selectedDayIndex: typeof parsed.selectedDayIndex === 'number' ? parsed.selectedDayIndex : fallbackDayIndex,
    weeklyWeekStart: (typeof parsed.weeklyWeekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.weeklyWeekStart))
      ? parsed.weeklyWeekStart
      : null,
    xpAwards: normalizeXpAwards(parsed),
    // Reserved scaffolding — preserved if present, else null.
    avatar: parsed.avatar ?? null,
    room: parsed.room ?? null,
    insights: parsed.insights ?? null,
    analytics: parsed.analytics ?? null
  };
}

/* Build the anti-exploit XP ledger from persisted data.
   - If a ledger already exists, keep it.
   - Otherwise (legacy save) back-fill it from existing completions so that
     already-counted past completions are treated as "already awarded" and
     can never re-grant XP. This neither adds nor removes any XP. */
function normalizeXpAwards(parsed) {
  if (parsed.xpAwards && typeof parsed.xpAwards === 'object') {
    const out = {};
    for (const [habitId, days] of Object.entries(parsed.xpAwards)) {
      if (days && typeof days === 'object') {
        out[habitId] = {};
        for (const [dateKey, xp] of Object.entries(days)) out[habitId][dateKey] = Number(xp) || 0;
      }
    }
    return out;
  }
  // Legacy back-fill: mark every existing completion as already awarded.
  const ledger = {};
  const completions = (parsed.completions && typeof parsed.completions === 'object') ? parsed.completions : {};
  for (const [habitId, days] of Object.entries(completions)) {
    if (days && typeof days === 'object') {
      ledger[habitId] = {};
      for (const dateKey of Object.keys(days)) ledger[habitId][dateKey] = 0; // 0 = awarded, amount unknown
    }
  }
  return ledger;
}
