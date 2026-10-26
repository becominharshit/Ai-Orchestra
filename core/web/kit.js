// Web kit shared by every experience. Plain ES module, no build step.
import { detectDeep, detect, showCare } from './care.js';
//   import { api, track, counter, tvMirror, hero, h, copy } from '/core/kit.js';
// The experience id is the first path segment (/jyotish/ -> 'jyotish'), or <html data-exp="...">.

export const EXP = document.documentElement.dataset.exp || location.pathname.split('/').filter(Boolean)[0] || 'hub';
export const params = new URLSearchParams(location.search);

// Hinglish copy for the shared screens. Positive, never blames the visitor.
export const copy = {
  offline: { title: 'Network thoda slow hai', body: 'Internet ne break le liya. Ek baar phir try karte hain?', btn: 'Dobara try karo' },
  oops: { title: 'Oops, chhota sa glitch', body: 'Hamari taraf se kuch atka. Ek tap aur sab theek.', btn: 'Phir se try karo' },
  queue: { title: 'Line mein ho', body: 'Abhi bahut log khel rahe hain. Tumhari baari bas aa rahi hai.', ahead: (n) => `${n} ${n === 1 ? 'log' : 'log'} aage` },
  slow: { title: 'Itni speed!', body: 'Thoda saans lo. Time poora hote hi hum khud phir try karenge.', btn: 'Theek hai, baad mein' },
  forFun: 'For fun only',
  tvOn: 'Big screen pe dikhao',
  tvHint: 'Sirf agents aur result dikhte hain. Naam kabhi nahi.',
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = (n = 12) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]);
};
const store = {
  get(k, s = localStorage) { try { return s.getItem(k); } catch { return null; } },
  set(k, v, s = localStorage) { try { s.setItem(k, v); } catch { /* private mode */ } },
};

/** Anonymous session id (same value as the pz_sid cookie the server sets). Not personal. */
export function sid() {
  const m = document.cookie.match(/(?:^|;\s*)pz_sid=([A-Za-z0-9_-]{8,64})/);
  if (m) return m[1];
  const v = rid();
  document.cookie = `pz_sid=${v}; Path=/; Max-Age=${60 * 60 * 24 * 3}; SameSite=Lax`;
  return v;
}

/** Counter number from ?c=<n> (remembered for this tab). null when opened without a counter. */
export function counter() {
  const k = `pz_c_${EXP}`;
  const q = params.get('c');
  if (q !== null && /^\d{1,2}$/.test(q)) { store.set(k, q, sessionStorage); return Number(q); }
  const s = store.get(k, sessionStorage);
  return s === null ? null : Number(s);
}

/** ?demo=hero: a seeded FICTIONAL profile for filming. Server answers from fixtures, no visitor data. */
export function isHero() {
  const k = `pz_hero_${EXP}`;
  if (params.get('demo') === 'hero') store.set(k, '1', sessionStorage);
  if (params.get('demo') === 'off') store.set(k, '0', sessionStorage);
  return store.get(k, sessionStorage) === '1';
}
export async function hero() {
  if (!isHero()) return null;
  try { const r = await fetch(`/api/core/hero/${EXP}`); return r.ok ? r.json() : null; } catch { return null; }
}

let cfgPromise = null;
export function config() {
  cfgPromise ||= fetch('/api/core/config').then((r) => r.json()).catch(() => ({ publicUrl: location.origin, igUrl: 'https://instagram.com/zenith_school_of_ai', handle: '@zenith_school_of_ai', site: 'play.zenithschool.ai' }));
  return cfgPromise;
}

/** Tiny DOM helper: h('div', { class: 'x', onclick }, 'text', child) */
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}

// ---------- analytics (counts only) ----------
const sentOnce = new Set();
/**
 * track('start') etc. Standard events: start, complete, gate_view, gate_open_ig, gate_unlock, share, fallback, error.
 * Extra events must be declared by the experience server (analytics.declare). dim: one small int or enum, e.g. { round: 3 }.
 * opts.once: count only once per page load.
 */
