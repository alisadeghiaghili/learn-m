import { LEVELS } from './levels.js';

export const STORAGE_KEY = 'learn-m-progress-v1';
export const LEGACY_KEY = 'learn-m-solved';

/**
 * @typedef {Object} LevelProgress
 * @property {boolean} solved
 * @property {number} [bestCommands]
 */

/**
 * @typedef {Object} CurriculumSummary
 * @property {number} solvedCount
 * @property {number} total
 * @property {any[]} learned
 * @property {any[]} remaining
 * @property {any | null} next
 * @property {number} percent
 */

export function loadProgress() {
  /** @type {Record<string, LevelProgress>} */
  const progress = {};

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.assign(progress, parsed);
      }
    }
  } catch {
    // ignore
  }

  // Check legacy format
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy && typeof legacy === 'object') {
        for (const [id, golf] of Object.entries(legacy)) {
          if (!progress[id]) {
            progress[id] = { solved: true, bestCommands: Number(golf) || 1 };
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return progress;
}

/**
 * @param {Record<string, LevelProgress>} progress
 */
export function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    // Also update legacy for backward compatibility
    const legacy = {};
    for (const [id, p] of Object.entries(progress)) {
      if (p.solved) legacy[id] = p.bestCommands ?? 1;
    }
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));
  } catch {
    // ignore
  }
}

/**
 * @param {Record<string, LevelProgress>} progress
 * @returns {CurriculumSummary}
 */
export function summarizeCurriculum(progress) {
  const total = LEVELS.length;
  const learned = [];
  const remaining = [];
  let next = null;

  for (const l of LEVELS) {
    const p = progress[l.id];
    if (p?.solved) {
      learned.push({
        id: l.id,
        name: l.title,
        seriesTitle: l.tab,
        bestCommands: p.bestCommands,
        par: l.par,
      });
    } else {
      const item = {
        id: l.id,
        name: l.title,
        seriesTitle: l.tab,
        par: l.par,
      };
      remaining.push(item);
      if (!next) next = item;
    }
  }

  const solvedCount = learned.length;
  const percent = total > 0 ? Math.round((solvedCount / total) * 100) : 0;

  return {
    solvedCount,
    total,
    learned,
    remaining,
    next,
    percent,
  };
}
