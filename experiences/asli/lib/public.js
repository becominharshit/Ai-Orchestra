// Public text for AI ya Asli? (CONTRACT section 13, CHECK_build items 12 + 13).
// Everything that can reach the TV, the leaderboard or a share card is a bank line or a filled template registered
// here. The phone's orchestra calls build the same strings; the bus checks them against this registry.
// No visitor-typed text exists in this experience: nicknames are generated (lib/nick.js), the room code is ours.
import { tvLine } from './content.js';

// Agent names, roles, tasks and fixed log / handoff lines (phone orchestra + TV).
export const ORX = {
  title: 'AI ya Asli?', duel_title: 'AI ya Asli? duel',
  quiz: 'Quizmaster', orch: 'Orchestrator',
  curator: 'Curator', curator_role: 'Balanced 10 rounds',
  detector: 'Detector Agent', detector_role: 'Apna guess + confidence',
  score: 'Scorekeeper', score_role: 'Speed + accuracy',
  t_curate: '10 rounds chuno: type + AI/asli balance',
  t_detect: 'Har round ka apna guess lock karo',
  t_score: 'Har round: 100 + speed bonus',
  t_finish: 'Score jodo, aaj ka rank nikalo',
  t_duel_finish: 'Dono ka score jodo, winner nikalo',
  l_top: 'Leaderboard update: TV pe dekho!',
  l_ready: 'Score + rank ready, leaderboard update ho gaya',
  l_duel_wait: 'Dost ka last round chal raha hai',
  l_duel_done: 'Duel ka result ready',
  l_room_wait: 'Room khula hai, dost ka intezaar',
  l_noclue: 'Detector Agent: koi pakka clue nahi mila',
  h_locked: 'guesses locked', h_result: 'result ready', h_room: 'same 10 rounds dono ko',
  kicker: 'AI ya Asli?', kicker_duel: 'AI ya Asli? duel', kicker_result: 'AI ya Asli? · result',
  more: 'Tum kitna pakad paoge?', stall: 'Zenith stall, KRMU Ideas 4.0',
};
export const BADGES = { b10: 'AI Detective Supreme', b8: 'AI Detective', b6: 'Sharp Eye', b4: 'Pattern Spotter', b0: 'Rising Detective' };
// Fixed enum values that travel as strings in TV events.
export const ENUM = { round: 'round', text: 'text', code: 'code', audio: 'audio', image: 'image', ask: 'ask', reveal: 'reveal', ai: 'ai', real: 'real', none: 'none', duel: 'duel', waiting: 'waiting', playing: 'playing', done: 'done' };

