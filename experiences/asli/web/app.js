// AI ya Asli? phone app.
//   intro (pick a generated nickname) -> solo or duel
//   solo: Orchestra brief (Curator, Detector, Scorekeeper) -> 10 rounds -> Scorekeeper -> gate -> score + share
//   duel: room code + QR (or join with a code / link) -> synced countdown -> the same 10 rounds -> wait for the friend
//         -> gate -> winner card ("Maine <friend> ko AI ya Asli mein haraya")
// Every TV line the phone sends is a bank line or a template registered on the server (lib/public.js): keep the
// strings below exactly in step with TEMPLATES there. Nothing the visitor types ever reaches the TV.
import { api, track, tvMirror, tvToggle, tvConsent, hero, isHero, h, sleep, retryScreen, counter, params, config } from '/core/kit.js';
import { rewardToken } from '/core/stage.js';
import { Orchestra } from '/core/orchestra.js';
import { gate } from '/core/gate.js';
import { makeShareCard, shareCard, sendToFriends } from '/core/sharecard.js';
import { qrSvg } from '/core/qr.js';
import { curatorLine, detectorReady, detLine, scoreLine, roundLog, readyLine, doneLine, tvLine } from './lines.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of document.querySelectorAll('.ax-screen')) s.hidden = s.id !== id; window.scrollTo(0, 0); };
const TYPE_LABEL = { text: 'TEXT', code: 'CODE', audio: 'VOICE', image: 'PHOTO' };
const LANG_LABEL = { hinglish: 'Hinglish', en: 'English', hi: 'Hindi', python: 'Python', js: 'JavaScript', sql: 'SQL', html: 'HTML', c: 'C', agc: 'Assembly' };
const REVEAL_MS = 2600;
const AGENTS = {
  orchestrator: { id: 'quiz', name: 'Quizmaster', role: 'Orchestrator', icon: 'crown' },
  agents: [
    { id: 'curator', name: 'Curator', role: 'Balanced 10 rounds', icon: 'search' },
    { id: 'detector', name: 'Detector Agent', role: 'Apna guess + confidence', icon: 'eye' },
    { id: 'score', name: 'Scorekeeper', role: 'Speed + accuracy', icon: 'chart' },
  ],
};

const hp = isHero() ? await hero() : null;
let mirror = null;
let orx = null;
let nick = '';
let result = null;
let card = null;
let duel = null; // { code, es, view, host }
let pendingCode = null; // a duel code waiting for the visitor to pick a name
const clip = $('clip');

