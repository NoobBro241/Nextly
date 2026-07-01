/* ============================================================
   categories.js — Category domain (XP + levels)

   The single source of truth for category-related behaviour. This is
   the foundation the future avatar, room and achievement systems will
   build on, so it is deliberately self-contained:

   - Category definitions come from constants.js (id + name).
   - Each category owns its own XP and (derived) level.
   - The level curve is dynamic and centrally configured
     (CATEGORY_LEVEL_CURVE) — no fixed lookup table.
   - All category XP is granted through grantCategoryXP(), which is
     additive-only: XP is never lost.

   This module is DOM-free. Rendering lives in dashboard.js.
   ============================================================ */

import {
  CATEGORIES, ALL_CATEGORIES, CATEGORY_BY_ID,
  DEFAULT_CATEGORY_ID, UNCATEGORIZED, CATEGORY_LEVEL_CURVE
} from './constants.js';
import { state } from './state.js';

/* ---------- definitions / lookups ---------- */

/* All selectable categories (excludes the Uncategorized fallback). */
export function getCategories() {
  return CATEGORIES;
}

/* Resolve a category id to its definition; falls back to Uncategorized. */
export function getCategory(id) {
  return CATEGORY_BY_ID[id] || UNCATEGORIZED;
}

export function getCategoryName(id) {
  return getCategory(id).name;
}

/* Validate an arbitrary value to a known category id (Uncategorized if not). */
export function normalizeCategoryId(value) {
  if (CATEGORY_BY_ID[value]) return value;
  return UNCATEGORIZED.id;
}

/* The default category id used when creating new items. */
export function defaultCategoryId() {
  return DEFAULT_CATEGORY_ID;
}

/* ---------- XP store helpers ---------- */

/* Current XP for a category id (0 if unseen). */
export function getCategoryXP(id) {
  return state.categoryXP[id] || 0;
}

/* Add XP to a category. ADDITIVE ONLY — XP can never be lost.
   `meta` carries context (source, habitId, goalId …) for future
   consumers (achievements / avatar) without changing the signature. */
export function grantCategoryXP(categoryId, amount, /* eslint-disable-next-line no-unused-vars */ meta = {}) {
  const id = normalizeCategoryId(categoryId);
  const value = Math.max(0, Math.round(Number(amount) || 0));
  if (value === 0) return 0;
  state.categoryXP[id] = (state.categoryXP[id] || 0) + value;
  return value;
}

/* ---------- dynamic level curve ----------
   xpForLevel(n) = XP required to advance FROM level n TO level n+1.
   Uses an exponential curve so early levels are quick and later ones
   scale up sharply. Configured entirely via CATEGORY_LEVEL_CURVE. */
export function xpForLevel(level) {
  const { base, growth } = CATEGORY_LEVEL_CURVE;
  return Math.round(base * Math.pow(growth, Math.max(0, level - 1)));
}

/* Convert a total XP amount into level + within-level progress.
   Returns:
     level             current level (>= 1)
     xpIntoLevel       XP accumulated within the current level
     xpForNext         XP needed to reach the next level
     percent           0–100 progress toward the next level
     totalXP           the input total (for convenience) */
export function getCategoryProgress(totalXP) {
  const xp = Math.max(0, Math.round(Number(totalXP) || 0));
  let level = 1;
  let remaining = xp;
  let need = xpForLevel(level);

  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = xpForLevel(level);
  }

  return {
    level,
    xpIntoLevel: remaining,
    xpForNext: need,
    percent: need > 0 ? Math.min(100, Math.round((remaining / need) * 100)) : 0,
    totalXP: xp
  };
}

/* ---------- view model ----------
   A ready-to-render snapshot of every selectable category, plus the
   Uncategorized bucket only if it actually holds XP (so migrated data
   stays visible without cluttering a fresh account). */
export function getCategorySummaries() {
  const list = CATEGORIES.map(buildSummary);
  const unXP = getCategoryXP(UNCATEGORIZED.id);
  if (unXP > 0) list.push(buildSummary(UNCATEGORIZED));
  return list;
}

function buildSummary(cat) {
  const totalXP = getCategoryXP(cat.id);
  const progress = getCategoryProgress(totalXP);
  return {
    id: cat.id,
    name: cat.name,
    xp: totalXP,
    level: progress.level,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNext: progress.xpForNext,
    percent: progress.percent
  };
}
