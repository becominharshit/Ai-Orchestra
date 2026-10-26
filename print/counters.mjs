// Counter map and copy for every print file. Change copy here, then run `node make.mjs`.
// Counter map: lead update 24 Oct 2026 (one experience per counter). URLs are final; the QR encodes them exactly.
// Copy rules: Hinglish, positive, no em-dashes or en-dashes, no claims beyond the programme line.
// TODO(student): add a Hindi (Devanagari) variant of the hook lines as an optional second line.

export const PLAY = 'https://play.zenithschool.ai';
export const IG_URL = 'https://instagram.com/zenith_school_of_ai';
export const HANDLE = '@zenith_school_of_ai';
// Messaging per BRAIN CHANGE-01 (24 Oct): exact wording, do not paraphrase.
export const PROGRAMME = 'B.Tech in AI + mini-MBA. Ek degree, KRMU ki.';
// PUBLIC HERO LINE: the one place to change it. HERO_LINE is the big hook on counter 7, HERO_LINE_SHORT the small
// line on every other standee, tent and poster. Swap the strings, then run `node print/make.mjs` (rebuilds and
// re-checks everything; verify.mjs requires these exact strings and fails if one matches BANNED).
// v4 FINAL (Avi via BRAIN, 24 Oct).
export const HERO_LINE = 'Zenith first-years ne AI agents ke saath banaye';
export const HERO_LINE_SHORT = 'Zenith first-years x AI agents';
export const SITE = 'zenithschool.ai';
export const EVENT = 'KRMU Ideas 4.0';
// Phrases that must never appear in any print file (checked on the extracted PDF text by verify.mjs).
// BANNED: forbidden everywhere, the hero strings included (old lines, who-coded-what wording).
export const BANNED = ['Shark Tank', 'direct aur test', 'directed and tested', '3 din', 'Student Builds', 'students ne code',
  'AI agents ne banaya', 'AI agents ne code kiya', 'Zenith x AI agents'];
// BANNED_OUTSIDE_HERO: allowed only inside HERO_LINE / HERO_LINE_SHORT, forbidden in any other copy.
export const BANNED_OUTSIDE_HERO = ['first-year', 'first year', 'agents ke saath'];

const PLAY_STEPS = ['Scan karo', 'Khelo', 'Follow karke result unlock karo'];

const jyotish = (c) => ({
  id: c,
  slug: 'jyotish',
  pillar: 'Tech',
  nameHtml: '<em>AI</em> Jyotish',
  name: 'AI Jyotish',
  hook: 'Haath dikhao. AI batayega tum kaun ho.',
  sub: 'Tum kaun ho, kya ho chuka hai, aur kya hone wala hai.',
  labels: ['For fun only', 'Sirf maze ke liye. AI demo.'],
  qr: { url: `${PLAY}/jyotish?c=${c}`, label: 'Scan karo', short: 'play.zenithschool.ai/jyotish' },
  steps: PLAY_STEPS,
  orchestra: { hub: 'Jyotish Guru', agents: ['Rashi Agent', 'Ank Agent', 'Hast Rekha Agent', 'Kaal Agent'] },
  tvLine: 'Counter TV pe dekho: AI agents ki team live tumhara haath padhti hai',
});

// Counter map v4 (print v5, BRAIN + Avi final, 24 Oct). Counters 2 and 4 are the new flagship experiences, go/no-go
// at 26 Oct 12:00. FALLBACKS are cheap A4 tents for those two counters. WALL is the Live Projects side-wall set.
// Every counter standee and tent also carries the follow QR and the photo-frame cue (FOLLOW below).
export const HUB_URL = `${PLAY}/`;
export const PHOTO_CUE = 'Photo frame: selfie lo, @zenith_school_of_ai tag karo';
export const FOLLOW = { url: IG_URL, label: 'Follow karo', short: 'instagram.com/zenith_school_of_ai' };

