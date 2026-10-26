// AI Sharks v2 offline engine: mock, offline, timeouts and ?demo=hero. Answers in the v2 schema shapes
// (lib/v2/prompts.js). ALL text it returns is our own template or fixture copy: nothing is derived from the
// visitor's words (CHECK-05b rule 3). The visitor's text only steers numbers (scores) and which line is picked.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seeded, pickWith } from '../text.js';
import { detect, matchFixture } from '../engine.js';
import { AXES, PERSONAS, lensScore, DEAL_AT, DEALS_FOR_DEAL } from './personas.js';
import { QUESTIONS, ASK_AXIS, TAKES, TITLES, HOST, TVLINE } from '../../web/tvtext.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const GAMES = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'fixtures', 'games.json'), 'utf8'));
export const PART_IDS = ['idea', 'customer', 'problem', 'paisa'];

export const joinParts = (parts = {}) => PART_IDS.map((k) => String(parts[k] || '')).join('\n');

const CHIPS = {
  seth: ['Cost kam, price sahi rakhunga', 'Pehle 100 orders se seekhunga', 'Abhi hisaab lagana hai'],
  riya: ['Mere jaise students', 'Insta reel se dikhaunga', 'Abhi pata karna hai'],
  kabir: ['Pehle apna area, phir har city', 'Online se poore India mein', 'Pehle 1 jagah perfect karunga'],
  mummy: ['Pehle chhota test karunga', 'Clear rules aur refund', 'Customers ke reviews dikhaunga'],
};
const COMPLIMENT = {
  idea: 'Tumhara idea clear hai, ek line mein samajh aa gaya. Founder wali soch!',
  customer: 'Tumhe pata hai kiske liye bana rahe ho, yeh sabse bada plus hai.',
  money: 'Tumne paise ka hisaab socha, sharks ko yeh bahut pasand aaya.',
  energy: 'Kya energy thi! Stage pe aake pitch karna khud mein bada move hai.',
};
const FIX = {
  idea: 'Idea ko ek line mein likho: main kya banata hoon aur kyun.',
  customer: 'Ek line likho: mera pehla customer kaun hai, aur woh mujhe kyun chunega.',
  money: 'Ek order ka cost aur price likho. Price minus cost = tumhara margin.',
  energy: 'Pitch ko 3 baar dost ke saamne bolo, har baar thoda chhota aur tez.',
};
const CONCEPT = { idea: 'moat', customer: 'customer', money: 'margin', energy: 'brand' };
const EXPLAIN = {
  customer: 'Customer matlab woh ek insaan jiski problem tum solve karte ho. Sabse pehle pakka karo ki kaun roz yeh khareedega.',
  margin: 'Margin matlab har sale pe kitna bachta hai: price minus cost. Agar 99 mein becho aur 55 lage, toh 44 tumhara margin hai.',
  pricing: 'Pricing matlab customer kitna khushi se dega. Price aisa rakho jo sasta lage par tumhara kharcha bhi nikle.',
  unit_economics: 'Unit economics matlab ek order ka poora hisaab: kitna aaya, kitna gaya. Ek order profit mein hai toh 1000 bhi honge.',
  moat: 'Moat matlab woh deewar jo copy karne waalon ko door rakhe. Secret recipe, community ya trust tumhara moat ban sakta hai.',
  scale: 'Scale matlab 1 se 100 tak bina sab kuch dobara banaye. Aisa formula banao jo har nayi city mein chale.',
  brand: 'Brand matlab log tumhe kis feeling se yaad rakhte hain. Ek naam, ek colour aur ek vibe chuno, aur har jagah wahi rakho.',
  distribution: 'Go-to-market matlab customer tak pahunchne ka raasta. Pehle 100 customers kahan milenge: Insta, school ya society?',
};
export const templateExplain = (concept) => EXPLAIN[concept] || EXPLAIN.customer;

export function matchGame(parts) {
  return matchFixture(joinParts(parts), GAMES)?.fx || null;
}

/** Template idea titles by category (TV-safe by construction). */
export function tvTitleFor(parts) {
  const d = detect(joinParts(parts));
  return pickWith(seeded(`tt:${joinParts(parts)}`), TITLES[d.cat] || TITLES.other);
}

/** Questions for the panel (v2 questions schema shape). */
export function questionsV2(parts, panel, { forceId } = {}) {
  const g = forceId ? GAMES.find((x) => x.id === forceId) : matchGame(parts);
  const rnd = seeded(`q2:${joinParts(parts)}`);
  const questions = {};
  for (const id of panel) {
    const fx = g?.answer?.questions?.[id];
    questions[id] = fx ? structuredClone(fx) : { q: pickWith(rnd, QUESTIONS[id][ASK_AXIS[id]]), chips: [...CHIPS[id]] };
  }
  const d = detect(joinParts(parts));
  return {
    safe: true,
    safety: 'ok',
    idea: g ? structuredClone(g.answer.idea) : { title: tvTitleFor(parts), tvTitle: tvTitleFor(parts), category: d.cat === 'other' ? 'other' : d.cat },
    hostLine: g ? g.answer.hostLine : pickWith(rnd, HOST),
    questions,
  };
}

