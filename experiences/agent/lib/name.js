// Optional first name (CHANGE-02a update 2, a controlled exception to CHECK_build 13 for this experience only).
// Shown ONLY in the visitor's phone result and on their downloadable Agent card. Never on the TV, the bus, cards
// built from publicText, pages, analytics or logs, and never stored beyond the request.
// Accepted only when ALL pass: on the allow-list, shape (one word, 2..12 letters, Latin or Devanagari, no mixing, NFKC), core's profanity
// filter (plain and leetspeak-folded), our blocklist (full names and handles of famous people, politics, brands,
// insults; first names a celebrity shares are fine) and the live AI check.
// Anything else falls back silently to the generated agent nickname: no error is ever shown.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasProfanity, cleanText } from '../../../core/server/textfilter.js';
import { normalise } from './guard.js';

// CHECK-19 F5 + round 6 (lead decision, F6): one rule. A first name is shown (phone result and Agent card) only if it is
// on the allow-list (data/names.json, built by ops/build-names.mjs) AND passes every check below AND the live check.
// Anything else, in every mode, silently becomes a nickname the visitor picks (never a word about rejection).
const LIST = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'names.json'), 'utf8'));
const ALLOWED = new Set([...LIST.latinCurated, ...(LIST.latinWestern || []), ...LIST.latinGenerated].map((n) => n.toLowerCase()).concat([...LIST.devaCurated, ...LIST.devaGenerated].map((n) => n.normalize('NFC'))));
// Bad tokens (core profanity roots, caste and religious slurs, the checker's bad set, famous surnames and handles,
// English insults): a name may not equal one, and a long name (8+ letters, a full-name combo) may not contain one of 5+.
const TOKENS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'names-src', 'bad-tokens.txt'), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const TOKEN_SET = new Set(TOKENS.map((t) => t.toLowerCase()));
const LONG_TOKENS = TOKENS.filter((t) => [...t].length >= 5).map((t) => t.toLowerCase());
export function hitsToken(name) {
  const low = name.toLowerCase().normalize('NFC');
  const forms = [low, low.replace(/(.)\1+/g, '$1'), low.replace(/h/g, '')];
  return forms.some((f) => TOKEN_SET.has(f) || ([...f].length >= 8 && LONG_TOKENS.some((t) => f.includes(t))));
}
export const onAllowList = (name) => ALLOWED.has(/^[A-Za-z]+$/.test(name) ? name.toLowerCase() : name.normalize('NFC'));
export const allowListSize = () => ALLOWED.size;

const LATIN = /^[A-Za-z]{2,12}$/;
const DEVA = /^[\u0900-\u0963\u0966-\u097F]{2,12}$/u; // Devanagari letters and signs, no danda punctuation

// Names that point at a real famous person, a political figure, a brand or an insult when used alone. Common
// Indian first names are NOT here (a visitor called Virat or Rahul is fine): only surnames, nicknames and
// handles that read as someone else, plus words that are never a name.
const BLOCK = /^(?:kohli|dhoni|msd|tendulkar|sachinji|srk|salmankhan|shahrukhkhan|bhaijaan|bachchan|amitabhji|modi|modiji|kejriwal|gandhi|yogiji|trump|biden|putin|musk|elonmusk|hitler|osama|ambani|adani|tata|apple|google|amazon|flipkart|zomato|swiggy|byjus|unacademy|physicswallah|admin|staff|zenith|test|null|undefined|anonymous|nobody|noname|loser|idiot|stupid|chutiya|kamina|kamine|kutta|kutti|suar|gadha|ullu|pagal|bewakoof|nalayak|harami|madarchod|behenchod|bhosdi|randi|chakka|hijra|sexy|hot|baby|daddy|mummy|papa|god|bhagwan|allah|jesus)$/;
const BLOCK_DEVA = /^(?:मोदी|गांधी|केजरीवाल|कोहली|धोनी|तेंदुलकर|बच्चन|अंबानी|अडानी|हिटलर|कुत्ता|कुत्ती|गधा|उल्लू|पागल|कमीना|हरामी|चूतिया|रंडी|छक्का|हिजड़ा|भगवान|अल्लाह)$/u;

/** Shape only: the NFKC first name ("riya" -> "Riya") or null. */
export function nameShape(raw) {
  if (typeof raw !== 'string') return null;
  if (/[\p{Cf}\u00ad]/u.test(raw)) return null; // zero-width or format characters: never a plain name
  const s = raw.normalize('NFKC').trim();
  if (LATIN.test(s)) return s[0].toUpperCase() + s.slice(1).toLowerCase();
  if (DEVA.test(s)) return s;
  return null;
}

/** Rules (no model): profanity in any form, blocklist, our pressure and leak rules. */
export function nameRulesOk(name) {
  if (!name) return false;
  const low = name.toLowerCase();
  const folded = normalise(name).replace(/[^a-z\u0900-\u097f]/g, '');
  if (hasProfanity(name) || hasProfanity(low) || hasProfanity(folded) || cleanText(name) !== name) return false;
  if (BLOCK.test(low) || BLOCK.test(folded) || BLOCK_DEVA.test(name) || hitsToken(name) || hitsToken(folded)) return false;
  // (no wording guard here: on a curated name list it only misfires, e.g. Lakhan or Mark)
  return true;
}

export const NAME_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean', description: 'true only if this is a plausible, harmless first name' } }, required: ['ok'] };
export const NAME_SYSTEM = `You check one word that a school student typed as their first name at a fest stall in India.
Answer ok=true only if it is a plausible, harmless personal first name (Indian or other; Latin or Devanagari script).
Answer ok=false for: any insult, slur, swear word or sexual word in any language (Hindi, English, Hinglish or regional, including disguised spellings),
names that clearly point at a famous person, politician, religious figure or brand, words that are not names, or anything you are unsure about.`;
