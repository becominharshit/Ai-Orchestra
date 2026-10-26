// Server-side clean-up for every text value that can reach a counter TV (bus.js).
//   - max 140 characters (longer text is cut with an ellipsis)
//   - links removed (http(s)://..., www...., bare domains), except zenithschool.ai and the Zenith IG profile;
//     degree abbreviations (B.Com, B.Tech, M.Sc, Ph.D, ...) are never treated as links
//   - Hindi (Roman and Devanagari) and English profanity and slurs masked as ***
// Defence in depth, not perfection: experiences must still never put visitor-typed text on the TV, and staff
// can blank a TV at once (key B on the TV page, or "Clear counter N" on /admin).
//
// How a word is checked:
//   1. punctuation around a word is split off first: "fuck!", "(chutiya)", "!!madarchod!!"
//   2. symbols inside a word are read as letters: sh!t, a$$hole, b1tch, sh1+; a star is any letter: f*ck, a**hole
//   3. repeated letters collapse: fuuuck, chutiyaa
//   4. each root is matched with its family: plurals, Hindi endings (-pa -iya -ke -ka -on -yan), and compounds
//      (fuckwit, dumbfuck, mothafucka); short or ambiguous roots match as whole words only
//   5. words with no vowels are compared by their consonants: fck, sht, mdrchd
//   6. letters spelled apart are joined first: "f u c k", "f.u.c.k", "F-U-C-K"
//   7. Devanagari words are matched after Unicode NFC, ignoring nukta, chandrabindu/anusvara and short/long
//      vowel-sign differences
// An allow-list of names and phrases stays untouched (Moby Dick, Lund University, BC Roy, sab chod diya, ...).

import { romanBase, unconfuse } from '../web/normalize.js';

export const MAX_TEXT = 140;

// ---------- Roman script ----------
// Suffix families. Kept per root so that e.g. "prick" does not mask "pricked" and "chut" does not mask "chute".
const EN = ['', 's', 'es', 'y', 'ty', 'ie', 'ies', 'er', 'ers', 'ing', 'in', 'ed', 'head', 'heads', 'face', 'faces', 'wit', 'wits', 'bag', 'bags', 'hole', 'holes', 'tard', 'a', 'az', 'off'];
const HI = ['', 'a', 'e', 'i', 'o', 's', 'as', 'es', 'on', 'an', 'yan', 'iyan', 'iyon', 'ya', 'ye', 'yo', 'pa', 'apa', 'yapa', 'iyapa', 'pan', 'ka', 'ke', 'ki', 'kar', 'na', 'ne', 'ni', 'giri', 'gardi', 'baaz', 'baz', 'masti', 'mara', 'mari', 'marao', 'phat', 'fat', 'pana', 'panti'];
const PRE = ['', 'mother', 'motha', 'mutha', 'mudda', 'dumb', 'bull', 'dip', 'horse', 'chicken', 'jack', 'dick', 'ass', 'shit', 'cluster', 'clusterf', 'brother', 'sister'];

