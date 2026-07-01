/* ============================================================
   constants.js — Application-wide constants
   Pure data only. No logic, no DOM, no state.
   ============================================================ */

export const STORAGE_KEY = 'habitfy.v3';

/* --- Calendar --- */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday -> Sunday
export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const SHORT_DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/* --- Habit priority --- */
export const PRIORITY_ORDER = { Extreme: 0, High: 1, Medium: 2, Low: 3, Minimal: 4 };
export const PRIORITY_CLASS = { Extreme: 'extreme', High: 'high', Medium: 'medium', Low: 'low', Minimal: 'minimal' };
export const PRIORITY_XP = { Low: 10, Medium: 20, High: 40, Extreme: 80 };

/* --- Categories ---------------------------------------------------------
   The category system is the foundation for XP, levels and the future
   avatar / room / achievement systems. Each category is an object with a
   stable `id` (used as the storage key and the future avatar/room key) and
   a human-readable `name`. Add or rename via this list only.

   "Uncategorized" is a reserved fallback for migrated habits/goals that
   never had a category. It is intentionally NOT offered in the create/edit
   pickers (see SELECTABLE_CATEGORIES). */
export const CATEGORIES = [
  { id: 'fitness',       name: 'Fitness' },
  { id: 'health',        name: 'Health' },
  { id: 'mindset',       name: 'Mindset' },
  { id: 'learning',      name: 'Learning' },
  { id: 'business',      name: 'Business' },
  { id: 'career',        name: 'Career' },
  { id: 'finance',       name: 'Finance' },
  { id: 'relationships', name: 'Relationships' },
  { id: 'creativity',    name: 'Creativity' },
  { id: 'lifestyle',     name: 'Lifestyle' }
];

/* Reserved fallback category for un-categorized / migrated items. */
export const UNCATEGORIZED = { id: 'uncategorized', name: 'Uncategorized' };

/* Every category including the fallback (used for storage + lookups). */
export const ALL_CATEGORIES = [...CATEGORIES, UNCATEGORIZED];

/* Only these are offered in the habit/goal pickers. */
export const SELECTABLE_CATEGORIES = CATEGORIES;

/* Fast id -> category lookup. */
export const CATEGORY_BY_ID = ALL_CATEGORIES.reduce((acc, c) => { acc[c.id] = c; return acc; }, {});

export const DEFAULT_CATEGORY_ID = CATEGORIES[0].id; // 'fitness'

/* --- Habit types --------------------------------------------------------
   Every habit is one of two types. This only stores the classification;
   no avatar behaviour is implemented yet. The future avatar system will
   read habitType + influenceTag to decide how a habit shapes the avatar.

   - 'direct'  : physically/mentally affects the user and will later be
                 able to change the avatar (training, sleep, nutrition …).
   - 'general' : everything else; still grants XP / levels / categories
                 but does not directly shape the avatar. */
export const HABIT_TYPES = [
  { id: 'direct',  name: 'Direct Influence', hint: 'Physical / mental habits that will later shape your avatar.' },
  { id: 'general', name: 'General Habit',    hint: 'Everything else — still earns XP, levels and category progress.' }
];
export const HABIT_TYPE_IDS = HABIT_TYPES.map(t => t.id);
export const DEFAULT_HABIT_TYPE = 'general';

/* Predefined "direct influence" habits offered as quick-pick suggestions.
   The user may still type a custom name; a custom direct habit is stored
   with influenceTag 'custom'. `influenceTag` is a stable key the future
   avatar system can map to body/stat changes. `category` pre-selects a
   sensible category when the suggestion is chosen. */
export const DIRECT_HABIT_SUGGESTIONS = [
  { influenceTag: 'strength',    name: 'Strength Training', category: 'fitness' },
  { influenceTag: 'calisthenics', name: 'Calisthenics',     category: 'fitness' },
  { influenceTag: 'running',     name: 'Running',           category: 'fitness' },
  { influenceTag: 'swimming',    name: 'Swimming',          category: 'fitness' },
  { influenceTag: 'cycling',     name: 'Cycling',           category: 'fitness' },
  { influenceTag: 'nutrition',   name: 'Healthy Eating',    category: 'health' },
  { influenceTag: 'sleep',       name: 'Sleep',             category: 'health' },
  { influenceTag: 'hydration',   name: 'Drink Water',       category: 'health' },
  { influenceTag: 'stretching',  name: 'Stretching',        category: 'fitness' },
  { influenceTag: 'meditation',  name: 'Meditation',        category: 'mindset' }
];

