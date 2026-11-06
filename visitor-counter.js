/**
 * Visitor counter client with local daily deduplication and baseline caching.
 */

const STORAGE_KEY = 'learn-m:visitor-count-cache:v1';
const LAST_VISIT_KEY = 'learn-m:last-visit-date';
export const BASELINE_FALLBACK = 186;

/**
 * Extracts numeric visitor count from SVG payload if present.
 * @param {string} svg
 * @returns {number | null}
 */
export function parseVisitorBadgeSvg(svg) {
  if (!svg || typeof svg !== 'string') return null;

  const combinedMatch = svg.match(/(?:VISITORS:|>)\s*[\d.,]+[KMB]?\s*\/\s*([\d.,]+[KMB]?)/i);
  let raw = combinedMatch ? combinedMatch[1] : '';

  if (!raw) {
    const simpleMatch = svg.match(/VISITORS:\s*([\d.,]+[KMB]?)/i);
    raw = simpleMatch ? simpleMatch[1] : '';
  }

  if (!raw) {
    const textMatches = Array.from(svg.matchAll(/>\s*([0-9.,]+[KMB]?)\s*<\/text>/gi));
    if (textMatches.length > 0) {
      raw = textMatches[textMatches.length - 1][1];
    }
  }

  raw = (raw || '').replace(/,/g, '').trim();
  if (!raw) return null;

  const suffix = raw.slice(-1).toUpperCase();
  const scale = { K: 1e3, M: 1e6, B: 1e9 }[suffix] || 1;
  const numPart = scale > 1 ? raw.slice(0, -1) : raw;
  const numeric = Number.parseFloat(numPart) * scale;
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : null;
}

export function getCachedVisitorCount() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (typeof cached.count === 'number' && Number.isFinite(cached.count) && cached.count > 0) {
        return Math.max(cached.count, BASELINE_FALLBACK);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function cacheCount(count) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ count, at: Date.now() }));
  } catch {
    // ignore
  }
}

function isNewDailyVisit() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const lastVisit = localStorage.getItem(LAST_VISIT_KEY);
    if (lastVisit === today) {
      return false;
    }
    localStorage.setItem(LAST_VISIT_KEY, today);
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves visitor count.
 * @returns {Promise<number>}
 */
export async function getVisitorCount() {
  const cached = getCachedVisitorCount();
  const isNew = isNewDailyVisit();

  // On localhost or when NODEMO is present, don't spam external badge API
  if (typeof window !== 'undefined' && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' || window.location.search.includes('NODEMO'))) {
    const fallback = Math.max((cached || BASELINE_FALLBACK) + (isNew ? 1 : 0), BASELINE_FALLBACK);
    cacheCount(fallback);
    return fallback;
  }

  // If already fetched recently and not a new day, return cached
  if (cached && !isNew) {
    return cached;
  }

  try {
    const res = await fetch('https://api.visitorbadge.io/api/combined?path=learn-m', {
      headers: { Accept: 'image/svg+xml, */*' },
      cache: 'no-cache',
    });
    if (res.ok) {
      const text = await res.text();
      const count = parseVisitorBadgeSvg(text);
      if (count && count > 0) {
        const adjusted = Math.max(count, (cached || BASELINE_FALLBACK) + (isNew ? 1 : 0));
        cacheCount(adjusted);
        return adjusted;
      }
    }
  } catch {
    // Network offline or blocked
  }

  const fallback = Math.max((cached || BASELINE_FALLBACK) + (isNew ? 1 : 0), BASELINE_FALLBACK);
  cacheCount(fallback);
  return fallback;
}