// [root, suffixes, prefixes, wholeWordOnly]. Roots are written in normalised form (lowercase, no repeats).
const ROOTS = [
  // English
  ['fuck', EN, PRE], ['fuk', EN, PRE], ['fuq', EN, PRE], ['fvck', EN, PRE], ['fuc', ['', 'k', 'ka', 'ker', 'kers', 'king', 'ked', 'kin'], PRE], ['fcuk', EN, PRE], ['phuck', EN, PRE], ['phuk', EN, PRE],
  ['fucka', EN, PRE], ['fuka', EN, PRE],
  ['shit', ['', 's', 'ty', 'ter', 'ters', 'ting', 'head', 'heads', 'face', 'hole', 'show', 'storm', 'e'], ['', 'bull', 'dip', 'horse', 'chicken', 'ape', 'holy']],
  ['bitch', EN, PRE], ['biatch', EN, PRE], ['biotch', EN, PRE], ['btch', EN, PRE],
  ['bastard', EN, PRE], ['ashole', EN, PRE], ['arshole', EN, PRE], ['arse', ['', 's', 'hole', 'holes', 'wipe'], PRE], ['ashat', EN, PRE], ['aswipe', EN, PRE],
  ['dick', ['', 's', 'head', 'heads', 'face', 'wad', 'hole'], ['', 'dumb', 'limp']],
  ['cunt', EN, PRE], ['twat', EN, PRE], ['slut', EN, PRE], ['whore', EN, PRE], ['pusy', ['', 'cat'], ['']], ['cock', ['', 's', 'sucker', 'suckers', 'head'], ['']],
  ['wanker', EN, PRE], ['wank', ['', 's', 'er', 'ers', 'ing'], ['']], ['retard', EN, PRE], ['fagot', EN, PRE], ['fag', ['', 's', 'got', 'gots'], ['']],
  ['niger', EN, PRE], ['niga', EN, PRE], ['nigah', EN, PRE], ['rape', ['', 's', 'd', 'r', 'rs', 'ist', 'ists'], ['']], ['raping', [''], ['']],
  ['porn', ['', 's', 'o', 'hub'], ['']], ['bobs', [''], ['']], ['tits', ['', 'y'], ['']], ['titie', ['s'], ['']], ['sex', ['', 'y', 'ting'], ['']], ['nude', ['', 's'], ['']], ['nudes', [''], ['']],
  ['dumbas', ['', 'es'], ['']], ['jackas', ['', 'es'], ['']], ['piss', ['', 'ed', 'es', 'ing', 'er', 'off', 'head'], ['']], ['bolocks', [''], ['']], ['bolox', [''], ['']],
  ['blowjob', ['', 's'], ['']], ['handjob', ['', 's'], ['']], ['prick', ['', 's'], ['']], ['douche', ['', 's', 'bag', 'bags', 'y'], ['']], ['dooshbag', [''], ['']],
  ['cum', ['', 's', 'shot', 'shots', 'dump'], ['']], ['jizz', ['', 'ed'], ['']], ['wtf', [''], ['']], ['stfu', [''], ['']], ['mofo', ['', 's'], ['']],
  ['motherfucker', EN, ['']], ['sht', [''], ['']], ['fkn', [''], ['']], ['fking', [''], ['']], ['fkin', [''], ['']], ['fck', ['', 's', 'er', 'ing', 'in'], PRE],
  // Hindi / Hinglish (Roman script)
  ['chut', ['', 's', 'h'], ['', 'maa ki ']], ['chutiy', HI, ['']], ['chutia', HI, ['']], ['chotiya', HI, ['']], ['chutya', HI, ['']], ['chtya', HI, ['']], ['chtiya', HI, ['']], ['chutye', HI, ['']],
  ['madarchod', HI, ['']], ['maderchod', HI, ['']], ['madharchod', HI, ['']], ['mderchod', HI, ['']], ['mdrchod', HI, ['']], ['madarjat', HI, ['']], ['maderjat', HI, ['']],
  ['behenchod', HI, ['']], ['bahenchod', HI, ['']], ['bhenchod', HI, ['']], ['bhanchod', HI, ['']], ['benchod', HI, ['']], ['bahanchod', HI, ['']], ['bhnchd', HI, ['']], ['bnchd', HI, ['']],
  ['bhosdi', HI, ['']], ['bhosadi', HI, ['']], ['bhosda', HI, ['']], ['bhosad', HI, ['']], ['bsdk', HI, ['']], ['bhosdike', HI, ['']], ['bhosdika', HI, ['']],
  ['gand', HI, ['']], ['gandu', HI, ['']], ['gandmasti', HI, ['']], ['gandfat', HI, ['']],
  ['lavda', HI, ['']], ['lavde', HI, ['']], ['lauda', HI, ['']], ['laude', HI, ['']], ['lawda', HI, ['']], ['lawde', HI, ['']], ['loda', HI, ['']], ['lode', HI, ['']], ['lodu', HI, ['']], ['lund', HI, ['']], ['laund', ['a', 'e', 'iya'], ['']],
  ['randi', HI, ['']], ['randwa', HI, ['']], ['chinal', HI, ['']], ['harami', HI, ['']], ['haramzad', HI, ['']], ['haramkhor', HI, ['']],
  ['bakchod', HI, ['']], ['bhadwa', HI, ['']], ['bhadwe', HI, ['']], ['bhadve', HI, ['']], ['bhadva', HI, ['']], ['hijra', HI, ['']], ['hijda', HI, ['']],
  ['tati', HI, ['']], ['jhatu', HI, ['']], ['jhant', HI, ['']], ['kutiya', HI, ['']], ['kutia', HI, ['']], ['kutta', ['kamina'], ['']], ['kamin', ['a', 'e', 'i'], ['']],
  ['chod', ['', 'u', 'na', 'ne', 'ni', 'ta', 'te', 'ti', 'enge', 'ega', 'oge', 'ai', 'ali', 'akad'], ['', 'maa ', 'behen ', 'bahen ']], ['chudai', HI, ['']], ['chud', ['', 'i', 'wa', 'wana', 'ai'], ['']],
  ['mc', [''], ['']], ['bc', [''], ['']], ['bkl', [''], ['']], ['mkc', [''], ['']], ['tmkc', [''], ['']], ['bkc', [''], ['']], ['mkb', [''], ['']],
];

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '+': 't' };
const LEET_RE = /[013457@$!+]/g;
// Shared with the care check: Unicode disguises undone (zero-width, accents, Cyrillic/Greek look-alikes),
// leetspeak, repeated letters collapsed except h ("chhod" (leave) stays apart from "chod").
const base = (w) => romanBase(w);

