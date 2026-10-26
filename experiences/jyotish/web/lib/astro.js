// AI Jyotish: the real computations behind the Rashi Agent and the Ank Agent.
// Shared by the phone (runs it live for the orchestra log) and the server (re-checks the values).
// Plain ES module, no dependencies, no DOM. Unit tests: test/jyotish/astro.test.js
//
// Sun sign: the common Western (tropical) date ranges, shown with the Hindi rashi name next to it,
// because that is the sign most students already know from Instagram.
// TODO(student): Vedic (sidereal) rashi is about 23 days earlier. Add a toggle and a test if you build it.

export const SIGNS = [
  { id: 'aries', en: 'Aries', hi: 'Mesh', element: 'Fire', from: [3, 21], to: [4, 19] },
  { id: 'taurus', en: 'Taurus', hi: 'Vrishabh', element: 'Earth', from: [4, 20], to: [5, 20] },
  { id: 'gemini', en: 'Gemini', hi: 'Mithun', element: 'Air', from: [5, 21], to: [6, 20] },
  { id: 'cancer', en: 'Cancer', hi: 'Kark', element: 'Water', from: [6, 21], to: [7, 22] },
  { id: 'leo', en: 'Leo', hi: 'Simha', element: 'Fire', from: [7, 23], to: [8, 22] },
  { id: 'virgo', en: 'Virgo', hi: 'Kanya', element: 'Earth', from: [8, 23], to: [9, 22] },
  { id: 'libra', en: 'Libra', hi: 'Tula', element: 'Air', from: [9, 23], to: [10, 22] },
  { id: 'scorpio', en: 'Scorpio', hi: 'Vrishchik', element: 'Water', from: [10, 23], to: [11, 21] },
  { id: 'sagittarius', en: 'Sagittarius', hi: 'Dhanu', element: 'Fire', from: [11, 22], to: [12, 21] },
  { id: 'capricorn', en: 'Capricorn', hi: 'Makar', element: 'Earth', from: [12, 22], to: [1, 19] },
  { id: 'aquarius', en: 'Aquarius', hi: 'Kumbh', element: 'Air', from: [1, 20], to: [2, 18] },
  { id: 'pisces', en: 'Pisces', hi: 'Meen', element: 'Water', from: [2, 19], to: [3, 20] },
];
export const SIGN_IDS = SIGNS.map((s) => s.id);
export const ELEMENT_HI = { Fire: 'Agni', Earth: 'Prithvi', Air: 'Vayu', Water: 'Jal' };

export const MASTER = [11, 22, 33];
export const LIFE_PATHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];

/** Parse 'YYYY-MM-DD' (what <input type=date> gives). Returns { y, m, d } or null if it is not a real date. */
export function parseDob(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // days in that month (handles leap years)
  if (d > dim) return null;
  return { y, m: mo, d };
}

/** A DOB the form accepts: real date, year 1930 or later, not in the future. */
export function validDob(s, today = new Date()) {
  const p = parseDob(s);
  if (!p || p.y < 1930) return false;
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Date.UTC(p.y, p.m - 1, p.d) <= t;
}

/** Sun sign for a month (1-12) and day. */
export function sunSign(month, day) {
  const md = month * 100 + day;
  for (const s of SIGNS) {
    const a = s.from[0] * 100 + s.from[1];
    const b = s.to[0] * 100 + s.to[1];
    if (a <= b ? md >= a && md <= b : md >= a || md <= b) return s; // Capricorn wraps the new year
  }
  return SIGNS[0];
}

export const signById = (id) => SIGNS.find((s) => s.id === id) || null;

const digitSum = (n) => String(n).split('').reduce((a, c) => a + Number(c), 0);

/** Reduce to one digit, but keep the master numbers 11, 22 and 33. */
export function reduce(n) {
  let v = Math.abs(Math.trunc(n));
  while (v > 9 && !MASTER.includes(v)) v = digitSum(v);
  return v;
}

/**
 * Life-path number, the usual numerology method: reduce month, day and year separately (keeping masters),
 * add them, reduce again (keeping masters). Returns { number, parts: { m, d, y }, sum } for the agent log.
 * Example: 2009-11-11 -> month 11, day 11, year 2009 -> 11; 11 + 11 + 11 = 33 (master, kept).
 */
export function lifePath(y, m, d) {
  const parts = { m: reduce(m), d: reduce(d), y: reduce(digitSum(y)) };
  const sum = parts.m + parts.d + parts.y;
  return { number: reduce(sum), parts, sum };
}

