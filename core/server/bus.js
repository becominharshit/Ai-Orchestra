// Live bus: phones -> counter TVs, over Server-Sent Events.
//
// Channel = (exp, counter). Phones POST batches of events; TVs subscribe at /api/core/bus/<exp>/<c>/stream.
// IN-MEMORY AND SINGLE NODE BY DESIGN: play-web runs with scale 1 (see TASK-07). If we ever scale out,
// this needs a shared broker (Redis pub/sub or similar). A restart only drops the live mirror, nothing else.
//
// TV SAFETY RULE: the TV never shows a visitor's name, DOB, birth place, phone number or IG username.
// Every event is checked here against an ALLOWLIST of keys (plus per-experience extensions) and a value scan.
// Anything that fails is rejected (the phone gets the reason back, so authors notice during development).
import crypto from 'node:crypto';
import { cleanText, cleanDeep } from './textfilter.js';

const ORCH_TYPES = {
  init: ['title', 'orchestrator', 'agents'],
  assign: ['id', 'task'],
  status: ['id', 'state'],
  log: ['id', 'text'],
  handoff: ['from', 'to', 'label'],
  progress: ['value'],
  done: ['summary'],
  reset: [],
};
const OTHER_TYPES = { result: ['payload'], end: [], custom: ['name', 'data'] };

// Keys allowed anywhere inside result payloads and custom data. Experiences add more with bus.allowKeys().
export const TV_SAFE_KEYS = new Set([
  'kicker', 'title', 'subtitle', 'lines', 'footer', 'badge', 'label', 'labels', 'score', 'scores', 'max', 'value', 'values',
  'items', 'text', 'emoji', 'icon', 'tag', 'tags', 'stats', 'image', 'overlay', 'paths', 'points', 'x', 'y', 'w', 'h',
  'qr', 'url', 'forFun', 'theme', 'color', 'kind', 'type', 'id', 'rank', 'round', 'rounds', 'verdict', 'sign', 'number',
  'past', 'future', 'tabs', 'skills', 'split', 'percent', 'duration', 'progress', 'agent', 'agents', 'state', 'note',
  'time', 'line', 'level', 'streak', 'squad', 'nickname', 'board', 'rows', 'unit',
]);

// Never allowed, at any depth, even if an experience tries to allow them.
export const TV_DENY_KEYS = new Set([
  'name', 'firstname', 'first_name', 'lastname', 'last_name', 'fullname', 'full_name', 'nickname',
  'dob', 'dateofbirth', 'date_of_birth', 'birthdate', 'birth_date', 'birthday', 'birthtime', 'birth_time', 'tob',
  'birthplace', 'birth_place', 'placeofbirth', 'place_of_birth', 'place', 'city', 'address',
  'phone', 'mobile', 'whatsapp', 'email', 'ig', 'instagram', 'ighandle', 'ig_handle', 'iguser', 'username', 'user', 'handle',
  'school', 'sid', 'ip',
]);