// Expand every root with its prefixes and suffixes into one lookup set of normalised forms.
const BAD = new Set();
for (const [root, sufs, pres] of ROOTS) for (const pre of pres) for (const suf of sufs) BAD.add(base(`${pre}${root}${suf}`));
// Forms that are fine on their own although a rule above generates them.
for (const ok of ['shite', 'arses', 'cocks', 'dicks', 'sexy', 'kamini', 'laundry', 'chute', 'chuts', 'gande', 'gandi', 'gando', 'ganda', 'gandon', 'gands', 'lodi', 'lodo', 'lode', 'lodha', 'lodhi', 'chodo', 'mca', 'bca', 'bce']) BAD.delete(base(ok));
BAD.add(base('lode')); // Hindi slang; "mother lode" is on the allow-list below
const FORMS = [...BAD];

// Consonant skeletons for vowel-dropped writing ("fck", "mdrchd"). Only from forms of 5+ letters, skeletons of
// 4+ letters, plus a few known 3-letter ones; common harmless abbreviations are never treated as swears.
const SKELETON_SKIP = new Set(['tts', 'nd', 'sx', 'rp', 'ld', 'gnd', 'pss', 'cms', 'chts', 'bcs', 'prcs']);
const skel = (w) => w.replace(/[aeiou]/g, '');
const BAD_SKEL = new Set(['fck', 'sht', 'btch', 'mdrchd', 'bhnchd', 'bnchd', 'bsdk', 'chtya', 'chty', 'lnd', 'gnd'].filter((k) => !SKELETON_SKIP.has(k)));
for (const f of FORMS) { const k = skel(f); if (f.length >= 5 && k.length >= 4 && !SKELETON_SKIP.has(k)) BAD_SKEL.add(k); }

function isBadRoman(core) {
  if (!core) return false;
  if (core.includes('*')) {
    // a star stands for one letter (or none): f*ck, a**hole, c*nt, ch*tiya
    const re = new RegExp(`^${base(core.replace(/\*/g, '\u0000')).replace(/[.?^${}()|[\]\\]/g, '\\$&').replace(/\u0000/g, '[a-z]?')}$`);
    if (core.replace(/\*/g, '').length < 1) return false;
    return FORMS.some((f) => re.test(f));
  }
  const b = base(core);
  if (BAD.has(b)) return true;
  if (!/[aeiou]/.test(b) && b.length >= 3 && BAD_SKEL.has(b)) return true;
  return false;
}

// ---------- Devanagari ----------
// Normalise: NFC, drop nukta, chandrabindu -> anusvara, ZWJ/ZWNJ out, long/short i and u signs merged,
// independent long vowels merged with short ones.
const devaNorm = (w) => w.normalize('NFC')
  .replace(/[‌‍़]/g, '')
  .replace(/ँ/g, 'ं')
  .replace(/ी/g, 'ि').replace(/ू/g, 'ु')
  .replace(/ई/g, 'इ').replace(/ऊ/g, 'उ')
  .replace(/ड़/g, 'ड').replace(/ड़/g, 'ड').replace(/ढ़/g, 'ढ');
// [word, mode]: 'sub' = anywhere inside a word (long, unambiguous), 'word' = whole word only
const DEVA = [
  ['चूतिया', 'sub'], ['चुतिया', 'sub'], ['चूतिये', 'sub'], ['चूत', 'word'], ['मादरचोद', 'sub'], ['मादर चोद', 'sub'], ['बहनचोद', 'sub'], ['बहन चोद', 'sub'], ['बहेनचोद', 'sub'],
  ['भेनचोद', 'sub'], ['भैनचोद', 'sub'], ['भोसड़ीके', 'sub'], ['भोसडीके', 'sub'], ['भोसड़ी', 'sub'], ['भोसड़ा', 'sub'], ['भोसडा', 'sub'], ['गांडू', 'sub'], ['गाँडू', 'sub'], ['गांड', 'word'],
  ['गाँड', 'word'], ['रंडी', 'sub'], ['रण्डी', 'sub'], ['लौड़ा', 'sub'], ['लौडा', 'sub'], ['लौड़े', 'sub'], ['लवडा', 'sub'], ['लोड़ा', 'word'], ['लंड', 'word'], ['लण्ड', 'word'],
  ['हरामी', 'sub'], ['हरामज़ादा', 'sub'], ['हरामजादा', 'sub'], ['हरामखोर', 'sub'], ['बकचोद', 'sub'], ['चोद', 'sub'], ['चुदाई', 'sub'], ['कुतिया', 'sub'], ['झांट', 'sub'],
  ['भड़वा', 'sub'], ['भडवा', 'sub'], ['भड़वे', 'sub'], ['छिनाल', 'sub'], ['हिजड़ा', 'sub'], ['हिजडा', 'sub'], ['मादरजात', 'sub'], ['कमीने', 'word'], ['कमीना', 'word'], ['साले', 'word'],
].map(([w, m]) => [devaNorm(w), m]);
const DEVA_WORD = /[ऀ-ॿ]+(?:\s+[ऀ-ॿ]+)?/g;
function isBadDeva(token) {
  const t = devaNorm(token);
  return DEVA.some(([w, mode]) => (mode === 'sub' ? t.includes(w) : t === w || t.replace(/[ा-ौंः]+$/, '') === w));
}