// ---------- nickname: pick 1 of 3 generated options (CONTRACT 12.2), never typed ----------
async function loadNicks() {
  const box = $('nick-opts');
  const r = await api('nicknames');
  box.replaceChildren(...r.options.map((o) => h('button', { type: 'button', class: 'ax-nickopt', role: 'radio', 'aria-checked': 'false', 'data-id': o.id, onclick: () => chooseNick(o) }, o.text)));
  if (isHero() || r.options.length === 1) await chooseNick(r.options[0]);
}
async function chooseNick(o) {
  const r = await api('nickname', { id: o.id });
  nick = r.nickname;
  for (const b of $('nick-opts').children) { const on = b.dataset.id === o.id; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
  for (const id of ['start', 'duel-new', 'duel-join', 'bigscreen']) $(id).disabled = false;
  $('nick-opts').classList.remove('ax-attn');
  if (pendingCode) { const c = pendingCode; pendingCode = null; $('room-banner').hidden = true; joinScreen(c); }
}
$('reroll').addEventListener('click', () => { nick = ''; for (const id of ['start', 'duel-new', 'duel-join', 'bigscreen']) $(id).disabled = true; loadNicks().catch(() => {}); });
// Big screen (CONTRACT 12.4): with core's queue on, only a big-screen turn reaches the counter TV, so solo players
// and duel rooms take turns instead of fighting over it. Without the queue: the old "Big screen pe dikhao" switch.
const cfg = await config();
const QUEUE = counter() !== null && cfg.stage?.queue !== false && !isHero();
if (QUEUE) { $('tv-toggle').remove(); $('bigscreen').hidden = false; } else $('tv-toggle').replaceWith(tvToggle((on) => mirror?.setEnabled(on)));
let turn = null; // the running big-screen turn on this phone

/** Join core's big-screen queue with the nickname already picked here; resolves with the turn, or null. */
async function bigScreenTurn() {
  const post = async (u, b) => { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return r.json().catch(() => ({})); };
  const j = await post('/api/core/stage/queue', { exp: 'asli', c: counter() });
  if (!j.ticket) {
    await retryScreen({ title: j.reason === 'full' ? 'Line bhar gayi hai' : 'Big screen abhi nahi', body: j.reason === 'full' ? 'Thodi der mein phir try karo, ya phone pe hi khelo.' : 'Phone pe khelo, mazaa utna hi hai.', btn: 'Theek hai' });
    return null;
  }
  let cancelled = false;
  const n = h('div', { class: 'pz-queue-n pz-grad-text', 'data-pz': 'bigscreen-ahead' }, String(j.ahead ?? 0));
  const box = h('div', { class: 'pz-overlay stage', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'pz-card' },
    h('div', { class: 'pz-kicker' }, `Counter ${counter()} · big screen`), h('h2', {}, 'Line mein ho'), n,
    h('p', {}, `log aage. TV pe tumhara naam: ${nick}`),
    h('button', { class: 'pz-btn ghost block', type: 'button', onclick: () => { cancelled = true; } }, 'Phone pe hi khelunga')));
  document.body.appendChild(box);
  try {
    for (;;) {
      if (cancelled) return null;
      const st = await (await fetch(`/api/core/stage/queue/${j.ticket}`)).json().catch(() => ({}));
      if (st.status === 'your_turn') return { ...st.turn, ticket: j.ticket };
      if (st.status === 'expired' || st.status === 'done') return null;
      n.textContent = String(st.ahead ?? 0);
      for (let k = 0; k < 10 && !cancelled; k++) await sleep(200);
    }
  } finally { box.remove(); }
}
/** After the result has been on the TV for a moment: post the score (ends the turn, the queue moves on). */
function releaseTurnSoon(ms = 6000) {
  if (!turn) return;
  setTimeout(() => { api('turn-done', {}).catch(() => {}); }, ms);
}
async function showToken() {
  if (!turn) return;
  const t = turn;
  turn = null;
  await sleep(400);
  await api('turn-done', {}).catch(() => {}); // in case it has not run yet
  rewardToken(t).catch(() => {});
}

const seenKey = 'asli_seen';
const seen = () => { try { return JSON.parse(localStorage.getItem(seenKey) || '[]'); } catch { return []; } };
const remember = (ids) => { try { localStorage.setItem(seenKey, JSON.stringify([...ids, ...seen()].slice(0, 60))); } catch { /* private mode */ } };

// ---------- the game (solo and duel share the round loop) ----------
/**
 * mode = { kind: 'solo' } | { kind: 'duel', code, host }
 * Solo mirrors to the TV. In a duel neither phone mirrors: the server drives the TV for the room (one session,
 * both nicknames, the host's rounds), because a phone may only put its own nickname on the TV.
 */
