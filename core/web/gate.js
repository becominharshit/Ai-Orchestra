// Follow-to-unlock sheet. HONOUR-BASED: we never call Instagram, never check a follow, never scrape.
//   import { gate } from '/core/gate.js';
//   await gate('jyotish', { reward: 'Tumhare 3 future predictions' });   // resolves when unlocked
// Counts gate_view, gate_open_ig, gate_unlock (counts only). Unlock is remembered for this anonymous session.
import { track, h, sid, isHero, EXP } from './kit.js';
import { qrElement } from './qr.js';

export const IG_URL = 'https://instagram.com/zenith_school_of_ai';
export const IG_HANDLE = '@zenith_school_of_ai';

const key = (exp) => `pz_gate_${exp}_${sid()}`;
export function isUnlocked(exp = EXP) { try { return localStorage.getItem(key(exp)) === '1'; } catch { return false; } }

/**
 * @param {string} exp experience id
 * @param {object} o { reward: what unlocks (Hinglish), title, kicker }
 * @returns {Promise<true>}
 */
export function gate(exp = EXP, { reward = 'Tumhara full result', title = 'Follow karo, result unlock karo', kicker = 'Last step' } = {}) {
  if (isUnlocked(exp)) return Promise.resolve(true);
  return new Promise((resolve) => {
    track('gate_view', undefined, { exp });
    let opened = false;
    const back = h('div', { class: 'pz-sheet-back' });
    const unlockBtn = h('button', { class: 'pz-btn ghost block', 'data-pz': 'gate-unlock' }, 'Maine follow kar liya');
    const igBtn = h('a', { class: 'pz-btn block', href: IG_URL, target: '_blank', rel: 'noopener noreferrer', 'data-pz': 'gate-ig' },
      h('span', { class: 'pz-ig-glyph', 'aria-hidden': 'true' }), 'Instagram kholo');
    igBtn.addEventListener('click', () => {
      if (!opened) track('gate_open_ig', undefined, { exp });
      opened = true;
      unlockBtn.className = 'pz-btn block';
      igBtn.className = 'pz-btn ghost block';
    });
    unlockBtn.addEventListener('click', () => {
      try { localStorage.setItem(key(exp), '1'); } catch { /* private mode: unlock just this once */ }
      track('gate_unlock', undefined, { exp });
      sheet.classList.add('pz-sheet-out');
      back.remove();
      setTimeout(() => sheet.remove(), 260);
      resolve(true);
    });
    const qr = qrElement(IG_URL, { ecc: 'M', margin: 3, label: 'QR code for instagram.com/zenith_school_of_ai' });
    const sheet = h('div', { class: 'pz-sheet pz-gate', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'grab' }),
      h('div', { class: 'pz-gate-top' },
        h('div', {},
          h('div', { class: 'pz-kicker' }, kicker),
          h('h2', { class: 'pz-display pz-gate-title' }, title),
          h('p', { class: 'pz-gate-reward' }, h('span', { class: 'pz-lock', 'aria-hidden': 'true' }), reward)),
        h('div', { class: 'pz-gate-qr' }, qr, h('small', {}, 'Dost ke phone se scan'))),
      h('div', { class: 'pz-gate-handle' }, h('span', { class: 'pz-ig-glyph big', 'aria-hidden': 'true' }), h('b', {}, IG_HANDLE),
        h('span', { class: 'pz-dim' }, 'AI, tech aur college life, Zenith style')),
      h('div', { class: 'pz-stack' }, igBtn, unlockBtn),
      h('p', { class: 'pz-gate-fine' }, isHero() ? 'Demo mode: kuch count nahi hota.' : 'Honest system: follow karo, phir tap karo. Hum check nahi karte.'));
    document.body.append(back, sheet);
  });
}
