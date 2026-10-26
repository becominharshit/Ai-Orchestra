// Output guard for AI Jyotish. Every reading (live Claude, mock and fixture) passes through here before it
// reaches a phone or the TV. Rules: nothing negative, medical, death, illness, breakup/romance, exam-fail,
// money-loss or guarantee; no body or looks talk; no em/en dashes; no personal details echoed back.
//
//   guardReading(data, { fallback, place })  -> { data, rewrites, rejected, hits }
//   (Dating and Health are not free text any more: lib/banks.js)
//
// A line that breaks a rule is REWRITTEN with the same slot from `fallback` (a hand-written fixture for the
// same sign or number, which is itself checked by test/jyotish/guard.test.js). If more than a third of the lines
// break rules the whole answer is REJECTED and the server answers the fixture instead.
// `hits` lists rule names only (never the text), so it is safe to log as a count.

// Matching runs on a NORMALISED copy of the line, so Hinglish spelling variants collapse to one form:
// lower case, punctuation -> space, "ee" -> "i", "oo" -> "u", doubled letters -> one ("bimaaar" = "bimar",
// "chhod" = "chod", "nuksaan" = "nuksan"). Word lists below are written naturally and normalised the same way.
// "word*" = the word and anything that continues it (stems: "guzar*" catches guzar, guzarenge, guzar gaye).
export function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
    .replace(/([a-z])\1{2,}/g, '$1$1') // "tooot" -> "toot" first
    .replace(/ee/g, 'i').replace(/oo/g, 'u')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/\s+/g, ' ').trim();
}
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function words(list) {
  const parts = list.map((w) => {
    const star = w.endsWith('*');
    const body = norm(star ? w.slice(0, -1) : w).split(' ').map(esc).join('\\s+');
    return star ? `${body}\\w*` : body;
  });
  return new RegExp(`\\b(?:${parts.join('|')})\\b`);
}

