import { ui } from './i18n/index.js';

export const LIVE_URL = 'https://alisadeghiaghili.github.io/learn-m/';
export const SHARE_URL = 'https://alisadeghiaghili.github.io/learn-m/';
export const REPO_URL = 'https://github.com/alisadeghiaghili/learn-m';
export const COFFEE_URL = 'https://www.buymeacoffee.com/alisadeghil';
export const PUBLISHER = 'Ali Sadeghi Aghili';
export const COFFEE_BUTTON_HTML = `<a href="${COFFEE_URL}" target="_blank" rel="noopener noreferrer"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=alisadeghil&button_colour=2a3a4a&font_colour=ffffff&font_family=Cookie&outline_colour=ffffff&coffee_colour=FFDD00" alt="Buy me a coffee" /></a>`;

/**
 * @typedef {Object} ShareContext
 * @property {string} levelName
 * @property {string} levelId
 * @property {number | null} commands
 * @property {number} par
 * @property {any} curriculum
 */

export function shareMessage(ctx) {
  const c = ctx.curriculum;
  const count = c?.solvedCount ?? 0;
  const total = c?.total ?? 53;
  const cmd = ctx.commands !== null ? ` in ${ctx.commands} command${ctx.commands === 1 ? '' : 's'} (par ${ctx.par})` : '';

  return [
    `🚀 Just solved "${ctx.levelName}" (${ctx.levelId})${cmd} on learn-m!`,
    `Progress: ${count} of ${total} Power Query M curriculum levels completed.`,
    '',
    `Master Power Query M step-by-step in your browser:`,
    SHARE_URL,
    '',
    `Created by ${PUBLISHER} · GitHub: ${REPO_URL}`
  ].join('\n');
}

export function buildShareTargets(ctx) {
  const text = shareMessage(ctx);
  const url = SHARE_URL;

  return {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
    whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    text,
    url,
  };
}

export function openShareWindow(url) {
  window.open(url, '_blank', 'noopener,noreferrer,width=720,height=640');
}

export async function copySharePayload(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}
