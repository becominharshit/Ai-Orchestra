// Care path for typed visitor input (CONTRACT 13.3). Uses core's kit.guardText when core ships it (it detects and
// shows core's care card); until then a small local fallback with the same card text.
// Which inputs: EVERY typed field (first names included, solo and Dost; CHECK-02c).
// Both detectors run: core's (authority) and the local list, so a phrase either one knows shows the card.
// TODO(core): remove the fallback once kit.guardText is in every deploy.
import * as kit from '/core/kit.js';

const LITE = [
  /suicid/i, /\bkill(ing)?\s*my\s*self\b/i, /\bend\s+(my|it)\s+(life|all)\b/i, /\bwant\s+to\s+die\b/i, /\bself\s*-?\s*harm/i, /\bdon'?t\s+want\s+to\s+live\b/i,
  /\bkhud\s*kh?ushi\b/i, /\baa?tm\s*a?hatya\b/i, /\bmar\s+ja(na|ana|un|unga|ungi|oon)\b/i, /\bmarna\s+(hai|chahta|chahti)\b/i, /\bjeena\s+nahi\b/i,
  /\bzind(a|agi)\s+(nahi|khatam)\b/i, /\bkhud\s+ko\s+(khatam|maar|hurt)\b/i, /आत्महत्या/, /मरना\s*चाहत/, /मर\s*जा/, /जीना\s*नहीं/, /जीने\s*का\s*मन\s*नहीं/, /खुदकुशी/, /ख़ुदकुशी/, /\bunalive\b/i,
];
const liteDetect = (t) => LITE.some((re) => re.test(String(t || '').replace(/[^\p{L}\p{M}\p{N}'\s-]/gu, ' ').replace(/\s+/g, ' ')));

function localCard() {
  return new Promise((resolve) => {
    const wrap = kit.h('div', { class: 'pz-overlay stage', role: 'dialog', 'aria-modal': 'true', 'data-pz': 'care' },
      kit.h('div', { class: 'pz-card' },
        kit.h('h2', {}, 'Tum akele nahi ho.'),
        kit.h('p', {}, 'Kisi bade se ya kisi apne se baat karo. Tele-MANAS (free, 24x7): 14416'),
        kit.h('a', { class: 'pz-btn block', href: 'tel:14416' }, 'Tele-MANAS ko call karo'),
        kit.h('button', { class: 'pz-btn ghost block', style: 'margin-top:10px', onclick: () => { wrap.remove(); resolve(); } }, 'Wapas')));
    document.body.appendChild(wrap);
  });
}

/** true when any text needs the care path; the care card has then been shown. Nothing else should run. */
export async function careCheck(...texts) {
  const list = texts.filter((t) => typeof t === 'string' && t.trim());
  if (!list.length) return false;
  if (typeof kit.guardText === 'function') {
    if (!kit.guardText(...list)) return true; // core: true = fine, false = core showed its care card
    if (!list.some(liteDetect)) return false;
    if (typeof kit.careFlow === 'function') kit.careFlow(); else localCard();
    return true;
  }
  if (!list.some(liteDetect)) return false;
  localCard();
  return true;
}
export { liteDetect };