// Each rule: [name, regex on the normalised line]. Review rule: if in doubt, add it; a false positive only swaps in a
// curated line, a miss reaches a 14-year-old on a 55-inch TV. Every add needs a probe in test/jyotish/probes.js.
export const RULES = [
  ['death', words(['death*', 'dead', 'die', 'dies', 'died', 'dying', 'maut', 'mrityu', 'dehant', 'guzar*', 'pass away', 'passed away', 'khatam*', 'marna', 'marne', 'maroge', 'marogi', 'marenge', 'mar ja*', 'mar gay*', 'mar sakt*', 'accident*', 'hadsa', 'hadse', 'funeral', 'suicide', 'kill*', 'khoon', 'blood', 'weapon*', 'jaan ko', 'life end', 'end ho ja*', 'kho doge', 'kho dogi', 'kho denge', 'kho jaoge', 'leave you', 'alvida', 'shraddhanjali', 'antim', 'rishtedar*', 'relative*'])],
  ['medical', words(['ill', 'illness', 'sick*', 'disease*', 'bimar*', 'beemar*', 'cancer', 'tumor', 'tumour', 'hospital*', 'surgery', 'injur*', 'fracture', 'chot', 'bukhar', 'fever', 'medicine*', 'dawai', 'dawa', 'depress*', 'anxiety', 'anxious', 'stress*', 'tension', 'panic', 'therapy', 'diabet*', 'bp', 'blood pressure', 'allerg*', 'supplement*', 'vitamin*', 'detox', 'cure', 'ilaaj', 'ilaj', 'sehat', 'health', 'sardi', 'khansi', 'zukam', 'jukam', 'cough', 'cold lag*', 'headache*', 'dard', 'pain*', 'thakan', 'thak ja*', 'neend ki kami', 'insomnia', 'burnout', 'immunity', 'mental', 'doctor ke', 'problem*', 'dhyan rakhna', 'dhyan rakho', 'bachna', 'bachke', 'bacho', 'bachiye', 'emergency', 'operation se', 'tabiyat*', 'tabiyaat*', 'unwell', 'bigdegi', 'bigdega'])],
  ['body', words(['weight*', 'wazan', 'vajan', 'fat', 'fatty', 'mota', 'moti', 'motapa', 'patla', 'patli', 'dubla', 'dubli', 'skinny', 'slim', 'skin*', 'pimple*', 'acne', 'gora', 'gori', 'fairness', 'ugly', 'looks', 'looking', 'bmi', 'calorie*', 'belly', 'tummy', 'six pack', 'chubby', 'overweight', 'underweight', 'height', 'tumhare baal', 'tumhari zulf', 'hair*', 'handsome', 'gorgeous', 'beautiful', 'beauty', 'sundar', 'khoobsurat', 'khubsurat', 'cute', 'cutie', 'hot', 'hottie', 'sexy', 'body', 'fit', 'fitness', 'gym', 'muscle*', 'abs', 'dark circle*', 'chhaati', 'chest', 'figure', 'glow karegi', 'face', 'chehra'])],
  ['diet', words(['diet*', 'fasting', 'junk', 'cold drink*', 'sugar', 'maida', 'fried', 'oily', 'sweets', 'mithai kam', 'kam khao', 'kam khana', 'mat khao', 'protein', 'vegan', 'keto', 'nashta skip', 'healthy', 'chai number', 'maggi at midnight', 'carbs', 'avoid*', 'khana chhod*'])],
  ['romance', words(['break up*', 'breakup*', 'brekup*', 'heart break*', 'heartbreak*', 'dil toot*', 'dil tut*', 'dil tod*', 'ex', 'exes', 'cheat*', 'dhoka', 'dhokha', 'bewafa*', 'divorce', 'shaadi', 'shadi', 'marriage', 'married', 'wedding', 'boyfriend*', 'girlfriend*', 'bf', 'gf', 'sex*', 'hook up', 'hookup', 'date', 'dates', 'dating', 'romance', 'romantic', 'propose*', 'soulmate', 'jaanu', 'babu', 'love*', 'lover', 'pyaar*', 'pyar*', 'ishq', 'mohabbat', 'valentine*', 'flirt*', 'special someone', 'koi special', 'partner*', 'chemistry', 'hug*', 'rizz', 'charm*', 'dil jeet*', 'dil jit*', 'jisko pasand', 'pasand karoge', 'pasand karogi', 'pasand nahi', 'toofan', 'love life', 'single', 'impress*', 'notice karega', 'notice karegi'])],
  ['exam', words(['fail*', 'fel ho', 'backlog*', 'compartment', 're exam', 'marks kam', 'kam marks', 'low marks', 'number kam', 'kam number', 'ratta', 'rank*', 'topper', 'iit', 'jee', 'neet', 'board exam*', 'exam*', 'paper mein', 'result*', 'padhai mein mann', 'pass hona'])],
  ['money', words(['loss', 'losses', 'lose*', 'losing', 'nuksaan', 'nuksan', 'nukhsan', 'debt', 'karz*', 'karja', 'udhaar', 'udhar', 'bankrupt*', 'kangal', 'kangaal', 'garib', 'gareeb', 'poor', 'scam*', 'fraud', 'paisa*', 'paise*', 'udd jayega', 'ud jayega', 'saving*', 'kharcha', 'kharch', 'investment*', 'ghata', 'ghate', 'crorepati', 'millionaire', 'billionaire', 'ameer', 'rich', 'earning*', 'income', 'money', 'rupaye', 'rupay*', 'rs'])],
  ['guarantee', words(['guarantee*', 'guaranteed', 'pakka', 'pakki', '100', 'placement*', 'package', 'salary', 'salaries', 'lakh*', 'crore*', 'lpa', 'ctc', 'job milegi', 'job milega', 'sure shot', 'selection'])],
  ['negative', words(['bad luck', 'badkismat*', 'badqismat*', 'bura', 'buri', 'bure', 'kharab*', 'curse*', 'shraap', 'shrap', 'dosh', 'manglik', 'kaal sarp', 'kal sarp', 'sade sati', 'shani', 'rahu', 'ketu', 'danger*', 'khatra', 'khatre', 'warning*', 'beware', 'saavdhan', 'savdhan', 'dukh*', 'rona', 'roge', 'aansu', 'tears', 'sad', 'sadness', 'udaas', 'udas', 'fear', 'darr', 'dar', 'nightmare', 'struggle*', 'pareshan*', 'takleef', 'musibat', 'enemy', 'enemies', 'dushman', 'jealous*', 'jalega', 'jalegi', 'jalenge', 'jalan', 'jalte', 'nazar lag*', 'buri nazar', 'evil', 'bhoot', 'ghost', 'lonely', 'akela*', 'akeli', 'akele', 'alone', 'hate', 'nafrat', 'gussa', 'angry', 'regret', 'pachta*', 'lazy', 'aalsi', 'weak', 'kamzor*', 'loser', 'jail', 'police', 'dikkat*', 'mushkil*', 'har jao', 'har jaoge', 'har jaogi', 'har jayega', 'har jayegi', 'har jaoge', 'har gay*', 'haroge', 'harenge', 'harna', 'chinta*', 'bekar', 'bekaar', 'galat*', 'late ho ja*', 'cancel*', 'nahi kar pa*', 'nahi kar sak*', 'nahi hoga', 'nahi hogi', 'nahi honge', 'nahi milega', 'nahi milegi', 'nahi bachenge', 'nahi lagega', 'nahi karna chahiye', 'bharosa nahi', 'go wrong', 'wrong', 'careful', 'overthink*', 'shy', 'door ho ja*', 'door rehte', 'door reh*', 'reject*', 'chhod*', 'bhool ja*', 'bhool jay*', 'trouble*', 'worry', 'worried', 'unlucky', 'misfortune', 'tragedy', 'bad news', 'sorry', 'fight*', 'jhagd*', 'jhagr*', 'ladai', 'gire', 'girna', 'giroge', 'tootega', 'tutega', 'barbaad*', 'barbad*', 'tabah', 'bach ke', 'kabhi nahi milega', 'na kare'])],
];
// CHECK-02b (fresh natural phrasings): exams, family, friends, looks, money, body, diet and "subtle" negatives.
// The keyword guard is the third layer; the judge (fail closed) and the reviewed TV banks are the first two.
RULES.push(['subtle', words([
  'tough', 'confidence hil*', 'blank', 'grade*', 'drop*', 'khush nahi', 'cutoff', 'cut off', 'miss ho*', 'ghabra*', 'peeche reh*', 'peeche rah*', 'dobara dena', 'niche aay*', 'niche ja*', 'last bench*',
  'anban', 'naraz*', 'naaraz*', 'not understand', 'understand', 'tense', 'band kar*', 'band ho*', 'ignore*', 'mana kar*', 'door jao*', 'door jaoge', 'yaad bahut',
  'mummy', 'mumma', 'mom', 'papa', 'dad', 'daddy', 'dadi', 'dada', 'nani', 'nana', 'parents', 'parent', 'family', 'behen', 'bhai', 'ghar mein', 'ghar ka', 'chacha', 'chachi', 'mausi', 'bua', 'rishta*', 'rishte', 'uljh*',
  'chakkar', 'drained', 'energy low', 'low rah*', 'low feel*',
  'wallet', 'kho jay*', 'kho jaa*', 'kho de*', 'mehengai', 'mehenga*', 'budget', 'phas*', 'phans*', 'repair', 'thag*', 'scholarship', 'chhoot ja*', 'chhoot sak*', 'chhoot gay*', 'chhootega', 'chhootegi', 'chhut ja*', 'chhut gay*', 'chhutega', 'chhutegi', 'nahi bachega', 'nahi bachegi',
  'jagah kam', 'samjhenge nahi', 'samjhega nahi', 'peeth peeche', 'kisi aur ke saath', 'busy rahega', 'stop repl*', 'nazarandaz*', 'maanta hi nahi', 'maanta nahi', 'nahi maanta',
  'dikhoge', 'dikhogi', 'dikhte ho', 'dikhti ho', 'achhe nahi', 'ache nahi', 'acche nahi', 'nahi lagte', 'nahi lagti', 'crooked', 'kapdon', 'kapde', 'look', 'tired', 'ajeeb', 'average', 'daant', 'tedhe', 'tedha', 'adorable', 'selfie',
  'someone special', 'special', 'leave your life', 'texting',
  'slow', 'aakhri', 'pet', 'kasrat', 'bhari', 'bhaari',
  'roti', 'khani chahiye', 'khana chahiye', 'suit nahi', 'bahar ka khana', 'binge eating', 'eating', 'eat', 'eat clean',
  'mutabik nahi', 'nahi chalega', 'nahi chalegi', 'door lag*', 'shak', 'your way', 'might not', 'may not', 'bharosa tod*', 'tod sak*', 'tod de*', 'setback*', 'purane nahi', 'raste band', 'band hone', 'underestimate*', 'kismat*', 'rooth*', 'nahi rahenge', 'nahi rahega', 'nahi rahegi', 'mushkil time',
])]);