/** Age band, only to pick the tone (school vs college). Never sent to the TV. */
export function ageBand(dob, today = new Date()) {
  const p = typeof dob === 'string' ? parseDob(dob) : dob;
  if (!p) return 'young';
  let age = today.getFullYear() - p.y;
  if (today.getMonth() + 1 < p.m || (today.getMonth() + 1 === p.m && today.getDate() < p.d)) age -= 1;
  if (age < 13) return 'kid';
  if (age < 18) return 'teen';
  if (age < 26) return 'young';
  return 'adult';
}
export const AGE_BANDS = ['kid', 'teen', 'young', 'adult'];

/** Optional birth time 'HH:MM' -> a time-of-day bucket for the Kaal Agent. '' when not given. */
export function timeBucket(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  if (!m) return '';
  const h = Number(m[1]);
  if (h >= 4 && h < 11) return 'subah';
  if (h >= 11 && h < 16) return 'dopahar';
  if (h >= 16 && h < 20) return 'shaam';
  return 'raat';
}
export const TIME_BUCKETS = ['', 'subah', 'dopahar', 'shaam', 'raat'];

/** Everything the phone computes from the form in one go. */
export function chart(dobStr, timeStr = '', today = new Date()) {
  const p = parseDob(dobStr);
  if (!p) return null;
  const sign = sunSign(p.m, p.d);
  const lp = lifePath(p.y, p.m, p.d);
  return { sign, lifePath: lp, age: ageBand(p, today), time: timeBucket(timeStr) };
}

// Simple constellation drawings (normalised 0..1 star points + line pairs) for the result header and the TV.
// Artistic, not star-chart accurate.
export const CONSTELLATIONS = {
  aries: { s: [[0.1, 0.55], [0.42, 0.38], [0.62, 0.42], [0.88, 0.62]], l: [[0, 1], [1, 2], [2, 3]] },
  taurus: { s: [[0.08, 0.2], [0.35, 0.45], [0.5, 0.55], [0.62, 0.48], [0.92, 0.18], [0.55, 0.85]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5]] },
  gemini: { s: [[0.2, 0.1], [0.22, 0.5], [0.15, 0.9], [0.72, 0.12], [0.7, 0.5], [0.8, 0.88]], l: [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4]] },
  cancer: { s: [[0.5, 0.15], [0.48, 0.5], [0.15, 0.85], [0.85, 0.82], [0.5, 0.62]], l: [[0, 1], [1, 4], [4, 2], [4, 3]] },
  leo: { s: [[0.12, 0.72], [0.38, 0.6], [0.55, 0.62], [0.82, 0.8], [0.6, 0.38], [0.66, 0.15], [0.86, 0.22], [0.48, 0.25]], l: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 7], [7, 5], [5, 6]] },
  virgo: { s: [[0.08, 0.3], [0.3, 0.35], [0.48, 0.48], [0.68, 0.4], [0.9, 0.2], [0.55, 0.78], [0.82, 0.88]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6]] },
  libra: { s: [[0.5, 0.12], [0.18, 0.48], [0.82, 0.48], [0.28, 0.88], [0.72, 0.86]], l: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4]] },
  scorpio: { s: [[0.08, 0.2], [0.2, 0.3], [0.32, 0.42], [0.45, 0.55], [0.55, 0.72], [0.7, 0.82], [0.86, 0.72], [0.92, 0.55]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]] },
  sagittarius: { s: [[0.12, 0.85], [0.35, 0.62], [0.55, 0.45], [0.78, 0.22], [0.62, 0.72], [0.4, 0.3], [0.9, 0.1]], l: [[0, 1], [1, 2], [2, 3], [3, 6], [1, 4], [2, 5]] },
  capricorn: { s: [[0.1, 0.25], [0.3, 0.55], [0.52, 0.82], [0.75, 0.6], [0.9, 0.3], [0.5, 0.3]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]] },
  aquarius: { s: [[0.08, 0.4], [0.25, 0.28], [0.42, 0.42], [0.58, 0.3], [0.75, 0.45], [0.92, 0.34], [0.4, 0.78], [0.62, 0.8]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [3, 7]] },
  pisces: { s: [[0.1, 0.18], [0.22, 0.4], [0.38, 0.62], [0.55, 0.82], [0.72, 0.6], [0.85, 0.4], [0.92, 0.18]], l: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]] },
};