const career = (c, slugSuffix = '') => ({
  id: c,
  slug: 'career' + slugSuffix,
  pillar: 'Careers + Business',
  nameHtml: 'Career <em>Studio</em>',
  name: 'Career Studio',
  hook: 'Tumhara dream job 2030 mein kaisa dikhega?',
  sub: 'Career Forecast dekho, phir Job Time Machine khelo: 2026 vs 2030.',
  // Predictive content, so the shared rule asks for the label (kept, confirmed by the lead after CHECK-08).
  labels: ['For fun only'],
  qr: { url: `${PLAY}/career?c=${c}`, label: 'Scan karo', short: 'play.zenithschool.ai/career' },
  steps: PLAY_STEPS,
  orchestra: { hub: 'Manager Agent', agents: ['Research', 'Draft', 'Analyst', 'Review'] },
  tvLine: 'Counter TV pe dekho: AI agents 2030 wali job live karte hain',
});

const PRINT_SET = ['standee', 'tent', 'poster'];
const key = (c, k) => ({ sizes: PRINT_SET, follow: true, ...c, key: k || `c${pad(c.id)}_${c.slug}`, seed: (c.seedBase ?? c.id * 10) });

export const COUNTERS = [
  jyotish(1),
  {
    id: 2,
    slug: 'startup',
    flagship: true,
    pillar: 'Business + Tech',
    nameHtml: '<em>AI</em> Startup Studio',
    name: 'AI Startup Studio',
    hook: 'Apna startup, 90 second mein.',
    sub: 'Problem chuno. AI agents banayenge naam, logo, pitch aur ek live startup page.',
    labels: [],
    qr: { url: `${PLAY}/startup?c=2`, label: 'Scan karo', short: 'play.zenithschool.ai/startup' },
    steps: PLAY_STEPS,
    orchestra: { hub: 'Founder Agent', agents: ['Research', 'Product', 'Brand', 'Finance', 'Pitch'] },
    tvLine: 'Counter TV pe dekho: tumhari company agent by agent banti hai',
  },
  {
    id: 3,
    slug: 'shark',
    pillar: 'Business',
    nameHtml: '<em>AI</em> Sharks',
    name: 'AI Sharks', // public name per lead update 24 Oct: never print "Shark Tank"
    hook: 'Apna idea pitch karo. Deal milegi ya "Main out hoon"?',
    sub: '3 AI sharks, 1 minute ka pitch. Har shark ka apna style.',
    labels: ['For fun only', 'AI sharks. Asli paisa nahi.'],
    qr: { url: `${PLAY}/shark?c=3`, label: 'Scan karo', short: 'play.zenithschool.ai/shark' },
    steps: PLAY_STEPS,
    // archetypes that hint at the v2 personas without naming them
    orchestra: { hub: 'Host Agent', agents: ['Business Baron', 'D2C Founder', 'Scale VC'] },
    tvLine: 'Counter TV pe dekho: teen AI sharks live sawaal poochte hain',
  },
  {
    id: 4,
    slug: 'agent',
    flagship: true,
    pillar: 'Tech',
    nameHtml: 'Build Your Own <em>AI Agent</em>',
    name: 'Build Your Own AI Agent',
    hook: 'Apna AI agent banao.',
    sub: 'Job chuno, personality set karo, tools do. Phir dekho woh live ek real task karta hai.',
    labels: [],
    qr: { url: `${PLAY}/agent?c=4`, label: 'Scan karo', short: 'play.zenithschool.ai/agent' },
    steps: PLAY_STEPS,
    orchestra: { hub: 'Tumhara Agent', agents: ['Plan', 'Calendar', 'Calculator', 'Lookup', 'Notes'] },
    tvLine: 'Counter TV pe dekho: tumhara agent live plan banata hai aur tools chalata hai',
  },
  career(5),
  {
    id: 6,
    slug: 'reel',
    pillar: 'Tech',
    nameHtml: 'Squad <em>Reel</em> Studio',
    name: 'Squad Reel Studio',
    hook: 'Doston ke saath aao. AI agents tumhari reel banayenge.',
    sub: '2 se 5 dost, 3 chhote shots, ek 9:16 reel.',
    labels: [],
    qr: { url: `${PLAY}/reel?c=6`, label: 'Scan karo', short: 'play.zenithschool.ai/reel' },
    steps: PLAY_STEPS,
    orchestra: { hub: 'Director', agents: ['Editor', 'Captions', 'Hook', 'Thumbnail'] },
    tvLine: 'Counter TV pe dekho: AI agents live tumhari reel edit karte hain',
  },
  {
    id: 7,
    slug: 'asli',
    pillar: 'Fun',
    nameHtml: '<em>AI</em> ya Asli?',
    name: 'AI ya Asli?',
    hook: 'Pehchano: AI ne banaya ya asli hai?',
    sub: '10 rounds, 60 second, live leaderboard.',
    labels: [],
    qr: { url: `${PLAY}/asli?c=7`, label: 'Scan karo', short: 'play.zenithschool.ai/asli' },
    steps: PLAY_STEPS,
    orchestra: { hub: 'Quizmaster', agents: ['Curator', 'Detector', 'Scorekeeper'] },
    tvLine: 'Counter TV pe dekho: live leaderboard aur AI Detector ka guess',
  },
  jyotish(8),
].map((c) => key(c));