// ---------- scorer: numbers from simple signals in the visitor's text, words from templates ----------
const SIG = {
  customer: /\b(students?|log|logon|parents|customers?|kids|bachche|bachon|office|families|family|seniors?|owners?|teachers?|dukaan(dar)?|shops?|ke liye|for|users?)\b/,
  problem: /\b(problem|dikkat|pareshan|time waste|waste|mushkil|issue|hard|late|boring|mehnga|mehenga|expensive|nahi milta|thak|tired|bhook|kam hain|nahi hote)\b/,
  scale: /\b(india|cities|city|shehron|lakhs?|crores?|har|every|franchise|online|app|national|colleges|schools|hostels)\b/,
  brand: /\b(insta|instagram|reels?|brand|naam|logo|influencers?|whatsapp|youtube|hook|viral|community|vibe|story|packaging)\b/,
  money: /(₹|\brs\b|\brupaye|\brupees?|\bprice|\bpaisa|\bpaise|\b\d{2,5}\b)/,
  margin: /\b(cost|margin|profit|munafa|kharcha|subscription|per month|monthly|commission|plan|bachega|bachta|premium|sponsors?)\b/,
  energy: /(!|\b(mast|awesome|amazing|best|pakka|zabardast|full|superb|kamaal|dhamaka|solid)\b)/,
};
const words = (s) => String(s).toLowerCase().split(/\s+/).filter(Boolean).length;
function quality(a) {
  const s = String(a || '').trim();
  if (!s) return 0;
  const n = words(s);
  let q = n >= 10 ? 1.4 : n >= 4 ? 1 : 0.5;
  if (/\d/.test(s)) q += 0.5;
  if (/\b(abhi socha nahi|pata nahi|nahi pata|dont know|don't know|no idea|skip)\b/i.test(s)) q = 0.3;
  return q;
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Axis scores 4..10 (integers). */
export function axesFor(parts, answers = {}, { mode = 'text', coop = false } = {}) {
  const p = Object.fromEntries(PART_IDS.map((k) => [k, String(parts[k] || '').toLowerCase()]));
  const all = `${joinParts(parts)} ${Object.values(answers).join(' ')}`.toLowerCase();
  const rnd = seeded(`ax:${joinParts(parts)}:${JSON.stringify(answers)}`);
  const j = () => (rnd() - 0.5) * 0.8;
  const filled = PART_IDS.filter((k) => words(p[k]) >= 2).length;
  const has = (k, txt = all) => (SIG[k].test(txt) ? 1 : 0);
  const ans = Object.values(answers);
  const raw = {
    idea: 4.6 + (words(p.idea) >= 4 ? 1 : 0.3) + has('problem', p.problem) * 1 + has('scale') * 0.8 + quality(answers.kabir) * 0.8 + j(),
    customer: 4.6 + has('customer', p.customer) * 1.2 + has('brand') * 0.8 + (words(p.customer) >= 4 ? 0.5 : 0) + quality(answers.riya) * 0.8 + j(),
    money: 4.4 + has('money', p.paisa) * 1.2 + has('margin') * 0.9 + (/\d/.test(p.paisa) ? 0.4 : 0) + quality(answers.seth || answers.mummy) * 0.8 + j(),
    energy: 4.8 + (filled - 2) * 0.6 + has('energy') * 0.8 + (mode === 'voice' ? 0.6 : 0) + (coop ? 0.4 : 0) + (ans.filter((a) => String(a || '').trim()).length / 3) * 0.8 + j(),
  };
  return Object.fromEntries(AXES.map((k) => [k, clamp(Math.round(raw[k]), 4, raw[k] >= 9.8 ? 10 : 9)]));
}

/** Full verdict (v2 verdict schema shape), template text only. */
export function verdictV2(parts, answers, panel, opts = {}) {
  const axes = axesFor(parts, answers, opts);
  const rnd = seeded(`v2:${joinParts(parts)}:${JSON.stringify(answers)}`);
  const sharks = {};
  for (const id of panel) {
    const deal = lensScore(id, axes) >= DEAL_AT;
    sharks[id] = { take: pickWith(rnd, TAKES[id][deal ? 'deal' : 'out']) };
  }
  const order = [...AXES].sort((a, b) => axes[b] - axes[a]);
  const concept = CONCEPT[order[3]];
  const deals = panel.filter((id) => lensScore(id, axes) >= DEAL_AT).length;
  return {
    safe: true,
    category: 'ok',
    axes,
    sharks,
    compliment: COMPLIMENT[order[0]],
    fix: FIX[order[3]],
    lesson: { concept, explain: templateExplain(concept) },
    tvLine: pickWith(rnd, TVLINE[deals >= DEALS_FOR_DEAL ? 'deal' : 'out']),
  };
}

export { PERSONAS };
