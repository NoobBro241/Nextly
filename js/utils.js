/* ============================================================
   utils.js — Pure helper functions
   Dates, formatting, math, ids. NO DOM manipulation, NO state,
   NO storage. Every function here must be side-effect free.
   ============================================================ */

import {
  DAY_ORDER, WEEKDAY_LABELS, SHORT_DAY_LABELS,
  GOAL_DIFFICULTY_MULTIPLIER, GOAL_BASE_XP_PER_MONTH,
  XP_PER_LEVEL_STEP, RANK_TITLES,
  GOAL_MILESTONES, GOAL_MILESTONE_WEIGHT
} from './constants.js';

/* ---------- ids ---------- */
export function uid() {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2);
}

/* ---------- numbers ---------- */
export function clampNum(v, min, max, fallback = min) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* ---------- dates ---------- */
export function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function getToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
}

export function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday-based week
  copy.setDate(copy.getDate() + diff);
  copy.setHours(12, 0, 0, 0);
  return copy;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

/* Shift a date by a number of whole weeks (Monday-based, calendar-correct). */
export function addWeeks(date, weeks) {
  return addDays(date, weeks * 7);
}

/* ISO-8601 calendar week number (1–53). Weeks start on Monday;
   week 1 is the week containing the first Thursday of the year. */
export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;            // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);    // shift to Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function monthLong(date) { return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date); }
export function monthShort(date) { return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date); }

export function formatLongDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  }).format(date);
}

export function formatReflectionDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

export function formatWeekHeader(weekDays) {
  const first = weekDays[0], last = weekDays[6];
  const kw = getISOWeek(first);
  let range;
  if (first.getMonth() === last.getMonth()) {
    range = `${monthLong(first)} ${first.getFullYear()} · ${first.getDate()}–${last.getDate()}`;
  } else if (first.getFullYear() === last.getFullYear()) {
    range = `${first.getDate()} ${monthLong(first)} – ${last.getDate()} ${monthLong(last)} ${last.getFullYear()}`;
  } else {
    range = `${first.getDate()} ${monthLong(first)} ${first.getFullYear()} – ${last.getDate()} ${monthLong(last)} ${last.getFullYear()}`;
  }
  return `${range} · KW ${kw}`;
}

export function formatDaysCompact(days) {
  return DAY_ORDER.filter(day => days.includes(day)).map(day => SHORT_DAY_LABELS[day]).join(' · ');
}

export function weekdayLabel(date) { return WEEKDAY_LABELS[date.getDay()]; }

/* ---------- strings ---------- */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ---------- xp / leveling math (pure) ---------- */
export function computeGoalXP(durationMonths, difficulty) {
  const mult = GOAL_DIFFICULTY_MULTIPLIER[difficulty] ?? 1;
  return Math.round(durationMonths * GOAL_BASE_XP_PER_MONTH * mult);
}

/* XP awarded for crossing a single milestone of a goal.
   Each milestone is a weighted fraction of the goal's total XP, so the
   sum of all milestone rewards equals computeGoalXP exactly. */
export function getMilestoneXP(durationMonths, difficulty, milestone) {
  const totalXP = computeGoalXP(durationMonths, difficulty);
  const weight = GOAL_MILESTONE_WEIGHT[milestone] ?? 0;
  return Math.round(totalXP * weight);
}

/* The milestones (from GOAL_MILESTONES) that a given progress value
   has reached or passed. */
export function getReachedMilestones(progress) {
  return GOAL_MILESTONES.filter(m => progress >= m);
}

export function getXPForLevel(level) {
  return level * XP_PER_LEVEL_STEP;
}

export function getLevelAndProgress(xp) {
  let level = 1, remaining = xp;
  while (remaining >= getXPForLevel(level)) { remaining -= getXPForLevel(level); level++; }
  const nextLevelXP = getXPForLevel(level);
  return {
    level,
    xpInCurrentLevel: remaining,
    xpRequiredForNext: nextLevelXP,
    percent: Math.min(100, Math.round((remaining / nextLevelXP) * 100))
  };
}

export function getRankTitle(level) {
  return (RANK_TITLES.find(r => level >= r.min) || RANK_TITLES[RANK_TITLES.length - 1]).title;
}


