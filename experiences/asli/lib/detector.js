// Detector Agent, offline brain: a small, explainable style model for text and code.
// It looks for generic signals (not item-specific answers), so it is right most of the time and wrong sometimes:
// that is the point of the "AI bhi confuse ho gaya" moment. npm run asli:check prints its accuracy.
// Live mode: server.js can ask Claude instead (cached per item); this heuristic is the fallback and the mock answer.
// Voice: the browser measures the clip's noise floor (web/app.js, audioClues). Images: manifest "detector" or 50/50.

// Signals that lean AI (modern, polished, generic). Weight > 0.
const AI_SIGNALS = [
  [/\b(vibes?|hits different|gratitude|journey|treasure|sorted|universe|promise)\b/i, 1.4, 'feel-good buzzword'],
  [/\b(absolutely|highly recommend|perfectly|crystal clear|super fast|five stars)\b/i, 1.6, 'review cliche'],
  [/\b(simply|astonishing|remembers|permission|curiosity)\b/i, 0.9, 'polished word'],
  [/\blet your\b/i, 1.2, '"let your..." advice'],
  [/\b(phone|notification|scroll|assignment|maggi|canteen|library|exam|deadline|bug|error|code|college|class)\b/i, 0.8, 'modern word'],
  [/,\s*(and|aur)\s+[^,]+[.!]$/i, 0.4, 'neat list ending'],
  [/!\s*$/, 0.5, 'cheerful ending'],
  [/;/, 0.6, 'semicolon'],
  [/\b(\w+)\b.*\b\1\b.*\b\1\b/i, 0.2, 'repeats a word'],
  // code
  [/"""[\s\S]*"""/, 1.6, 'perfect docstring'],
  [/\/\/ Function to|# Example usage|<!-- Main/i, 2.0, 'comment restates the code'],
  [/->\s*\w+:|\w+:\s*str\b/, 1.0, 'type hints'],
  [/console\.(log|error)\(/, 0.8, 'console example'],
  [/try\s*{[\s\S]*catch/, 0.9, 'try/catch everywhere'],
  [/\b(GENTLY|SLOWLY|KIND|SMILE|Welcome)\b/, 0.9, 'too polite'],
];
// Signals that lean human / classic. Weight < 0.
const REAL_SIGNALS = [
  [/\b(thy|thee|ye|hath|pray|whatever|merely|universally|algebraical|usher|O)\b/, -1.4, 'old English'],
  [/\b(koye|hoye|mana|auran|aapahu|kabira|panthi|nindak|niyare|subhaye|bahuri|seenche|ritu|khair|bair)\b/i, -1.5, 'old Braj/Awadhi words'],
  [/\b(ghalib|mir|sukhanvar|andaaz|khwahish\w*|armaan|nikamma|naadaan|rekhte|varna)\b/i, -1.5, 'Urdu ghazal words'],
  [/\b(analytical engine|relay|panel|mr\.)\b/i, -1.0, 'historic detail'],
  [/^(why|on two occasions|it is a truth|it was the)\b/i, -0.6, 'old-style opening'],
  [/\b(HOPE HOPE|LYING|TRASHY|HONI SOIT|BURN, BABY)\b/, -2.2, 'human joke in old code'],
  [/disclaims copyright|blessing/i, -1.6, 'human licence note'],
  [/\b[A-Z]{2,}\d{2,}\b/, -0.6, 'old assembler labels'],
];

const squash = (x) => Math.tanh(x / 2.5);

/** @returns {{ guess:'ai'|'real', confidence:number, clues:string[], source:'heuristic' }} */
export function detectText(body = '', { type = 'text' } = {}) {
  let score = 0;
  const clues = [];
  for (const [re, w, label] of [...AI_SIGNALS, ...REAL_SIGNALS]) {
    if (re.test(body)) { score += w; clues.push(`${w > 0 ? 'AI' : 'asli'}: ${label}`); }
  }
  // Length prior: very short punchy lines and long rambling ones both read a bit human; mid-length polished reads AI.
  const n = body.length;
  if (type === 'text') {
    if (n >= 55 && n <= 115) score += 0.3;
    if (/[A-Z][a-z]+, [a-z]/.test(body) && /\.$/.test(body)) score += 0.15;
  }
  const guess = score > 0 ? 'ai' : 'real';
  const confidence = Math.round((0.5 + 0.45 * Math.abs(squash(score))) * 100) / 100;
  return { guess, confidence, clues: clues.slice(0, 3), source: 'heuristic' };
}

/** Detector guess for any manifest item (server side). Audio is analysed in the browser. */
export function detectItem(it) {
  if (it.detector && ['ai', 'real'].includes(it.detector.guess)) {
    return { guess: it.detector.guess, confidence: Number(it.detector.confidence) || 0.6, clues: it.detector.clues || [], source: it.detector.source || 'manifest' };
  }
  if (it.type === 'text' || it.type === 'code') return detectText(it.body, { type: it.type });
  if (it.type === 'audio') return { guess: null, confidence: 0, clues: [], source: 'browser' };
  return { guess: 'ai', confidence: 0.5, clues: ['photo: koi pakka clue nahi'], source: 'heuristic' };
}

/** Detector accuracy over a set of items (text + code only). */
export function accuracy(items) {
  const scored = items.filter((it) => it.type === 'text' || it.type === 'code');
  const right = scored.filter((it) => detectItem(it).guess === it.answer).length;
  return { right, total: scored.length, pct: scored.length ? Math.round((right / scored.length) * 100) : 0 };
}

/** One short Hinglish log line for the orchestra, from real data. */
export function detectorLine(d, right) {
  const pct = Math.round((d.confidence || 0) * 100);
  const what = d.guess === 'ai' ? 'AI' : 'Asli';
  if (!d.guess) return 'Detector: koi pakka clue nahi mila';
  if (pct < 62) return `Detector: ${pct}% ${what}... AI bhi confuse ho gaya`;
  return right ? `Detector: ${pct}% ${what}. Detector bhi sahi` : `Detector: ${pct}% ${what}. AI bhi confuse ho gaya!`;
}