async function play(mode) {
  track('start');
  // iOS only lets audio play after a tap: play a silent clip inside this tap, later clips then autoplay.
  clip.src = './silence.m4a';
  clip.play().catch(() => {});
  show('s-brief');
  orx?.destroy?.();
  orx = new Orchestra($('orx'), { title: mode.kind === 'duel' ? 'AI ya Asli? duel' : 'AI ya Asli?', mode: 'phone', ...AGENTS });
  // solo: with the queue only a big-screen turn mirrors; duel: never (the server drives the TV for the room)
  mirror = mode.kind === 'duel' || (QUEUE && !turn) ? null : tvMirror(orx);
  const t0 = performance.now();
  const P = mode.kind === 'duel' ? 'duel/' : '';
  const ref = mode.kind === 'duel' ? { code: mode.code } : null;

  // Curator (server): picks the balanced set. Its log line is the real split it chose.
  const game = await orx.step('curator', '10 rounds chuno: type + AI/asli balance', async () => {
    const [g] = await Promise.all([mode.kind === 'duel' ? Promise.resolve(mode.start) : api('start', { seen: seen() }), sleep(700)]);
    orx.log('curator', curatorLine(g.plan));
    return g;
  });
  orx.handoff('curator', 'detector', `${game.count} items`);
  await orx.step('detector', 'Har round ka apna guess lock karo', async () => {
    await sleep(600);
    orx.log('detector', detectorReady(game.detector, game.plan.audio || 0));
  });
  orx.handoff('detector', 'score', 'guesses locked');
  orx.status('detector', 'working'); // stays on duty for every round (the progress ring then follows the rounds)
  orx.assign('score', 'Har round: 100 + speed bonus');
  orx.status('score', 'working');
  orx.log('quiz', readyLine(nick));

  // countdown (duel: until the room's shared start time)
  const count = $('count');
  count.hidden = false;
  const tick = (k) => { count.textContent = String(k); count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop'); };
  if (mode.kind === 'duel') {
    // both phones count down to the room's shared start time
    let last = 0;
    while (Date.now() < duel.startAt) { const k = Math.max(1, Math.ceil((duel.startAt - Date.now()) / 1000)); if (k !== last) { tick(k); last = k; } await sleep(80); }
  } else for (const k of [3, 2, 1]) { tick(k); await sleep(480); }
  count.hidden = true;

  $('dots').replaceChildren(...Array.from({ length: game.count }, () => h('li')));
  $('duelbar').hidden = mode.kind !== 'duel';
  let total = 0;
  for (let i = 0; i < game.count; i++) {
    // duel: the friend left (walkover) or the room ended: stop and show the result
    if (mode.kind === 'duel' && duel?.view?.state === 'done') break;
    // The server issues one round at a time and starts its clock now (server-side timing, light anti-cheat).
    let r;
    try { r = await api(`${P}round`, { ...(ref || { game: game.game }), i }); } catch (err) { if (mode.kind === 'duel' && err.status === 409) break; throw err; }
    while (r.wait) { await sleep(Math.min(1000, r.wait)); r = await api(`${P}round`, { ...(ref || { game: game.game }), i }); }
    remember([r.id]);
    if (i === 0) show('s-round'); // only once round 1's content is here (no empty card flash)
    let out;
    try { out = await round(game, r, total, P, ref); } catch (err) { if (mode.kind === 'duel' && err.status === 409) break; throw err; }
    total = out.total;
  }

  if (mode.kind === 'duel') return finishDuel(mode, t0);

  // Scorekeeper (server): totals, rank, leaderboard. The phone log shows no numbers: score + rank sit behind the gate.
  show('s-brief');
  orx.status('detector', 'done');
  const fin = await orx.step('score', 'Score jodo, aaj ka rank nikalo', async () => {
    const [f] = await Promise.all([api('finish', { game: game.game }), sleep(900)]);
    orx.log('score', f.inTop ? 'Leaderboard update: TV pe dekho!' : 'Score + rank ready, leaderboard update ho gaya');
    return f;
  });
  orx.handoff('score', 'quiz', 'result ready');
  orx.progress(1);
  orx.done(doneLine((performance.now() - t0) / 1000));
  // TV payload: the server built these strings from banks and templates (public text)
  mirror?.result({ ...fin.tv, score: fin.right, of: fin.of, rank: fin.rank, points: fin.points });
  releaseTurnSoon();
  track('complete');
  result = { ...fin, kind: 'solo' };
  await sleep(1000);
  renderLocked();
}

/** One round: show, time, pick, reveal (server says if it was right). */
async function round(game, r, totalBefore, P, ref) {
  const n = r.i + 1;
  $('rn').textContent = `${n}/${game.count}`;
  $('pts').textContent = String(totalBefore);
  const dots = $('dots').children;
  for (let k = 0; k < dots.length; k++) dots[k].classList.toggle('now', k === r.i);
  $('reveal').hidden = true;
  $('card').className = `ax-card t-${r.type}`;
  $('r-type').textContent = `${TYPE_LABEL[r.type]}${LANG_LABEL[r.lang] ? ` · ${LANG_LABEL[r.lang]}` : ''}`;
  renderBody(r);
  $('picks').classList.remove('locked');
  for (const b of $('picks').children) b.classList.remove('chosen');

  const tv = { round: n, type: r.type, state: 'ask', limit: r.limitMs };
  if (r.type === 'text') tv.text = r.body;
  if (r.type === 'audio') tv.text = r.transcript || '';
  if (r.type === 'code') tv.lines = r.body.split('\n').map(tvLine);
  if (r.type === 'image') tv.image = r.src;
  mirror?.custom('round', tv);
  orx.progress(r.i / game.count);
  orx.log('quiz', roundLog(n, r.type, r.limitMs));
  ticker(`Quizmaster: round ${n}, ${TYPE_LABEL[r.type].toLowerCase()}`);

  // Voice: the clip plays first, the timer starts when it starts. The Detector listens in parallel (noise floor).
  let det = null;
  if (r.type === 'audio') {
    det = audioClues(r.src).catch(() => null);
    await startClip(r.src);
  }

  const { pick } = await waitPick(r, n);
  // no client time is sent: the server measures from when it issued the round
  const body = { ...(ref || { game: game.game }), i: r.i, pick, ...(pick === 'hero' ? { want: heroWant } : {}) };
  if (det) { const d = await det; if (d) body.det = d; }
  orx.status('detector', 'thinking');
  const res = await api(`${P}answer`, body);
  clip.pause();
  revealRound(r, res, res.pick);
  orx.log('detector', detLine(res.detector));
  orx.status('detector', 'working');
  orx.handoff('detector', 'score', `R${n}`);
  orx.log('score', scoreLine(n, res));
  ticker(detLine(res.detector));
  dots[r.i].classList.add(res.correct ? 'ok' : 'no');
  $('pts').textContent = String(res.total);
  mirror?.custom('round', {
    round: n, state: 'reveal', answer: res.answer, pick: res.pick || 'none', right: res.correct, points: res.points, total: res.total,
    tip: res.reveal, credit: res.credit, guess: res.detector.guess || 'none', confidence: Math.round((res.detector.confidence || 0) * 100),
  });
  await nextTap(isHero() ? 2300 : REVEAL_MS);
  return res;
}

function renderBody(r) {
  const el = $('r-body');
  el.className = 'ax-body';
  if (r.type === 'text') {
    const len = r.body.length;
    el.classList.add(len <= 70 ? 'big' : len <= 110 ? 'mid' : 'small');
    el.replaceChildren(h('blockquote', {}, r.body));
  } else if (r.type === 'code') {
    el.replaceChildren(h('pre', { class: 'ax-code' }, h('code', {}, r.body)));
  } else if (r.type === 'audio') {
    const bars = h('div', { class: 'ax-wave' }, ...Array.from({ length: 18 }, (_, k) => h('i', { style: `--k:${k}` })));
    const btn = h('button', { class: 'ax-play', type: 'button', 'aria-label': 'Clip phir se suno', onclick: () => { clip.currentTime = 0; clip.play().catch(() => {}); } }, 'Phir suno');
    el.replaceChildren(bars, btn, r.transcript ? h('p', { class: 'ax-transcript' }, `"${r.transcript}"`) : '');
  } else if (r.type === 'image') {
    el.replaceChildren(h('img', { src: r.src, alt: r.alt || 'Photo', class: 'ax-photo' }));
  }
}

function startClip(src) {
  return new Promise((resolve) => {
    let done = false;
    const go = () => { if (!done) { done = true; resolve(); } };
    clip.onplaying = go;
    clip.onerror = go;
    clip.src = src;
    clip.currentTime = 0;
    clip.play().catch(go);
    setTimeout(go, 1500); // autoplay blocked or slow network: start the timer anyway, the visitor can tap "Phir suno"
  });
}

/** Wait for a tap (or the timer). Hero mode answers by itself from the fictional profile. */
function waitPick(r, n) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const bar = $('timer');
    let raf = 0;
    let over = false;
    const finish = (pick) => {
      if (over) return;
      over = true;
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      $('picks').classList.add('locked');
      for (const b of $('picks').children) b.classList.toggle('chosen', b.dataset.pick === pick);
      for (const b of $('picks').children) b.onclick = null;
      resolve({ pick });
    };
    const tick = () => {
      const f = Math.min(1, (performance.now() - t0) / r.limitMs);
      bar.style.transform = `scaleX(${1 - f})`;
      bar.classList.toggle('low', f > 0.7);
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    const timeout = setTimeout(() => finish(null), r.limitMs);
    for (const b of $('picks').children) b.onclick = () => finish(b.dataset.pick);
    if (isHero() && hp?.profile) {
      const pace = hp.profile.pace?.[n - 1] ?? 2200;
      // the server turns 'hero' into the planned right (or wrong) pick; only allowed with the hero header
      setTimeout(() => { heroWant = hp.profile.plan?.[n - 1] !== false; finish('hero'); }, Math.min(pace, r.limitMs - 300));
    }
  });
}
let heroWant = true;