// ---------- allow-list ----------
const ALLOW = [
  /\bsex\s+(?:ratio|education|ed)\b/gi, /\b(?:moby|tricky|spotted)\s+dick\b/gi, /\bdick\s+(?:van\s+dyke|whittington|grayson|cheney|tracy)\b/gi,
  /\blund\s+(?:university|universitet)\b/gi, /\b(?:university\s+of\s+)lund\b/gi, /\bbc\s+roy\b/gi, /\bgand\s+sahab?\b/gi, /\bharami\s+pass\b/gi,
  /\bpussy\s*(?:willow|cat)s?\b/gi, /\bloda\s+mavi\b/gi, /\bmother\s+lode\b/gi, /\bcum\s+laude\b/gi, /\b(?:magna|summa)\s+cum\b/gi,
  /\bmc\s+(?:stan|square|of\s+the|for\s+the)\b/gi, /\b(?:the|an|our|event|stage)\s+mc\b/gi,
  /\b\d[\d,]*\s*(?:bc|bce)\b/gi, /\b(?:bc|bce)\s*\d+\b/gi,
  /\bchod\s+(?:diya|diye|di|do|de|dena|dete|deta|raha|rahe|rahi|ke|kar|dia|dun|du)\b/gi, /\b(?:sab|kuch|mat|sab\s+kuch)\s+chod\b/gi,
];
// "Dick" alone, written as a name (capital D, rest lowercase), is a first name, not a swear
const NAME_OK = new Set(['dick']);
// raw words that normalise onto a listed form but are harmless (Niger the country, ...)
const RAW_OK = new Set(['niger', 'nigers', 'shite', 'kamini', 'chute', 'chutes', 'ganda', 'gandi', 'gande', 'gandagi', 'lodha', 'lodhi', 'chodo']);

// Degree abbreviations are never links: B.Com, B.Tech, M.Sc, Ph.D, LL.B, M.B.A, B.A, M.Com, B.Sc, B.Ed ...
const DEGREE = /^(?:[bm]\.?(?:com|sc|tech|a|ed|arch|des|pharm|phil|ba|ca|e|s)|ph\.?d|ll\.?[bm]|m\.?b\.?a|b\.?b\.?a)$/i;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]{2,}(?:\.[a-z0-9-]+)*\.(?:com|in|net|org|io|ai|co|me|xyz|app|link|ly|gg|tv|info|biz|online|site|store|live|club)\b(?:\/[^\s]*)?/gi;
const OWN = /(^|\.)zenithschool\.ai(\/|$)|instagram\.com\/zenith_school_of_ai/i;