const OWN_HANDLE = /@zenith_school_of_ai\b/gi;
// Value scan: phone numbers, emails, @handles, full dates (DOB shapes).
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const BAD_VALUE = [
  [/(?:\+?\d[\s.\-()]{0,2}){10,}/, 'phone-like number'],
  [new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH}\\.?,?\\s*'?\\d{2,4}\\b`, 'i'), 'worded date (DOB?)'],
  [new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+'?\\d{2,4}\\b`, 'i'), 'worded date (DOB?)'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, 'email'],
  [/(^|\s)@[A-Za-z0-9_.]{2,}/, 'instagram handle'],
  [/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/, 'date (DOB?)'],
  [/\b\d{4}-\d{2}-\d{2}\b/, 'date (DOB?)'],
];

// Numbers on the TV (CHECK-19 F1): a number with 5 or more digits (a phone number, a pin) is refused unless the key has a
// registered range (core defaults below, experiences add theirs with bus.numbers()). A string that is only a number
// is checked the same way.
// Core ranges (a range lets a key carry decimals, e.g. 0..1 palm coordinates). All stay under 5 digits before the point,
// so two adjacent fields can never spell a phone number (CHECK-20 F6).
export const NUMBER_RANGES = Object.freeze({
  duration: [0, 9999], time: [0, 9999], progress: [0, 9999], // seconds (or a 0..1 fraction)
  x: [-9999, 9999], y: [-9999, 9999], w: [0, 9999], h: [0, 9999], points: [-9999, 9999], paths: [-9999, 9999],
});
// 5 or more digits in a run, with any separators between them (spaces, dots, dashes, underscores, slashes, commas,
// middle dots, colons, quotes, brackets, plus); digits of any script. Checked AFTER normalisation (NFKC, format and
// zero-width characters removed), and the normalised value is what gets published.
export const DIGIT_RUN = /\p{Nd}(?:[\s.\-\u00a0\u2010-\u2015\u2212]*\p{Nd}){4,}/u; // inside text: spaces, dots, dashes
// a value that is only a number (any separators: commas, slashes, underscores, middle dots, brackets, plus) with 5+ digits
const NUMBER_ONLY = /^[\s.\-_/\\,\u00b7:'"()+\u00a0\u2010-\u2015\u2212\p{Nd}]+$/u;
const ZW = /[\p{Cf}\u00ad\u034f\u115f\u1160\u3164\uffa0\u180e]/gu;
// a year range like "(1797-1869)" or "1947 - 2026" is a date span, not a phone number: it is taken out before the check
const YEAR_RANGE = /\b(?:1[0-9]|20)\d{2}\s?[-\u2010-\u2015]\s?(?:1[0-9]|20)\d{2}\b/g;
const hasDigitRun = (s) => { const t = normaliseText(s); if (NUMBER_ONLY.test(t) && (t.match(/\p{Nd}/gu) || []).length >= 5) return true; return DIGIT_RUN.test(t.replace(YEAR_RANGE, ' ')); };
/** NFKC, then every format / zero-width character out (the same normalisation the TV text filter uses). */
export const normaliseText = (s) => String(s).normalize('NFKC').replace(ZW, '');
const normaliseDeep = (v, d = 0) => {
  if (d > 8) return v;
  if (typeof v === 'string') return v.startsWith('data:image/') ? v : normaliseText(v);
  if (Array.isArray(v)) return v.map((x) => normaliseDeep(x, d + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normaliseDeep(x, d + 1)]));
  return v;
};
const sigDigits = (n) => { const t = Math.abs(n).toString(); return /e/i.test(t) ? 99 : t.replace('.', '').replace(/^0+/, '').length; };
function numberOk(n, key, ranges) {
  if (!Number.isFinite(n)) return false;
  const r = ranges?.[key] || NUMBER_RANGES[key];
  if (r) return n >= r[0] && n <= r[1];
  return sigDigits(n) <= 4; // at most 4 digits in all (decimals count too: 9876.54321 is refused)
}

function scanValue(v, at, key = null, ranges = null) {
  if (typeof v === 'number') return numberOk(v, key, ranges) ? null : `${at}: number out of range (5+ digits need a registered range)`;
  if (typeof v !== 'string') return null;
  // a digit run is fine only inside registered public text (a bank line, or a template whose number slots hold at most
  // 4 digits each, e.g. "12 + 15 + 12 beats"); links have their own rules (own origin only)
  if (key !== 'qr' && key !== 'url' && hasDigitRun(v) && !scanValue.pub?.(normaliseText(v))) return `${at}: looks like a long number`;
  if (v.startsWith('data:image/')) return null; // images are checked by size only (palm photo, opt-in)
  const s = v.replace(OWN_HANDLE, '');
  for (const [re, what] of BAD_VALUE) if (re.test(s)) return `${at}: looks like a ${what}`;
  return null;
}

function walk(v, allowed, at, depth = 0, key = null, ranges = null) {
  if (depth > 6) return `${at}: too deep`;
  if (Array.isArray(v)) {
    if (v.length > 60) return `${at}: array too long`;
    for (let i = 0; i < v.length; i++) { const e = walk(v[i], allowed, `${at}[${i}]`, depth + 1, key, ranges); if (e) return e; }
    return null;
  }
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v)) {
      const lk = k.toLowerCase();
      if (TV_DENY_KEYS.has(lk)) return `${at}.${k}: personal field not allowed on TV`;
      if (!allowed.has(k)) return `${at}.${k}: key not in TV-safe allowlist`;
      const e = walk(val, allowed, `${at}.${k}`, depth + 1, k, ranges); if (e) return e;
    }
    return null;
  }
  return scanValue(v, at, key, ranges);
}

