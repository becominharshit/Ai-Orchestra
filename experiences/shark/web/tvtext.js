// AI Sharks: EVERY string that can reach the counter TV or the share card, as fixed reviewed banks and templates
// (CONTRACT section 13, CHECK_build item 12). Imported by the server (registers them with ctx.safety) and by the
// phone (composes TV events only from these). No model text and no visitor text ever goes to the TV.
// Copy rules: Hinglish, PG, positive, no em/en dashes. Mummy: only risk and trust in the business (tested).

// ---------- orchestra: agent names, roles, labels, tasks, fixed log lines ----------
export const ORX = {
  title: 'AI Sharks',
  host: 'Host Agent', hostRole: 'Orchestrator',
  safety: 'Safety Agent', safetyRole: 'Family-friendly check', safetyLabel: 'SAFE',
  score: 'Score Agent', scoreRole: 'Idea, Customer, Money, Energy', scoreLabel: 'SCORE',
  lesson: 'Lesson Agent', lessonRole: 'Mini-MBA concept', lessonLabel: 'MBA',
  // v1 sharks
  vc: 'Shark VC', vcRole: 'Market + scale', vcLabel: 'VC',
  mkt: 'Shark Marketing', mktRole: 'Customer + brand', mktLabel: 'MKTG',
  fin: 'Shark Finance', finRole: 'Price + margin', finLabel: 'CFO',
  // v2 personas (fictional)
  seth: 'Seth Dhanraj', sethRole: 'Margin + distribution', sethLabel: 'SETH',
  riya: 'Riya Rao', riyaRole: 'Customer + brand', riyaLabel: 'RIYA',
  kabir: "Kabir 'Scale' Mehta", kabirRole: 'Market + scale', kabirLabel: 'KABIR',
  mummy: 'Mummy Angel Investor', mummyRole: 'Risk + trust', mummyLabel: 'MUMMY',
  // tasks
  tSafety: 'Pitch family-friendly hai?', tAsk: 'Ek follow-up sawaal', tScore: 'Scorecard banao', tTake: 'Deal ya out, ek line', tLesson: 'Mini-MBA concept chuno',
  tAskVc: 'Ek sawaal: market + scale', tAskMkt: 'Ek sawaal: customer + brand', tAskFin: 'Ek sawaal: price + margin', tScoreV1: 'Score /10 + ek line kyun',
  // handoff labels
  hClear: 'pitch clear', hPitch: 'pitch', hScore: 'score + why', hAxes: '4 axis scores',
  // fixed log lines
  lClear: 'sab rules clear', lRedirect: 'idea change ka request, naya idea suggest kiya', lPass: 'founder ne pass kiya, koi baat nahi',
  lSealed: 'score sealed, reveal pe khulega', lReady: 'sawaal ready', lAxes: '4 axis scores ready', lJudge: 'phone lines judge se clear',
  dNew: 'Naya idea try karte hain',
};

// Log lines that carry real data use templates (numbers and enums only).
export const TEMPLATES = {
  logWords: ['{n} words, 4 cards, sab clear', { n: 'int:0..999' }],
  logWordsV1: ['{n} words checked, 9 rules, sab clear', { n: 'int:0..999' }],
  logAnswer: ['jawab mila ({how}), {n} words', { how: ['voice', 'chip', 'text'], n: 'int:0..999' }],
  logSource: ['{src}, {n} sawaal ready', { src: ['claude reply', 'mock reply', 'offline demo sharks', 'hero demo pitch'], n: 'int:0..9' }],
  logLesson: ['concept: {concept}', { concept: ['Customer', 'Margin', 'Pricing', 'Unit economics', 'Moat', 'Scale', 'Brand', 'Go-to-market'] }],
  doneReady: ['Verdict ready in {s}s', { s: 'int:0..999' }],
  step: ['AI SHARKS · SAWAAL {i}/{n}', { i: 'int:1..4', n: 'int:1..4' }],
  card: ['AI SHARKS · PITCH CARD {i}/4', { i: 'int:1..4' }],
  total: ['{score}/{max} · {deals} of 3 sharks Deal', { score: 'int:0..40', max: ['30', '40'], deals: 'int:0..3' }],
  totalV1: ['{score}/30 · {deals} of 3 sharks in', { score: 'int:0..30', deals: 'int:0..3' }],
  nickPitch: ['{nickname} ka pitch', { nickname: 'nickname' }],
};