function maskWords(s) {
  // "maa/behen (ki) chod/chut ..." is always a swear, even where "chod di" alone would be harmless
  s = s.replace(/\b(?:maa|maaa|ma|behen|bahen|behan)\s+(?:ki\s+|ke\s+)?(?:chod|chut(?!t))\w*/gi, '***');
  const keep = [];
  for (const re of ALLOW) for (const m of s.matchAll(re)) keep.push([m.index, m.index + m[0].length]);
  const kept = (a, b) => keep.some(([x, y]) => a < y && x < b);

  // Devanagari words (and two-word phrases such as "मादर चोद")
  s = s.replace(DEVA_WORD, (m, off) => {
    if (kept(off, off + m.length)) return m;
    const parts = m.split(/(\s+)/);
    if (parts.some((w) => !/\s/.test(w) && isBadDeva(w))) return parts.map((w) => (/\s/.test(w) || !isBadDeva(w) ? w : '***')).join('');
    return isBadDeva(m.replace(/\s+/g, '')) ? '***' : m; // two-word forms such as "मादर चोद"
  });

  // Roman two-word forms: "maa chod", "maa ki chut", "jerk off", "piss off", "mother fucker"
  s = s.replace(/\b(jerk|jack|piss|fuck|f\*ck)\s*(off)\b/gi, (m, a, b, off) => (kept(off, off + m.length) ? m : '***'));

  // letters spelled apart: runs of single characters separated by spaces, dots, dashes or underscores
  s = s.replace(/(?<![\p{L}\p{N}\p{So}])(?:[\p{L}\p{So}*@$!+0-9][\s._\-]){1,}[\p{L}\p{So}*@$!+0-9](?![\p{L}\p{N}\p{So}])/gu, (m, off) => {
    if (kept(off, off + m.length)) return m;
    const joined = m.replace(/[\s._\-]/g, '');
    if (DEGREE.test(m.replace(/\s/g, ''))) return m;
    return isBadRoman(joined) ? '***' : m;
  });

  // word by word; punctuation around a word is split off before the lookup
  return s.replace(/[^\s]+/gu, (tok, off) => {
    if (kept(off, off + tok.length)) return tok;
    if (/[ऀ-ॿ]/.test(tok) || tok === '***') return tok;
    // undo disguises first (circled letters are symbols until NFKC; small capitals, Greek sigma, ...)
    const core = unconfuse(tok).replace(/^[^\p{L}\p{N}*@$!+]+|[^\p{L}\p{N}*+]+$/gu, '');
    if (NAME_OK.has(core.toLowerCase()) && /^[A-Z][a-z]+$/.test(core)) return tok;
    if (RAW_OK.has(core.toLowerCase())) return tok;
    if (DEGREE.test(core)) return tok;
    const strip = (x) => x.replace(/[!@$+]+$/, '').replace(/^[!@$+]+/, '');
    const parts = core.split(/[-_/,.;:?"'()[\]{}#]+/).filter(Boolean);
    const bad = isBadRoman(core) || isBadRoman(strip(core)) || parts.some((p) => !(NAME_OK.has(p.toLowerCase()) && /^[A-Z][a-z]+$/.test(p)) && (isBadRoman(p) || isBadRoman(strip(p))));
    if (!bad) return tok;
    // fold letter-like symbols (circled ⓕ, parenthesised ⒡, math 𝐟) to letters before splitting off punctuation,
    // so "ⓕⓤⓒⓚ!" keeps only "!" around the mask
    const chars = [...tok];
    const folded = chars.map((c) => (/[\p{L}\p{N}]/u.test(unconfuse(c)) ? 'a' : c)).join('');
    const leadN = [...folded.match(/^[^\p{L}\p{N}*@$!+]*/u)[0]].length;
    const trailN = [...folded.match(/[^\p{L}\p{N}*]*$/u)[0]].length;
    const lead = chars.slice(0, leadN).join('');
    const trail = (trailN ? chars.slice(chars.length - trailN).join('') : '').replace(/[!@$+]/g, '');
    return `${lead}***${trail}`;
  });
}

/** true when the word filter would mask something in this text (a rule-based profanity hit). */
export function hasProfanity(value) {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('data:')) return false;
  const s = value.normalize('NFC').replace(/[\p{Cf}\u00ad]/gu, '');
  const n = (x) => (x.match(/\*\*\*/g) || []).length;
  return n(maskWords(s)) > n(s);
}

/** Clean one string. Returns the cleaned string (possibly unchanged). */
export function cleanText(value) {
  if (typeof value !== 'string' || value.startsWith('data:image/')) return value;
  let s = value.normalize('NFC')
    .replace(URL_RE, (m) => (OWN.test(m.replace(/^https?:\/\//i, '')) || DEGREE.test(m) ? m : ''))
    .replace(/\s{2,}/g, ' ').trim();
  // zero-width and format characters are never shown on a TV: remove them before anything else
  s = maskWords(s.replace(/[\p{Cf}\u00ad]/gu, ''));
  if ([...s].length > MAX_TEXT) s = `${[...s].slice(0, MAX_TEXT - 1).join('').trimEnd()}…`;
  return s;
}

/** Deep-clean every string in a value. Keys in `keep` (urls for QR codes, images) are left as they are. */
export function cleanDeep(v, keep = new Set(['qr', 'url', 'image'])) {
  if (typeof v === 'string') return cleanText(v);
  if (Array.isArray(v)) return v.map((x) => cleanDeep(x, keep));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, keep.has(k) ? x : cleanDeep(x, keep)]));
  return v;
}