function cleanAgent(a) {
  const str = (x, n) => (typeof x === 'string' ? x.slice(0, n) : undefined);
  return { id: str(a?.id, 32), name: str(a?.name, 40), role: str(a?.role, 60), label: str(a?.label, 12), icon: str(a?.icon, 24), color: str(a?.color, 24) };
}

// Every string a TV would show (CONTRACT 13.2); qr / url / image keep their own rules.
function tvStrings(ev) {
  const out = [];
  const deep = (v, k) => {
    if (k === 'qr' || k === 'url' || k === 'image') return;
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => deep(x));
    else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) deep(x, kk);
  };
  if (ev.t === 'init') { deep(ev.title); for (const a of [ev.orchestrator, ...(ev.agents || [])]) { deep(a?.name); deep(a?.role); deep(a?.label); } }
  for (const k of ['task', 'text', 'label', 'summary']) deep(ev[k]);
  if (ev.t === 'result') deep(ev.payload);
  if (ev.t === 'custom') { deep(ev.name); deep(ev.data); }
  return out.filter((x) => x !== undefined);
}

/** Validate one event. Returns { ok, event } or { ok:false, reason }. textCheck(strings) -> reason | null. */
export function checkEvent(ev, extraKeys = new Set(), textCheck = null, ranges = null, pub = null) {
  scanValue.pub = pub; // is this exact string registered public text for the experience? (synchronous, reset below)
  let r0;
  try { r0 = checkEventInner(ev, extraKeys, ranges); } finally { scanValue.pub = null; }
  if (!r0.ok || !textCheck) return r0;
  const reason = textCheck(tvStrings(r0.event));
  return reason ? { ok: false, reason } : r0;
}

function checkEventInner(ev0, extraKeys = new Set(), ranges = null) {
  if (!ev0 || typeof ev0 !== 'object' || typeof ev0.t !== 'string') return { ok: false, reason: 'event needs a type t' };
  const ev = normaliseDeep(ev0); // every check runs on, and only this is published: NFKC, no zero-width or format characters
  const keys = ORCH_TYPES[ev.t] || OTHER_TYPES[ev.t];
  if (!keys) return { ok: false, reason: `unknown event type ${ev.t}` };
  for (const k of Object.keys(ev)) if (!['t', 'ts', ...keys].includes(k)) return { ok: false, reason: `${ev.t}.${k}: key not allowed` };
  if ('ts' in ev && ev.ts !== undefined && !(typeof ev.ts === 'number' && Number.isFinite(ev.ts))) return { ok: false, reason: `${ev.t}.ts: a number` };
  const size = JSON.stringify(ev).length;
  if (size > (ev.t === 'result' ? 450_000 : 8_000)) return { ok: false, reason: `${ev.t}: too big (${size} bytes)` };

  const ID = /^[a-z][a-z0-9_-]{0,23}$/;
  if (ev.t === 'status' && !['idle', 'thinking', 'working', 'done', 'retry'].includes(ev.state)) return { ok: false, reason: 'status.state: unknown state' };
  for (const k of ['id', 'from', 'to']) if (k in ev && !(typeof ev[k] === 'string' && ID.test(ev[k]))) return { ok: false, reason: `${ev.t}.${k}: agent ids are short lowercase ids` };
  if (ev.t === 'init') {
    for (const a of [ev.orchestrator, ...(ev.agents || [])]) if (!a || !ID.test(String(a.id || ''))) return { ok: false, reason: 'init: agent ids are short lowercase ids' };
    const e = { t: 'init', ts: ev.ts, title: typeof ev.title === 'string' ? ev.title.slice(0, 80) : undefined, orchestrator: cleanAgent(ev.orchestrator), agents: (ev.agents || []).slice(0, 12).map(cleanAgent) };
    for (const a of [e.orchestrator, ...e.agents]) for (const [k, v] of Object.entries(a)) { const r = scanValue(v, `init.${k}`); if (r) return { ok: false, reason: r }; }
    const r = scanValue(e.title, 'init.title'); if (r) return { ok: false, reason: r };
    e.title = e.title === undefined ? undefined : cleanText(e.title);
    for (const a of [e.orchestrator, ...e.agents]) { a.name = cleanText(a.name); a.role = cleanText(a.role); a.label = cleanText(a.label); }
    return { ok: true, event: e };
  }
  const allowed = new Set([...TV_SAFE_KEYS, ...extraKeys]);
  for (const k of keys) {
    if (!(k in ev)) continue;
    const r = (ev.t === 'result' && k === 'payload') || (ev.t === 'custom' && k === 'data') ? walk(ev[k], allowed, `${ev.t}.${k}`, 0, null, ranges) : scanValue(ev[k], `${ev.t}.${k}`, k, ranges);
    if (r) return { ok: false, reason: r };
  }
  // Clean every text value: 140 chars max, links removed, profanity masked (see textfilter.js).
  const out = { ...ev };
  for (const k of ['task', 'text', 'label', 'summary', 'name', 'payload', 'data']) if (k in out) out[k] = cleanDeep(out[k]);
  // cleaning removes links and masks words: re-check that it did not join two short digit groups into a long one
  const runIn = (v, d = 0) => (d > 8 ? false : typeof v === 'string' ? !v.startsWith('data:image/') && hasDigitRun(v) && !scanValue.pub?.(v) : Array.isArray(v) ? v.some((x) => runIn(x, d + 1)) : v && typeof v === 'object' ? Object.entries(v).some(([k, x]) => k !== 'qr' && k !== 'url' && runIn(x, d + 1)) : false);
  for (const k of ['task', 'text', 'label', 'summary', 'name', 'payload', 'data']) if (k in out && runIn(out[k])) return { ok: false, reason: `${ev.t}.${k}: looks like a long number` };
  return { ok: true, event: out };
}

