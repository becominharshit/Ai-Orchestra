// The phone's TV lines, built exactly like the templates in lib/public.js (the bus checks them in strict mode).
// Pure functions, no DOM: test/asli/public.test.js checks every shape against core safety.
export const TYPE_WORD = { text: 'text', code: 'code', audio: 'voice', image: 'photo' };

export function curatorLine(p) {
  if (p.image) return `${p.text} text, ${p.code} code, ${p.audio} voice, ${p.image} photo · ${p.ai} AI / ${p.real} asli`;
  if (p.audio) return `${p.text} text, ${p.code} code, ${p.audio} voice · ${p.ai} AI / ${p.real} asli`;
  return `${p.text} text, ${p.code} code · ${p.ai} AI / ${p.real} asli`;
}
export function detectorReady(d, voice) {
  const base = d.claude ? `${d.ready} guesses ready (${d.claude} Claude se)` : `${d.ready} guesses ready (offline style model)`;
  return voice ? `${base}, ${voice} voice: clip sun ke` : base;
}
/** Detector line from guess + confidence only (never Claude's free text). */
export function detLine(d) {
  if (!d?.guess || d.guess === 'none') return 'Detector Agent: koi pakka clue nahi mila';
  const pct = Math.round((d.confidence || 0) * 100);
  const what = d.guess === 'ai' ? 'AI' : 'Asli';
  if (!d.right) return `Detector Agent: ${pct}% ${what}. AI bhi confuse ho gaya!`;
  if (pct < 62) return `Detector Agent: ${pct}% ${what}, bas tukka laga`;
  return `Detector Agent: ${pct}% ${what}. Detector bhi sahi`;
}
export const scoreLine = (n, res) => `R${n}: +${res.correct ? res.points : 0} (${(res.ms / 1000).toFixed(1)}s), total ${res.total}`;
export const roundLog = (n, type, limitMs) => `Round ${n}/10: ${TYPE_WORD[type]}, ${(limitMs / 1000).toFixed(0)}s`;
export const readyLine = (nick) => `${nick} ready. Round 1 shuru!`;
export const doneLine = (s) => `Game complete in ${Math.max(1, Math.round(s))}s`;

/** Same transform as lib/content.js tvLine (core's cleanText collapses spaces; the indent travels as a number). */
export function tvLine(line) {
  const indent = (String(line).match(/^ */) || [''])[0].length;
  return { x: Math.min(12, indent), text: String(line).normalize('NFC').replace(/\s{2,}/g, ' ').trim() };
}