export function track(event, dim, { once = false, exp = EXP } = {}) {
  const key = `${exp}:${event}:${JSON.stringify(dim || '')}`;
  if (once && sentOnce.has(key)) return;
  sentOnce.add(key);
  if (isHero() && event !== 'error') return; // filming runs do not count as visitors
  fetch('/api/core/track', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exp, event, ...(dim ? { dim } : {}) }) }).catch(() => {});
}

// Friend share links (?ref=share&exp=<exp>): count one anonymous ref_visit, then strip the params so a reload
// or a re-share from this tab does not count again. Nothing about the sender or the friend is stored.
if (params.get('ref') === 'share') {
  const e = params.get('exp') && /^[a-z_][a-z0-9_-]{0,30}$/.test(params.get('exp')) ? params.get('exp') : EXP;
  track('ref_visit', undefined, { once: true, exp: e });
  const u = new URL(location.href);
  u.searchParams.delete('ref');
  u.searchParams.delete('exp');
  history.replaceState(history.state, '', u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : '') + u.hash);
}

// ---------- overlays: retry / queue / slow down ----------
let overlay = null;
function showOverlay(build) {
  hideOverlay();
  overlay = h('div', { class: 'pz-overlay stage', role: 'dialog', 'aria-modal': 'true' });
  overlay.appendChild(build());
  document.body.appendChild(overlay);
  return overlay;
}
export function hideOverlay() { overlay?.remove(); overlay = null; }

/** Friendly retry screen. Resolves when the visitor taps the button. */
export function retryScreen(c = copy.oops) {
  return new Promise((resolve) => {
    showOverlay(() => h('div', { class: 'pz-card', 'data-pz': 'retry' },
      h('div', { class: 'pz-kicker' }, 'Zenith agents'),
      h('h2', {}, c.title), h('p', {}, c.body),
      h('button', { class: 'pz-btn block', onclick: () => { hideOverlay(); resolve(); } }, c.btn)));
  });
}
export function queueScreen(ahead) {
  const existing = overlay?.querySelector('[data-pz="queue"] .pz-queue-n');
  if (existing) { existing.textContent = String(ahead); overlay.querySelector('[data-pz="queue"] .pz-q-ahead').textContent = copy.queue.ahead(ahead); return; }
  showOverlay(() => h('div', { class: 'pz-card', 'data-pz': 'queue' },
    h('div', { class: 'pz-spinner' }),
    h('h2', {}, copy.queue.title),
    h('div', { class: 'pz-queue-n pz-grad-text' }, String(ahead)),
    h('p', { class: 'pz-q-ahead' }, copy.queue.ahead(ahead)),
    h('p', {}, copy.queue.body)));
}
/**
 * Cool-down screen for 429. Counts down exactly the server's Retry-After, then resolves 'retry'.
 * There is no early retry (it would only be refused again); "Baad mein" resolves 'later' instead.
 */
function slowScreen(ms, message) {
  return new Promise((resolve) => {
    const end = Date.now() + ms;
    const fmt = () => { const s = Math.max(0, Math.ceil((end - Date.now()) / 1000)); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s); };
    const n = h('div', { class: 'pz-queue-n pz-grad-text', 'data-pz': 'slow-left' }, fmt());
    const done = (v) => { clearInterval(t); hideOverlay(); resolve(v); };
    const t = setInterval(() => { n.textContent = fmt(); if (Date.now() >= end) done('retry'); }, 250);
    showOverlay(() => h('div', { class: 'pz-card', 'data-pz': 'slow' }, h('h2', {}, copy.slow.title), n, h('p', {}, message || copy.slow.body),
      h('button', { class: 'pz-btn ghost block', onclick: () => done('later') }, copy.slow.btn)));
  });
}