/* Map legacy category VALUES (old name-based system) to new ids.
   Old set was ['Finance','Selfcare','Fitness','Learning','Work','Household'].
   Anything not listed and not already a valid id migrates to Uncategorized. */
export const LEGACY_CATEGORY_MAP = {
  Finance: 'finance',
  Fitness: 'fitness',
  Learning: 'learning',
  Selfcare: 'health',
  Work: 'career',
  Household: 'lifestyle'
};

/* --- Category XP curve (central, dynamic, easily tunable) ---------------
   Level N requires:  round(BASE * GROWTH^(N-1))  XP to advance to N+1.
   - Early levels are cheap (BASE small) so the first few feel fast.
   - GROWTH > 1 makes each level cost noticeably more than the last.
   Tune the whole progression here without touching any logic. */
export const CATEGORY_LEVEL_CURVE = {
  base: 100,    // XP needed to go from level 1 -> 2
  growth: 1.45  // each subsequent level costs ~45% more
};

/* --- Goal difficulty (single unified percent system, no goal types) --- */
export const GOAL_DIFFICULTIES = ['Minimal', 'Low', 'Medium', 'High', 'Extreme'];
export const GOAL_DIFFICULTY_CLASS = { Minimal: 'minimal', Low: 'low', Medium: 'medium', High: 'high', Extreme: 'extreme' };
export const GOAL_DIFFICULTY_MULTIPLIER = { Minimal: 0.5, Low: 0.8, Medium: 1.2, High: 1.8, Extreme: 2.6 };
export const GOAL_BASE_XP_PER_MONTH = 120;

/* --- Goal milestones (percent thresholds rewarded once per goal) ---
   The reward for each milestone is a fraction of the goal's total XP
   (computeGoalXP). Fractions sum to 1.0 so the full goal XP is paid
   out exactly once across the whole 0 -> 100% journey. */
export const GOAL_MILESTONES = [5, 10, 15, 20, 30, 50, 75, 100];
export const GOAL_MILESTONE_WEIGHT = {
  5: 0.05, 10: 0.05, 15: 0.05, 20: 0.05, 30: 0.10, 50: 0.15, 75: 0.20, 100: 0.35
};

/* --- Legacy difficulty migration map --- */
export const LEGACY_DIFFICULTY_MAP = { Easy: 'Low', Medium: 'Medium', Hard: 'High', Extreme: 'Extreme' };

/* --- XP / leveling --- */
export const XP_PER_LEVEL_STEP = 300;       // level N requires N * step XP

/* --- Navigation --- */
/* Variant A: the avatar lives only in the Dashboard ("My Workspace"),
   so there is no dedicated Life tab in the navigation. */
export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'goals', label: 'Goals' },
  { id: 'weekly', label: 'Weekly Plan' },
  { id: 'habits', label: 'Habits' },
  { id: 'settings', label: 'Settings' }
];

export const PAGE_META = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview of routines, active goals, and daily progress.' },
  goals: { title: 'Long-Term Goals', subtitle: 'Set a target, reflect daily, and move the percentage forward.' },
  weekly: { title: 'Weekly Plan', subtitle: 'Structured weekly routine and completion history.' },
  habits: { title: 'Manage Habits', subtitle: 'Create, inspect, and remove your daily habits.' },
  settings: { title: 'Settings', subtitle: 'Adjust preferences and manage storage data.' }
};

export const DEFAULT_VIEW = 'dashboard';

/* --- Rank titles by level --- */
export const RANK_TITLES = [
  { min: 10, title: 'Lord of Consistency' },
  { min: 8, title: 'Demigod of Habits' },
  { min: 6, title: 'Master of Habits' },
  { min: 5, title: 'Self-Discipline Sage' },
  { min: 4, title: 'Streak Sentinel' },
  { min: 3, title: 'Focus Disciple' },
  { min: 2, title: 'Routine Builder' },
  { min: 1, title: 'Habit Novice' }
];