function revealRound(r, res, pick) {
  const c = $('card');
  c.classList.add(res.correct ? 'is-right' : 'is-wrong', `ans-${res.answer}`);
  for (const b of $('picks').children) b.classList.toggle('chosen', b.dataset.pick === res.pick);
  $('rv-stamp').textContent = res.answer === 'ai' ? 'AI THA' : 'ASLI THA';
  $('rv-verdict').textContent = res.correct ? `Sahi pakda! +${res.points}` : pick === null ? 'Time up! Agla round tumhara.' : 'Is baar AI ne chakma diya!';
  $('rv-tip').textContent = res.reveal;
  $('rv-credit').textContent = res.credit;
  $('rv-det').textContent = detLine(res.detector);
  $('rv-det').classList.toggle('confused', !res.detector.right || (res.detector.confidence || 0) < 0.62);
  $('reveal').hidden = false;
}

function nextTap(ms) {
  return new Promise((resolve) => {
    const btn = $('next');
    const t = setTimeout(go, ms);
    function go() { clearTimeout(t); btn.onclick = null; resolve(); }
    setTimeout(() => { btn.onclick = go; }, 700);
  });
}

function ticker(text) {
  const el = $('ticker');
  el.textContent = text;
  el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
}

/**
 * Detector for voice clips, in the browser: TTS clips have digital silence between words (noise floor far below
 * -70 dB); phone recordings of a real voice always carry room noise. Returns { guess, confidence } or null.
 */
