// AI Jyotish counter TV hook (/tv/jyotish?c=1). Loaded by core/web/tv.js; see core/CONTRACT.md section 6.
// The show: the agent orchestra runs; when the Hast Rekha Agent starts, a palm dock slides over the left panel
// (portrait: the top panel) with a laser scan; when the lines arrive they draw in one by one with glowing
// labels; then the spotlight shows the palm + the reading typing out live.
// TV-safety: everything here comes from bus payloads that core already checked (no name, DOB or place).
// Dating and Health are never sent to the TV. The palm photo arrives as an inline picture on core's bus (a small
// thumbnail for the scan, the full photo in the result); core drops it at session end. Without one, the TV draws the
// illustrated palm. reset() drops every image element.
import { palmView, constellation } from './palm.js';
import { LINE_INFO } from './lib/palmlines.js';

const BASE = new URL('./', import.meta.url).pathname; // /jyotish/
const HERO_PALM = `${BASE}assets/hero-palm.svg`;
const STRENGTH_HI = { soft: 'halki', clear: 'saaf', deep: 'gehri' };
const KINDS = ['heart', 'head', 'life', 'fate'];

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const s = { frame: null, stage: null, dock: null, pv: null, rows: null, state: null, spot: null, typing: null, speed: 1, drawn: Promise.resolve(), typed: Promise.resolve(), imgReady: Promise.resolve(), blobs: new Map() };

/** Server palm URL -> local blob URL (fetched once). Anything else (the illustrated palm) is used as is. */
function localImage(url) {
  if (!url || !url.startsWith('/api/jyotish/palm/')) return Promise.resolve(url || HERO_PALM);
  if (!s.blobs.has(url)) {
    s.blobs.set(url, fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? URL.createObjectURL(b) : HERO_PALM)).catch(() => HERO_PALM));
  }
  return s.blobs.get(url);
}
function freeImages() {
  for (const p of s.blobs.values()) p.then((u) => { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); });
  s.blobs.clear();
}

