// Director agent: plans the cut from the template and the real clip lengths.
// Pure computation (no ffmpeg), so the web server can show it live and the tests can check it.
//
// Rules:
// - every shot length is a whole number of beats (cuts land on the beat of the music bed)
// - a shot never runs past the end of its clip; it starts a little after the record tap (people settle)
// - the whole reel (shots + 2 s end card) stays at or under MAX_TOTAL_S
import { TEMPLATES, HOOK_S, END_CARD_S } from './templates.js';

export const MIN_SHOT_BEATS = 2; // shortest shot the Director accepts: a 2.0 s clip fits 2 beats even at 90 BPM
export const MAX_TOTAL_S = 26;
const LEAD_IN_S = 0.35; // skip the first moment after the record tap when the clip is long enough

const round3 = (x) => Math.round(x * 1000) / 1000;

/**
 * @param {string} templateId
 * @param {number[]} clipDurations seconds, one per shot (3)
 * @returns {{ template, bpm, beat, shots:[{n, in, dur, beats, start, clipDur}], shotsTotal, total, hookS, endCardS }}
 */
export function planCut(templateId, clipDurations) {
  const t = TEMPLATES[templateId];
  if (!t) throw Object.assign(new Error('unknown template'), { code: 'bad_template' });
  if (!Array.isArray(clipDurations) || clipDurations.length !== t.shots.length) throw Object.assign(new Error('need one clip per shot'), { code: 'bad_clips' });
  const beat = 60 / t.bpm;
  const budget = MAX_TOTAL_S - END_CARD_S;
  let start = 0;
  const shots = t.shots.map((target, i) => {
    const clipDur = Math.max(0, Number(clipDurations[i]) || 0);
    const fitBeats = Math.floor((clipDur - 0.05) / beat); // whole beats that fit in the clip
    let beats = Math.max(1, Math.round(target / beat));
    beats = Math.min(beats, fitBeats);
    // keep cuts on bar lines (4 beats) when that costs less than one beat
    const toBar = beats - (beats % 4);
    if (beats % 4 === 1 && toBar >= MIN_SHOT_BEATS) beats = toBar;
    if (beats < MIN_SHOT_BEATS) throw Object.assign(new Error(`shot ${i + 1} is too short`), { code: 'too_short', shot: i + 1 });
    const dur = beats * beat;
    const spare = clipDur - dur;
    const inPoint = spare > LEAD_IN_S * 2 ? LEAD_IN_S : Math.max(0, spare / 2);
    const s = { n: i + 1, in: round3(inPoint), dur: round3(dur), beats, start: round3(start), clipDur: round3(clipDur) };
    start += dur;
    return s;
  });
  // Over budget (only with very long targets): trim beats from the longest shot, never below the minimum.
  let total = shots.reduce((a, s) => a + s.beats * beat, 0);
  while (total > budget + 1e-6) {
    const longest = shots.reduce((a, s) => (s.beats > a.beats ? s : a));
    if (longest.beats <= MIN_SHOT_BEATS) break;
    longest.beats -= 1;
    longest.dur = round3(longest.beats * beat);
    total = shots.reduce((a, s) => a + s.beats * beat, 0);
  }
  let acc = 0;
  for (const s of shots) { s.start = round3(acc); acc += s.beats * beat; }
  const shotsTotal = round3(acc);
  return { template: templateId, name: t.name, bpm: t.bpm, beat: round3(beat), shots, shotsTotal, total: round3(shotsTotal + END_CARD_S), hookS: HOOK_S, endCardS: END_CARD_S };
}

/** Max caption characters that read comfortably in a shot of `dur` seconds (about 7 characters per second, capped). */
export function captionBudget(dur) {
  return Math.max(18, Math.min(52, Math.round(dur * 7)));
}
