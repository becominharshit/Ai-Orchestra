// Care path UI (CONTRACT 13.3): a calm full-screen card with Tele-MANAS 14416. No game, no score, nothing on the TV.
//   import { showCare, detect } from '/core/care.js';
// The kit calls showCare() itself when a visitor's text suggests self-harm; experiences rarely need it directly.
export { detect, detectDeep } from './care-words.js';

export const CARE = {
  title: 'Tum akele nahi ho.',
  body: 'Kisi bade se ya kisi apne se baat karo.',
  line: 'Tele-MANAS (free, 24x7): 14416',
  call: 'Abhi call karo: 14416',
  back: 'Wapas',
};

let open = null;
/** Show the care card. onBack defaults to restarting the experience from its first screen. */
export function showCare({ onBack } = {}) {
  if (open) return open;
  const el = document.createElement('div');
  el.className = 'pz-care';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('data-pz', 'care');
  el.innerHTML = `<div class="pz-care-card">
    <div class="pz-care-glow" aria-hidden="true"></div>
    <h2>${CARE.title}</h2>
    <p>${CARE.body}</p>
    <p class="pz-care-line">${CARE.line}</p>
    <a class="pz-btn block pz-care-call" href="tel:14416">${CARE.call}</a>
    <button class="pz-btn ghost block pz-care-back" type="button">${CARE.back}</button>
  </div>`;
  document.querySelectorAll('.pz-overlay, .pz-sheet, .pz-sheet-back').forEach((n) => n.remove());
  document.body.appendChild(el);
  el.querySelector('.pz-care-back').addEventListener('click', () => {
    el.remove();
    open = null;
    // back to the start screen, keeping this phone's counter (?c=) so the TV mirror still works
    const c = new URLSearchParams(location.search).get('c');
    if (onBack) onBack(); else location.assign(location.pathname + (c && /^\d{1,2}$/.test(c) ? `?c=${c}` : ''));
  });
  open = el;
  return el;
}