// A4 fallback tents for the two go/no-go counters (cheap; print them now).
export const FALLBACKS = [
  key({
    id: 2,
    slug: 'ai-experience',
    chip: 'Counter 2 / 4',
    pillar: 'AI Experience',
    nameHtml: '<em>AI</em> Experience',
    name: 'AI Experience',
    hook: 'Scan karo aur apna AI experience chuno.',
    sub: '',
    labels: [],
    qr: { url: HUB_URL, label: 'Scan karo', short: 'play.zenithschool.ai' },
    steps: PLAY_STEPS,
    sizes: ['tent'],
    fallbackFor: 'c02_startup or c04_agent',
    seedBase: 205,
  }, 'cXX_FALLBACK-ai-experience-for-c02-or-c04'),
  key({ ...jyotish(2), name: 'AI Jyotish', sizes: ['tent'], fallbackFor: 'c02_startup', seedBase: 215 }, 'c02_FALLBACK-jyotish'),
  key({ ...career(4), sizes: ['tent'], fallbackFor: 'c04_agent', seedBase: 245 }, 'c04_FALLBACK-career'),
].map((c) => ({ ...c, fallback: true }));

// Live Projects: not a counter. Side-wall posters (A3 + A2) and a 16:9 loop slide for a spare TV.
// No company or brand names until approvals.
export const WALL = [
  key({
    id: 0,
    slug: 'live-projects',
    // v5.1 (CHECK-08 Round v5): hook and body only in website wording ("Work in industry starting 1st year",
    // "Externships (real world live projects)" on zenithschool.ai; zenith.json "4 mandatory real-world live projects
    // with 30+ companies"). No past tense, no company names. The hero line stays only as the small footer line.
    chip: 'Live Projects',
    pillar: 'B.Tech in AI + mini-MBA',
    nameHtml: 'Live <em>Projects</em>',
    name: 'Live Projects',
    hook: 'Work in industry starting 1st year.',
    sub: '4 mandatory real-world live projects with 30+ companies. Sawaal ho to kisi bhi counter pe poocho.',
    labels: [],
    qr: FOLLOW,
    steps: ['Programme jaano', 'Sawaal poocho', 'Follow karo'],
    sizes: ['poster', 'posterA2', 'slide'],
    follow: false, // its main QR already is the follow QR
    seedBase: 900,
  }, 'WALL-live-projects'),
];
export const ALL = [...COUNTERS, ...FALLBACKS, ...WALL];

// Physical sizes in mm. trim = finished size; bleed = extra art beyond trim; slug = white margin for crop marks.
export const SIZES = {
  standee: { label: 'Roll-up standee', trimW: 850, trimH: 2000, bleed: 3, slug: 15, file: (c) => `standee_${c.key}_850x2000mm.pdf` },
  tent:    { label: 'A4 table tent (fold in half)', trimW: 210, trimH: 297, bleed: 3, slug: 12, file: (c) => `tent_${c.key}_A4.pdf` },
  poster:  { label: 'A3 poster', trimW: 297, trimH: 420, bleed: 3, slug: 12, file: (c) => `poster_${c.key}_A3.pdf` },
  // A2 uses the A3 template scaled by 420/297 (vector, so nothing is lost)
  posterA2: { label: 'A2 poster', template: 'poster', scale: 420 / 297, trimW: 420, trimH: 594, bleed: 3, slug: 12, file: (c) => `posterA2_${c.key}_A2.pdf` },
};

export const QUANTITIES = { standee: 1, tent: 2, poster: 1 };

export function pad(n) { return String(n).padStart(2, '0'); }
