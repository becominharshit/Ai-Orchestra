// Stage mode (CONTRACT section 12): nicknames, leaderboards, the big-screen queue, the anchor / record card and the
// reward token. Single node, in memory, with leaderboards and anchor cards snapshotted to DATA_DIR/stage.json.
// Nothing here ever stores visitor text: nicknames are generated, scores are numbers, extras are public text.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { istDay } from './analytics.js';

// ---------- nicknames (12.2) ----------
const ADJ = ['Tez', 'Chill', 'Turbo', 'Cosmic', 'Mast', 'Neon', 'Desi', 'Super', 'Jhakaas', 'Solid', 'Pixel', 'Lucky', 'Rocket', 'Bindaas', 'Sonic', 'Ultra', 'Hyper', 'Golden', 'Bright', 'Swift'];
const NOUN = ['Jugnu', 'Samosa', 'Tiger', 'Cheetah', 'Chai', 'Toofan', 'Bijli', 'Laddoo', 'Comet', 'Tota', 'Panda', 'Rocket', 'Jalebi', 'Pixel', 'Falcon', 'Dhamaka', 'Orbit', 'Mango', 'Kulfi', 'Rangoli'];
export const NICK_RE = /^[A-Z][a-z]+[A-Z][a-z]+\d{0,2}$/;
/** A generated nickname: CamelCase adjective + noun, maybe 2 digits; at most 12 characters, never @, never phone-like. */
export function makeNickname(rand = Math.random) {
  for (let i = 0; i < 50; i++) {
    const a = ADJ[Math.floor(rand() * ADJ.length)];
    const n = NOUN[Math.floor(rand() * NOUN.length)];
    if (a === n) continue;
    let s = `${a}${n}`;
    if (s.length <= 10 && rand() < 0.6) s += String(10 + Math.floor(rand() * 90));
    if (s.length <= 12 && NICK_RE.test(s)) return s;
  }
  return 'TezTiger';
}