// ---------- care path (CONTRACT 13.3) ----------
const mirrors = new Set();
let careDone = false;
/** Show the care card, end every TV mirror of this phone, tell core (count + quiet operator alert). */
export function careFlow({ onBack } = {}) {
  for (const m of mirrors) { try { m.setEnabled(false); } catch { /* ignore */ } }
  if (!careDone) {
    careDone = true;
    fetch('/api/core/care', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exp: EXP, c: counter() ?? 0 }) }).catch(() => {});
  }
  showCare({ onBack });
}
function careError() { const e = new Error('care'); e.care = true; return e; }
// CHECK-21 L1: the live crisis check timed out on this text, so the server did not use it (fail closed). Calm notice,
// the care line shown prominently, and err.unchecked / err.chips so the experience offers its chips path.
function uncheckedError() { const e = new Error('unchecked'); e.unchecked = true; e.chips = true; return e; }
function uncheckedNotice(message) {
  document.documentElement.dataset.pzSafety = 'degraded'; // the care line under text fields becomes the prominent card
  document.querySelectorAll('.pz-unchecked, .pz-unchecked-back').forEach((n) => n.remove());
  const back = h('div', { class: 'pz-sheet-back pz-unchecked-back' });
  const close = () => { el.remove(); back.remove(); };
  const el = h('div', { class: 'pz-sheet pz-unchecked', role: 'dialog', 'aria-modal': 'true', 'data-pz': 'unchecked' },
    h('div', { class: 'grab' }),
    h('h2', { class: 'pz-display', style: 'font-size:26px;margin:4px 0 10px' }, 'Chips se aage badho'),
    h('p', { class: 'pz-dim' }, message || 'Yeh line abhi check nahi ho payi, isliye use nahi ki.'),
    h('div', { class: 'pz-care-net', style: 'font-size:16px' }, h('a', { href: 'tel:14416' }, h('span', { class: 'nw' }, 'Kabhi bhi baat karni ho:'), ' ', h('span', { class: 'nw' }, 'Tele-MANAS ', h('b', {}, '14416'), ' (free, 24x7)'))),
    h('button', { class: 'pz-btn block', type: 'button', 'data-pz': 'unchecked-ok', onclick: close }, 'Theek hai'));
  document.body.append(back, el);
}
/** For text you only use on the phone: true = fine to use, false = the care card was shown instead. */
export function guardText(...texts) {
  if (texts.some((t) => detectDeep(t))) { careFlow(); return false; }
  return true;
}
export { detect as careDetect };

/**
 * api('reading', body) -> POST /api/<exp>/reading, returns JSON.
 * Handles: network loss (retry screen), 503 busy (queue screen with live position), 429 (cool-down screen that
 * waits exactly Retry-After, then retries; if the visitor taps "baad mein" it throws Error .status 429),
 * 5xx (one silent retry, then retry screen). Any other 4xx throws Error with .status, .data and a friendly
 * .message taken from the server's { message } (Hinglish). Catch it and send the visitor back to the form.
 */
