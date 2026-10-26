// Public text shared by the phone (orchestra calls, TV payload) and the server (registration with ctx.safety).
// Browser-safe: no Node imports. Every string here can reach the counter TV, so it is fixed or templated.
import { SIGNS, LIFE_PATHS } from './astro.js';
import { LINE_KINDS, STRENGTHS } from './palmlines.js';

export const AGENTS = {
  orchestrator: { id: 'guru', name: 'Jyotish Guru', role: 'Orchestrator', icon: 'crown' },
  agents: [
    { id: 'rashi', name: 'Rashi Agent', role: 'Sun sign, in code', icon: 'star' },
    { id: 'ank', name: 'Ank Agent', role: 'Life path, in code', icon: 'dice' },
    { id: 'hast', name: 'Hast Rekha Agent', role: 'Palm lines, Claude vision', icon: 'palm' },
    { id: 'kaal', name: 'Kaal Agent', role: 'Past + future', icon: 'clock' },
    { id: 'career', name: 'Career Agent', role: 'AI-era career read', icon: 'rocket' },
  ],
};
export const ORX = {
  title: 'AI Jyotish',
  task: { hast: 'Palm ki 4 rekhaayein trace karo', kaal: 'Past aur future padho', rashi: 'Sun sign nikalo', ank: 'Life-path number nikalo', career: 'AI-era career read banao' },
  log: {
    plan: 'Plan: 2 agents in code, 1 vision call, 5 agents total',
    demoPalm: 'Demo haath (illustration), stock rekha set',
    picks: 'TV ke liye reviewed lines chuni',
  },
  handoff: { palm: 'palm lines', picks: 'reading picks', career: 'career read' },
};

export const UI = {
  kicker: 'AI Jyotish reading', hint: 'Future phone pe unlock hoga', card: 'Mera AI Bhavishya', forfun: 'For fun only',
  demo: 'SIRF MAZE KE LIYE. AI DEMO.',
};

// short tokens that appear as values in TV payloads (ids, line kinds, states)
export const TOKENS = [
  ...SIGNS.map((s) => s.id), 'Fire', 'Earth', 'Air', 'Water', ...LINE_KINDS, ...STRENGTHS, 'scan', 'lines', 'palm', 'future',
  AGENTS.orchestrator.id, ...AGENTS.agents.map((a) => a.id), AGENTS.orchestrator.icon, ...AGENTS.agents.map((a) => a.icon),
];

const how = ['Claude vision', 'Claude vision + stock', 'stock rekha set'];
const src = ['Claude reply', 'mock reply', 'offline reading', 'hero demo reading'];

export const TEMPLATES = {
  rashi_log: ['Sun sign range match: {sign} ({hi}), {element} element', { sign: SIGNS.map((s) => s.en), hi: SIGNS.map((s) => s.hi), element: ['Fire', 'Earth', 'Air', 'Water'] }],
  ank_log: ['digits reduce karke add kiye -> {n}', { n: LIFE_PATHS.map(String) }],
  ank_log_master: ['digits reduce karke add kiye -> {n} (master number)', { n: ['11', '22', '33'] }],
  photo_log: ['Photo {w}x{h} JPEG, {kb} KB, EXIF hata diya', { w: 'int:1..4000', h: 'int:1..4000', kb: 'int:1..2000' }],
  traced_log: ['4 rekha traced ({how}): heart {a}, head {b}, life {c}, fate {d}', { how, a: STRENGTHS, b: STRENGTHS, c: STRENGTHS, d: STRENGTHS }],
  kaal_log: ['{src}: 3 past + 3 future, safety check clean', { src }],
  kaal_log_swap: ['{src}: 3 past + 3 future, safety check swapped {n} line(s)', { src, n: 'count' }],
  career_log: ['Career read ready: {a} skills, {b} roles', { a: 'int:0..9', b: 'int:0..9' }],
  ho_sign: ['sign = {sign}', { sign: SIGNS.map((s) => s.en) }],
  ho_number: ['life path {n}', { n: LIFE_PATHS.map(String) }],
  done: ['Reading ready in {s}s', { s: 'int:0..600' }],
  // share card kicker: short enough for every sign + 33 (X1); the Hindi name stays on the TV and the phone
  card_kicker: ['{sign} · Life path {n}', { sign: SIGNS.map((s) => s.en), n: LIFE_PATHS.map(String) }],
};


/** Fill a template: fillFrom(TEMPLATES, 'done', { s: 9 }) -> 'Reading ready in 9s'. Throws on a bad slot. */
export function fillFrom(T, id, slots) {
  const [text, types] = T[id];
  return text.replace(/\{(\w+)\}/g, (_, n) => {
    const v = String(slots[n]);
    const ty = types[n];
    if (Array.isArray(ty) ? !ty.includes(v) : !/^\d+$/.test(v)) throw new Error(`template ${id}: bad slot ${n}`);
    return v;
  });
}
export const fill = (id, slots) => fillFrom(TEMPLATES, id, slots);