export const ANCHORS = ['Ayushman Pandita', 'Gaurav Taneja', 'Manika Vishwakarma'];
// The About card text is the configured public hero line (config.publicHeroLine), never hard-coded here.
const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function createStage({ config, analytics, bus, safety, log = () => {}, now = () => Date.now() }) {
  const flags = config.stage;
  const file = path.join(config.dataDir, 'stage.json');
  let saved = { days: {}, anchors: {} };
  if (fs.existsSync(file)) { try { saved = { days: {}, anchors: {}, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { log({ kind: 'stage', err: 'bad stage.json' }); } }
  let dirty = false;

  // ---- nicknames ----
  const offers = new Map(); // offer id -> { sid, text, at }
  const chosen = new Map(); // sid -> { nickname, at }
  const NICK_TTL = 2 * 60 * 60 * 1000;
  const OFFER_TTL = 10 * 60 * 1000;
  const OFFER_CAP = 5000;
  function offer(sid) {
    for (const [k, v] of offers) if (v.sid === sid) offers.delete(k); // one offer set per session
    while (offers.size > OFFER_CAP - 3) offers.delete(offers.keys().next().value); // oldest first
    const out = [];
    const used = new Set();
    while (out.length < 3) {
      const text = makeNickname();
      if (used.has(text)) continue;
      used.add(text);
      const id = crypto.randomBytes(8).toString('hex');
      offers.set(id, { sid, text, at: now() });
      out.push({ id, text });
    }
    return out;
  }
  function choose(sid, id) {
    const o = offers.get(String(id || ''));
    if (!o || o.sid !== sid || now() - o.at > OFFER_TTL) return null;
    for (const [k, v] of offers) if (v.sid === sid) offers.delete(k);
    chosen.set(sid, { nickname: o.text, at: now() });
    return o.text;
  }
  // nicknames core generated and a session picked (for server-side publicText nickname slots)
  // nicknames core generated and a session picked today (server-side publishes, e.g. a duel TV naming both players)
  function isKnownNickname(n) { const today = istDay(new Date(now())); for (const v of chosen.values()) if (v.nickname === n && istDay(new Date(v.at)) === today) return true; return false; }
  function nicknameOf(sid) {
    const c = chosen.get(sid);
    if (!c) return null;
    if (now() - c.at > NICK_TTL) { chosen.delete(sid); return null; }
    return c.nickname;
  }

  // ---- leaderboards (12.3) ----
  const declared = new Map(); // exp -> { boards: Map(id -> spec), panels }
  function declare(exp, { boards = [], panels = {} } = {}) {
    const m = new Map();
    for (const b of boards) {
      if (!/^[a-z][a-z0-9_]{0,23}$/.test(b.id || '')) throw new Error(`stage.declare: bad board id ${b.id}`);
      const tb = b.tieBreak && /^[a-z][a-zA-Z0-9_]{0,23}$/.test(b.tieBreak.key || '') ? { key: b.tieBreak.key, order: b.tieBreak.order === 'desc' ? 'desc' : 'asc' } : null;
      m.set(b.id, { id: b.id, title: String(b.title || ''), unit: String(b.unit || ''), order: b.order === 'asc' ? 'asc' : 'desc', min: Number(b.min ?? 0), max: Number(b.max ?? 100), decimals: Number(b.decimals ?? 0), tieBreak: tb });
    }
    declared.set(exp, { boards: m, panels });
  }
  const dayBoards = (exp, board, day = istDay(new Date(now()))) => (((saved.days[day] ||= {})[exp] ||= {})[board] ||= []);
  function extraOk(exp, extra) {
    if (extra === undefined || extra === null) return true;
    if (typeof extra !== 'object' || Array.isArray(extra) || JSON.stringify(extra).length > 400) return false;
    const r = bus.checkEvent({ t: 'custom', name: 'extra', data: extra });
    if (!r.ok) return false;
    // text in extra must be public text (13.2); numbers and booleans are fine
    for (const v of Object.values(extra)) if (typeof v === 'string' && !safety.isPublic(exp, v)) return !config.publicTextStrict;
    return true;
  }
  function post(exp, req, board, { score, extra } = {}) {
    if (!flags.loop && !flags.queue) return { ok: false, reason: 'off' };
    const spec = declared.get(exp)?.boards.get(board);
    if (!spec) return { ok: false, reason: 'unknown_board' };
    const nickname = nicknameOf(req?.sid);
    if (!nickname) return { ok: false, reason: 'no_nickname' };
    const n = Number(score);
    if (!Number.isFinite(n) || n < spec.min || n > spec.max) return { ok: false, reason: 'bad_score' };
    if (!extraOk(exp, extra)) return { ok: false, reason: 'bad_extra' };
    const list = dayBoards(exp, board);
    const entry = { nickname, score: Number(n.toFixed(spec.decimals)), extra: extra || undefined, at: new Date(now()).toISOString() };
    list.push(entry);
    // equal scores: the board's tie-break number from extra (e.g. { key: 'time', order: 'asc' }: faster first), then earlier first
    const tbv = (e) => { const v = Number(e.extra?.[spec.tieBreak?.key]); return Number.isFinite(v) ? v : (spec.tieBreak?.order === 'desc' ? -Infinity : Infinity); };
    list.sort((a, b) => (spec.order === 'asc' ? a.score - b.score : b.score - a.score)
      || (spec.tieBreak ? (spec.tieBreak.order === 'desc' ? tbv(b) - tbv(a) : tbv(a) - tbv(b)) : 0)
      || a.at.localeCompare(b.at));
    const day = istDay(new Date(now()));
    const cnt = ((saved.counts ||= {})[day] ||= {});
    cnt[`${exp}:${board}`] = (cnt[`${exp}:${board}`] || 0) + 1;
    if (list.length > 50) list.length = 50;
    dirty = true;
    const rank = list.indexOf(entry) + 1 || null;
    // anchor / record turn on this counter?
    const turn = turnOf(req?.sid);
    if (turn && (turn.anchor || turn.record) && flags.anchor) {
      saved.anchors[`${exp}:${turn.counter}`] = {
        kind: turn.anchor ? 'anchor' : 'record',
        title: turn.anchor ? `Beat ${turn.anchor.name} ka score` : 'Zenith ka record',
        name: turn.anchor ? turn.anchor.name : null, board, score: entry.score, extra: entry.extra, at: entry.at, hidden: false,
      };
      dirty = true;
      bus.notify(exp, turn.counter, { type: 'stage', what: 'anchor' });
    }
    if (turn) endTurn(turn.id, 'posted');
    return { ok: true, rank, best: list[0]?.score ?? entry.score };
  }
  function board(exp, id, { limit = 10, day } = {}) {
    return dayBoards(exp, id, day).slice(0, limit).map((e, i) => ({ rank: i + 1, nickname: e.nickname, score: e.score, extra: e.extra, at: e.at }));
  }
  /** today's number of entries on a board (all of them, not only the top 50 kept) */
  function count(exp, id, { day } = {}) { return saved.counts?.[day || istDay(new Date(now()))]?.[`${exp}:${id}`] || 0; }
  function anchor(exp, c) {
    if (!flags.anchor) return null;
    const a = saved.anchors[`${exp}:${Number(c)}`];
    return a && !a.hidden ? { kind: a.kind, title: a.title, name: a.name, board: a.board, score: a.score, extra: a.extra, at: a.at } : null;
  }

  // ---- big-screen queue (12.4) ----
  const queues = new Map(); // `${exp}:${c}` -> { waiting: [entry], running: turn|null, pending: {anchor|record}|null, lastDone: turn|null }
  const turns = new Map(); // turn id -> turn
  const bySid = new Map(); // sid -> turn id (running)
  const tickets = new Map(); // ticket -> entry
  const WAIT_TTL = 3 * 60 * 1000;
  const TURN_TTL = 4 * 60 * 1000;
  const MIN_TURN = Number.isFinite(flags.minTurnMs) ? flags.minTurnMs : 20 * 1000;
  const TOKEN_TTL = 30 * 60 * 1000; // tokens can be redeemed for 30 minutes
  const q = (exp, c) => { const k = `${exp}:${Number(c)}`; let v = queues.get(k); if (!v) { v = { exp, c: Number(c), waiting: [], running: null, pending: null, lastDone: null }; queues.set(k, v); } return v; };

  function join(exp, c, sid) {
    if (!flags.queue) return { ok: false, reason: 'off' };
    const nickname = nicknameOf(sid);
    if (!nickname) return { ok: false, reason: 'no_nickname' };
    const Q = q(exp, c);
    sweep(Q);
    const mine = Q.waiting.find((e) => e.sid === sid);
    if (mine) return { ok: true, ticket: mine.ticket, ahead: Q.waiting.indexOf(mine) + (Q.running ? 1 : 0) };
    if (Q.running?.sid === sid) return { ok: true, ticket: Q.running.ticket, ahead: 0 };
    if (Q.waiting.length >= 10) return { ok: false, reason: 'full' };
    const e = { ticket: crypto.randomBytes(8).toString('hex'), sid, nickname, exp, c: Number(c), seen: now() };
    Q.waiting.push(e);
    tickets.set(e.ticket, e);
    advance(Q);
    return { ok: true, ticket: e.ticket, ahead: Q.running?.ticket === e.ticket ? 0 : Q.waiting.indexOf(e) + (Q.running ? 1 : 0) };
  }
  // A pending guest-star or record turn (WARN-B) is handed only to the turn the operator starts with Next; until then
  // the queue does not start turns by itself, so a random visitor can never inherit an anchor's name.
  const PENDING_TTL = 5 * 60 * 1000;
  function advance(Q, { byOperator = false } = {}) {
    if (Q.pending && now() - Q.pending.at > PENDING_TTL) Q.pending = null;
    if (Q.running || !Q.waiting.length) return;
    if (Q.pending && !byOperator) return;
    const e = Q.waiting.shift();
    const t = { id: crypto.randomBytes(8).toString('hex'), ticket: e.ticket, sid: e.sid, nickname: e.nickname, exp: Q.exp, counter: Q.c, startedAt: now(), anchor: null, record: false, state: 'running' };
    if (byOperator && Q.pending?.anchor) t.anchor = { name: Q.pending.anchor };
    if (byOperator && Q.pending?.record) t.record = true;
    if (byOperator) Q.pending = null;
    Q.running = t;
    turns.set(t.id, t);
    bySid.set(t.sid, t.id);
    e.turn = t;
    bus.notify(Q.exp, Q.c, { type: 'stage', what: 'turn', nickname: t.nickname, anchor: !!t.anchor, record: t.record });
  }
  function sweep(Q) {
    const t = now();
    Q.waiting = Q.waiting.filter((e) => { const ok = t - e.seen < WAIT_TTL; if (!ok) { e.state = 'expired'; } return ok; });
    if (Q.running && t - Q.running.startedAt > TURN_TTL) endTurn(Q.running.id, 'timeout');
    advance(Q);
  }
  function status(ticket, sid) {
    const e = tickets.get(String(ticket || ''));
    if (!e || e.sid !== sid) return { status: 'expired' };
    const Q = q(e.exp, e.c);
    sweep(Q); // an entry that stopped polling for 3 minutes expires before this poll can revive it
    if (e.state === 'expired') return { status: 'expired' };
    e.seen = now();
    if (e.turn) {
      const t = e.turn;
      if (t.state === 'running') return { status: 'your_turn', ahead: 0, turn: publicTurn(t) };
      return { status: 'done', turn: publicTurn(t), token: flags.reward ? t.token || null : null };
    }
    return { status: 'waiting', ahead: Q.waiting.indexOf(e) + (Q.running ? 1 : 0) };
  }
  const publicTurn = (t) => ({ id: t.id, counter: t.counter, nickname: t.nickname, anchor: t.anchor ? { name: t.anchor.name } : null, record: !!t.record });
  function turnOf(sid) { const id = bySid.get(sid); const t = id && turns.get(id); return t && t.state === 'running' ? t : null; }
  function endTurn(id, why = 'end') {
    const t = turns.get(id);
    if (!t || t.state !== 'running') return t || null;
    t.state = 'done';
    t.endedAt = now();
    t.why = why;
    // a turn shorter than MIN_TURN earns no token (WARN-C): ending at once or skipping cannot farm rewards
    if (t.endedAt - t.startedAt >= MIN_TURN) {
      let code = '';
      for (let i = 0; i < 4; i++) code += TOKEN_ALPHABET[crypto.randomInt(TOKEN_ALPHABET.length)];
      t.token = code;
    } else t.token = null;
    bySid.delete(t.sid);
    const Q = q(t.exp, t.counter);
    if (Q.running?.id === id) Q.running = null;
    Q.lastDone = t;
    bus.notify(t.exp, t.counter, { type: 'stage', what: 'turn_end' });
    advance(Q);
    return t;
  }
  /** true when this session may publish to that channel (no big-screen turn running there, or it is theirs). */
  function allows(exp, c, session) {
    const Q = queues.get(`${exp}:${Number(c)}`);
    if (!Q?.running) return true;
    if (now() - Q.running.startedAt > TURN_TTL) { endTurn(Q.running.id, 'timeout'); return !Q.running || Q.running.sid === session; }
    return Q.running.sid === session;
  }
  function nicknameOnTv(exp, c) { const Q = queues.get(`${exp}:${Number(c)}`); return Q?.running?.nickname || null; }

  // ---- operator (12.8) ----
  function opView(exp, c) {
    const Q = q(exp, c);
    sweep(Q);
    const a = saved.anchors[`${exp}:${Number(c)}`];
    return {
      flags,
      running: Q.running ? { id: Q.running.id, nickname: Q.running.nickname, anchor: Q.running.anchor?.name || null, record: Q.running.record, since: new Date(Q.running.startedAt).toISOString() } : null,
      waiting: Q.waiting.map((e) => ({ nickname: e.nickname })),
      pending: Q.pending ? { anchor: Q.pending.anchor || null, record: !!Q.pending.record, expiresIn: Math.max(0, Math.round((PENDING_TTL - (now() - Q.pending.at)) / 1000)) } : null,
      recentTokens: [...turns.values()].filter((x) => x.exp === exp && x.counter === Number(c) && x.token && !x.rewarded && now() - x.endedAt <= TOKEN_TTL).length,
      lastToken: Q.lastDone?.token && !Q.lastDone.rewarded ? Q.lastDone.token : null,
      anchor: a ? { kind: a.kind, title: a.title, hidden: !!a.hidden } : null,
      anchors: ANCHORS,
    };
  }
  function op(exp, c, action, body = {}) {
    const Q = q(exp, c);
    switch (action) {
      case 'next': if (Q.running) endTurn(Q.running.id, 'next'); advance(Q, { byOperator: true }); return { ok: true }; // with a pending guest star, endTurn does not start the next turn by itself
      case 'skip': if (Q.waiting.length) { const e = Q.waiting.shift(); e.state = 'expired'; } return { ok: true };
      case 'clear': Q.pending = null; Q.waiting.forEach((e) => { e.state = 'expired'; }); Q.waiting = []; if (Q.running) endTurn(Q.running.id, 'clear'); return { ok: true };
      case 'pin': return { ok: true, pinned: true }; // pin uses the bus pin (TV token or staff); kept for the button
      case 'anchor': {
        if (!flags.anchor) return { ok: false, reason: 'off' };
        if (!ANCHORS.includes(body.name)) return { ok: false, reason: 'unknown_anchor' };
        if (body.consent !== true) return { ok: false, reason: 'consent_required' };
        Q.pending = { anchor: body.name, at: now() };
        return { ok: true };
      }
      case 'record': if (!flags.anchor) return { ok: false, reason: 'off' }; Q.pending = { record: true, at: now() }; return { ok: true };
      case 'hide': { const a = saved.anchors[`${exp}:${Number(c)}`]; if (a) { a.hidden = body.hidden !== false; dirty = true; } bus.notify(exp, c, { type: 'stage', what: 'anchor' }); return { ok: true, hidden: !!a?.hidden }; }
      case 'clear_anchor': delete saved.anchors[`${exp}:${Number(c)}`]; dirty = true; bus.notify(exp, c, { type: 'stage', what: 'anchor' }); return { ok: true };
      case 'reward': {
        if (!flags.reward) return { ok: false, reason: 'off' };
        const code = String(body.token || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const t = code.length === 4 && [...turns.values()].find((x) => x.exp === exp && x.counter === Number(c) && x.token && x.token === code && !x.rewarded && now() - x.endedAt <= TOKEN_TTL);
        if (!t) return { ok: false, reason: 'unknown_token' };
        t.rewarded = true;
        t.token = null; // the token is not kept once used
        analytics.inc(exp, 'reward_given');
        return { ok: true };
      }
      default: return { ok: false, reason: 'unknown_action' };
    }
  }

  // ---- TV stage data (12.7) ----
  function tvData(exp, c) {
    const today = analytics.snapshot().todayCounts[exp] || {};
    const d = declared.get(exp);
    const boardId = d?.panels?.leaderboard;
    const spec = boardId ? d.boards.get(boardId) : null;
    return {
      flags,
      counters: { played: today.start || 0, followedAndSaw: today.gate_unlock || 0, shares: today.share || 0 },
      board: spec ? { id: spec.id, title: spec.title, unit: spec.unit, rows: board(exp, spec.id, { limit: 5 }) } : null,
      anchor: anchor(exp, c),
      about: config.publicHeroLine,
      aboutHi: config.publicHeroLineHi,
      onTv: nicknameOnTv(exp, c),
    };
  }

  function save() {
    if (!dirty) return;
    // keep 3 days of boards
    const days = Object.keys(saved.days).sort();
    for (const d of days.slice(0, Math.max(0, days.length - 3))) delete saved.days[d];
    for (const d of Object.keys(saved.counts || {}).sort().slice(0, -3)) delete saved.counts[d];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(saved));
    fs.renameSync(`${file}.tmp`, file);
    dirty = false;
  }
  // WARN-A: nothing grows without bound. Offers live 10 min, nicknames 26 h, finished turns and their tickets 30 min.
  function sweepMemory() {
    const t = now();
    for (const [k, v] of offers) if (t - v.at > OFFER_TTL) offers.delete(k);
    for (const [k, v] of chosen) if (t - v.at > 26 * 60 * 60 * 1000) chosen.delete(k);
    for (const [k, v] of turns) if (v.state !== 'running' && t - (v.endedAt || v.startedAt) > TOKEN_TTL) turns.delete(k);
    for (const [k, e] of tickets) {
      const old = e.turn ? e.turn.state !== 'running' && t - (e.turn.endedAt || 0) > TOKEN_TTL : e.state === 'expired' && t - e.seen > OFFER_TTL;
      if (old) tickets.delete(k);
    }
    for (const Q of queues.values()) if (Q.lastDone && !turns.has(Q.lastDone.id)) Q.lastDone = null;
  }
  const timer = setInterval(() => { try { save(); } catch (e) { log({ kind: 'stage', err: e?.name }); } for (const Q of queues.values()) sweep(Q); sweepMemory(); }, config.snapshotMs || 30000);
  timer.unref?.();
  const stop = () => { clearInterval(timer); try { save(); } catch { /* best effort */ } };

  return { offer, choose, nicknameOf, isKnownNickname, declare, post, board, count, anchor, join, status, endTurn, turnOf, allows, op, opView, tvData, save, stop, flags, sweepMemory, sizes: () => ({ offers: offers.size, chosen: chosen.size, turns: turns.size, tickets: tickets.size }) };
}