async function audioClues(src) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const buf = await (await fetch(src)).arrayBuffer();
  const ctx = new AC();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const win = Math.max(1, Math.round(audio.sampleRate * 0.02));
    const frames = [];
    for (let k = 0; k + win <= data.length; k += win) {
      let s = 0;
      for (let j = k; j < k + win; j++) s += data[j] * data[j];
      frames.push(10 * Math.log10(s / win + 1e-12));
    }
    if (frames.length < 10) return null;
    frames.sort((a, b) => a - b);
    const floor = frames[Math.floor(frames.length * 0.1)];
    const guess = floor < -68 ? 'ai' : 'real';
    const confidence = Math.min(0.97, 0.55 + Math.abs(floor + 68) / 40);
    return { guess, confidence: Math.round(confidence * 100) / 100 };
  } finally { ctx.close?.(); }
}

// ---------- duel ----------
function vsView(v) {
  const me = v.players[v.me];
  const fr = v.players[1 - v.me];
  const side = (p, who) => h('div', { class: `ax-vs-side ${who}` }, h('small', {}, who === 'me' ? 'Tum' : 'Dost'), h('b', {}, p ? p.nick : '...'), h('span', {}, p ? `${p.right}/10` : ''), h('i', { style: `--n:${p ? p.n : 0}` }));
  return [side(me, 'me'), h('div', { class: 'ax-vs-x' }, 'vs'), side(fr, 'fr')];
}
function onRoom(v) {
  duel.view = v;
  if (v.startIn !== null && v.startIn !== undefined) duel.startAt = Date.now() + v.startIn;
  for (const id of ['room-vs', 'wait-vs']) $(id).replaceChildren(...vsView(v));
  const bar = $('duelbar');
  const me = v.players[v.me];
  const fr = v.players[1 - v.me];
  if (me && fr) bar.replaceChildren(h('span', { class: 'me' }, `${me.nick} ${me.right}`), h('span', { class: 'x' }, `R${Math.max(me.n, fr.n)}`), h('span', { class: 'fr' }, `${fr.right} ${fr.nick}`));
  if (v.state === 'expired') { $('room-wait').textContent = 'Room expire ho gaya. Naya duel banao!'; }
  if ((v.state === 'countdown' || v.state === 'playing') && !duel.started && v.players.length === 2) { duel.started = true; duel.resolveStart?.(); }
  if (v.state === 'done') duel.resolveDone?.();
}
function listen(code) {
  duel.es?.close();
  duel.es = new EventSource(`/api/asli/duel/${code}/stream`);
  duel.es.onmessage = (m) => { try { const v = JSON.parse(m.data); if (v.type === 'room') onRoom(v); } catch { /* ignore */ } };
}
async function enterRoom(r, host) {
  duel = { code: r.code, host, view: r.room, started: false };
  show('s-room');
  $('room-host').hidden = !host;
  $('room-join').hidden = true;
  $('room-wait').textContent = 'Dost ka intezaar...';
  $('room-tv').hidden = !(host && QUEUE);
  $('room-tv-note').hidden = true;
  if (host) {
    $('room-code').textContent = r.code;
    $('room-qr').innerHTML = qrSvg(r.url, { margin: 2, label: 'QR code to join this duel' });
  }
  onRoom(r.room);
  listen(r.code);
  await new Promise((res) => { duel.resolveStart = res; if (duel.started) res(); });
  $('room-wait').textContent = 'Dost aa gaya! Duel shuru...';
  // the rounds come from the room, the plan is the same for both
  await play({ kind: 'duel', code: r.code, host, start: { count: 10, plan: r.plan, detector: r.detector } });
}
async function finishDuel(mode, t0) {
  show('s-wait');
  orx.status('detector', 'done');
  let f = await api('duel/finish', { code: mode.code });
  if (f.waiting) {
    orx.log('score', 'Dost ka last round chal raha hai');
    await new Promise((res) => { duel.resolveDone = res; if (duel.view?.state === 'done') res(); });
    f = await api('duel/finish', { code: mode.code });
  }
  show('s-brief');
  await orx.step('score', 'Dono ka score jodo, winner nikalo', async () => { await sleep(700); orx.log('score', 'Duel ka result ready'); });
  orx.handoff('score', 'quiz', 'result ready');
  orx.progress(1);
  orx.done(doneLine((performance.now() - t0) / 1000));
  duel.es?.close();
  if (duel.host) releaseTurnSoon();
  track('complete');
  const r = f.room.result;
  result = { kind: 'duel', nick: r.me.nick, right: r.me.right, of: 10, points: r.me.points, time: Math.round(r.me.timeMs / 1000), rank: f.rank, players: null, detectorRight: r.me.detectorRight, badge: f.badge, rounds: r.me.rounds, share: f.share, outcome: r.outcome, friend: r.friend };
  await sleep(900);
  renderLocked();
}
async function newDuel() {
  try {
    // the server shows the duel on this counter's TV only if the host left "Big screen pe dikhao" on
    const r = await api('duel/create', { c: counter(), tv: counter() !== null && tvConsent() });
    await enterRoom(r, true);
  } catch (err) { await failed(err); }
}
async function joinDuel(code) {
  $('join-err').hidden = true;
  if (!nick) { pendingCode = code; show('s-intro'); $('nick-opts').classList.add('ax-attn'); return; } // pick a name first
  try {
    const r = await api('duel/join', { code });
    await enterRoom(r, false);
  } catch (err) {
    if (err.status === 404 || err.status === 409) { $('join-err').textContent = err.message; $('join-err').hidden = false; return; }
    await failed(err);
  }
}
function joinScreen(prefill = '') {
  show('s-room');
  $('room-host').hidden = true;
  $('room-join').hidden = false;
  $('room-vs').replaceChildren();
  $('room-wait').textContent = '';
  $('code-in').value = prefill;
  $('join-err').hidden = true;
}
$('duel-new').addEventListener('click', () => newDuel());
$('duel-join').addEventListener('click', () => joinScreen());
$('room-join').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('code-in').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (code.length === 4) joinDuel(code);
});
$('room-cancel').addEventListener('click', async () => {
  if (duel?.code) { api('duel/leave', { code: duel.code }).catch(() => {}); duel.es?.close(); }
  duel = null;
  show('s-intro');
});

