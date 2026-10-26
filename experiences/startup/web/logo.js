// Brand kit shared by the phone, the TV hook AND the server (lib/content.js and the /s/<code> page import this file).
// Plain data and string builders only: no DOM at import time, so Node can import it too.

// 4 palettes: bg (page), a and b (gradient accents), ink (text on bg).
export const PALETTES = [
  { name: 'Sky Violet', bg: '#0E0B2A', a: '#62BBF3', b: '#8F6BFF', ink: '#F1F2FF' },
  { name: 'Sunrise Chai', bg: '#1E0F12', a: '#FFB347', b: '#FF6F61', ink: '#FFF4EA' },
  { name: 'Mint Fresh', bg: '#06201C', a: '#3EE6A8', b: '#2BB3C0', ink: '#ECFFF7' },
  { name: 'Ink Gold', bg: '#19173D', a: '#F5C451', b: '#F7F6F2', ink: '#F7F6F2' },
];

// 4 typographic logo templates. The mark is a fixed SVG; the monogram letters sit on top (CSS).
// Colours come from CSS (currentColor and the .ss-fill class), never from the SVG itself.
export const LOGO_NAMES = ['Ring monogram', 'Dot wordmark', 'Spark mark', 'Block badge'];
export const MARKS = [
  '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="5"/><circle class="ss-fill" cx="50" cy="50" r="35"/></svg>',
  '<svg viewBox="0 0 100 100" aria-hidden="true"><rect class="ss-fill" x="6" y="6" width="88" height="88" rx="44"/><circle cx="80" cy="80" r="12" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="ss-fill" d="M50 0 L64 22 Q70 30 78 36 L100 50 L78 64 Q70 70 64 78 L50 100 L36 78 Q30 70 22 64 L0 50 L22 36 Q30 30 36 22 Z"/></svg>',
  '<svg viewBox="0 0 100 100" aria-hidden="true"><rect class="ss-fill" x="4" y="4" width="92" height="92" rx="24"/><rect x="16" y="16" width="68" height="68" rx="16" fill="none" stroke="currentColor" stroke-width="3" opacity=".45"/></svg>',
];

/** CSS custom properties for a palette, for inline styles in the phone and TV views. */
export function paletteVars(i) {
  const p = PALETTES[i] || PALETTES[0];
  return `--ss-bg:${p.bg};--ss-a:${p.a};--ss-b:${p.b};--ss-ink:${p.ink}`;
}