function css(href) {
  if ([...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.getAttribute('href') === href)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

// ---------- palm dock (during the run) ----------
function buildDock() {
  s.dock?.remove();
  const dock = el('div', 'jt-dock');
  const head = el('div', 'jt-dock-h');
  head.append(el('span', 'jt-dot'), el('span', 'jt-dock-n', 'Hast Rekha Agent'));
  s.state = el('b', 'jt-dock-s', 'SCANNING');
  head.appendChild(s.state);
  const box = el('div', 'jt-dock-palm');
  const rows = el('ul', 'jt-dock-rows');
  s.rows = {};
  for (const k of KINDS) {
    const li = el('li', 'jt-row');
    li.style.setProperty('--c', LINE_INFO[k].color);
    li.append(el('i'), el('b', '', LINE_INFO[k].label), el('span', 'jt-row-v', 'tracing...'));
    rows.appendChild(li);
    s.rows[k] = li;
  }
  dock.append(head, box, rows);
  s.stage.appendChild(dock);
  s.dock = dock;
  return box;
}

function palmScan(image) {
  const box = buildDock();
  s.pv = palmView({ src: '', size: 'tv', fit: true, fallback: HERO_PALM, speed: s.speed });
  const pv = s.pv;
  s.imgReady = localImage(image).then((u) => pv.setSrc(u));
  box.appendChild(s.pv.el);
  s.pv.scan(true, 'PALM SCAN');
  s.frame.classList.add('jt-palm-on');
  requestAnimationFrame(() => s.dock.classList.add('on'));
}

async function palmLines(paths) {
  if (!s.pv) palmScan('');
  s.pv.scan(false);
  s.state.textContent = 'TRACING';
  const lines = (paths || []).map((p) => ({ kind: p.kind, strength: p.label, points: p.points }));
  // rows light up in step with the drawing (palm.js draws one line every ~520 ms)
  lines.forEach((l, i) => setTimeout(() => {
    const r = s.rows?.[l.kind];
    if (!r) return;
    r.classList.add('on');
    r.querySelector('.jt-row-v').textContent = STRENGTH_HI[l.strength] || 'saaf';
  }, (520 * i + 500) / s.speed));
  await s.imgReady;
  await s.pv.draw(lines);
  if (s.state) { s.state.textContent = '4 REKHA TRACED'; s.dock?.classList.add('done'); }
}

// The traced palm is the hero shot: when the reading arrives early, the dock stays on top of the
// spotlight until the drawing is finished plus a short hold, then fades and the typing starts.
async function holdDock() {
  if (!s.dock) return;
  const dock = s.dock;
  dock.classList.add('hold');
  await s.drawn;
  await sleep(1500 / s.speed);
  dock.classList.remove('hold');
}

function hideDock() {
  if (s.frame?.classList.contains('jt-palm-on')) s.frame.classList.remove('jt-palm-on');
  s.dock?.remove();
  s.dock = null;
  s.pv = null;
}

// ---------- spotlight (the reading) ----------
function typeInto(node, text, token) {
  return (async () => {
    node.classList.add('on');
    const caret = el('span', 'jt-caret');
    for (let i = 1; i <= text.length; i++) {
      if (s.typing !== token) return;
      node.textContent = text.slice(0, i);
      node.appendChild(caret);
      // a little rhythm: pause on punctuation, like someone typing
      const ch = text[i - 1];
      await sleep((/[,.!?:]/.test(ch) ? 120 : 22) / s.speed);
    }
    node.textContent = text;
  })();
}

async function typeAll(items, token) {
  await sleep(700 / s.speed);
  for (const [node, text] of items) {
    if (s.typing !== token) return;
    await typeInto(node, text, token);
    await sleep(260 / s.speed);
  }
}

function lockedRows(ol, hint) {
  ol.replaceChildren(...[0, 1, 2].map(() => { const li = el('li', 'locked'); li.append(el('span'), el('span')); return li; }));
  const h = el('li', 'jt-hint', hint || 'Future phone pe unlock hoga');
  ol.appendChild(h);
}

function renderSpot(p, ctx) {
  const card = el('div', 'jt-spot');
  // left: palm + sign
  const left = el('div', 'jt-spot-l');
  const pbox = el('div', 'jt-spot-palm');
  const pv = palmView({ src: '', size: 'tv', fit: true, fallback: HERO_PALM });
  pbox.appendChild(pv.el);
  localImage(p.image).then((u) => { pv.setSrc(u); pv.show((p.paths || []).map((x) => ({ kind: x.kind, strength: x.label, points: x.points }))); });
  const sign = el('div', 'jt-sign');
  const cw = el('div', 'jt-sign-c');
  cw.appendChild(constellation(p.sign?.id || 'leo'));
  const st = el('div', 'jt-sign-t');
  st.append(el('b', '', p.sign?.label || ''), el('span', '', p.sign?.element ? `${p.sign.element} element` : ''));
  const num = el('div', 'jt-num');
  num.append(el('small', '', 'LIFE PATH'), el('b', '', String(p.number ?? '')));
  sign.append(cw, st, num);
  left.append(pbox, sign);

  // right: the reading
  const right = el('div', 'jt-spot-r');
  right.append(el('div', 'jt-kicker', p.kicker || 'AI Jyotish reading'), el('h2', 'pz-display jt-title', p.title || ''));
  const who = el('ol', 'jt-who');
  const typed = [];
  for (const l of (p.who || []).slice(0, 3)) { const li = el('li'); who.appendChild(li); typed.push([li, l]); }
  const cols = el('div', 'jt-cols');
  const col = (label, cls) => { const c = el('div', `jt-col ${cls}`); c.appendChild(el('div', 'jt-col-k', label)); const ol = el('ol', 'jt-plist'); c.appendChild(ol); cols.appendChild(c); return ol; };
  const past = col('Past', 'past');
  for (const l of (p.past || []).slice(0, 3)) { const li = el('li'); past.appendChild(li); typed.push([li, l]); }
  const fut = col('Future', 'future');
  if (p.locked || !(p.future || []).length) lockedRows(fut, p.hint);
  else for (const l of p.future.slice(0, 3)) { const li = el('li'); fut.appendChild(li); typed.push([li, l]); }
  const foot = el('div', 'jt-foot');
  foot.append(el('span', 'jt-demo', 'SIRF MAZE KE LIYE. AI DEMO.'), el('span', 'pz-forfun', 'For fun only'));
  right.append(el('div', 'jt-sec', 'Tum kaun ho'), who, cols, foot);

  card.append(left, right);
  ctx.spotlight.replaceChildren(card);
  s.spot = { fut, card };
  const token = (s.typing = {});
  s.typed = holdDock().then(() => typeAll(typed, token));
}

// Dost compatibility spotlight: squad energy, roles under generated nicknames, two squad lines (all reviewed text)
function renderDost(p, ctx) {
  hideDock();
  const card = el('div', 'jt-spot jt-dost');
  const head = el('div', 'jt-dost-h');
  head.append(el('div', 'jt-kicker', p.kicker || ''), el('h2', 'pz-display jt-title', p.title || ''), el('p', 'jt-dost-line', p.text || ''), el('span', 'jt-dost-score', p.tag || ''));
  const roles = el('ol', 'jt-dost-roles');
  const typed = [[head.querySelector('.jt-dost-line'), p.text || '']];
  head.querySelector('.jt-dost-line').textContent = '';
  for (const it of (p.items || []).slice(0, 4)) {
    const li = el('li', 'jt-dost-role');
    const nm = el('b', '', it.label || '');
    const note = el('span', '', '');
    li.append(nm, note);
    roles.appendChild(li);
    typed.push([note, it.note || '']);
  }
  const lines = el('ol', 'jt-who jt-dost-lines');
  for (const l of (p.lines || []).slice(0, 2)) { const li = el('li'); lines.appendChild(li); typed.push([li, l]); }
  const foot = el('div', 'jt-foot');
  foot.append(el('span', 'jt-demo', 'SIRF MAZE KE LIYE. AI DEMO.'), el('span', 'pz-forfun', 'For fun only'));
  const right = el('div', 'jt-spot-r');
  right.append(roles, el('div', 'jt-sec', 'Squad vibes'), lines, foot);
  card.append(head, right);
  ctx.spotlight.replaceChildren(card);
  s.spot = { card };
  const token = (s.typing = {});
  s.typed = typeAll(typed, token);
}

async function unlockFuture(lines) {
  if (!s.spot?.fut) return;
  const { fut } = s.spot;
  const token = s.typing;
  await s.typed; // let the main reading finish typing first
  if (!token || s.typing !== token || s.spot?.fut !== fut) return;
  fut.replaceChildren();
  fut.closest('.jt-col')?.classList.add('unlocked');
  const items = (lines || []).slice(0, 3).map((l) => { const li = el('li'); fut.appendChild(li); return [li, l]; });
  await typeAll(items, token);
}

export default {
  mount(ctx) {
    css(`${BASE}palm.css`);
    css(`${BASE}tv.css`);
    s.stage = ctx.stage;
    s.frame = ctx.stage.parentElement;
    s.frame.classList.add('jt');
    s.speed = ctx.speed || 1;
    // the TV always says what this is (also in capture mode)
    const badge = el('div', 'jt-badge', 'SIRF MAZE KE LIYE. AI DEMO.');
    ctx.stage.appendChild(badge);
    // a replay (R key) restarts the show: clear the dock so the old drawing does not linger
    // (react to the transition only: hideDock() touches the class list and would re-trigger the observer)
    let replaying = false;
    new MutationObserver(() => {
      const now = s.frame.classList.contains('is-replay');
      if (now && !replaying) { s.typing = null; hideDock(); }
      replaying = now;
    }).observe(s.frame, { attributes: true, attributeFilter: ['class'] });
  },
  event(ev, ctx) {
    s.speed = ctx.speed || 1;
    if (ev.t === 'init') { hideDock(); s.typing = null; s.drawn = Promise.resolve(); }
    if (ev.t !== 'custom') return;
    if (ev.name === 'palm' && ev.data?.state === 'scan') palmScan(ev.data.image);
    else if (ev.name === 'palm' && ev.data?.state === 'lines') s.drawn = palmLines(ev.data.paths);
    else if (ev.name === 'future' && Array.isArray(ev.data?.future)) unlockFuture(ev.data.future);
  },
  result(payload, ctx) {
    s.speed = ctx.speed || 1;
    if (payload.kind === 'dost') renderDost(payload, ctx); else renderSpot(payload, ctx);
    return true;
  },
  reset(ctx) {
    // back to idle: drop every image element so nothing of the visitor stays in the TV page
    s.typing = null;
    hideDock();
    ctx.spotlight.replaceChildren();
    s.spot = null;
    freeImages();
  },
};