// ---------- enums used as strings in TV events (registered so strict mode passes) ----------
export const ENUMS = {
  questions: 'questions', scoring: 'scoring', pitching: 'pitching', tank: 'tank', ask: 'ask', answered: 'answered', card: 'card', deal: 'deal', out: 'out', IN: 'IN', OUT: 'OUT', DEAL: 'DEAL',
  vc: 'vc', mkt: 'mkt', fin: 'fin', seth: 'seth', riya: 'riya', kabir: 'kabir', mummy: 'mummy',
  idea: 'idea', customer: 'customer', money: 'money', energy: 'energy',
  icChart: 'chart', icHeart: 'heart', icRocket: 'rocket', icShield: 'shield', icCrown: 'crown', icBrain: 'brain', icTarget: 'target', icCard: 'card', icScale: 'scale', icCompass: 'compass',
  cBlue: '#62BBF3', cPink: '#FF8FC0', cGold: '#FFC861', cViolet: '#C49BFF', cTeal: '#5EEAD4',
};

// ---------- TV copy ----------
export const COPY = {
  kickerLive: 'AI SHARKS · LIVE PITCH', kickerVerdict: 'AI SHARKS KA VERDICT', kickerVerdictV1: 'AI Sharks ka verdict',
  statusThinking: 'Sharks sawaal soch rahe hain...', statusAnswering: 'Founder jawab de raha hai...', statusGot: 'Jawab mil gaya! Agla shark ready...',
  statusAll: 'Teeno jawab mil gaye! Sharks score kar rahe hain...', statusPitching: 'Founder pitch kar raha hai...',
  deal: 'DEAL!', outHoon: 'MAIN OUT HOON', mainIn: 'MAIN IN', mainOut: 'MAIN OUT', dealShort: 'Deal', outShort: 'Main out hoon',
  axisIdea: 'Idea', axisCustomer: 'Customer', axisMoney: 'Money', axisEnergy: 'Pitch energy',
  cardIdea: 'Idea', cardCustomer: 'Customer: kaun khareedega?', cardProblem: 'Problem: kyun zaroori hai?', cardPaisa: 'Paisa: kaise kamaoge?',
  forFun: 'For fun only', banner: 'AI SHARKS. ASLI PAISA NAHI.',
  lessonPrefix: 'Mini-MBA lesson',
};
export const LESSON_TITLES = { customer: 'Customer', margin: 'Margin', pricing: 'Pricing', unit_economics: 'Unit economics', moat: 'Moat', scale: 'Scale', brand: 'Brand', distribution: 'Go-to-market' };
export const LESSON_LINES = Object.fromEntries(Object.entries(LESSON_TITLES).map(([k, v]) => [k, `Mini-MBA lesson: ${v}`]));

// Idea titles for the TV: by category only, never from the visitor's words.
export const TITLES = {
  food: ['Desi Food Idea', 'Tasty Food Startup'], education: ['Smart Study Idea', 'Study Help Startup'], campus: ['Campus Life Startup', 'Hostel Helper Idea'],
  fitness: ['Fit Life Startup', 'Fitness Fun Idea'], fashion: ['Style Startup', 'Fresh Fashion Idea'], environment: ['Green Planet Idea', 'Eco Startup'],
  gaming: ['Game On Startup', 'Fun Gaming Idea'], pets: ['Pet Care Idea', 'Happy Pets Startup'], travel: ['Smart Travel Idea', 'Trip Saver Startup'],
  creator: ['Creator Studio Idea', 'Content Creator Startup'], services: ['Helping Hands Startup', 'Smart Service Idea'], tech: ['Smart Tech Idea', 'Next Gen App Idea'],
  other: ['Next Big Idea', 'Fresh Founder Idea', 'Desi Startup Idea'],
};
export const HOST = [
  'Naya founder, naya idea! Sharks, kaan khade karo.',
  'Pitch aa gaya hai, sharks ready? Chalo shuru karte hain!',
  'Tank mein fresh idea aaya hai. Sharks, sawaal taiyaar?',
  'Ek aur bold founder! Sharks, dhyaan se suno.',
];
export const TVLINE = {
  deal: ['Sharks ko idea pasand aaya. DEAL pakki!', 'Founder ne sharks ka dil jeet liya!'],
  out: ['Is baar out, par founder wali energy full on!', 'Idea mein dum hai, agli baar DEAL pakki!'],
};

