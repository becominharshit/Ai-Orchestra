// Counter TV shell: /tv/<exp>?c=<n>
//   idle attract loop (big QR for this counter) -> live orchestra mirror -> result spotlight -> idle
// URL flags:  capture=1 (hide QR/URL/counter chrome, bigger graph)   layout=portrait (9:16 stage)
//             replay=1 (replay the last session on load)              speed=0.5 (replay speed)
// Staff keys: P pin/unpin the current session (hold it for filming)   R replay last session   B blank TV now
//             1 / 2 / 5 replay speed 1x, 1/2x, 1/5x                    C capture mode   H help   Esc stop replay
// Optional experience hook: experiences/<id>/web/tv.js (see core/CONTRACT.md).
import { Orchestra, iconSvg } from './orchestra.js';
import { qrSvg } from './qr.js';
import { h, config } from './kit.js';

const params = new URLSearchParams(location.search);
const EXP = decodeURIComponent(location.pathname.split('/')[2] || '');
// Counter from ?c=; without it, the experience's first counter (map v2: 1-2 jyotish, 3 career, 4 shark, 5 reel, 6 asli).
let C = /^\d{1,2}$/.test(params.get('c') || '') ? Number(params.get('c')) : null;
let capture = params.get('capture') === '1';
const layout = params.get('layout') === 'portrait' ? 'portrait' : 'landscape';
let speed = Number(params.get('speed')) > 0 ? Math.min(4, Number(params.get('speed'))) : 1;
const ORCH = new Set(['init', 'assign', 'status', 'log', 'handoff', 'progress', 'done', 'reset']);
const IDLE_AFTER_END_MS = 22000;
const IDLE_AFTER_SILENCE_MS = 60000;

const root = document.getElementById('tv');

// Privacy: the TV keeps sessions for replay, but never their images (e.g. the palm photo) once a session ended.
const isImg = (x) => typeof x === 'string' && x.startsWith('data:image/');
const noImages = (v) => (Array.isArray(v) ? v.filter((x) => !isImg(x)).map(noImages) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => !isImg(x)).map(([k, x]) => [k, noImages(x)])) : v);
function forgetImages() {
  state.current = noImages(state.current);
  state.last = noImages(state.last);
  if (state.orx) state.orx.history = noImages(state.orx.history);
}
const state = { token: null, pinned: false, current: [], last: [], orx: null, replaying: false, idleTimer: null, hook: null, meta: null, cfg: null, mode: 'idle' };

function setMode(m) {
  state.mode = m;
  root.dataset.mode = m;
}

