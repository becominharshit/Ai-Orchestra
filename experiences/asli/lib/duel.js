// 1v1 duel rooms for AI ya Asli? (TASK-14). In memory only.
//   create -> 4-character room code (+ QR on the first phone) -> the friend joins -> 4 s countdown -> both play the SAME
//   10 rounds (each at their own pace, server-timed per player) -> scores live on both phones (SSE) and on the TV
//   (the room creator's phone mirrors) -> result: more right answers wins, then less total time.
// Rooms expire 10 min after creation if nobody joins. A player silent for IDLE_MS mid-game counts as gone: the other
// wins by walkover. Finished rooms are dropped after DONE_KEEP_MS (results are cached per player until then).
import crypto from 'node:crypto';
import { newRun, summary } from './game.js';

export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export const WAIT_MS = 10 * 60 * 1000;
export const COUNTDOWN_MS = 4000;
export const IDLE_MS = 60 * 1000;
export const DONE_KEEP_MS = 3 * 60 * 1000;
const MAX_ROOMS = 500;
const TIE_MS = 500;

export function createDuels({ now = () => Date.now(), curate, onEvent = () => {}, idleMs = IDLE_MS, waitMs = WAIT_MS, countdownMs = COUNTDOWN_MS } = {}) {
  const rooms = new Map();

  function newCode() {
    for (let k = 0; k < 50; k++) {
      const c = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
      if (!rooms.has(c)) return c;
    }
    return null;
  }

  const meIn = (room, sid) => room.players.findIndex((p) => p.sid === sid);

  function stateOf(room) {
    if (room.state === 'countdown' && now() >= room.startAt) room.state = 'playing';
    return room.state;
  }

  function view(room, sid) {
    stateOf(room);
    const me = meIn(room, sid);
    return {
      code: room.code, state: room.state, counter: room.counter, me,
      startIn: room.startAt ? Math.max(0, room.startAt - now()) : null,
      players: room.players.map((p) => { const s = summary(p.run); return { nick: p.nick, n: p.run.answers.length, right: s.right, points: s.points, done: p.done, left: p.left }; }),
      result: room.state === 'done' ? resultFor(room, me) : null,
    };
  }

  function broadcast(room) {
    for (const c of room.clients) {
      try { c.res.write(`data: ${JSON.stringify({ type: 'room', ...view(room, c.sid) })}\n\n`); } catch { /* gone */ }
    }
  }

  function resultFor(room, me) {
    if (me < 0 || room.players.length < 2) return null;
    const [a, b] = [room.players[me], room.players[1 - me]];
    const sa = summary(a.run);
    const sb = summary(b.run);
    let outcome;
    if (b.left && !a.left) outcome = 'walkover';
    else if (a.left && !b.left) outcome = 'left';
    else if (sa.right !== sb.right) outcome = sa.right > sb.right ? 'won' : 'lost';
    else if (Math.abs(sa.timeMs - sb.timeMs) > TIE_MS) outcome = sa.timeMs < sb.timeMs ? 'won' : 'lost';
    else outcome = 'tie';
    return { outcome, me: { nick: a.nick, ...sa }, friend: { nick: b.nick, right: sb.right, points: sb.points, timeMs: sb.timeMs, complete: sb.complete } };
  }

  function finishRoom(room, why) {
    if (room.state === 'done') return;
    room.state = 'done';
    room.finishedAt = now();
    onEvent(why === 'complete' ? 'duel_complete' : 'duel_abandoned', room);
    broadcast(room);
  }

  function sweep() {
    const t = now();
    for (const room of rooms.values()) {
      const st = stateOf(room);
      if (st === 'waiting' && t - room.created > waitMs) { room.state = 'expired'; broadcast(room); rooms.delete(room.code); continue; }
      if (st === 'playing') {
        for (const p of room.players) if (!p.done && !p.left && t - p.lastAt > idleMs) p.left = true;
        if (room.players.some((p) => p.left)) finishRoom(room, 'abandoned');
      }
      if (st === 'done' && t - room.finishedAt > DONE_KEEP_MS) { for (const c of room.clients) { try { c.res.end(); } catch { /* gone */ } } rooms.delete(room.code); }
    }
  }
  const timer = setInterval(sweep, 2000);
  timer.unref?.();

  return {
    rooms,
    sweep,
    create(sid, nick, counter) {
      for (const r of rooms.values()) if (r.state === 'waiting' && r.players[0].sid === sid) return { room: r }; // one open room per phone
      if (rooms.size >= MAX_ROOMS) sweep();
      if (rooms.size >= MAX_ROOMS) return { error: 'busy' };
      const code = newCode();
      if (!code) return { error: 'busy' };
      const items = curate();
      const room = { code, counter, created: now(), state: 'waiting', startAt: null, items, finishedAt: null, clients: new Set(),
        players: [{ sid, nick, run: newRun(items), lastAt: now(), done: false, left: false, posted: false }] };
      rooms.set(code, room);
      return { room };
    },
    join(code, sid, nick) {
      const room = rooms.get(String(code || '').toUpperCase());
      if (!room || room.state === 'expired') return { error: 'no_room' };
      if (meIn(room, sid) >= 0) return { room };
      if (room.players.length >= 2 || room.state !== 'waiting') return { error: 'full' };
      if (room.players[0].nick === nick) return { error: 'same_nick' };
      room.players.push({ sid, nick, run: newRun(room.items), lastAt: now(), done: false, left: false, posted: false });
      room.state = 'countdown';
      room.startAt = now() + countdownMs;
      for (const p of room.players) p.lastAt = room.startAt;
      onEvent('duel_start', room);
      broadcast(room);
      return { room };
    },
    get(code) { return rooms.get(String(code || '').toUpperCase()) || null; },
    player(room, sid) { const i = meIn(room, sid); return i < 0 ? null : room.players[i]; },
    playing(room) { return stateOf(room) === 'playing'; },
    touch(room, p) { p.lastAt = now(); broadcast(room); },
    /** Mark this player done; finish the room when both are done. Returns the view for this player. */
    done(room, p) {
      p.done = true;
      p.lastAt = now();
      if (room.players.length === 2 && room.players.every((x) => x.done || x.left)) finishRoom(room, room.players.some((x) => x.left) ? 'abandoned' : 'complete');
      else broadcast(room);
    },
    leave(room, p) { if (room.state === 'done') return; p.left = true; if (room.state === 'waiting') { room.state = 'expired'; broadcast(room); rooms.delete(room.code); return; } finishRoom(room, 'abandoned'); },
    view,
    resultFor,
    subscribe(room, sid, req, res) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      const c = { sid, res };
      room.clients.add(c);
      res.write(`data: ${JSON.stringify({ type: 'room', ...view(room, sid) })}\n\n`);
      const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* ignore */ } }, 15000);
      hb.unref?.();
      req.on('close', () => { clearInterval(hb); room.clients.delete(c); });
    },
    close() { clearInterval(timer); },
  };
}