// Follow-up questions for the TV, per persona and axis (the phone may show the model's own phrasing).
export const QUESTIONS = {
  seth: {
    money: ['Beta, ek order pe kitna bachega?', 'Beta, maal kitne mein banega aur kitne mein bikega?'],
    customer: ['Beta, pehla grahak kaun hai, aur woh baar baar aayega?', 'Beta, dukaan se customer tak maal kaise pahunchega?'],
    idea: ['Beta, yeh idea saal bhar chalega ya sirf season mein?', 'Beta, sabse pehle kahan se shuru karoge?'],
    energy: ['Beta, isme poora dil lagaoge na?', 'Beta, pehle 100 customers kaise laoge?'],
  },
  riya: {
    customer: ['Tumhara first customer kaun hai, ek line mein?', 'Customer tumhe hi kyun chunega?'],
    energy: ['Insta pe iska 3 second ka hook kya hoga?', 'Brand ka naam aur vibe kya hogi?'],
    idea: ['Isme aisa kya hai jo log share karna chahenge?', 'Yeh idea ek reel mein kaise dikhaoge?'],
    money: ['Customer kitna pay karega, aur khushi se karega?', 'Pehli sale kaise karoge?'],
  },
  kabir: {
    idea: ['Yeh idea 10x kaise hoga?', '1 shehar se 100 shehron tak kaise jaoge?'],
    customer: ['Market kitna bada hai? Kitne log yeh roz chahte hain?', 'Agle saal kitne users chahiye?'],
    money: ['Har naye user pe kharcha kitna aur kamai kitni?', 'Tech se yeh sasta aur tez kaise banega?'],
    energy: ['Agar kal 1000 users aa gaye, toh kya badlega?', 'Tumhari team mein kaun kya karega?'],
  },
  mummy: {
    money: ['Safe hai na? Mera paisa doob toh nahi jayega?', 'Beta, agar kuch galat hua toh nuksaan kitna hoga?'],
    customer: ['Beta, customers ko tum pe bharosa kaise hoga?', 'Kisi ki shikayat aayi toh kaise sambhaloge?'],
    idea: ['Beta, isme sabse bada risk kya hai?', 'Pehle chhota test karke dekhoge na?'],
    energy: ['Beta, Plan B kya hai, agar pehla plan na chale?', 'Beta, kuch galat hua toh customer ka paisa wapas doge na?'],
  },
  // v1 sharks
  vc: { idea: ['Yeh idea 1 jagah se 100 shehron tak kaise jaayega?', 'Market kitna bada hai?', 'Agar kal 1000 customers aa gaye, toh kya badlega?'] },
  mkt: { customer: ['Tumhara pehla customer kaun hai, aur woh tumhe kyun chunega?', 'Insta pe iska 3 second ka hook kya hoga?', 'Brand ka naam aur vibe kya hogi?'] },
  fin: { money: ['Ek order pe kitna kharcha, aur kitne mein bechoge?', 'Pehle 100 customers ke liye paisa kahan se aayega?', 'Subscription loge ya per order?'] },
};
// Which axis each persona asks about on the TV.
export const ASK_AXIS = { seth: 'money', riya: 'customer', kabir: 'idea', mummy: 'money', vc: 'idea', mkt: 'customer', fin: 'money' };