// a few patterns that must see the original spelling (normalising would collide with other words)
export const RAW_RULES = [
  ['romance', /\bkiss\w*/i],
  ['negative', /\bhaa+r\w*/i],
  ['subtle', /\bkam\s+aa(?:yenge|yega|yegi|ye|ega|ega|sakte|sakta|sakti)\b|\bse\s+kam\b/i], // "kam" (less) vs "kaam" (work): original spelling // "haar" = lose; normalised it would equal "har" (every)
  ['romance', /\bcrush\b(?!\s+(it|kar|karoge|karogi|karna|karega|karegi|kiya)\b)/i],
  ['guarantee', /\d+\s?%/],
  ['money', /₹/],
];

const MAX_LEN = 120;

/** Normalise one line: dashes, whitespace, handles, URLs, dates, place, length. */
export function tidy(s, { place = '' } = {}) {
  let t = String(s ?? '');
  t = t.replace(/\s*[\u2014\u2013\u2012\u2015]\s*/g, ', '); // em/en/figure dashes -> comma
  t = t.replace(/https?:\/\/\S+/gi, '').replace(/(^|\s)@[A-Za-z0-9_.]+/g, '$1');
  t = t.replace(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g, '').replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
  if (place) {
    for (const w of String(place).split(/[^A-Za-zऀ-ॿ]+/).filter((x) => x.length >= 3)) {
      t = t.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), 'tumhara shehar');
    }
  }
  t = t.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/,\s*,/g, ',').replace(/^[,\s]+/, '').trim();
  if (t.length > MAX_LEN) {
    const cut = t.slice(0, MAX_LEN);
    t = `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60)).replace(/[,\s]+$/, '')}.`;
  }
  return t;
}