async function boot() {
  root.dataset.layout = layout;
  root.classList.toggle('is-capture', capture);
  const [meta, cfg] = await Promise.all([
    fetch(`/api/core/exp/${encodeURIComponent(EXP)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    config(),
  ]);
  state.meta = meta || { id: EXP, name: EXP || 'Zenith', hook: '', counters: [] };
  const own = state.meta.counters || [];
  if (C === null) C = own[0] ?? 0;
  state.counterMismatch = own.length > 0 && !own.includes(C);
  state.cfg = cfg;
  build();
  if (meta?.tvHook) {
    try { state.hook = (await import(`/${EXP}/tv.js`)).default || null; } catch (e) { console.warn('[tv] hook failed to load', e?.message); }
  }
  state.hook?.mount?.(hookCtx());
  startOps();
  startLoop();
  if (state.counterMismatch) flash(`Note: ${state.meta.name} ka counter ${state.meta.counters.join(' + ')} hai, yeh TV ${C} pe set hai`);
  connect();
  setMode('idle');
}

let $ = {};
function build() {
  const m = state.meta;
  const playUrl = `${state.cfg.publicUrl}/${EXP}?c=${C}`;
  const shortUrl = `${state.cfg.site || 'play.zenithschool.ai'}/${EXP}`;
  const stage = h('div', { class: 'tv-stage' });

  // chrome
  const top = h('header', { class: 'tv-top' },
    h('div', { class: 'pz-brand' }, h('i'), 'Zenith School of AI'),
    h('div', { class: 'tv-top-mid' }, m.name),
    h('div', { class: 'tv-counter tv-chrome' }, h('small', {}, 'COUNTER'), h('b', {}, String(C))));
  const foot = h('footer', { class: 'tv-foot' },
    h('span', { class: 'tv-handle' }, '@zenith_school_of_ai'),
    h('span', { class: 'tv-chrome tv-url' }, shortUrl),
    h('span', { class: 'tv-prog' }, 'B.Tech in AI + mini-MBA. Ek degree, KRMU ki.'));

  // idle attract
  const qr = h('div', { class: 'tv-qr tv-chrome', html: qrSvg(playUrl, { ecc: 'M', margin: 2, label: `QR code to play ${m.name}` }) });
  const orbit = h('div', { class: 'tv-orbit' }, ...[0, 1, 2, 3, 4, 5].map((i) => h('span', { style: `--i:${i}` })));
  const hookLines = [m.hook || 'AI agents live kaam karte dikhenge.', '1. Scan karo  2. Khelo  3. Follow karke unlock karo', 'Har result ke peeche asli AI agents ka kaam.'];
  const hookEl = h('p', { class: 'tv-hook' }, hookLines[0]);
  let hi = 0;
  setInterval(() => { if (state.mode !== 'idle') return; hi = (hi + 1) % hookLines.length; hookEl.classList.remove('in'); void hookEl.offsetWidth; hookEl.textContent = hookLines[hi]; hookEl.classList.add('in'); }, 6000);
  const qrPanel = h('div', { class: 'tv-panel on', 'data-panel': 'qr' },
    h('div', { class: 'tv-idle-kicker' }, h('span', { class: 'tv-dot' }), h('span', { class: 'tv-chrome' }, `COUNTER ${C} · `), 'LIVE AI AGENTS'),
    h('h1', { class: 'pz-display tv-idle-title' }, m.name),
    m.forFun ? h('span', { class: 'pz-forfun tv-forfun' }, 'For fun only') : null,
    h('div', { class: 'tv-qr-wrap' }, orbit, qr, h('div', { class: 'tv-core' }, iconSvg(m.icon || 'spark'))),
    h('div', { class: 'tv-scan tv-chrome' }, 'Scan karo, khelo'),
    hookEl);
  const idle = h('section', { class: 'tv-idle' }, qrPanel);

  const live = h('section', { class: 'tv-live' });
  const spot = h('section', { class: 'tv-spot', 'aria-live': 'polite' });
  const chips = h('div', { class: 'tv-chips' });
  const pinChip = h('span', { class: 'tv-chip tv-pin' }, h('i'), 'PINNED · FILMING');
  const replayChip = h('span', { class: 'tv-chip tv-replay' }, h('i'), 'REPLAY');
  const nickChip = h('span', { class: 'tv-chip tv-nick', 'data-pz': 'tv-nick' }, h('i'), '');
  const conn = h('span', { class: 'tv-conn', title: 'live link' });
  chips.append(pinChip, replayChip, nickChip);
  const help = h('div', { class: 'tv-help' },
    h('b', {}, 'Staff keys'),
    h('span', {}, 'P  pin / unpin this session'), h('span', {}, 'R  replay last session'), h('span', {}, '1 / 2 / 5  replay speed 1x, 1/2x, 1/5x'),
    h('span', {}, 'C  capture mode (no QR / URL)'), h('span', {}, 'B  blank this TV now (clears the session)'), h('span', {}, 'A  hide / show the anchor card'), h('span', {}, 'Esc  stop replay   H  hide help'));
  const pinBtn = h('button', { class: 'tv-pinbtn', title: 'Pin this session (P)', onclick: togglePin }, 'PIN');

  stage.append(top, idle, live, spot, foot, chips, conn, help, pinBtn);
  root.replaceChildren(stage);
  $ = { stage, idle, live, spot, pinChip, replayChip, nickChip, conn, help, hookEl, qrPanel };
}

function hookCtx() {
  return { exp: EXP, counter: C, stage: $.stage, live: $.live, spotlight: $.spot, orchestra: state.orx, meta: state.meta, layout, capture, speed };
}

// ---------- live bus ----------
function connect() {
  const es = new EventSource(`/api/core/bus/${encodeURIComponent(EXP)}/${C}/stream`);
  es.onopen = () => $.conn.classList.add('ok');
  es.onerror = () => $.conn.classList.remove('ok');
  es.onmessage = (m) => {
    let msg;
    try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.type === 'hello') {
      state.token = msg.token;
      setPinned(msg.pinned);
      state.last = msg.last || [];
      const act = msg.active || [];
      const ended = act.some((e) => e.t === 'end' || e.t === 'done');
      if (act.length && !ended) { state.current = act.slice(); playEvents(act, true); }
      else if (act.length) state.last = act;
      if (params.get('replay') === '1' && !state._autoReplayed) { state._autoReplayed = true; setTimeout(replay, 600); }
    } else if (msg.type === 'session') {
      forgetImages();
      if (state.current.length) state.last = state.current;
      state.current = [];
      stopReplay();
    } else if (msg.type === 'events') {
      if (state.replaying) stopReplay();
      state.current.push(...msg.events);
      playEvents(msg.events, false);
      if (msg.events.some((e) => e.t === 'end')) forgetImages();
    } else if (msg.type === 'pin') setPinned(msg.pinned);
    else if (msg.type === 'clear') wipe();
    else if (msg.type === 'stage') onStageMsg(msg);
  };
}

function ensureOrchestra() {
  if (state.orx) return state.orx;
  $.live.replaceChildren();
  const host = h('div', { class: 'tv-orx' });
  $.live.appendChild(host);
  state.orx = new Orchestra(host, { mode: 'tv', layout, scale: capture ? 1.06 : 1, autoBeams: true });
  state.orx.on(onOrxEvent);
  return state.orx;
}

function onOrxEvent(ev) {
  if (ev.t === 'result') showSpot(ev.payload);
  else if (ev.t === 'end') scheduleIdle(IDLE_AFTER_END_MS);
  else if (ev.t === 'custom') state.hook?.event?.(ev, hookCtx());
}

function playEvents(events, instant) {
  for (const ev of events) {
    if (ev.t === 'init') {
      state.orx?.destroy();
      state.orx = null;
      hideSpot();
      setMode('live');
    }
    if (!state.orx && !ORCH.has(ev.t)) { onOrxEvent(ev); continue; }
    if (!state.orx && ev.t !== 'init') continue;
    ensureOrchestra().apply(ev, { instant });
    if (ORCH.has(ev.t)) state.hook?.event?.(ev, hookCtx());
  }
  if (state.mode === 'idle' && state.orx) setMode('live');
  scheduleIdle(IDLE_AFTER_SILENCE_MS);
}

function scheduleIdle(ms) {
  clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    if (state.pinned || state.replaying) return scheduleIdle(10000);
    goIdle();
  }, ms);
}

function goIdle() {
  hideSpot();
  $.spot.replaceChildren(); // drop any spotlight DOM (and its images) for good
  state.orx?.destroy();
  state.orx = null;
  state.hook?.reset?.(hookCtx());
  setMode('idle');
}

// ---------- result spotlight ----------
function showSpot(payload = {}) {
  $.spot.replaceChildren();
  const handled = state.hook?.result?.(payload, hookCtx());
  if (!handled) {
    const lines = (payload.lines || []).slice(0, 4);
    const card = h('div', { class: 'tv-spot-card' },
      payload.kicker ? h('div', { class: 'tv-spot-kicker' }, payload.kicker) : null,
      h('h2', { class: 'pz-display tv-spot-title' }, payload.title || ''),
      h('ol', { class: 'tv-spot-lines' }, ...lines.map((l) => h('li', { 'data-text': l }))),
      h('div', { class: 'tv-spot-foot' },
        payload.forFun ? h('span', { class: 'pz-forfun' }, 'For fun only') : null,
        payload.footer ? h('span', { class: 'tv-spot-footer' }, payload.footer) : null),
      payload.qr && !capture ? h('div', { class: 'tv-spot-qr', html: qrSvg(payload.qr, { margin: 2 }) }) : null);
    $.spot.appendChild(card);
    typeLines(card.querySelectorAll('.tv-spot-lines li'));
  }
  $.spot.classList.add('show');
  root.classList.add('has-spot');
}
function hideSpot() { $.spot.classList.remove('show'); root.classList.remove('has-spot'); }

async function typeLines(items) {
  const token = (typeLines.token = {});
  await new Promise((r) => setTimeout(r, 500 / speed));
  for (const li of items) {
    const text = li.dataset.text;
    li.classList.add('on');
    for (let i = 1; i <= text.length; i++) {
      if (typeLines.token !== token) return;
      li.textContent = text.slice(0, i);
      await new Promise((r) => setTimeout(r, 24 / speed));
    }
    await new Promise((r) => setTimeout(r, 320 / speed));
  }
}

// ---------- pin / replay ----------
function setPinned(p) {
  state.pinned = !!p;
  root.classList.toggle('is-pinned', state.pinned);
}
// Pin, clear and hide need a staff TV (CHECK-12 F1): pair each counter TV browser once at /staff (code from /admin).
const NOT_STAFF = 'Staff TV nahi: is browser mein ek baar /staff kholo aur pairing code daalo';
const staffPost = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  .then((r) => { if (r.status === 403) flash(NOT_STAFF); return r; }).catch(() => null);
async function togglePin() {
  if (!state.token) return;
  await staffPost(`/api/core/bus/${encodeURIComponent(EXP)}/${C}/pin`, { token: state.token, pin: !state.pinned });
}

// Staff wipe (key B here, or "Clear counter N" on /admin): back to the QR screen, nothing kept for replay.
function wipe() {
  stopReplay();
  state.current = [];
  state.last = [];
  setPinned(false);
  goIdle();
  flash('TV cleared');
}
async function blankTv() {
  wipe();
  if (state.token) await staffPost(`/api/core/bus/${encodeURIComponent(EXP)}/${C}/clear`, { token: state.token });
}

async function replay() {
  const events = (state.current.some((e) => e.t === 'init') && state.current.some((e) => e.t === 'done' || e.t === 'end')) ? state.current : state.last.length ? state.last : state.current;
  if (!events.length || !events.some((e) => e.t === 'init')) { flash('Replay ke liye abhi koi session nahi'); return; }
  stopReplay();
  state.replaying = true;
  root.classList.add('is-replay');
  $.replayChip.lastChild.textContent = `REPLAY ${speedLabel()}`;
  hideSpot();
  state.orx?.destroy();
  state.orx = null;
  setMode('live');
  const orx = ensureOrchestra();
  const ok = await orx.replay(events, { speed });
  if (ok) { state.replaying = false; root.classList.remove('is-replay'); scheduleIdle(IDLE_AFTER_END_MS); }
}
function stopReplay() {
  if (!state.replaying) return;
  state.replaying = false;
  root.classList.remove('is-replay');
  state.orx?.stopReplay();
}
const speedLabel = () => (speed === 1 ? '1x' : speed === 0.5 ? '1/2x' : speed === 0.2 ? '1/5x' : `${speed}x`);

let flashT = null;
function flash(text) {
  let f = document.querySelector('.tv-flash');
  if (!f) { f = h('div', { class: 'tv-flash' }); $.stage.appendChild(f); }
  f.textContent = text;
  f.classList.add('show');
  clearTimeout(flashT);
  flashT = setTimeout(() => f.classList.remove('show'), 2200);
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'p') togglePin();
  else if (k === 'r') replay();
  else if (k === 'b') blankTv();
  else if (k === 'a') toggleAnchor();
  else if (k === '1' || k === '2' || k === '5') { speed = 1 / Number(k); flash(`Replay speed ${speedLabel()}`); if (state.replaying) replay(); }
  else if (k === 'c') { capture = !capture; root.classList.toggle('is-capture', capture); flash(capture ? 'Capture mode on' : 'Capture mode off'); }
  else if (k === 'h' || k === '?') root.classList.toggle('show-help');
  else if (k === 'escape') { stopReplay(); root.classList.remove('show-help'); }
});

// ---------- stage loop (CONTRACT 12.7): idle panels rotate every 9 s ----------
const LOOP_MS = 9000;
let stageData = null;
let loopIdx = 0;
function stagePanels() {
  const d = stageData;
  const out = [];
  if (!d || d.flags?.loop === false) return out;
  const n = (x) => h('b', { class: 'tv-stat-n pz-grad-text' }, String(x));
  out.push(['counters', () => h('div', { class: 'tv-panel-in' },
    h('div', { class: 'tv-idle-kicker' }, h('span', { class: 'tv-dot' }), 'AAJ KA SCOREBOARD'),
    h('div', { class: 'tv-stats' },
      h('div', { class: 'tv-stat' }, h('span', {}, 'Aaj'), n(d.counters.played), h('span', {}, 'logon ne khela')),
      h('div', { class: 'tv-stat' }, h('span', {}, 'Aaj'), n(d.counters.followedAndSaw), h('span', {}, 'logon ne follow karke result dekha')),
      h('div', { class: 'tv-stat' }, n(d.counters.shares), h('span', {}, 'shares'))))]);
  if (d.board && d.board.rows.length) out.push(['board', () => h('div', { class: 'tv-panel-in' },
    h('div', { class: 'tv-idle-kicker' }, h('span', { class: 'tv-dot' }), 'LEADERBOARD'),
    h('h2', { class: 'pz-display tv-panel-title' }, d.board.title),
    h('ol', { class: 'tv-board' }, ...d.board.rows.map((r) => h('li', {}, h('span', { class: 'tv-board-rank' }, String(r.rank)), h('span', { class: 'tv-board-nick' }, r.nickname), h('b', {}, `${r.score}${d.board.unit}`)))))]);
  if (d.anchor) out.push(['anchor', () => h('div', { class: 'tv-panel-in tv-anchor', 'data-pz': 'anchor-card' },
    h('div', { class: 'tv-idle-kicker' }, h('span', { class: 'tv-dot' }), d.anchor.kind === 'anchor' ? 'GUEST STAR' : 'RECORD'),
    h('h2', { class: 'pz-display tv-panel-title' }, d.anchor.title),
    h('div', { class: 'tv-anchor-score pz-grad-text' }, String(d.anchor.score)),
    h('p', { class: 'tv-hook' }, 'Scan karo aur score todo!'))]);
  for (const p of state.hook?.stagePanels?.(hookCtx()) || []) if (p && p.id && p.render) out.push([`hook-${p.id}`, () => { const el = h('div', { class: 'tv-panel-in' }); p.render(el); return el; }]);
  out.push(['about', () => h('div', { class: 'tv-panel-in tv-about' },
    h('div', { class: 'tv-idle-kicker' }, h('span', { class: 'tv-dot' }), 'ABOUT THIS STALL'),
    h('h2', { class: 'pz-display tv-panel-title' }, d.about),
    h('p', { class: 'tv-hook' }, d.aboutHi || ''))]);
  return out;
}
function rotate() {
  if (state.mode !== 'idle') return;
  const panels = [['qr', null], ...stagePanels()];
  loopIdx = (loopIdx + 1) % panels.length;
  const [id, render] = panels[loopIdx];
  for (const el of $.idle.querySelectorAll('.tv-panel')) if (el !== $.qrPanel) el.remove();
  $.qrPanel.classList.toggle('on', id === 'qr');
  if (render) { const el = h('div', { class: 'tv-panel on', 'data-panel': id }, render()); $.idle.appendChild(el); }
  root.dataset.panel = id;
}
async function refreshStage() {
  try { const r = await fetch(`/api/core/stage/${encodeURIComponent(EXP)}/${C}`); if (r.ok) stageData = await r.json(); } catch { /* keep the last data */ }
  if (stageData?.onTv) showNick(stageData.onTv);
}
function showNick(nickname) {
  $.nickChip.lastChild.textContent = nickname ? `BIG SCREEN: ${nickname}` : '';
  root.classList.toggle('has-nick', !!nickname);
}
function onStageMsg(msg) {
  if (msg.what === 'turn') showNick(msg.nickname);
  else if (msg.what === 'turn_end') showNick(null);
  refreshStage();
}
async function toggleAnchor() {
  if (!state.token) return;
  const hidden = !stageData?.anchor ? false : true;
  const r = await staffPost(`/api/core/stage/${encodeURIComponent(EXP)}/${C}/tv/hide`, { token: state.token, hidden });
  await refreshStage();
  if (r?.ok) flash(hidden ? 'Anchor card hidden' : 'Anchor card shown');
}
function startLoop() {
  refreshStage();
  setInterval(refreshStage, 10000);
  setInterval(rotate, LOOP_MS);
}
window.__stage = { rotate, refresh: refreshStage, get panels() { return ['qr', ...stagePanels().map((p) => p[0])]; } };

// hide the cursor on the TV unless the mouse moves
let curT = null;
window.addEventListener('mousemove', () => { document.body.classList.add('cursor'); clearTimeout(curT); curT = setTimeout(() => document.body.classList.remove('cursor'), 2500); });

// ---------- operator view: /tv/<exp>?c=<n>&op=1 (staff cookie) ----------
// Quiet care alert (CONTRACT 13.3): an amber dot and the time only, never visitor data. Staff dismiss it.
const OP = params.get('op') === '1';
let opPanel = null;
async function pollOps() {
  if (!opPanel) return;
  let r;
  try { r = await fetch(`/api/core/ops/${encodeURIComponent(EXP)}/${C}`); } catch { return; }
  if (r.status === 403) { opPanel.dataset.key = 'staff'; opPanel.replaceChildren(h('div', { class: 'tv-op-note' }, 'Staff only: is phone pe pehle /admin/staff kholo')); return; }
  if (!r.ok) return;
  const { alerts = [] } = await r.json();
  const key = alerts.map((a) => a.id).join(',');
  if (key === opPanel.dataset.key) return; // unchanged: keep the DOM (and any button being tapped)
  opPanel.dataset.key = key;
  // care alerts, and (degraded safety mode) rule-based language hits: time and experience only
  opPanel.replaceChildren(...alerts.map((a) => h('div', { class: `tv-op-alert${a.kind === 'language' ? ' is-lang' : ''}`, 'data-pz': a.kind === 'language' ? 'lang-alert' : 'care-alert' },
    h('i', { class: 'tv-op-dot' }),
    h('span', {}, `${a.kind === 'language' ? 'Filter ne ek gaali roki' : a.kind === 'report' ? 'Ek page report hua (admin alerts dekho)' : a.kind === 'spend' ? 'Spend meter bucket se nahi mila (admin alerts dekho)' : 'Ek visitor ko support card dikha'} · ${new Date(a.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`),
    h('button', { class: 'tv-op-x', title: 'Dismiss', onclick: async () => { await fetch(`/api/core/ops/${encodeURIComponent(EXP)}/${C}/alerts/${a.id}/dismiss`, { method: 'POST' }); pollOps(); } }, 'Theek hai'))));
}
let opQueue = null;
const opPost = (action, body = {}) => fetch(`/api/core/ops/${encodeURIComponent(EXP)}/${C}/stage/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(() => { pollQueue(); refreshStage(); });
async function pollQueue() {
  if (!opQueue) return;
  let r;
  try { r = await fetch(`/api/core/ops/${encodeURIComponent(EXP)}/${C}`); } catch { return; }
  if (!r.ok) return;
  const { stage: st } = await r.json();
  if (!st) return;
  const key = JSON.stringify(st);
  if (key === opQueue.dataset.key) return;
  opQueue.dataset.key = key;
  const sel = h('select', { class: 'tv-op-sel', 'data-pz': 'anchor-name' }, ...st.anchors.map((n) => h('option', { value: n }, n)));
  const consent = h('input', { type: 'checkbox', 'data-pz': 'anchor-consent' });
  opQueue.replaceChildren(...[ // filter: replaceChildren would print null as text (CHECK-12 F3)
    h('b', {}, 'Big screen queue'),
    h('div', { 'data-pz': 'op-running' }, st.running ? `On TV: ${st.running.nickname}${st.running.anchor ? ` (guest star ${st.running.anchor})` : st.running.record ? ' (record turn)' : ''}` : 'On TV: nobody'),
    h('ol', { class: 'tv-op-list', 'data-pz': 'op-waiting' }, ...st.waiting.map((w) => h('li', {}, w.nickname))),
    h('div', { class: 'tv-op-row' }, ...['next', 'skip', 'clear'].map((a) => h('button', { class: 'tv-op-btn', 'data-pz': `op-${a}`, onclick: () => opPost(a) }, a[0].toUpperCase() + a.slice(1))),
      h('button', { class: 'tv-op-btn', 'data-pz': 'op-pin', onclick: () => togglePin() }, 'Pin')),
    st.flags.anchor ? h('div', { class: 'tv-op-row' }, sel, h('label', { class: 'tv-op-consent' }, consent, 'consent confirmed by staff'),
      h('button', { class: 'tv-op-btn', 'data-pz': 'op-anchor', onclick: () => opPost('anchor', { name: sel.value, consent: consent.checked }) }, 'Guest star turn')) : null,
    st.flags.anchor ? h('div', { class: 'tv-op-row' }, h('button', { class: 'tv-op-btn', 'data-pz': 'op-record', onclick: () => opPost('record') }, 'Mark next turn as record'),
      st.anchor ? h('button', { class: 'tv-op-btn', 'data-pz': 'op-hide', onclick: () => opPost('hide', { hidden: !st.anchor.hidden }) }, st.anchor.hidden ? 'Show anchor card' : 'Hide anchor card') : null) : null,
    st.pending ? h('div', { 'data-pz': 'op-pending' }, `${st.pending.anchor ? `Next turn: guest star ${st.pending.anchor}` : 'Next turn: record turn'}. Tap Next to start it (${Math.ceil((st.pending.expiresIn || 0) / 60)} min left).`) : null,
    st.flags.reward && st.lastToken ? h('div', { class: 'tv-op-row' }, h('span', {}, `Token ${st.lastToken}`), h('button', { class: 'tv-op-btn', 'data-pz': 'op-reward', onclick: () => opPost('reward', { token: st.lastToken }) }, 'Reward given')) : null,
  ].filter(Boolean));
  if (opReward) opReward.hidden = !st.flags.reward;
}
// WARN-C: type the 4-character code a visitor shows (any token from the last 30 min). Built once, so typing survives the queue refresh.
let opReward = null;
function rewardRow() {
  const input = h('input', { class: 'tv-op-token', 'data-pz': 'op-token', maxlength: '4', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'ABCD', 'aria-label': 'Reward token', 'data-pz-no-net': '' });
  const note = h('span', { class: 'tv-op-note', 'data-pz': 'op-token-note', 'aria-live': 'polite' });
  input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); note.textContent = ''; });
  const give = async () => {
    if (input.value.length !== 4) { note.textContent = '4 letters chahiye'; return; }
    const r = await fetch(`/api/core/ops/${encodeURIComponent(EXP)}/${C}/stage/reward`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: input.value }) }).then((x) => x.json()).catch(() => ({}));
    note.textContent = r.ok ? `Reward given: ${input.value}` : 'Token nahi mila (ya use ho chuka)';
    if (r.ok) input.value = '';
    pollQueue();
  };
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') give(); }); // TV staff keys must not fire while typing
  opReward = h('div', { class: 'tv-op-queue tv-op-reward', 'data-pz': 'op-reward-row' }, h('b', {}, 'Reward token'), h('div', { class: 'tv-op-row' }, input, h('button', { class: 'tv-op-btn', 'data-pz': 'op-token-give', onclick: give }, 'Reward given')), note);
  return opReward;
}
function startOps() {
  if (!OP) return;
  root.classList.add('is-op');
  opPanel = h('div', { class: 'tv-op', 'aria-live': 'polite' });
  opQueue = h('div', { class: 'tv-op-queue', 'data-pz': 'op-queue' });
  $.stage.append(opPanel, opQueue, rewardRow());
  pollOps();
  pollQueue();
  setInterval(pollOps, 4000);
  setInterval(pollQueue, 3000);
}

// test hook (Playwright): read-only view of the TV state
window.__tv = { dump() { return JSON.stringify([state.current, state.last]); }, get holdsImages() { return JSON.stringify([state.current, state.last, state.orx?.history || []]).includes('data:image/'); }, get counter() { return C; }, get mismatch() { return !!state.counterMismatch; }, get mode() { return state.mode; }, get events() { return state.current.length; }, get last() { return state.last.length; }, get pinned() { return state.pinned; }, get replaying() { return state.replaying; } };

boot();