// One-line takes in character, by verdict band (deal / out). Never about the person, always kind.
export const TAKES = {
  seth: {
    deal: ['Beta, margin dikh raha hai. Deal!', 'Dukaan se godown tak plan pakka hai. Deal!', 'Hisaab mein dum hai, beta. Deal!'],
    out: ['Beta, margin dikhao, phir baat karenge. Abhi main out hoon.', 'Hisaab thoda kaccha hai, beta. Main out hoon, par wapas aana!', 'Paisa kaise bachega, yeh likho. Abhi main out hoon.'],
  },
  riya: {
    deal: ['Insta pe pakka bikega! Deal!', 'Customer clear hai, vibe on point. Deal!', 'Yeh reel viral jaayegi. Deal!'],
    out: ['Customer ek line mein bolo, phir Deal. Abhi main out hoon.', 'Hook thoda aur chahiye. Main out hoon, par vibe pasand aayi!', 'Brand pe kaam karo aur wapas aao. Abhi main out hoon.'],
  },
  kabir: {
    deal: ['10x ka scope dikh raha hai. Deal!', 'Market bada hai, plan smart. Deal!', 'Yeh scale hoga. Deal!'],
    out: ['10x ka raasta abhi clear nahi. Main out hoon, par idea yaad rahega.', 'Pehle 1 jagah jeeto, phir aao. Abhi main out hoon.', 'Market ka size ek number mein lao. Abhi main out hoon.'],
  },
  mummy: {
    deal: ['Safe bhi hai aur smart bhi. Mera aashirwaad, Deal!', 'Risk samajh ke socha hai, beta. Deal!', 'Bharosa wala idea hai. Deal!'],
    out: ['Beta, risk thoda zyada lag raha hai. Abhi main out hoon, par proud hoon.', 'Pehle chhota test karo, phir Deal. Abhi main out hoon.', 'Plan B likh ke laao, beta. Abhi main out hoon.'],
  },
  vc: { deal: ['Main in hoon, rocket ready!', 'VC shark in! Scale karte hain.'], out: ['Abhi main out, par wapas aana!', 'Is baar out, next pitch ka wait hai.'] },
  mkt: { deal: ['Brand vibe on point, main in!', 'Customer pakad liya, main in hoon.'], out: ['Abhi main out, customer pe kaam karo!', 'Main out, par vibe pasand aayi.'] },
  fin: { deal: ['Numbers ne dil jeet liya, main in.', 'Main in! Hisaab pakka hai.'], out: ['Main out, par hisaab sudhaar ke aao!', 'Abhi out, numbers laao, phir baat.'] },
};

// Share card (server-composed lines only).
export const SHARE = {
  kicker: 'AI Sharks ne kaha', footer: 'For fun only · Asli paisa nahi',
  titleDeal: 'DEAL!', titleOut: 'Main out hoon', coop: 'Co-founders ka pitch',
};
export const SHARE_TEMPLATES = {
  shareTotal: ['Score {score}/40 · {deals} of 3 sharks Deal', { score: 'int:0..40', deals: 'int:0..3' }],
  shareAxes: ['Idea {i} · Customer {c} · Money {m} · Energy {e}', { i: 'int:0..10', c: 'int:0..10', m: 'int:0..10', e: 'int:0..10' }],
  shareIdea: ['Idea: {title}', { title: Object.values(TITLES).flat() }],
  sharePanel: ['Panel: {a}, {b}, {c}', { a: ['Seth Dhanraj', 'Riya Rao', "Kabir 'Scale' Mehta", 'Mummy Angel Investor'], b: ['Seth Dhanraj', 'Riya Rao', "Kabir 'Scale' Mehta", 'Mummy Angel Investor'], c: ['Seth Dhanraj', 'Riya Rao', "Kabir 'Scale' Mehta", 'Mummy Angel Investor'] }],
};

/** Fill a template with values (same rules as the server's checker: ints in range, enums from the list). */
export function fill(name, values, all = { ...TEMPLATES, ...SHARE_TEMPLATES }) {
  const [text, slots] = all[name];
  return text.replace(/\{(\w+)\}/g, (_, k) => {
    const t = slots[k];
    const v = values[k];
    if (Array.isArray(t)) { if (!t.includes(String(v))) throw new Error(`tvtext ${name}.${k}: not allowed`); return String(v); }
    if (typeof t === 'string' && t.startsWith('int:')) {
      const [a, b] = t.slice(4).split('..').map(Number);
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < a || n > b) throw new Error(`tvtext ${name}.${k}: out of range`);
      return String(n);
    }
    if (t === 'nickname') { if (!/^[A-Za-z][A-Za-z0-9]{1,11}$/.test(String(v))) throw new Error('tvtext nickname'); return String(v); }
    return String(v);
  });
}

/** Every fixed line (for registration and for tests). */
export function allBankLines() {
  const out = [];
  const walk = (v) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  [ORX, ENUMS, COPY, LESSON_TITLES, LESSON_LINES, TITLES, HOST, TVLINE, QUESTIONS, TAKES, SHARE].forEach(walk);
  return [...new Set(out)];
}