/** Name of the first rule a line breaks, or null. */
export function breaks(s) {
  const n = norm(s);
  for (const [name, re] of RULES) if (re.test(n)) return name;
  for (const [name, re] of RAW_RULES) if (re.test(String(s || ''))) return name;
  return null;
}

/**
 * Walk `data` against `fallback` (same shape). For every string: tidy it, and if it breaks a rule or is empty,
 * use the fallback's string at the same path. Arrays are cut or padded to `counts[path]`.
 */
function guardTree(data, fallback, { counts = {}, place = '', skip = new Set() } = {}) {
  const stat = { lines: 0, rewrites: 0, hits: [] };
  const fix = (v, fb, path) => {
    if (skip.has(path)) return v;
    if (Array.isArray(fb)) {
      const want = counts[path] ?? fb.length;
      const src = Array.isArray(v) ? v : [];
      const out = [];
      for (let i = 0; i < want; i++) out.push(fix(src[i], fb[i] ?? fb[fb.length - 1], `${path}[]`));
      return out;
    }
    if (fb && typeof fb === 'object') {
      const out = {};
      for (const k of Object.keys(fb)) out[k] = fix(v && typeof v === 'object' ? v[k] : undefined, fb[k], path ? `${path}.${k}` : k);
      return out;
    }
    if (typeof fb === 'string') {
      stat.lines += 1;
      const t = typeof v === 'string' ? tidy(v, { place }) : '';
      const rule = t ? breaks(t) : 'empty';
      if (!rule) return t;
      stat.rewrites += 1;
      stat.hits.push(rule);
      return tidy(fb, { place });
    }
    return v === undefined ? fb : v;
  };
  const out = fix(data, fallback, '');
  return { data: out, ...stat };
}

const READING_COUNTS = { who: 3, past: 3, future: 3, 'career.read': 2, 'career.learn': 3, 'career.roles': 3 };

/** Guard a reading. `fallback` = the fixture for the same sign. Palm geometry is checked in palmlines.cleanLines. */
export function guardReading(data, { fallback, place = '' } = {}) {
  const fbText = { title: fallback.title, who: fallback.who, past: fallback.past, future: fallback.future, career: fallback.career, tvLine: fallback.tvLine };
  const g = guardTree(data, fbText, { counts: READING_COUNTS, place });
  // palm meanings: rewrite unsafe ones with the stock meaning for that kind
  const lines = Array.isArray(data?.palm?.lines) ? data.palm.lines : [];
  const meanings = {};
  for (const l of lines) {
    if (!l || typeof l.meaning !== 'string') continue;
    g.lines += 1;
    const t = tidy(l.meaning, { place });
    const rule = t ? breaks(t) : 'empty';
    if (rule) { g.rewrites += 1; g.hits.push(rule); meanings[l.kind] = ''; } else meanings[l.kind] = t;
  }
  const rejected = g.rewrites > Math.ceil(g.lines / 3);
  return { data: { ...g.data, meanings }, rewrites: g.rewrites, lines: g.lines, rejected, hits: g.hits };
}