export async function api(path, body, { method } = {}) {
  const url = path.startsWith('/') ? path : `/api/${EXP}/${path}`;
  const m = method || (body === undefined ? 'GET' : 'POST');
  // Every visitor text is checked before it leaves the phone; the server checks again (it is the authority).
  if (body !== undefined && detectDeep(body)) { careFlow(); throw careError(); }
  let ticket = null;
  let fails = 0;
  for (;;) {
    let res;
    let data = {};
    try {
      const headers = { 'content-type': 'application/json' };
      if (ticket) headers['x-queue-ticket'] = ticket;
      if (isHero()) headers['x-pz-demo'] = 'hero';
      if (counter() !== null) headers['x-pz-counter'] = String(counter());
      res = await fetch(url, { method: m, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
      data = await res.json().catch(() => ({}));
    } catch {
      fails += 1;
      if (fails < 2) { await sleep(900); continue; }
      await retryScreen(copy.offline);
      fails = 0;
      continue;
    }
    if (res.ok && data && data.care === true) { hideOverlay(); careFlow(); throw careError(); }
    if (res.ok && data && data.unchecked === true) { hideOverlay(); uncheckedNotice(data.message); throw uncheckedError(); }
    if (res.ok) { if (overlay?.querySelector('[data-pz="queue"]')) hideOverlay(); return data; }
    if (res.status === 503 && data.error === 'busy') {
      ticket = data.queue.ticket;
      queueScreen(data.queue.ahead);
      await sleep(data.queue.retryMs || 1500);
      continue;
    }
    if (res.status === 429) {
      // Respect Retry-After (seconds); fall back to the body's retryMs. Wait the whole time, then retry once.
      const ra = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : data.retryMs || 30000;
      if ((await slowScreen(wait, data.message)) === 'retry') continue;
      const err = new Error(data.message || copy.slow.body);
      err.status = 429;
      err.data = data;
      throw err;
    }
    if (res.status >= 500) {
      fails += 1;
      if (fails < 2) { await sleep(800); continue; }
      track('error');
      await retryScreen({ ...copy.oops, body: data.message || copy.oops.body });
      fails = 0;
      continue;
    }
    const err = new Error(data.message || copy.oops.body);
    err.status = res.status;
    err.data = data;
    throw err;
  }
}

// ---------- TV mirror ----------
/** The "Big screen pe dikhao" switch. Default on. Only shown when the page was opened from a counter QR. */
export function tvConsent() {
  const v = store.get(`pz_tv_${EXP}`, sessionStorage);
  return v === null ? true : v === '1';
}
/** opts.hint: your own reassurance line (e.g. Jyotish: 'Sirf haath ki photo aur reading, naam kabhi nahi.'). */
export function tvToggle(onChange, { hint = copy.tvHint, label = copy.tvOn } = {}) {
  const c = counter();
  if (c === null) return h('span');
  const input = h('input', { type: 'checkbox', role: 'switch', checked: tvConsent() });
  input.addEventListener('change', () => { store.set(`pz_tv_${EXP}`, input.checked ? '1' : '0', sessionStorage); onChange?.(input.checked); });
  return h('label', { class: 'pz-tvtoggle' }, input, h('span', { class: 'pz-switch' }), h('span', {}, h('b', {}, `${label} (Counter ${c})`), h('small', {}, hint)));
}

/**
 * Mirror an Orchestra to this counter's TV. Returns { result(payload), end(), custom(name, data), setEnabled(bool) }.
 * payload must be TV-safe (see CONTRACT.md): never a name, DOB, birth place, phone or IG username. The bus rejects those.
 */
export function tvMirror(orx, { exp = EXP } = {}) {
  const c = counter();
  let enabled = c !== null && tvConsent();
  const play = rid(); // one id per run; the TV treats a new id as a new visitor session
  let queue = [];
  let timer = null;
  let chain = Promise.resolve();
  const flush = () => {
    timer = null;
    if (!queue.length) return;
    const events = queue;
    queue = [];
    chain = chain.then(() => fetch(`/api/core/bus/${exp}/${c}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sid: play, events }) })
      .then((r) => r.json())
      .then((r) => { if (r.rejected?.length) console.warn('[tv mirror] rejected by TV-safety check:', r.rejected.map((x) => x.reason).join('; ')); })
      .catch(() => { /* TV mirror is best effort */ }));
  };
  const push = (ev) => {
    if (!enabled || careDone) return; // after the care card nothing from this phone goes to a TV
    queue.push(ev);
    if (!timer) timer = setTimeout(flush, 90);
  };
  if (orx) {
    for (const ev of orx.serialize().events) push(ev);
    orx.on((ev, meta) => { if (!meta?.remote) push(ev); });
  }
  const ts = () => (orx ? orx.now() : 0);
  const api = {
    result(payload) { push({ t: 'result', ts: ts(), payload }); },
    custom(name, data) { push({ t: 'custom', ts: ts(), name, data }); },
    end() { push({ t: 'end', ts: ts() }); flush(); window.dispatchEvent(new Event('pz:mirror-end')); },
    setEnabled(v) { if (enabled && !v) { queue.push({ t: 'end', ts: ts() }); flush(); } enabled = c !== null && !!v; },
    get enabled() { return enabled; },
  };
  mirrors.add(api);
  return api;
}

/** "For fun only" label element (Jyotish, AI Sharks, anything predictive). */
export const forFunLabel = () => h('span', { class: 'pz-forfun' }, copy.forFun);

/** Downscale an image File to a JPEG data URL (max side px), EXIF dropped by re-encoding. */
export async function downscaleImage(file, max = 768, quality = 0.82) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * s);
  cv.height = Math.round(bmp.height * s);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  return cv.toDataURL('image/jpeg', quality);
}

// ---------- always-on safety net (CHECK-16b, lead decision; wording by BRAIN) ----------
// Independent of any detection: a small calm line with a tap-to-call Tele-MANAS number sits right under every LONG
// free-text input on the phone: a <textarea>, a contenteditable box, or any input marked data-care-net. Never under
// nickname pickers, choice taps or single-word fields (a plain text input needs data-care-net, or maxlength >= 60).
// data-care-net="off" opts a field out. Phone pages only: never on a TV page, never drawn into a share card.
export const CARE_NET_TEXT = 'Kabhi bhi baat karni ho: Tele-MANAS 14416 (free, 24x7)';
const LONG_TEXT = 'textarea, [contenteditable=""], [contenteditable="true"], input[data-care-net], input:not([type]), input[type="text"], input[type="search"]';
const isTvPage = () => document.body?.classList.contains('tv') || location.pathname.startsWith('/tv');
function wantsNet(el) {
  if (el.closest('[data-care-net="off"], [data-pz-no-net]') || el.disabled || el.readOnly) return false;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable || el.hasAttribute('data-care-net')) return true;
  return Number(el.getAttribute('maxlength')) >= 60; // a plain text input counts only when it takes a long answer
}
const shown = (el) => el.offsetParent !== null || el.getClientRects().length > 0;
function careNetLine() {
  return h('div', { class: 'pz-care-net', role: 'note', 'data-pz': 'care-net' },
    h('a', { href: 'tel:14416', 'aria-label': 'Tele-MANAS helpline 14416, free, 24x7, tap to call' },
      h('span', { class: 'nw' }, 'Kabhi bhi baat karni ho:'), ' ', h('span', { class: 'nw' }, 'Tele-MANAS ', h('b', {}, '14416'), ' (free, 24x7)')));
}
/** 'live' | 'degraded': whether the live AI crisis check is available (degraded = rules only). Experiences can adapt. */
export async function safetyMode() { const c = await config(); return c.safetyMode === 'live' ? 'live' : 'degraded'; }
function startCareNet() {
  if (isTvPage()) return;
  // degraded safety (no live AI crisis check): the line is more prominent, still calm
  safetyMode().then((m) => { document.documentElement.dataset.pzSafety = m; }).catch(() => { document.documentElement.dataset.pzSafety = 'degraded'; });
  const lines = new Map(); // input -> line element
  const update = () => {
    const want = new Set([...document.querySelectorAll(LONG_TEXT)].filter((el) => wantsNet(el) && shown(el)));
    for (const [el, line] of lines) if (!want.has(el) || !el.isConnected) { line.remove(); lines.delete(el); }
    for (const el of want) {
      let line = lines.get(el);
      if (!line) { line = careNetLine(); lines.set(el, line); }
      if (el.nextElementSibling !== line) el.after(line);
    }
  };
  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'type', 'maxlength', 'data-care-net', 'disabled'] });
  update();
}
if (typeof document !== 'undefined') {
  if (document.body) startCareNet();
  else document.addEventListener('DOMContentLoaded', startCareNet, { once: true });
}

// ---------- counter numbers (CHECK-20 F5) ----------
// Never hard-code a counter: <span data-pz-counter-of="career">5</span> is filled from the counter map (v4, flags),
// e.g. "4 + 5" for Career Studio when Agent Builder is off. The number inside is only the fallback.
export async function countersOf(id = EXP) { const c = await config(); return c.counters?.[id] || []; }
function fillCounters() {
  const els = document.querySelectorAll('[data-pz-counter-of]:not([data-pz-filled])');
  if (!els.length) return;
  config().then((c) => {
    for (const el of els) {
      const list = c.counters?.[el.dataset.pzCounterOf];
      if (list?.length) el.textContent = list.join(' + ');
      el.dataset.pzFilled = '1';
    }
  }).catch(() => {});
}
if (typeof document !== 'undefined') {
  const startFill = () => { fillCounters(); new MutationObserver(() => fillCounters()).observe(document.body, { childList: true, subtree: true }); };
  if (document.body) startFill(); else document.addEventListener('DOMContentLoaded', startFill, { once: true });
}
