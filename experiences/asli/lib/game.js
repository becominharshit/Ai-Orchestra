// One player's run through 10 rounds, shared by solo games and duel rooms.
// Rounds are issued one at a time and timed on the server (CHECK-06): the client's own time is never used.
import { publicRound, roundMs } from './content.js';

export const AUDIO_ALLOWANCE_MS = 1000; // the phone starts its timer when a voice clip starts playing

export function points(correct, ms, limitMs) {
  if (!correct) return 0;
  return 100 + Math.round(50 * Math.max(0, 1 - ms / limitMs));
}

export function newRun(items) {
  return { items, answers: [], issuedAt: [] };
}

/** Issue round i (idempotent: asking again returns the same round and keeps its clock). */
export function issueRound(run, i, now = Date.now()) {
  if (i !== run.answers.length || i >= run.items.length) return { error: 'bad_round' };
  if (!run.issuedAt[i]) run.issuedAt[i] = now;
  return { round: { ...publicRound(run.items[i], i), id: run.items[i].id } };
}

/**
 * Answer round i. opts: { pick, want, hero, graceMs, now, detector(it), browserDet }
 * Returns { res } (the reveal) or { error }. Retrying the last answer returns the same reveal.
 */
export function answerRound(run, i, opts) {
  const { now = Date.now(), graceMs = 8000 } = opts;
  if (i === run.answers.length - 1 && run.answers[i]?.res) return { res: run.answers[i].res, repeat: true };
  if (i !== run.answers.length || i >= run.items.length || !run.issuedAt[i]) return { error: 'bad_round' };
  const it = run.items[i];
  const limitMs = roundMs(it);
  let pick = ['ai', 'real'].includes(opts.pick) ? opts.pick : null;
  if (opts.hero && opts.pick === 'hero') pick = opts.want === false ? (it.answer === 'ai' ? 'real' : 'ai') : it.answer;
  const elapsed = now - run.issuedAt[i] - (it.type === 'audio' ? AUDIO_ALLOWANCE_MS : 0);
  if (elapsed > limitMs + graceMs) pick = null; // far too late: time up
  const ms = Math.min(limitMs, Math.max(250, elapsed));
  const correct = pick === it.answer;
  const pts = points(correct, ms, limitMs);
  let det = opts.detector(it);
  const bd = opts.browserDet;
  if (it.type === 'audio' && ['ai', 'real'].includes(bd?.guess)) {
    det = { guess: bd.guess, confidence: Math.min(0.99, Math.max(0.5, Number(bd.confidence) || 0.6)), clues: [], source: 'browser' };
  }
  run.answers.push({ pick, correct, ms, points: pts, det: det.guess, detRight: det.guess === it.answer });
  const total = run.answers.reduce((s, a) => s + a.points, 0);
  const res = {
    i, correct, pick, ms, answer: it.answer, reveal: it.reveal_line, credit: it.credit,
    // the phone and TV build their Detector line from guess + confidence only (templated); no free text
    detector: { guess: det.guess, confidence: det.confidence, source: det.source, right: det.guess === it.answer },
    points: pts, total, right: run.answers.filter((a) => a.correct).length,
  };
  run.answers[i].res = res;
  return { res };
}

export function summary(run) {
  const right = run.answers.filter((a) => a.correct).length;
  return {
    right,
    of: run.items.length,
    points: run.answers.reduce((s, a) => s + a.points, 0),
    timeMs: run.answers.reduce((s, a) => s + a.ms, 0),
    detectorRight: run.answers.filter((a) => a.detRight).length,
    rounds: run.answers.map((a, i) => ({ correct: a.correct, type: run.items[i].type, points: a.points })),
    complete: run.answers.length === run.items.length,
  };
}
