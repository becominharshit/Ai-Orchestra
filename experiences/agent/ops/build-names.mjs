// Builds data/names.json, the first-name allow-list (CHECK-19 F5, rounds 4 and 5), from the hand-written sources in
// data/names-src/ plus generated forms, and scans every generated form. Run: node experiences/agent/ops/build-names.mjs
//   curated   hand-written names (latin-*.txt, deva-*.txt) and screened Western first names from the macOS system list
//             /usr/share/dict/propernames (read only, nothing downloaded)
//   generated regional spelling variants of the Indian curated names only (one
//             change at a time, rules in the direction they are used; odd-looking forms like 'bhh' or 'iii' dropped),
//             Devanagari forms without nukta
// A generated form is dropped if it equals, or (4+ letters) contains, a bad token (data/names-src/bad-tokens.txt:
// core profanity roots and Devanagari list, our blocklists, the checker's bad set, English insults), if core's profanity
// filter flags it, or if it is an English dictionary word (that is where junk like "Git" came from).
// Never in either list: surnames, caste or community markers, religious terms (DROP below).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hasProfanity } from '../../../core/server/textfilter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'data', 'names-src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const LAT = /^[a-z]{2,12}$/;
const DEV = /^[\u0900-\u097F]{2,12}$/u;

const DROP = new Set(`tamil naga gandu pappi rengma sanjenbam dhamma metta kh kumar devi roy das sen singh kaur sharma verma gupta khan
sheikh syed ansari qureshi patel shah desai reddy naidu nair menon pillai iyer iyengar chettiar gounder thevar yadav jat gujjar rajput thakur
pandit mishra tiwari dubey pandey chaudhary chauhan rathore bhatt joshi kulkarni deshpande banerjee chatterjee mukherjee ghosh bose dutta
brahmin dalit harijan chamar bhangi jatav valmiki kurmi koeri teli nai dhobi mallah kahar lohar sonar ahir munda oraon santhal gond bhil
hindu muslim sikh christian jain buddhist isai god allah jesus lucifer bhagwan guru waheguru sherpa lovely mohd pahan mirza meitei tamang
kempegowda appa sardool sadhu chanu dick randy nigel dawood jilani nawab jadav`.split(/\s+/));
// CHECK-19 round 5 F7: entries the checker flagged (not names, derogatory, vulgar, a sect, a politician's nickname, junk)
const REMOVE = new Set(`gypsy rodent rogue vice willie budhu budhoo buddhu plastic spy the those trying think old part list space real sanity
tolerant shatter stagger panacea sunni shia hva wic leest neeck pheell thodd knoot wizo sedobic soogih volfgang lalu brandi choden`.split(/\s+/));
const REMOVE_DEVA = new Set(['लालू', 'बुधु', 'बुद्धू']);
// English insult or vulgar substrings a generated form may not contain (curated names are reviewed one by one instead)
const INSULT_SUB = ['fool', 'boob', 'wine', 'ass', 'dumb', 'piss', 'crap', 'butt', 'poop', 'fart', 'sexy', 'nude', 'porn', 'kill', 'dead', 'slut', 'shit', 'dick', 'cock', 'tits', 'rape', 'hell', 'damn', 'drug', 'beer', 'vodka', 'idiot', 'stupid'];
const tokens = read('bad-tokens.txt').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const latTok = tokens.filter((t) => LAT.test(t) || /^[a-z]+$/.test(t));
const devTok = tokens.filter((t) => /[\u0900-\u097F]/.test(t));
const english = new Set(fs.existsSync('/usr/share/dict/words') ? fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n').filter((w) => w && w === w.toLowerCase()) : []);

/** Why a generated Latin form is unsafe ('' = fine). */
export function generatedProblem(n) {
  if (DROP.has(n) || REMOVE.has(n)) return 'marker';
  if (n.length < 5) return 'short'; // generated forms of 4 letters or fewer read like typos (Parb, Saan)
  if (INSULT_SUB.some((t) => n.includes(t))) return 'insult';
  if (english.has(n)) return 'english';
  if (hasProfanity(n)) return 'profanity';
  const sq = n.replace(/(.)\1+/g, '$1'); // doubled letters collapsed: 'dhonnie' is checked as 'donie' and 'dhonie'
  for (const f of [n, sq, n.replace(/h/g, ''), sq.replace(/h/g, '')]) for (const t of latTok) if (f === t || (t.length >= 4 && f.includes(t))) return `token:${t}`;
  return '';
}
export function generatedProblemDeva(n) {
  if (hasProfanity(n)) return 'profanity';
  for (const t of devTok) if (n === t || ([...t].length >= 3 && n.includes(t))) return `token:${t}`;
  return '';
}

function build() {
  const words = (f) => read(f).split(/\s+/).filter(Boolean);
  const latinFiles = fs.readdirSync(SRC).filter((f) => /^latin-\d+\.txt$/.test(f)).sort();
  const devaFiles = fs.readdirSync(SRC).filter((f) => /^deva-\d+\.txt$/.test(f)).sort();
  // curated Indian names (hand-written, reviewed one by one): kept even when also an English word (Asha, Amar, Kiran)
  const curated = new Set();
  const western = new Set();
  const curatedDropped = {};
  const dropC = (why) => { curatedDropped[why] = (curatedDropped[why] || 0) + 1; };
  const badCurated = (n) => (REMOVE.has(n) ? 'flagged' : DROP.has(n) ? 'marker' : hasProfanity(n) ? 'profanity' : latTok.includes(n) ? 'token' : '');
  for (const f of latinFiles) for (const w of words(f)) { const n = w.toLowerCase(); if (!LAT.test(n)) continue; const why = badCurated(n); if (why) dropC(why); else curated.add(n); }
  // screened Western first names from the macOS system list: kept only if NOT an English dictionary word (no Rose, Grace,
  // Rodent, Those ...), and never used as a base for generated spellings (they add nothing for Indian visitors)
  if (fs.existsSync('/usr/share/dict/propernames')) for (const w of fs.readFileSync('/usr/share/dict/propernames', 'utf8').split(/\s+/)) {
    const n = w.toLowerCase(); if (!LAT.test(n) || curated.has(n)) continue;
    const why = badCurated(n) || (english.has(n) ? 'english' : '');
    if (why) dropC(`western_${why}`); else western.add(n);
  }
  const curatedDeva = new Set();
  for (const f of devaFiles) for (const w of words(f)) { const n = w.normalize('NFC'); if (!DEV.test(n)) continue; if (REMOVE_DEVA.has(n) || hasProfanity(n) || devTok.includes(n)) dropC('deva'); else curatedDeva.add(n); }

  const gen = new Set();
  // round 6: no blind prefix + suffix compounds any more (they made forms like Avbir or Svaankar); real compounds are in the hand-written lists
  // generated: regional spelling variants of curated names and compounds
  // one change at a time; each rule is a real regional spelling habit, written in the direction it is used
  // Reviewed transliteration rules (round 6): only spellings Indian families really use, in the direction they are used.
  //   ee/i      Preeti/Priti, Deepak/Dipak       i -> ee only before a final t, p, n, k or l (Jit/Jeet, Dip/Deep)
  //   oo -> u   Pooja/Puja                        w -> v (Waseem/Vaseem)     ph -> f (Phiroz/Firoz)
  //   th/t      Karthik/Kartik, Tarun/Tharun      dh -> d (Dhivya/Divya)     final v -> b (Gaurav/Gaurab, Sourav/Sourab)
  //   au/ou     Kaushik/Koushik                   sh -> s at the start (Shubham/Subham)   Lakshmi -> Laxmi only
  //   aa -> a at the start (Aarav/Arav), iya/ia at the end (Priya/Pria), y -> i at the end (Pinky/Pinki)
  //   t -> th only at the start or after r (Tarun/Tharun, Kartik/Karthik). Western names never get variants.
  const RULES = [[/ee/g, 'i'], [/(?<=[^aeiou])i(?=[tpnkl]$)/g, 'ee'], [/oo/g, 'u'], [/(?<!s)w/g, 'v'], [/ph/g, 'f'], [/th(?=[aeiou])/g, 't'], [/^t(?=[aeiou])/g, 'th'], [/(?<=r)t(?=[aeiou])/g, 'th'],
    [/dh/g, 'd'], [/v$/g, 'b'], [/au/g, 'ou'], [/ou/g, 'au'], [/^sh/g, 's'], [/(?<=^la)ksh(?=m)/g, 'x'], [/^aa/g, 'a'], [/iya$/g, 'ia'], [/ia$/g, 'iya'], [/y$/g, 'i']];
  const looksOdd = (v) => /hh|aaa|eee|iii|ooo|uuu|yy|ww|vv|[^aeiouy]{4}|ii(?!$)|^[^aeiouy]{3}/.test(v);
  const westernish = new Set(fs.existsSync('/usr/share/dict/propernames') ? fs.readFileSync('/usr/share/dict/propernames', 'utf8').split(/\s+/).map((w) => w.toLowerCase()) : []);
  for (const l of [...curated, ...gen].filter((n) => !westernish.has(n))) { // Indian curated names only
    for (const [re, to] of RULES) {
      for (const m of l.matchAll(re)) { const v = l.slice(0, m.index) + to + l.slice(m.index + m[0].length); if (v.length >= 3 && LAT.test(v) && !looksOdd(v)) gen.add(v); }
    }
  }
  for (const n of [...curated, ...western]) gen.delete(n);
  const genDeva = new Set([...curatedDeva].map((w) => w.replace(/\u093c/g, '')).filter((w) => !curatedDeva.has(w) && DEV.test(w)));

  // the scan: generated forms only; curated hits are reported for review
  const dropped = {};
  const keptGen = [...gen].filter((n) => { const why = generatedProblem(n); if (why) dropped[why.split(':')[0]] = (dropped[why.split(':')[0]] || 0) + 1; return !why; });
  const keptGenDeva = [...genDeva].filter((n) => !generatedProblemDeva(n));
  const curatedHits = [];
  const cap = (n) => n[0].toUpperCase() + n.slice(1);
  const out = {
    _about: 'Allow-list for the optional first name (CHANGE-02a update 2, CHECK-19 F5, rounds 4 and 5). Built by experiences/agent/ops/build-names.mjs: "curated" = hand-written first names across Indian communities and regions (data/names-src) plus screened Western first names from the macOS system list; "generated" = compounds and regional spelling variants that passed the scan (no bad token equal or contained, no profanity, no English dictionary word). No surnames, caste or community markers, religious terms, slurs or public-figure full names. Round 6: a first name is shown (phone and Agent card) only if it is on this list AND passes every check; anything else becomes a picked nickname. Western names come from the macOS system list only if they are not English dictionary words, and generated spellings come only from the Indian curated names.',
    counts: { latinCurated: curated.size, latinWestern: western.size, latinGenerated: keptGen.length, devaCurated: curatedDeva.size, devaGenerated: keptGenDeva.length, indianTotal: curated.size + keptGen.length + curatedDeva.size + keptGenDeva.length, curatedDropped, generatedDropped: dropped },
    latinCurated: [...curated].sort().map(cap), latinWestern: [...western].sort().map(cap), latinGenerated: keptGen.sort().map(cap), devaCurated: [...curatedDeva].sort(), devaGenerated: keptGenDeva.sort(),
  };
  fs.writeFileSync(path.join(HERE, '..', 'data', 'names.json'), JSON.stringify(out));
  return { counts: out.counts, curatedHits };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { counts, curatedHits } = build();
  console.log(JSON.stringify(counts));
  if (curatedHits.length) console.log('curated names to review:', curatedHits.map((x) => x.join('=')).join(' '));
}