export function createBus({ config, log = () => {}, now = () => Date.now(), safety = null }) {
  const channels = new Map();
  const extra = new Map(); // exp -> Set of extra allowed keys
  const knownExps = new Set(config.experiences.map((e) => e.id));
  const ownHost = (() => { try { return new URL(config.publicUrl).host.replace(/\./g, '\\.'); } catch { return 'play\\.zenithschool\\.ai'; } })();
  // the configured PUBLIC_URL origin exactly, any scheme it was configured with (offline stall laptop:
  // http://<lan-ip>:8790), followed only by a plain path: no userinfo, no other port, no look-alike host
  const ownOrigin = (() => { try { const o = new URL(config.publicUrl).origin; return o === 'null' ? null : o; } catch { return null; } })();
  const ownOriginLink = (u) => !!ownOrigin && (u === ownOrigin || (u.startsWith(`${ownOrigin}/`) && /^\/[A-Za-z0-9/_\-.~?=&%#+]*$/.test(u.slice(ownOrigin.length))));
  const LINK_OK = new RegExp(`^https://(?:(?:${ownHost}|play\\.zenithschool\\.ai|zenithschool\\.ai)(?:/[^\\s]*)?|(?:www\\.)?instagram\\.com/zenith_school_of_ai/?)$`);
  const MAX_EVENTS = 600;
  const PIN_MS = 15 * 60 * 1000;

  function channel(exp, c) {
    const key = `${exp}:${c}`;
    let ch = channels.get(key);
    if (!ch) {
      ch = { key, clients: new Set(), activeSid: null, active: [], last: [], pinned: false, pinnedSid: null, pinnedUntil: 0, token: crypto.randomBytes(12).toString('hex'), updated: now(), imageAt: null };
      channels.set(key, ch);
    }
    return ch;
  }

  function send(ch, msg) {
    const line = `data: ${JSON.stringify(msg)}\n\n`;
    for (const res of ch.clients) { try { res.write(line); } catch { /* client gone */ } }
  }

  function validChannel(exp, c) {
    const n = Number(c);
    return knownExps.has(exp) && Number.isInteger(n) && n >= 0 && n <= 99;
  }

  // ---- privacy: images (e.g. the palm photo) never outlive the session in memory ----
  // The replay buffer keeps the last session for staff replays, but every image value is dropped the moment
  // the session ends (an `end` event, or another visitor starting) or IMAGE_TTL_MS after it arrived, whichever
  // comes first. Replays then show the overlay without the photo.
  const IMAGE_TTL_MS = 3 * 60 * 1000;
  const hasImage = (v) => (typeof v === 'string' ? v.startsWith('data:image/') : Array.isArray(v) ? v.some(hasImage) : v && typeof v === 'object' ? Object.values(v).some(hasImage) : false);
  const dropImages = (v) => {
    if (Array.isArray(v)) return v.filter((x) => !(typeof x === 'string' && x.startsWith('data:image/'))).map(dropImages);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => !(typeof x === 'string' && x.startsWith('data:image/'))).map(([k, x]) => [k, dropImages(x)]));
    return v;
  };
  // returns a new array where events carrying images are replaced by image-free copies (no reference kept)
  const scrub = (events) => events.map((ev) => (hasImage(ev) ? dropImages(ev) : ev));
  function scrubChannel(ch) {
    if (ch.imageAt !== null && ch.imageAt !== undefined) { ch.active = scrub(ch.active); ch.last = scrub(ch.last); ch.imageAt = null; }
  }
  function sweepImages() {
    const t = now();
    for (const ch of channels.values()) if (ch.imageAt != null && t - ch.imageAt >= IMAGE_TTL_MS) scrubChannel(ch);
  }
  const imgTimer = setInterval(sweepImages, 15000);
  imgTimer.unref?.();

  // ---- publish limits ----
  // Keyed on what the server knows, not on the client-chosen `sid`: the session cookie + IP (120 POSTs and
  // 1500 events per minute) and, so a cookie-less client cannot rotate its way past it, the IP alone
  // (1200 POSTs per minute: many phones share one mobile CGNAT IP). Server-side publishes are not limited.
  const pubHits = new Map();
  const PUB_WINDOW_MS = 60000;
  const sweep = setInterval(() => { const t = now(); for (const [k, v] of pubHits) if (t - v.start > PUB_WINDOW_MS) pubHits.delete(k); }, PUB_WINDOW_MS);
  sweep.unref?.();
  function bump(key, n) {
    const t = now();
    let h = pubHits.get(key);
    if (!h || t - h.start > PUB_WINDOW_MS) { h = { start: t, posts: 0, events: 0 }; pubHits.set(key, h); }
    h.posts += 1;
    h.events += n;
    return h;
  }
  function overLimit(rate, n) {
    if (!rate) return false;
    const s = bump(`s:${rate.session}|${rate.ip}`, n);
    const ip = bump(`ip:${rate.ip}`, n);
    return s.posts > 120 || s.events > 1500 || ip.posts > 1200;
  }

  /**
   * Publish a batch from a phone (or from server code). Returns { accepted, rejected:[{i,reason}], held }.
   * `rate` = { session, ip } from the HTTP request (the route passes it); omitted for server-side publishes.
   */
  function publish(exp, c, sid, events, rate = null) {
    if (!validChannel(exp, c)) return { accepted: 0, rejected: [{ i: -1, reason: 'unknown channel' }], held: false };
    if (overLimit(rate, Array.isArray(events) ? events.length : 0)) return { accepted: 0, rejected: [{ i: -1, reason: 'rate limited' }], held: false, limited: true };
    const ch = channel(exp, Number(c));
    if (ch.pinned && now() > ch.pinnedUntil) { ch.pinned = false; send(ch, { type: 'pin', pinned: false }); }
    if (ch.pinned && sid !== ch.pinnedSid) return { accepted: 0, rejected: [], held: true };
    const rejected = [];
    const ok = [];
    // Links and images on a TV (CONTRACT 13.2, CHECK-16): qr / url only to our own site or the Zenith IG profile,
    // image only an inline base64 picture.
    // a relative path is our own origin too (e.g. /api/reel/file/<id>); '//' would be another host
    const linkOk = (u) => typeof u === 'string' && (LINK_OK.test(u) || ownOriginLink(u) || /^\/(?!\/)[A-Za-z0-9/_\-.~?=&%]*$/.test(u));
    const imgOk = (u) => typeof u === 'string' && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u);
    const mediaBad = (v, k, d = 0) => {
      if (d > 6) return false;
      if ((k === 'qr' || k === 'url') && !linkOk(v)) return true;
      if (k === 'image' && !imgOk(v)) return true;
      if (Array.isArray(v)) return v.some((x) => mediaBad(x, undefined, d + 1));
      if (v && typeof v === 'object') return Object.entries(v).some(([kk, x]) => mediaBad(x, kk, d + 1));
      return false;
    };
    // A phone that just triggered the care path sends nothing to any TV (CONTRACT 13.3).
    if (rate?.session && safety?.isCareLocked(rate.session)) return { accepted: 0, rejected: [], held: true, care: true };
    // a big-screen turn is running on this counter: only that phone reaches the TV (CONTRACT 12.4)
    if (rate?.session && stage && !stage.allows(exp, c, rate.session)) return { accepted: 0, rejected: [], held: true };
    // the nickname slot must be this phone's own core-generated nickname, not just its shape
    const ctxNick = rate?.session && stage ? { nickname: stage.nicknameOf(rate.session) } : null;
    const textCheck = safety ? (strings) => safety.checkTvText(exp, strings, ctxNick) : null;
    // agent ids must come from this session's init (or the experience's registered ids); a new session starts fresh
    let ids = sid === ch.activeSid ? new Set(ch.agentIds || []) : new Set();
    const registered = safety?.agentIds?.(exp);
    (Array.isArray(events) ? events : []).slice(0, 100).forEach((ev, i) => {
      if (rate && clientMayNot(exp, ev)) { rejected.push({ i, reason: `${ev?.t}${ev?.t === 'custom' ? `:${ev?.name}` : ''}: only the server sends this event` }); return; }
      const r = checkEvent(ev, extra.get(exp), textCheck, numRanges.get(exp) || null, safety ? (str) => safety.isPublic(exp, str, ctxNick) : null);
      if (!r.ok) { rejected.push({ i, reason: r.reason }); return; }
      const e = r.event;
      if (mediaBad(e)) { rejected.push({ i, reason: `${e.t}: qr / url / image must be our own link or an inline picture` }); return; }
      if (e.t === 'init') {
        const all = [e.orchestrator, ...e.agents].map((a) => a.id);
        if (safety?.strict && registered && all.some((x) => !registered.has(x))) { rejected.push({ i, reason: 'init: agent id not registered by this experience' }); return; }
        if (safety?.strict && [e.orchestrator, ...e.agents].some((a) => !a.name)) { rejected.push({ i, reason: 'init: every agent needs a name' }); return; }
        ids = new Set(all);
      } else {
        const used = ['id', 'from', 'to'].filter((k) => k in e).map((k) => e[k]);
        if (used.some((x) => !ids.has(x))) { rejected.push({ i, reason: `${e.t}: unknown agent id` }); return; }
      }
      ok.push(e);
    });
    if (sid !== ch.activeSid) {
      // the previous visitor's session is over: keep it for replay, without images
      scrubChannel(ch);
      if (ch.active.length) ch.last = ch.active;
      ch.activeSid = sid;
      ch.activeSession = rate?.session || null;
      ch.active = [];
      send(ch, { type: 'session' });
    }
    ch.agentIds = [...ids];
    if (ok.length) {
      if (ch.imageAt == null && ok.some(hasImage)) ch.imageAt = now();
      ch.active.push(...ok);
      if (ch.active.length > MAX_EVENTS) ch.active = ch.active.slice(-MAX_EVENTS);
      ch.updated = now();
      send(ch, { type: 'events', events: ok });
      if (ok.some((e) => e.t === 'end')) scrubChannel(ch); // live TVs already got the image; memory drops it now
    }
    if (rejected.length) log({ kind: 'bus', exp, c: Number(c), rejected: rejected.length, reason: rejected[0].reason });
    return { accepted: ok.length, rejected, held: false };
  }

  /**
   * Wipe a counter's TV now (staff): forget the live and the last session, unpin, tell every TV to go idle.
   * From the TV itself (key B) the per-channel token is required; from /admin (key-gated) pass trusted=true.
   */
  function clear(exp, c, token, trusted = false) {
    if (!validChannel(exp, c)) return { ok: false };
    const ch = channel(exp, Number(c));
    if (!trusted && (!token || token !== ch.token)) return { ok: false };
    ch.active = [];
    ch.last = [];
    ch.activeSid = null;
    ch.pinned = false;
    ch.pinnedSid = null;
    ch.imageAt = null;
    send(ch, { type: 'clear' });
    return { ok: true, tvs: ch.clients.size };
  }

  let stage = null;
  function setStage(s) { stage = s; }
  /** Send a core message to every TV on a channel (stage turns, anchor updates). */
  function notify(exp, c, msg) { if (validChannel(exp, c)) send(channel(exp, Number(c)), msg); }
  function tokenOk(exp, c, token) { return validChannel(exp, c) && !!token && token === channel(exp, Number(c)).token; }

  /** Care path: wipe every TV that is currently showing this phone (by server session cookie). */
  function dropSession(session) {
    if (!session) return 0;
    let n = 0;
    for (const ch of channels.values()) if (ch.activeSession === session) { const [exp, c] = ch.key.split(':'); clear(exp, c, null, true); n++; }
    return n;
  }

  /** Test/ops helper: true if any stored event still holds image bytes. */
  function holdsImages() { for (const ch of channels.values()) if (hasImage(ch.active) || hasImage(ch.last)) return true; return false; }

  function subscribe(exp, c, req, res) {
    const ch = channel(exp, Number(c));
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 2000\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'hello', token: ch.token, pinned: ch.pinned, active: ch.active, last: ch.last })}\n\n`);
    ch.clients.add(res);
    const hb = setInterval(() => { try { res.write(`: hb\n\n`); } catch { /* ignore */ } }, 15000);
    hb.unref?.();
    req.on('close', () => { clearInterval(hb); ch.clients.delete(res); });
  }

  function pin(exp, c, token, on) {
    if (!validChannel(exp, c)) return { ok: false };
    const ch = channel(exp, Number(c));
    if (!token || token !== ch.token) return { ok: false };
    ch.pinned = !!on;
    ch.pinnedSid = on ? ch.activeSid : null;
    ch.pinnedUntil = on ? now() + PIN_MS : 0;
    send(ch, { type: 'pin', pinned: ch.pinned });
    return { ok: true, pinned: ch.pinned };
  }

  // experiences: numeric fields with a range (5+ digit values allowed only there), and event types only the server sends
  const numRanges = new Map(); // exp -> { key: [min, max] }
  function numbers(exp, spec) {
    const cur = { ...(numRanges.get(exp) || {}) };
    for (const [k, r] of Object.entries(spec || {})) {
      if (TV_DENY_KEYS.has(String(k).toLowerCase())) throw new Error(`bus.numbers: ${k} is a personal field`);
      if (!Array.isArray(r) || r.length !== 2 || !r.every(Number.isFinite) || r[0] > r[1]) throw new Error(`bus.numbers: ${k} needs [min, max]`);
      if (Math.max(Math.abs(r[0]), Math.abs(r[1])) >= 1e9) throw new Error(`bus.numbers: ${k} range too wide (phone-number sized)`);
      cur[k] = [r[0], r[1]];
    }
    numRanges.set(exp, cur);
  }
  const serverOnly = new Map(); // exp -> Set('result' | 'custom' | 'custom:<name>' | any event type)
  function serverOnlyTypes(exp, types) { const s0 = serverOnly.get(exp) || new Set(); for (const t of types) s0.add(String(t)); serverOnly.set(exp, s0); }
  const clientMayNot = (exp, ev) => { const so = serverOnly.get(exp); return !!so && (so.has(ev?.t) || (ev?.t === 'custom' && so.has(`custom:${ev?.name}`))); };

  function allowKeys(exp, keys) {
    const s = extra.get(exp) || new Set();
    for (const k of keys) if (!TV_DENY_KEYS.has(String(k).toLowerCase())) s.add(k);
    extra.set(exp, s);
  }

  function allowExp(id) { knownExps.add(id); }

  function status() {
    return [...channels.values()].map((ch) => ({ channel: ch.key, tvs: ch.clients.size, events: ch.active.length, pinned: ch.pinned }));
  }

  return { publish, subscribe, pin, clear, dropSession, setStage, notify, tokenOk, allowKeys, numbers, serverOnlyTypes, allowExp, status, checkEvent, sweepImages, holdsImages, IMAGE_TTL_MS };
}
