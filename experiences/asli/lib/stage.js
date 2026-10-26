// Stage adapter (CONTRACT section 12) for AI ya Asli?.
// When core provides ctx.stage we use it: core owns nicknames, boards and the TV loop. Until core's stage module
// lands (TASK-12), a local in-memory fallback with the SAME surface keeps solo, duel and the TV leaderboard working:
//   nicknames(req) -> [{ id, text }] x3   ·   pickNickname(req, id) -> { ok, nickname }   ·   nickname(req) -> string|null
//   declare({ boards, panels })  ·  post(req, board, { score, extra }) -> { ok, rank, best }  ·  board(id, { limit })
// Boards are per IST day, ordered by score (desc) then extra.time (asc). Nothing personal is kept: nickname, score, time.
// No files are written (CONTRACT Clarification 5); a restart clears the local boards.
// TODO(core): needs ctx.stage.nickname(req) (server-side read of the session's picked nickname) to drop the fallback.
import crypto from 'node:crypto';
import { nickOptions, isNick } from './nick.js';

const IST_MS = 5.5 * 3600 * 1000;
export const dayKey = (t) => new Date(t + IST_MS).toISOString().slice(0, 10);

const NICK_TTL_MS = 2 * 3600 * 1000;

export function createLocalStage({ now = () => Date.now(), seed = {} } = {}) {
  const offers = new Map(); // sid -> { at, options: Map(id -> text) }
  const picked = new Map(); // sid -> { nickname, at }
  const boards = new Map(); // id -> { spec, day, entries: top 50 [{nickname, score, extra, at}], results: all today [[score, time]] }
  let declared = { boards: [], panels: {} };

  const sweep = setInterval(() => {
    const t = now();
    for (const [k, v] of picked) if (t - v.at > NICK_TTL_MS) picked.delete(k);
    for (const [k, v] of offers) if (t - v.at > 10 * 60 * 1000) offers.delete(k);
  }, 60000);
  sweep.unref?.();

  function boardOf(id) {
    const b = boards.get(id);
    if (!b) return null;
    const d = dayKey(now());
    if (b.day !== d) { b.day = d; b.entries = (seed[id] || []).map((e, i) => ({ ...e, at: i })); b.results = b.entries.map((e) => [e.score, e.extra?.time ?? 1e9]); }
    return b;
  }
  const cmp = (a, b) => b.score - a.score || (a.extra?.time ?? 1e9) - (b.extra?.time ?? 1e9) || a.at - b.at;

  return {
    core: false,
    nicknames(req) {
      const options = new Map(nickOptions(3).map((text) => [crypto.randomBytes(6).toString('base64url'), text]));
      offers.set(req.sid, { at: now(), options });
      return [...options].map(([id, text]) => ({ id, text }));
    },
    pickNickname(req, id) {
      const o = offers.get(req.sid);
      const text = o?.options.get(String(id || ''));
      if (!text || !isNick(text)) return { ok: false, reason: 'bad_option' };
      offers.delete(req.sid); // ids are one-use
      picked.set(req.sid, { nickname: text, at: now() });
      return { ok: true, nickname: text };
    },
    /** Local only: set a session's nickname directly (fictional demo board for filming). */
    setNickname(sid, nickname) { if (/^[A-Z][a-z]+[A-Z][a-z]+\d{0,2}$/.test(nickname) && nickname.length <= 12) picked.set(sid, { nickname, at: now() }); },
    nickname(req) {
      const p = picked.get(req?.sid);
      if (!p) return null;
      p.at = now();
      return p.nickname;
    },
    declare(spec) {
      declared = spec;
      for (const b of spec.boards || []) {
        boards.set(b.id, { spec: b, day: null, entries: [], results: [] });
        boardOf(b.id);
      }
    },
    post(req, id, { score, extra } = {}) {
      const b = boardOf(id);
      if (!b) return { ok: false, reason: 'unknown_board' };
      const nickname = this.nickname(req);
      if (!nickname) return { ok: false, reason: 'no_nickname' };
      if (!Number.isFinite(score) || score < b.spec.min || score > b.spec.max) return { ok: false, reason: 'bad_score' };
      if (extra && (JSON.stringify(extra).length > 400 || Object.values(extra).some((v) => typeof v === 'string'))) return { ok: false, reason: 'bad_extra' };
      const e = { nickname, score, extra: extra || {}, at: now() };
      const time = e.extra.time ?? 1e9;
      const rank = 1 + b.results.filter(([s2, t2]) => s2 > score || (s2 === score && t2 < time)).length;
      b.results.push([score, time]);
      b.entries.push(e);
      b.entries.sort(cmp);
      b.entries = b.entries.slice(0, 50);
      return { ok: true, rank, best: b.entries[0].score, players: b.results.length };
    },
    board(id, { limit = 10 } = {}) {
      const b = boardOf(id);
      if (!b) return [];
      return b.entries.slice(0, limit).map((e, i) => ({ rank: i + 1, nickname: e.nickname, score: e.score, extra: e.extra, at: e.at }));
    },
    count(id) { return boardOf(id)?.results.length || 0; },
    panels: () => declared.panels,
    turn: () => null,
    end: () => ({ ok: true, ended: false }),
    close: () => clearInterval(sweep),
  };
}

/** Use core's stage when it is there (and can tell us the session's nickname), else the local fallback. */
export function makeStage(ctx, opts) {
  const core = ctx.stage;
  if (core && typeof core.post === 'function' && typeof core.nickname === 'function') {
    // core keeps the top 50 per day; "players today" is our own count of scored runs (numbers only, in memory)
    let day = null;
    let posts = 0;
    const today = () => { const d = dayKey(Date.now()); if (d !== day) { day = d; posts = 0; } };
    return {
      core: true,
      nicknames: core.nicknames ? (req) => core.nicknames(req) : null,
      pickNickname: core.pickNickname ? (req, id) => core.pickNickname(req, id) : null,
      nickname: (req) => core.nickname(req),
      declare: (s) => core.declare(s),
      post: (req, id, v) => { const r = core.post(req, id, v); if (r?.ok) { today(); posts += 1; } return r?.ok ? { ...r, players: core.count ? core.count(id) : (today(), posts) } : r; },
      board: (id, o) => core.board(id, o),
      count: (id) => (core.count ? core.count(id) : (today(), posts)),
      turn: (req) => core.turn?.(req) ?? null,
      end: (reqOrSid, why) => (core.end ? core.end(reqOrSid, why) : { ok: false, ended: false }),
      close() {},
    };
  }
  return createLocalStage(opts);
}
