// Deterministic backstop for the ONE free model line (the phone-only `note`), on top of core's judge (CHECK-18 N2).
// A note that fails is replaced by a reviewed line. "Where in doubt, drop it": false positives only cost variety.
import { BLOCKLIST } from './names.js';
import { BRANDS } from './brands.js';

// Brand entries that are also everyday English or Hindi words are skipped for the note only (names keep the full list).
const EVERYDAY = new Set(['idea', 'apna', 'chalo', 'josh', 'moj', 'koo', 'jar', 'nothing', 'stage', 'housing', 'booking', 'target', 'steam', 'beats', 'noise',
  'slice', 'flames', 'scout', 'monster', 'liberty', 'lifestyle', 'trends', 'threads', 'signal', 'windows', 'chrome', 'zoom', 'notion', 'hinge', 'more', 'time',
  'sting', 'perk', 'munch', 'bingo', 'vans', 'sugar', 'plum', 'minimalist', 'wow', 'mochi', 'campus', 'aha', 'navi', 'simpl', 'uni', 'mortal', 'valve', 'hero', 'max',
  'dukaan', 'udaan', 'housing', 'meta', 'visa', 'dove', 'bounce', 'loco', 'idea', 'cred', 'slack', 'canva', 'figma', 'plum', 'presto', 'stanza', 'scaler']);
const BRAND_SET = [...new Set([...BLOCKLIST, ...BRANDS].map((b) => b.toLowerCase().replace(/[^a-z0-9]/g, '')))].filter((b) => b && !EVERYDAY.has(b));
// money, funding, valuation, earnings and guarantee promises; handles, links, contact asks; long digit runs
const MONEY = /₹|\brs\.?\s*\d|\brupa?y|\brupee|\bcrore|\bcr\b|\blakh|\blac\b|\bfund|\binvest|valuation|unicorn|\bipo\b|profit|kama[oiu]|kamai|\bpaisa\b|\bpaise\b|\bameer|\brich\b|millionaire|billionaire|guarantee|gaurantee|garanti|pakk[aie]|pukka|\bpromise|\bvaa?da\b|\b100\s*%|success pakki|bada banega|sabse bada|no\.?\s*1\b/i;
const CONTACT = /@|https?:|www\.|\.(?:com|in|io|ai|co)\b|insta|instagram|whatsapp|youtube|telegram|snapchat|follow|subscribe|\bdm\b|\bcall\b|\d{5,}/i;

// Spelled-out links and handles ("dot com", "at the rate", "underscore") (CHECK-18 round 3)
const SPELLED = /\bdot\s*(?:com|in|co|net|org|io|ai)\b|\bat\s*the\s*rate\b|\battherate\b|[[(]\s*(?:at|dot)\s*[)\]]|\bunderscore\b|\bslash\b/i;
// Institutes and schools by name or kind (a note must never name or point at one)
const INSTITUTE = /\b(?:iit|iits|iim|iims|nit|nits|iiit|iiits|aiims|bits|bitsat|jnu|du|vit|srm|lpu|amity|manipal|ashoka|krmu|nift|nid|isb|xlri|nlu|dps|kv|kendriya|navodaya|jee|neet|cuet|university|universities|universiti|college|colleges|school|schools|vidyalaya|vidyapeeth|academy|institute|coaching|mahavidyalaya)\b/i;
// Number words, English and Hindi: 4 or more in one note looks like a phone number read out
const NUMWORD = /^(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|double|triple|shunya|shoonya|ek|do|teen|tin|char|chaar|paanch|panch|chhe|chhah|chheh|saat|sat|aath|ath|nau|no|das)$/i;

export function noteOk(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 120) return false;
  if (/[\u2013\u2014<>{}]/.test(text) || MONEY.test(text) || CONTACT.test(text) || SPELLED.test(text) || INSTITUTE.test(text)) return false;
  if (text.split(/[^a-z]+/i).filter((w) => NUMWORD.test(w)).length >= 4) return false;
  if ((text.match(/\d/g) || []).length >= 5) return false; // digits spread out ("98 76 54")
  // a brand is a word, or 2 or 3 words written together ("burger king"), or a 6+ letter brand inside a word ("Zomatowala")
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const grams = new Set(words.flatMap((w, i) => [w, w + (words[i + 1] || ''), w + (words[i + 1] || '') + (words[i + 2] || '')]));
  return !BRAND_SET.some((b) => grams.has(b) || (b.length >= 6 && words.some((w) => w.includes(b))));
}