const pct = 'int:0..100';
const r10 = 'int:0..10';
export const TEMPLATES = {
  nick: ['{n}', { n: 'nickname' }],
  frac: ['{r}/{of}', { r: r10, of: 'int:1..10' }],
  round_log: ['Round {n}/10: {type}, {s}s', { n: 'int:1..10', type: ['text', 'code', 'voice', 'photo'], s: 'int:1..20' }],
  score_log: ['R{n}: +{p} ({ts}.{td}s), total {total}', { n: 'int:1..10', p: 'int:0..150', ts: 'int:0..60', td: 'int:0..9', total: 'int:0..1500' }],
  r_label: ['R{n}', { n: 'int:1..10' }],
  items: ['{n} items', { n: 'int:1..10' }],
  cur_tc: ['{t} text, {c} code · {ai} AI / {real} asli', { t: r10, c: r10, ai: r10, real: r10 }],
  cur_tcv: ['{t} text, {c} code, {v} voice · {ai} AI / {real} asli', { t: r10, c: r10, v: r10, ai: r10, real: r10 }],
  cur_tcvp: ['{t} text, {c} code, {v} voice, {p} photo · {ai} AI / {real} asli', { t: r10, c: r10, v: r10, p: r10, ai: r10, real: r10 }],
  det_ready: ['{n} guesses ready (offline style model)', { n: r10 }],
  det_ready_c: ['{n} guesses ready ({k} Claude se)', { n: r10, k: r10 }],
  det_ready_v: ['{n} guesses ready (offline style model), {v} voice: clip sun ke', { n: r10, v: r10 }],
  det_ready_cv: ['{n} guesses ready ({k} Claude se), {v} voice: clip sun ke', { n: r10, k: r10, v: r10 }],
  det_ok: ['Detector Agent: {pct}% {what}. Detector bhi sahi', { pct, what: ['AI', 'Asli'] }],
  det_miss: ['Detector Agent: {pct}% {what}. AI bhi confuse ho gaya!', { pct, what: ['AI', 'Asli'] }],
  det_luck: ['Detector Agent: {pct}% {what}, bas tukka laga', { pct, what: ['AI', 'Asli'] }],
  ready: ['{nick} ready. Round 1 shuru!', { nick: 'nickname' }],
  done: ['Game complete in {s}s', { s: 'int:1..900' }],
  res_pts: ['{points} points · aaj ka rank #{rank}', { points: 'int:0..1500', rank: 'count' }],
  res_det: ['Detector Agent: {d}/{of}', { d: r10, of: 'int:1..10' }],
  share_hi: ['Main AI pakad leta hoon: {r}/10', { r: r10 }],
  share_lo: ['Maine AI ko challenge kiya: {r}/10', { r: r10 }],
  share_rank: ['Aaj ka rank #{rank}', { rank: 'count' }],
  share_det: ['Detector Agent: {d}/10', { d: r10 }],
  // duel
  duel_ready: ['{a} vs {b}: duel shuru!', { a: 'nickname', b: 'nickname' }],
  duel_got: ['{nick} ne round {n} pakda', { nick: 'nickname', n: 'int:1..10' }],
  duel_score: ['{a}: {x}/10 · {b}: {y}/10', { a: 'nickname', x: r10, b: 'nickname', y: r10 }],
  duel_won: ['{nick} jeeta!', { nick: 'nickname' }],
  duel_tie: ['{a} aur {b}: barabar takkar!', { a: 'nickname', b: 'nickname' }],
  duel_win_card: ['Maine {friend} ko AI ya Asli mein haraya', { friend: 'nickname' }],
  duel_lose_card: ['Maine {friend} ke saath AI ya Asli duel khela', { friend: 'nickname' }],
  duel_me: ['Mera score: {x}/10', { x: r10 }],
  duel_friend: ['{friend}: {y}/10', { friend: 'nickname', y: r10 }],
  duel_faster: ['Score barabar, {nick} zyada tez tha!', { nick: 'nickname' }],
  duel_walkover: ['{friend} beech mein chala gaya, duel tumhara', { friend: 'nickname' }],
};

/**
 * Register everything with core safety. Item lines are registered per item; an item whose lines fail core's copy
 * rules is reported (and the caller keeps it out of games) instead of crashing the server.
 * @returns {{ badItems: string[] }}
 */
export function registerPublic(safety, items, log = () => {}) {
  safety.bank('orx', ORX);
  safety.bank('badge', BADGES);
  safety.bank('enum', ENUM);
  for (const [id, [text, slots]] of Object.entries(TEMPLATES)) safety.template(id, text, slots);
  const badItems = [];
  for (const it of items) {
    try { safety.bank(`it_${it.id}`, itemLines(it)); } catch (e) { badItems.push(it.id); log({ kind: 'public_text', item: it.id, err: e.message.slice(0, 120) }); }
  }
  return { badItems };
}

/** The item's public lines, exactly as they travel to the TV (code lines cleaned, indent sent as a number). */
export function itemLines(it) {
  const out = {};
  if (it.type === 'text' && it.body) out.b = it.body;
  if (it.type === 'code' && it.body) it.body.split('\n').forEach((l, k) => { const t = tvLine(l).text; if (t) out[`l${k}`] = t; });
  if (it.transcript) out.tr = it.transcript;
  if (it.reveal_line) out.t = it.reveal_line;
  if (it.credit) out.c = it.credit;
  return out;
}

export const badgeKey = (right) => (right >= 10 ? 'b10' : right >= 8 ? 'b8' : right >= 6 ? 'b6' : right >= 4 ? 'b4' : 'b0');
