import { LOCALES } from './types.js';
import { en } from './en.js';
import { fa } from './fa.js';

export { LOCALES };

const STORAGE_KEY = 'learn-m-locale';

/** @type {Record<import('./types.js').Locale, { ui: import('./types.js').UiCopy, dir: 'ltr' | 'rtl' }>} */
const catalogs = {
  en: { ui: en, dir: 'ltr' },
  fa: { ui: fa, dir: 'rtl' },
};

/** @type {import('./types.js').Locale} */
let current = 'en';

/**
 * @param {string | null | undefined} v
 * @returns {v is import('./types.js').Locale}
 */
function isLocale(v) {
  return !!v && LOCALES.includes(v);
}

export function detectLocale() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  if (nav.toLowerCase().startsWith('fa') || nav.toLowerCase().startsWith('pe')) return 'fa';
  return 'en';
}

export function getLocale() {
  return current;
}

/**
 * @param {import('./types.js').Locale} locale
 */
export function setLocale(locale) {
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  applyDocumentLocale();
}

export function ui() {
  return catalogs[current].ui;
}

export function getDir() {
  return catalogs[current].dir;
}

export function applyDocumentLocale() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = current;
  document.documentElement.dir = getDir();
}

export function initLocale() {
  current = detectLocale();
  applyDocumentLocale();
  return current;
}
