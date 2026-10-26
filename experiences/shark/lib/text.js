// Small text helpers shared by the server, the offline engine and the tests.
// Everything that leaves the server goes through clean(): no em/en dashes, no handles, phones or emails,
// no visitor names (see nameTokens), length capped at a word boundary.

const DASHES = /\s*[\u2012\u2013\u2014\u2015]\s*/g;

/** Words the visitor used to introduce themselves ("mera naam Riya", "my name is Riya"). Never shown on the TV. */
export function nameTokens(pitch = '') {
  const out = new Set();
  const s = String(pitch);
  const res = [
    /\bmy name is\s+([a-z]{2,20})(?:\s+([a-z]{2,20}))?/gi,
    /\bmera naam\s+([a-z]{2,20})(?:\s+([a-z]{2,20}))?/gi,
    /\bnaam hai\s+([a-z]{2,20})/gi,
    /\bmyself\s+([a-z]{2,20})/gi,
    /\bthis is\s+([a-z]{2,20})\s+(?:from|and|here)\b/gi,
    /\bi am\s+([a-z]{2,20})\s+(?:from|and|here)\b/gi,
  ];
  const skip = new Set(['hai', 'he', 'h', 'is', 'and', 'from', 'aur', 'main', 'mai', 'hoon', 'hu', 'the', 'a', 'an', 'not', 'very', 'so', 'going', 'student', 'class']);
  for (const re of res) {
    for (const m of s.matchAll(re)) for (const g of m.slice(1)) if (g && !skip.has(g.toLowerCase())) out.add(g.toLowerCase());
  }
  return [...out];
}

/** Clean one line of generated text. names: tokens to replace with "founder". */
export function clean(v, max = 160, names = []) {
  let s = String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(DASHES, ', ')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '')
    .replace(/(^|\s)@[A-Za-z0-9_.]{2,}/g, '$1')
    .replace(/(?:\+?\d[\s-]?){10,}/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[,\s]+/, '')
    .trim();
  for (const n of names) s = s.replace(new RegExp(`\\b${n}\\b`, 'gi'), 'founder');
  if (s.length > max) {
    const cut = s.slice(0, max + 1);
    const sp = cut.lastIndexOf(' ');
    s = `${(sp > max * 0.6 ? cut.slice(0, sp) : cut.slice(0, max)).replace(/[,;:\s]+$/, '')}...`;
  }
  return s;
}

/** Normalise visitor input before it goes anywhere (never logged). */
export function cleanInput(v, max = 700) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(DASHES, ', ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export const titleCase = (s) => String(s).replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** Deterministic 0..1 random from a string seed (same pitch, same demo verdict). */
export function seeded(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return h / 4294967296;
  };
}
export const pickWith = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

/** Text to hand to core's textfilter: words it flags by mistake in Hinglish ("chhod do" = leave it,
 *  cricket "chakka" = six) are swapped for neutral words first. TODO(core): allow these in textfilter.js. */
export const coreProbe = (s) => String(s).replace(/\bchh+od/gi, 'leave').replace(/\bchakk?a\b/gi, 'six');