// ---------- result (behind the follow gate) ----------
function renderLocked() {
  $('res-nick').textContent = result.nick;
  $('res-kicker').textContent = result.kind === 'duel' ? 'Duel khatam' : 'Game khatam';
  $('locked-line').textContent = result.kind === 'duel' ? 'Kaun jeeta? Score aur winner card ready hai.' : 'Tumhara score, aaj ka rank aur Detector Agent se muqabla ready hai.';
  $('unlock').textContent = result.kind === 'duel' ? 'Result unlock karo' : 'Score + rank unlock karo';
  $('rematch').hidden = true;
  $('locked').hidden = false;
  $('unlocked').hidden = true;
  $('res-src').textContent = 'Score server pe gina gaya: speed + accuracy';
  show('s-result');
  if (isHero()) setTimeout(() => $('unlock').click(), 1500);
}

const OUTCOME = {
  won: 'Tum jeete!', walkover: 'Duel tumhara!', lost: 'Dost aaj aage tha. Rematch?', tie: 'Barabar takkar!', left: 'Duel adhoora reh gaya',
};
$('unlock').addEventListener('click', async () => {
  const p = gate('asli', { reward: result.kind === 'duel' ? 'Duel ka result aur winner card' : 'Tumhara score, aaj ka rank aur share card' });
  if (isHero()) setTimeout(() => document.querySelector('[data-pz="gate-unlock"]')?.click(), 2200);
  await p;
  const r = result;
  $('res-score').textContent = String(r.right);
  $('res-badge').textContent = r.badge;
  $('res-rank').textContent = r.rank ? (r.players ? `#${r.rank} / ${r.players}` : `#${r.rank}`) : '-';
  if (r.kind === 'duel') {
    $('res-outcome').hidden = false;
    $('res-outcome').textContent = OUTCOME[r.outcome] || '';
    $('res-s1k').textContent = 'Time';
    $('res-points').textContent = `${r.time}s`;
    $('res-s3k').textContent = 'Dost';
    $('res-det').textContent = `${r.friend.right}/10`;
    $('res-line').textContent = `${r.friend.nick}: ${r.friend.right}/10 · tum: ${r.right}/10`;
    $('rematch').hidden = false;
  } else {
    $('res-outcome').hidden = true;
    $('res-s1k').textContent = 'Points';
    $('res-points').textContent = String(r.points);
    $('res-s3k').textContent = 'Detector Agent';
    $('res-det').textContent = `${r.detectorRight}/${r.of}`;
    $('res-line').textContent = r.right > r.detectorRight ? 'Tumne Detector Agent ko hara diya!' : r.right === r.detectorRight ? 'Tum aur Detector Agent barabar. Rematch?' : 'Detector Agent aaj thoda aage tha. Ek aur game?';
  }
  $('res-rounds').replaceChildren(...(r.rounds || []).map((x, i) => h('li', { class: x.correct ? 'ok' : 'no', title: `Round ${i + 1}` }, String(i + 1))));
  // share card lines are public text ({ pt, text }) the server built (CONTRACT 13.2)
  card = await makeShareCard({ exp: 'asli', kicker: r.share.kicker, title: r.share.title, lines: r.share.lines });
  $('card-img').src = card.url;
  $('locked').hidden = true;
  $('unlocked').hidden = false;
  showToken(); // big-screen players get core's reward token ("Counter pe dikhao")
});
$('friends').addEventListener('click', () => card && sendToFriends(card, { exp: 'asli', text: result.share.title.text, filename: 'zenith-ai-ya-asli.png' }));
$('story').addEventListener('click', () => card && shareCard(card, { filename: 'zenith-ai-ya-asli.png' }));
$('again').addEventListener('click', () => { mirror?.end(); result = null; card = null; duel = null; show('s-intro'); });
$('rematch').addEventListener('click', () => { mirror?.end(); result = null; card = null; duel = null; newDuel(); });

