// "Big screen pe khelo" (CONTRACT 12.4): nickname picker, queue screen, reward token.
//   import { bigScreenButton, bigScreen, rewardToken, pickNickname } from '/core/stage.js';
//   bigScreenButton(el);               // the button; hidden when STAGE_QUEUE=0 or the page has no ?c=
//   const turn = await bigScreen();    // -> { id, counter, nickname, anchor, record } on your turn, or null if cancelled
//   ... play; kit.tvMirror shows the nickname on the TV ...
//   await rewardToken(turn);           // ends the turn and shows the 4-character token + QR, "Counter pe dikhao"
import { h, counter, config, EXP, sleep } from './kit.js';
import { qrElement } from './qr.js';

let current = null; // the running turn on this phone
let chosenNick = null;

async function json(url, body) {
  const r = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

function sheet(...kids) {
  document.querySelectorAll('.pz-stage-sheet, .pz-stage-back').forEach((n) => n.remove());
  const back = h('div', { class: 'pz-sheet-back pz-stage-back' });
  const el = h('div', { class: 'pz-sheet pz-stage-sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grab' }), ...kids);
  document.body.append(back, el);
  return { el, close: () => { el.remove(); back.remove(); } };
}

/** Pick 1 of 3 generated nicknames (no text box). Resolves with the nickname, or null if cancelled. */
export function pickNickname({ title = 'Apna stage naam chuno' } = {}) {
  if (chosenNick) return Promise.resolve(chosenNick);
  return new Promise(async (resolve) => {
    const { data } = await json('/api/core/stage/nicknames');
    const s = sheet(
      h('div', { class: 'pz-kicker' }, 'Big screen'),
      h('h2', { class: 'pz-display pz-stage-title' }, title),
      h('p', { class: 'pz-dim' }, 'Yahi naam TV pe dikhega. Asli naam kabhi nahi.'),
      h('div', { class: 'pz-stage-nicks' }, ...(data.options || []).map((o) => h('button', {
        class: 'pz-btn block pz-nick', 'data-pz': 'nick', type: 'button',
        onclick: async () => {
          const r = await json('/api/core/stage/nickname', { id: o.id });
          s.close();
          chosenNick = r.data.ok ? r.data.nickname : null;
          resolve(chosenNick);
        },
      }, o.text))),
      h('button', { class: 'pz-btn ghost block', type: 'button', onclick: () => { s.close(); resolve(null); } }, 'Abhi nahi'));
  });
}

/** Render the "Big screen pe khelo" button into el. onTurn(turn) runs when it is this phone's turn. */
export async function bigScreenButton(el, { label = 'Big screen pe khelo', onTurn } = {}) {
  const cfg = await config();
  if (!el || counter() === null || cfg.stage?.queue === false) { if (el) el.hidden = true; return null; }
  const b = h('button', { class: 'pz-btn pz-bigscreen block', type: 'button', 'data-pz': 'bigscreen' }, h('span', { class: 'pz-tv-glyph', 'aria-hidden': 'true' }), label);
  b.addEventListener('click', async () => { const t = await bigScreen(); if (t && onTurn) onTurn(t); });
  el.replaceChildren(b);
  return b;
}

/** Nickname -> queue -> resolves on your turn (or null if cancelled / expired / full). */
export async function bigScreen({ exp = EXP } = {}) {
  const c = counter();
  if (c === null) return null;
  const nick = await pickNickname();
  if (!nick) return null;
  const j = await json('/api/core/stage/queue', { exp, c });
  if (!j.data.ok) {
    const s = sheet(h('h2', { class: 'pz-display pz-stage-title' }, j.data.reason === 'full' ? 'Line bhar gayi hai' : 'Abhi nahi ho paya'),
      h('p', { class: 'pz-dim' }, j.data.reason === 'full' ? 'Thodi der mein phir try karo, ya phone pe hi khelo.' : 'Phone pe khelo, mazaa utna hi hai.'),
      h('button', { class: 'pz-btn block', type: 'button', onclick: () => s.close() }, 'Theek hai'));
    return null;
  }
  let cancelled = false;
  const n = h('div', { class: 'pz-queue-n pz-grad-text', 'data-pz': 'bigscreen-ahead' }, String(j.data.ahead));
  const s = sheet(h('div', { class: 'pz-kicker' }, `Counter ${c} · big screen`), h('h2', { class: 'pz-display pz-stage-title' }, 'Line mein ho'), n,
    h('p', { class: 'pz-dim' }, `log aage. Tumhara naam: ${nick}`),
    h('button', { class: 'pz-btn ghost block', type: 'button', onclick: () => { cancelled = true; s.close(); } }, 'Phone pe hi khelunga'));
  for (;;) {
    if (cancelled) return null;
    const st = await json(`/api/core/stage/queue/${j.data.ticket}`);
    if (st.data.status === 'your_turn') { s.close(); current = st.data.turn; current.ticket = j.data.ticket; return current; }
    if (st.data.status === 'expired' || st.data.status === 'done') { s.close(); return null; }
    n.textContent = String(st.data.ahead ?? 0);
    await sleep(2000);
  }
}

/** The running turn on this phone, if any. */
export const currentTurn = () => current;

/** End the turn (if still running) and show the reward token: 4 characters + QR, "Counter pe dikhao". */
export async function rewardToken(turn = current) {
  const cfg = await config();
  if (!turn) return null;
  await json(`/api/core/stage/turn/${turn.id}/end`, {});
  current = null;
  if (cfg.stage?.reward === false) return null;
  let token = null;
  for (let i = 0; i < 5 && !token; i++) { const st = await json(`/api/core/stage/queue/${turn.ticket}`); token = st.data.token || null; if (!token) await sleep(300); }
  if (!token) return null;
  const s = sheet(h('div', { class: 'pz-kicker' }, 'Big screen star'), h('h2', { class: 'pz-display pz-stage-title' }, 'Counter pe dikhao'),
    h('div', { class: 'pz-token', 'data-pz': 'token' }, token),
    h('div', { class: 'pz-token-qr' }, qrElement(token, { margin: 2, label: 'Reward token QR' })),
    h('button', { class: 'pz-btn ghost block', type: 'button', onclick: () => s.close() }, 'Done'));
  return token;
}

// kit.tvMirror().end() also ends a running big-screen turn
window.addEventListener('pz:mirror-end', () => { if (current) json(`/api/core/stage/turn/${current.id}/end`, {}).catch(() => {}); });
