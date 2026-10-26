// Offline engine: answers in exactly the Claude schema shapes (lib/prompts.js) without any network.
// Used for CLAUDE_MOCK=1, DEMO_MODE / OFFLINE, no key, spend cap, timeouts, and ?demo=hero.
//
//   questionsFor(pitch)  -> a fixture's questions when the pitch matches one of 12 fixture ideas,
//                           otherwise a generic set built from the detected category + keyword.
//   verdictFor(pitch, questions, answers) -> a real (simple) scorer: it reads the pitch and answers for
//                           customer, problem, scale, brand and money signals, so better answers score higher.
// Deterministic: the same pitch and answers always give the same demo verdict.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seeded, pickWith, titleCase } from './text.js';
import { SHARK_IDS } from './prompts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'pitches.json'), 'utf8'));

// ---------- category detection (generic path) ----------
const norm = (s) => ` ${String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
export const CATS = {
  food: ['chai', 'tea', 'coffee', 'food', 'khana', 'tiffin', 'snack', 'snacks', 'momos', 'samosa', 'maggi', 'biryani', 'cafe', 'restaurant', 'juice', 'bakery', 'cake', 'cakes', 'pizza', 'burger', 'canteen', 'kitchen', 'meal', 'thali', 'lassi', 'icecream', 'ice cream', 'paratha', 'dosa'],
  education: ['study', 'padhai', 'notes', 'exam', 'exams', 'tutor', 'tuition', 'coaching', 'homework', 'learn', 'learning', 'course', 'quiz', 'teacher', 'revision', 'books', 'library', 'school'],
  campus: ['hostel', 'college', 'campus', 'laundry', 'roommate', 'mess', 'cycle', 'scooty', 'pg'],
  fitness: ['gym', 'fitness', 'workout', 'yoga', 'running', 'sports', 'cricket', 'football', 'badminton', 'protein', 'diet', 'dance'],
  fashion: ['clothes', 'fashion', 'thrift', 'tshirt', 't shirt', 'sneakers', 'shoes', 'jewellery', 'kurta', 'merch', 'hoodie', 'hoodies', 'style', 'bags', 'watch'],
  environment: ['plant', 'plants', 'eco', 'recycle', 'plastic', 'waste', 'solar', 'compost', 'tree', 'trees', 'sustainable', 'pollution', 'water'],
  gaming: ['game', 'games', 'gaming', 'esports', 'tournament', 'chess', 'minecraft'],
  pets: ['pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'animal', 'animals'],
  travel: ['travel', 'trip', 'trips', 'tour', 'tourism', 'ticket', 'tickets', 'train', 'bus', 'cab', 'hotel'],
  creator: ['youtube', 'instagram', 'reel', 'reels', 'content', 'creator', 'podcast', 'video', 'videos', 'photo', 'photography', 'music', 'art', 'design', 'editing'],
  services: ['repair', 'cleaning', 'delivery', 'service', 'elderly', 'grandparents', 'parents', 'babysitting', 'printing'],
  tech: ['app', 'website', 'ai', 'robot', 'software', 'platform', 'coding', 'chatbot', 'drone', 'gadget', 'device'],
};
const CAT_ORDER = ['food', 'pets', 'fashion', 'environment', 'gaming', 'fitness', 'travel', 'campus', 'education', 'creator', 'services', 'tech'];
const PRETTY = { tshirt: 'T-Shirt', 't shirt': 'T-Shirt', ai: 'AI', pg: 'PG', 'ice cream': 'Ice Cream', esports: 'Esports' };

const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9₹ -]+/g, ' ').split(/\s+/).filter(Boolean);
const has = (s, re) => re.test(String(s).toLowerCase());

export function detect(pitch) {
  const text = norm(pitch);
  let best = { cat: 'other', kw: null, hits: 0, at: Infinity };
  for (const cat of CAT_ORDER) {
    let hits = 0;
    let first = null;
    let at = Infinity;
    for (const k of CATS[cat]) {
      const i = text.indexOf(` ${k} `);
      if (i >= 0) { hits += 1; if (i < at && !['app', 'website', 'platform', 'service', 'school', 'college'].includes(k)) { at = i; first = k; } }
    }
    if (hits > best.hits) best = { cat, kw: first || CATS[cat].find((k) => text.includes(` ${k} `)), hits, at };
  }
  return best;
}

// Titles only ever use our own keyword lists (never visitor words), so they are TV-safe by construction.
const GENERIC_KW = new Set(['app', 'website', 'platform', 'service', 'software', 'device', 'gadget', 'school', 'college', 'course']);
const CAT_TITLES = {
  food: ['Desi Food Startup', 'Tasty Food Idea'], education: ['Smart Study Idea', 'Study Help Startup'], campus: ['Campus Life Startup', 'Hostel Helper Idea'],
  fitness: ['Fit Life Startup', 'Fitness Fun Idea'], fashion: ['Style Startup', 'Fresh Fashion Idea'], environment: ['Green Planet Idea', 'Eco Startup'],
  gaming: ['Game On Startup', 'Fun Gaming Idea'], pets: ['Pet Care Idea', 'Happy Pets Startup'], travel: ['Smart Travel Idea', 'Trip Saver Startup'],
  creator: ['Creator Studio Idea', 'Content Creator Startup'], services: ['Helping Hands Startup', 'Smart Service Idea'], tech: ['Smart Tech Idea', 'Next Gen App Idea'],
  other: ['Next Big Idea', 'Fresh Founder Idea', 'Desi Startup Idea'],
};

export function titleFor(pitch, { cat = 'other', kw } = {}) {
  const p = String(pitch).toLowerCase();
  const rnd = seeded(`t:${pitch}`);
  if (!kw || GENERIC_KW.has(kw)) {
    const t = pickWith(rnd, CAT_TITLES[cat] || CAT_TITLES.other);
    return { title: t, tvTitle: t, cat };
  }
  const noun = PRETTY[kw] || titleCase(kw);
  const kind = /\bapp\b/.test(p) ? 'App' : /\b(store|shop|dukaan|brand)\b/.test(p) ? 'Brand' : /\b(service|helper|delivery)\b/.test(p) && kw !== 'delivery' ? 'Service' : 'Startup';
  const t = `${noun} ${kind}`;
  return { title: t, tvTitle: t, cat };
}

// ---------- fixture match ----------
// keywords[0] is the fixture's own phrase ("pet sitter", "plant care"). A match needs that phrase, or 2+ keywords,
// so "robot that waters plants" gets generic plant questions instead of the plant-subscription fixture.
const hit = (text, k) => text.includes(norm(k)) || (!k.includes(' ') && text.includes(` ${k}s `));

export function matchFixture(pitch, fixtures = FIXTURES) {
  const text = norm(pitch);
  let best = null;
  for (const fx of fixtures) {
    const primary = hit(text, fx.keywords[0]);
    const score = fx.keywords.filter((k) => hit(text, k)).length + (primary ? 2 : 0);
    if (score >= 2 && score > (best?.score || 0)) best = { fx, score };
  }
  return best;
}

// ---------- generic questions ----------
const GENERIC = {
  vc: [
    { q: 'Yeh {kw} idea 1 jagah se 100 shehron tak kaise jaayega?', chips: ['Pehle apna area, phir har city', 'Online, poore India mein', 'Abhi ek jagah perfect karunga'] },
    { q: 'Kitne log roz yeh problem face karte hain? Market kitna bada hai?', chips: ['Har school mein sainkdon log', 'Lakhs log India mein', 'Pakka nahi, survey karunga'] },
    { q: 'Agar kal 1000 customers aa gaye, toh kya badlega?', chips: ['Team aur partners badhaunga', 'App se sab automatic', 'Pehle 10 pe test karunga'] },
  ],
  mkt: [
    { q: 'Tumhara pehla customer kaun hai, aur woh tumhe hi kyun chunega?', chips: ['Mere jaise students', 'Busy parents', 'Abhi pata karna hai'] },
    { q: 'Insta pe iska 3 second ka hook kya hoga?', chips: ['Before vs after reel', 'Dost ke saath funny demo', 'Trending audio pe idea'] },
    { q: 'Brand ka naam aur vibe kya hogi? Ek line mein batao.', chips: ['Desi, fun aur sasta', 'Premium aur cool', 'Naam abhi soch raha hoon'] },
  ],
  fin: [
    { q: 'Ek order pe kitna kharcha, aur kitne mein bechoge?', chips: ['Cost 50, price 99', 'Cost 20, price 40', 'Abhi calculate karna hai'] },
    { q: 'Pehle 100 customers ke liye paisa kahan se aayega?', chips: ['Pocket money se chhota start', 'Pre-orders lunga', 'Ghar walon se chhota support'] },
    { q: 'Subscription loge ya per order? Kyun?', chips: ['Monthly plan, steady paisa', 'Per order, simple', 'Dono try karunga'] },
  ],
};
const HOST = [
  'Naya founder, naya idea! Sharks, kaan khade karo.',
  'Pitch aa gaya hai, sharks ready? Chalo shuru karte hain!',
  'Tank mein fresh idea aaya hai. Sharks, sawaal taiyaar?',
  'Ek aur bold founder! Sharks, dhyaan se suno.',
];

function fill(t, kw) {
  return t.replace('{kw}', kw ? (PRETTY[kw] || kw) : '').replace(/\s+/g, ' ').trim();
}

/** Questions in QUESTIONS_SCHEMA shape. opts.forceId = fixture id (hero). */
export function questionsFor(pitch, { forceId, fixtures = FIXTURES } = {}) {
  const forced = forceId ? fixtures.find((f) => f.id === forceId) : null;
  const m = forced ? { fx: forced } : matchFixture(pitch, fixtures);
  if (m) return structuredClone(m.fx.answer);
  const d = detect(pitch);
  const rnd = seeded(`q:${pitch}`);
  const t = titleFor(pitch, d);
  const q = {};
  for (const id of SHARK_IDS) {
    let opt = pickWith(rnd, GENERIC[id]);
    if (id === 'vc' && !d.kw && opt.q.includes('{kw}')) opt = GENERIC.vc[1];
    q[id] = { q: fill(opt.q, d.kw), chips: [...opt.chips] };
  }
  return {
    safe: true,
    safety: 'ok',
    idea: { title: t.title, tvTitle: t.tvTitle, category: d.cat === 'other' ? 'other' : d.cat },
    hostLine: pickWith(rnd, HOST),
    questions: q,
  };
}

export function fixtureFor(pitch) {
  return matchFixture(pitch)?.fx || null;
}

// ---------- scorer ----------
const SIG = {
  customer: /\b(students?|log|logon|parents|customers?|kids|bachche|bachon|office|families|family|seniors?|owners?|teachers?|dukaan(dar)?|shops?|ke liye|for)\b/,
  problem: /\b(problem|dikkat|pareshan|time waste|waste|mushkil|issue|hard|late|boring|mehnga|mehenga|expensive|nahi milta|thak|tired|bhook)\b/,
  scale: /\b(india|cities|city|shehron|lakhs?|crores?|har|every|franchise|online|app|national|colleges|schools|hostels)\b/,
  brand: /\b(insta|instagram|reels?|brand|naam|logo|influencers?|whatsapp|youtube|hook|viral|community|vibe|story|packaging)\b/,
  money: /(₹|\brs\b|\brupaye|\brupees?|\bprice|\bpaisa|\bpaise|\b\d{2,5}\b)/,
  margin: /\b(cost|margin|profit|munafa|kharcha|subscription|per month|monthly|commission|plan|bachega|bachta|premium|sponsors?)\b/,
  moat: /\b(unique|secret|recipe|community|network|data|first|sirf hum|patent|verified|trust|quality)\b/,
};

function quality(a) {
  const s = String(a || '').trim();
  if (!s) return 0;
  const n = words(s).length;
  let q = n >= 10 ? 1.6 : n >= 4 ? 1.1 : 0.5;
  if (/\d/.test(s)) q += 0.6;
  if (/\b(abhi socha nahi|pata nahi|nahi pata|dont know|don't know|no idea|skip)\b/i.test(s)) q = 0.4;
  return q;
}

const WHY = {
  vc: {
    hi: ['Scale ka scope dikh raha hai, {kw} har city mein chal sakta hai.', 'Badi soch hai! Market bada hai aur tumne growth ka raasta bataya.', 'Yeh idea 1 jagah pe nahi rukega, VC wali energy hai.'],
    lo: ['Idea cute hai, bas dikhao ki yeh 100 jagah tak kaise jaayega.', 'Market ka size ek number mein bolo, phir main pakka in.', 'Pehle 1 jagah jeeto, phir scale ka plan saath lao.'],
  },
  mkt: {
    hi: ['Customer clear hai, aur Insta pe iska hook ban sakta hai.', 'Brand vibe solid hai, log isse yaad rakhenge.', 'Tumhe pata hai kiske liye bana rahe ho, yeh sabse bada plus hai.'],
    lo: ['Pehla customer kaun hai, ek line mein bolo, game ban jaayega.', 'Idea achha hai, bas ek catchy naam aur hook chahiye.', 'Customer ki problem pe ek reel socho, log khud aayenge.'],
  },
  fin: {
    hi: ['Paise ka hisaab samajh aaya, margin wala dimaag hai.', 'Price aur cost dono socha, Finance shark impressed!', 'Numbers ke saath pitch kiya, yeh real founder move hai.'],
    lo: ['Ek order pe cost aur price ka number likho, phir main in.', 'Idea mast hai, bas dikhao ki har sale pe kitna bachega.', 'Pricing pe 10 minute do, yeh idea aur strong hoga.'],
  },
};
const LINES = {
  vc: { in: ['Main in hoon, rocket ready!', 'VC shark in! Scale karte hain.', 'Main in, badi soch ko salaam!'], out: ['Abhi main out, par wapas aana!', 'Is baar out, next pitch ka wait hai.', 'Main out, par idea yaad rahega.'] },
  mkt: { in: ['Brand vibe on point, main in!', 'Main in! Reel abhi se dikh rahi hai.', 'Customer pakad liya, main in hoon.'], out: ['Abhi main out, customer pe kaam karo!', 'Out for now, hook laao aur aao.', 'Main out, par vibe pasand aayi.'] },
  fin: { in: ['Numbers ne dil jeet liya, main in.', 'Main in! Hisaab pakka hai.', 'Margin dikha, Finance shark in!'], out: ['Main out, par hisaab sudhaar ke aao!', 'Abhi out, numbers laao, phir baat.', 'Main out, par idea mein dum hai.'] },
};
const COMPLIMENT = {
  vc: 'Tumne bada socha, aur yeh founder wali sabse rare quality hai.',
  mkt: 'Tumhe apna customer pata hai, yeh real founder wali nazar hai.',
  fin: 'Tumne numbers ke saath pitch kiya, sharks ko yeh bahut pasand hai.',
  pitch: 'Stage pe aake 60 second mein idea bolna, yeh khud mein bada move hai!',
};
const FIX = {
  vc: 'Is hafte 10 logon se poochho ki unhe yeh chahiye ya nahi, aur kitne log aise hain.',
  mkt: 'Ek line likho: "Main ___ ke liye ___ banata hoon", aur ek 3 second ka reel hook socho.',
  fin: 'Ek order ka cost aur price likho. Price minus cost = tumhara margin. Yahi magic number hai.',
};
const EXPLAIN = {
  customer: 'Customer matlab woh ek insaan jiski problem tum solve karte ho. {kw} ke liye sabse pehle yeh pakka karo ki kaun roz yeh khareedega.',
  margin: 'Margin matlab har sale pe kitna bachta hai: price minus cost. {kw} mein agar 99 mein becho aur 55 lage, toh 44 tumhara margin hai.',
  pricing: 'Pricing matlab customer kitna khushi se dega. {kw} ka price aisa rakho jo sasta lage par tumhara kharcha bhi nikle.',
  unit_economics: 'Unit economics matlab ek order ka poora hisaab: kitna aaya, kitna gaya. {kw} ka ek order profit mein hai toh 1000 bhi honge.',
  moat: 'Moat matlab woh deewar jo copy karne waalon ko door rakhe. {kw} ke liye secret recipe, community ya trust tumhara moat ban sakta hai.',
  scale: 'Scale matlab 1 se 100 tak bina sab kuch dobara banaye. {kw} ko aise design karo ki har nayi city mein same formula chale.',
  brand: 'Brand matlab log tumhe kis feeling se yaad rakhte hain. {kw} ka ek naam, ek colour aur ek vibe chuno, aur har jagah wahi rakho.',
  distribution: 'Go-to-market matlab customer tak pahunchne ka raasta. {kw} ke pehle 100 customers kahan milenge: Insta, school ya society?',
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Verdict in VERDICT_SCHEMA shape. */
export function verdictFor(pitch, questions = {}, answers = {}, { seed = '' } = {}) {
  const p = String(pitch || '').toLowerCase();
  const all = `${p} ${Object.values(answers || {}).join(' ').toLowerCase()}`;
  const rnd = seeded(`v:${seed}:${pitch}:${JSON.stringify(answers)}`);
  const nWords = words(p).length;
  const sig = Object.fromEntries(Object.entries(SIG).map(([k, re]) => [k, re.test(all) ? 1 : 0]));
  const pitchBonus = nWords >= 30 ? 1 : nWords >= 14 ? 0.5 : 0;
  const jitter = () => (rnd() - 0.5) * 0.9;
  const raw = {
    vc: 4.6 + sig.scale * 1 + sig.problem * 0.8 + pitchBonus + quality(answers.vc) + jitter(),
    mkt: 4.6 + sig.customer * 1 + sig.brand * 0.8 + pitchBonus * 0.6 + quality(answers.mkt) + jitter(),
    fin: 4.4 + sig.money * 1 + sig.margin * 0.9 + pitchBonus * 0.4 + quality(answers.fin) + (/\d/.test(String(answers.fin || '')) ? 0.4 : 0) + jitter(),
  };
  const d = detect(pitch);
  const kw = d.kw ? (PRETTY[d.kw] || d.kw) : 'is idea';
  const sharks = {};
  for (const id of SHARK_IDS) {
    const score = clamp(Math.round(raw[id]), 4, raw[id] >= 9.8 ? 10 : 9);
    const band = score >= 7 ? 'hi' : 'lo';
    sharks[id] = {
      score,
      why: pickWith(rnd, WHY[id][band]).replace('{kw}', kw),
      line: pickWith(rnd, LINES[id][score >= 7 ? 'in' : 'out']),
    };
  }
  const byScore = [...SHARK_IDS].sort((a, b) => sharks[b].score - sharks[a].score);
  const best = byScore[0];
  const worst = byScore[2];
  const concept = worst === 'fin' ? (sig.money ? 'margin' : 'pricing') : worst === 'mkt' ? (sig.customer ? 'brand' : 'customer') : (sig.scale ? 'moat' : 'scale');
  const idea = questions?.idea?.tvTitle || null;
  return {
    safe: true,
    category: 'ok',
    sharks,
    compliment: sharks[best].score >= 7 ? COMPLIMENT[best] : COMPLIMENT.pitch,
    fix: FIX[worst],
    lesson: { concept, explain: EXPLAIN[concept].replace('{kw}', kw === 'is idea' ? 'Tumhare idea' : titleCase(kw)) },
    tvLine: idea ? `${idea}: sharks ne dhyaan se suna!` : 'Fresh idea, sharks ne dhyaan se suna!',
  };
}

// ---------- safe template lines (used by the output guard when a model line fails) ----------
const kwOf = (pitch) => { const d = detect(pitch); return d.kw && !['app', 'website', 'platform', 'service', 'school', 'college'].includes(d.kw) ? (PRETTY[d.kw] || d.kw) : 'is idea'; };
export function templateWhy(id, isIn, pitch = '') { return pickWith(seeded(`w:${id}:${pitch}`), WHY[id][isIn ? 'hi' : 'lo']).replace('{kw}', kwOf(pitch)); }
export function templateLine(id, isIn, pitch = '') { return pickWith(seeded(`l:${id}:${pitch}`), LINES[id][isIn ? 'in' : 'out']); }
export function templateExplain(concept, pitch = '') { const kw = kwOf(pitch); return (EXPLAIN[concept] || EXPLAIN.customer).replace('{kw}', kw === 'is idea' ? 'Tumhare idea' : titleCase(kw)); }
export function templateHost(pitch = '') { return pickWith(seeded(`h:${pitch}`), HOST); }
export const TEMPLATE_WORDS = JSON.stringify([WHY, LINES, COMPLIMENT, FIX, EXPLAIN, HOST, GENERIC, CAT_TITLES, CATS]);