async function failed(err) {
  // kit.api already showed the friendly retry / queue / cool-down screens for network loss, 5xx, 503 and 429
  // and retried. What reaches here is a 4xx: the game or room is gone (restart, too old) or a round was skipped.
  if (err?.care) { show('s-intro'); return; }
  console.warn('[asli]', err?.status || '', err?.message);
  mirror?.end();
  duel?.es?.close();
  duel = null;
  if (err?.status === 409 && err?.data?.error === 'no_nickname') { show('s-intro'); await loadNicks().catch(() => {}); return; }
  await retryScreen({ title: 'Game reset ho gaya', body: 'Chhota sa glitch, tumhari koi galti nahi. Ek naya game shuru karte hain!', btn: 'Naya game' });
  show('s-intro');
}

$('start').addEventListener('click', () => {
  $('start').disabled = true;
  turn = null;
  play({ kind: 'solo' }).catch(failed).finally(() => { $('start').disabled = false; });
});
$('bigscreen').addEventListener('click', async () => {
  $('bigscreen').disabled = true;
  try {
    turn = await bigScreenTurn();
    if (!turn) return;
    await play({ kind: 'solo' });
  } catch (err) { await failed(err); } finally { $('bigscreen').disabled = false; }
});
$('room-tv').addEventListener('click', async () => {
  $('room-tv').disabled = true;
  try {
    const t = await bigScreenTurn();
    if (!t || !duel?.code) return;
    turn = t;
    await api('duel/tv', { code: duel.code });
    $('room-tv').hidden = true;
    $('room-tv-note').hidden = false;
    $('room-tv-note').textContent = 'Yeh duel ab counter ke TV pe hai!';
  } catch (err) { console.warn('[asli] big screen', err?.message); } finally { $('room-tv').disabled = false; }
});

// boot
await loadNicks().catch(() => {});
if (params.get('room') && /^[A-Za-z0-9]{4}$/.test(params.get('room'))) {
  // opened from a friend's duel QR: pick a name first (if needed), then the join screen opens with the code filled in
  const code = params.get('room').toUpperCase();
  if (nick) joinScreen(code);
  else { pendingCode = code; $('room-banner').hidden = false; $('room-banner').textContent = `Dost ne duel bheja: ${code}. Apna naam chuno, phir join karo!`; }
}
if (isHero() && hp) {
  $('hero-note').hidden = false;
  $('hero-note').textContent = hp.label;
  setTimeout(() => $('start').click(), 1200);
}
// test hook (Playwright): read-only
window.__asli = { get nick() { return nick; }, get result() { return result; }, get duel() { return duel && { code: duel.code, state: duel.view?.state }; } };
