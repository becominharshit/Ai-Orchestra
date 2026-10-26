// Build Your Own AI Agent: the fixed menu a visitor designs from (CHANGE-02a: curated templates only, no open prompt).
// 16 templates, each with a fixed task, chip inputs only, a fixed output structure (lib/compose.js) and deterministic
// tools (lib/tools.js). Every label here is reviewed copy and may appear on the TV or a card (registered in lib/text.js).
// TODO(student): add a template by copying one block below, add its data to data/lookup.json and its sections to
// lib/compose.js, then run the tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LOOKUP = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'lookup.json'), 'utf8'));

const opt = (id, label, extra = {}) => ({ id, label, ...extra });
const hours = (m) => (m % 60 ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)}h ` : ''}${m % 60} min` : `${m / 60}h`);
const days = (list) => ({ id: 'days', label: 'Kitne din?', options: list.map((d) => opt(d, `${d} din`)) });
const perDay = (list) => ({ id: 'perDay', label: 'Roz kitna time?', options: list.map((m) => opt(m, hours(m))) });
const start = (list) => ({ id: 'start', label: 'Kab shuru?', options: list.map((t) => opt(t, t)) });
const SUBJ = { physics: 'Physics', chemistry: 'Chemistry', maths: 'Maths', biology: 'Biology', english: 'English' };
const subjects = (ids) => ids.map((id) => opt(id, SUBJ[id]));
const lookupItems = (tpl) => Object.entries(LOOKUP[tpl].items).map(([id, v]) => opt(id, v.label));

export const GROUPS = [
  { id: 'study', label: 'Padhai' }, { id: 'skills', label: 'Skills' }, { id: 'startup', label: 'Startup' },
  { id: 'creator', label: 'Creator aur campus' }, { id: 'career', label: 'Career' }, { id: 'broad', label: 'Khel' },
];

// schedule: 'days' = day by day sessions | 'spaced' = review on day 1, 3, 7, 14 | 'agenda' = one event day with timed blocks
// sessions / breaks = lengths (minutes) the planner may pick. fixed = settings the template decides (not shown as chips).
// needs = tools the fixed output structure depends on (always on). study: true adds "Apne teacher/mentor se bhi discuss karo" to the result.
export const JOBS = [
  {
    id: 'jee', needs: ['lookup'], group: 'study', study: true, name: 'JEE Prep Tutor', role: 'JEE Prep Tutor', icon: 'target', blurb: '7 din ka revision plan, weak chapter pe extra time.',
    task: 'Mera 7-din JEE revision plan banao', unit: 'study session', schedule: 'days', topicParam: 'cls',
    items: { label: 'Subjects chuno (2 ya 3)', min: 2, max: 3, options: subjects(['physics', 'chemistry', 'maths']) },
    params: [
      { id: 'cls', label: 'Class', options: [opt('c11', 'Class 11'), opt('c12', 'Class 12')] },
      { id: 'weak', label: 'Weak chapter', options: Object.entries(LOOKUP.jee.weak).map(([id, w]) => opt(id, `${SUBJ[w.item]}: ${w.label}`, { for: w.item })) },
      perDay([120, 180, 240]), start(['07:00', '16:00', '18:00']),
    ],
    fixed: { days: 7 }, sessions: [30, 45, 60], breaks: [10, 15],
  },
  {
    id: 'boards', needs: ['calculator', 'calendar'], group: 'study', study: true, name: 'Boards Planner', role: 'Boards Planner', icon: 'clock', blurb: '30 din ka timetable, 3 revision rounds ke saath.',
    task: 'Mera 30-din boards timetable banao', unit: 'study session', schedule: 'days',
    items: { label: 'Subjects chuno (3 se 5)', min: 3, max: 5, options: [...subjects(['physics', 'chemistry', 'maths', 'biology', 'english']), opt('cs', 'Computer Science'), opt('economics', 'Economics'), opt('accounts', 'Accountancy'), opt('business', 'Business Studies'), opt('hindi', 'Hindi')] },
    params: [{ id: 'board', label: 'Board', options: [opt('cbse', 'CBSE'), opt('isc', 'ISC'), opt('state', 'State board')] }, perDay([120, 180, 240]), start(['07:00', '16:00', '18:00'])],
    fixed: { days: 30 }, sessions: [30, 45, 60], breaks: [10, 15],
  },
  {
    id: 'concept', needs: ['lookup', 'calculator'], group: 'study', study: true, name: 'Concept Explainer', role: 'Concept Explainer', icon: 'eye', blurb: 'Ek concept, 3 levels mein, reviewed explanation se.',
    task: 'Yeh concept mujhe 3 levels mein samjhao', unit: 'revision', schedule: 'spaced',
    items: { label: 'Concept chuno', min: 1, max: 1, options: lookupItems('concept') },
    params: [start(['07:00', '17:00', '20:00'])],
    fixed: { days: 14, perDay: 15 }, sessions: [10, 15], breaks: [5],
  },
  {
    id: 'lecture', needs: ['lookup'], group: 'study', study: true, name: 'Micro-Lecture Series Designer', role: 'Micro-Lecture Designer', icon: 'film', blurb: '5 episode, 60 second ki video series ka outline.',
    task: 'Is chapter pe 60-second video series design karo', unit: 'recording session', schedule: 'days',
    items: { label: 'Chapter chuno', min: 1, max: 1, options: lookupItems('lecture') },
    params: [{ id: 'cls', label: 'Class', options: [opt('c11', 'Class 11'), opt('c12', 'Class 12')] }, perDay([30, 45, 60]), start(['16:00', '18:00', '20:00'])],
    fixed: { days: 5 }, sessions: [20, 30], breaks: [5, 10],
  },
  {
    id: 'mock', needs: ['lookup', 'calculator'], group: 'study', study: true, name: 'Mock Test Strategist', role: 'Mock Test Strategist', icon: 'chart', blurb: 'Agle mock ka time split aur attempt order.',
    task: 'Mere agle mock test ki strategy banao', unit: 'practice session', schedule: 'days',
    items: { label: 'Mock mein subjects (2 ya 3)', min: 2, max: 3, options: subjects(['physics', 'chemistry', 'maths', 'biology', 'english']) },
    params: [
      { id: 'exam', label: 'Mock kaunsa?', options: [opt('jee', 'JEE style mock'), opt('boards', 'Boards sample paper'), opt('unit', 'School unit test')] },
      { id: 'weak', label: 'Weak subject', options: subjects(['physics', 'chemistry', 'maths', 'biology', 'english']).map((o) => ({ ...o, for: o.id })) },
      { id: 'mins', label: 'Paper ka time', options: [opt(60, '1 ghanta'), opt(120, '2 ghante'), opt(180, '3 ghante')] },
      start(['07:00', '16:00', '18:00']),
    ],
    fixed: { days: 3, perDay: 90 }, sessions: [30, 45], breaks: [10, 15],
  },
  {
    id: 'skill', needs: ['lookup'], group: 'skills', name: 'Skill Roadmap', role: 'Skill Roadmap Agent', icon: 'compass', blurb: '30 din ka roadmap aur ek mini project.',
    task: 'Mera 30-din skill roadmap banao', unit: 'learning session', schedule: 'days', topicParam: 'skill',
    items: { label: 'Kis cheez pe time? (2 ya 3)', min: 2, max: 3, options: [opt('learn', 'Concepts seekhna'), opt('practice', 'Practice problems'), opt('project', 'Mini project'), opt('share', 'Kaam share karna')] },
    params: [{ id: 'skill', label: 'Skill', options: [opt('python', 'Python'), opt('ai', 'AI basics'), opt('web', 'Web'), opt('data', 'Data')] }, perDay([30, 45, 60]), start(['07:00', '17:00', '20:00'])],
    fixed: { days: 30 }, sessions: [20, 30], breaks: [5, 10],
  },
  {
    id: 'mvp', needs: ['lookup'], group: 'skills', name: 'App Idea to MVP Planner', role: 'MVP Planner', icon: 'code', blurb: 'Must-have features, tool stack aur 2 hafte ka build plan.',
    task: 'Meri app idea ka MVP plan banao', unit: 'build session', schedule: 'days',
    items: { label: 'Kin kaamon pe focus? (2 ya 3)', min: 2, max: 3, options: [opt('design', 'Screens aur design'), opt('build', 'Build'), opt('test', 'User testing'), opt('launch', 'Launch')] },
    params: [
      { id: 'app', label: 'App type', options: [opt('study', 'Study helper'), opt('market', 'Campus marketplace'), opt('event', 'Event app'), opt('habit', 'Habit tracker'), opt('split', 'Expense splitter')] },
      { id: 'user', label: 'Kis ke liye?', options: [opt('school', 'School students'), opt('college', 'College students'), opt('parents', 'Parents'), opt('shops', 'Local shops')] },
      perDay([30, 60, 90]), start(['07:00', '17:00', '19:00']),
    ],
    fixed: { days: 14 }, sessions: [20, 30, 45], breaks: [5, 10],
  },
  {
    // CHECK-19 F4: visitors are under 18, so a DAY plan only: 09:00 to 21:00 with meals and a break at least every 2 h
    id: 'hackathon', needs: ['lookup', 'calendar'], group: 'skills', name: 'Hackathon Teammate', role: 'Hackathon Teammate', icon: 'bolt', blurb: 'Hackathon ka day plan (9 se 9), roles aur demo checklist.',
    task: 'Hamari team ka hackathon day plan banao', unit: 'block', schedule: 'agenda',
    items: { label: 'Team ki taakat (1 se 3)', min: 1, max: 3, options: [opt('design', 'Design'), opt('code', 'Coding'), opt('pitch', 'Pitching'), opt('research', 'Research')] },
    params: [
      { id: 'theme', label: 'Theme', options: [opt('campus', 'Smart campus'), opt('climate', 'Climate'), opt('edtech', 'Edtech'), opt('social', 'Social good')] },
      { id: 'team', label: 'Team size', options: [opt(2, '2 log'), opt(3, '3 log'), opt(4, '4 log')] },
    ],
    fixed: { days: 1, perDay: 60, start: '09:00' }, sessions: [60], breaks: [0],
  },
  {
    id: 'cofounder', needs: ['lookup', 'calculator'], group: 'startup', name: 'Startup Co-founder', role: 'Startup Co-founder', icon: 'rocket', blurb: 'Pehle 4 hafte ka sprint plan aur pehle 10 customers.',
    task: 'Meri startup ke pehle 4 hafte plan karo', unit: 'work session', schedule: 'days',
    items: { label: 'Kin kaamon pe focus? (2 ya 3)', min: 2, max: 3, options: [opt('research', 'Customer research'), opt('prototype', 'Prototype'), opt('marketing', 'Marketing'), opt('feedback', 'Feedback loop'), opt('partners', 'Partnerships')] },
    params: [
      { id: 'area', label: 'Problem area', options: [opt('hostel_food', 'Hostel food'), opt('kirana', 'Kirana delivery'), opt('notes', 'Notes sharing'), opt('gear', 'Cricket gear rental'), opt('thrift', 'Thrift fashion'), opt('tutor', 'Peer tutoring')] },
      perDay([30, 60, 90]), start(['07:00', '17:00', '19:00']),
    ],
    fixed: { days: 28 }, sessions: [20, 30, 45], breaks: [5, 10],
  },
  {
    id: 'd2c', needs: ['lookup', 'calculator'], group: 'startup', name: 'D2C Brand Marketer', role: 'D2C Brand Marketer', icon: 'star', blurb: 'Instagram launch: 5 posts, 3 hooks, launch week.',
    task: 'Mere brand ka Instagram launch plan banao', unit: 'creation session', schedule: 'days',
    items: { label: 'Post formats (2 ya 3)', min: 2, max: 3, options: [opt('reel', 'Reel'), opt('carousel', 'Carousel'), opt('bts', 'Behind the scenes'), opt('story', 'Customer story'), opt('offer', 'Launch offer')] },
    params: [
      { id: 'product', label: 'Product', options: [opt('candles', 'Handmade candles'), opt('thrift', 'Thrift fashion'), opt('stickers', 'Stickers aur stationery'), opt('plants', 'Plant pots'), opt('jewellery', 'Handmade jewellery')] },
      { id: 'audience', label: 'Audience', options: [opt('school', 'School students'), opt('college', 'College students'), opt('young', 'Young professionals'), opt('parents', 'Parents')] },
      perDay([30, 60]), start(['16:00', '18:00', '20:00']),
    ],
    fixed: { days: 7 }, sessions: [20, 30], breaks: [5, 10],
  },
  {
    id: 'creator', needs: ['lookup'], group: 'creator', name: 'Content Creator Coach', role: 'Content Creator Coach', icon: 'film', blurb: '7 reel ideas hooks ke saath, aur posting plan.',
    task: 'Mere niche ke 7 reel ideas aur posting plan do', unit: 'creation session', schedule: 'days',
    items: { label: 'Kaunse formats? (2 ya 3)', min: 2, max: 3, options: [opt('reel', 'Reel'), opt('carousel', 'Carousel'), opt('tutorial', 'Short tutorial'), opt('meme', 'Meme post'), opt('bts', 'Behind the scenes')] },
    params: [
      { id: 'niche', label: 'Niche', options: [opt('tech', 'Tech'), opt('cricket', 'Cricket'), opt('food', 'Food'), opt('study', 'Study tips'), opt('music', 'Music'), opt('art', 'Art')] },
      { id: 'posts', label: 'Posts per week', options: [opt(2, '2'), opt(3, '3'), opt(4, '4')] },
      days([7, 14]), perDay([30, 60, 90]), start(['16:00', '18:00', '20:00']),
    ],
    sessions: [20, 30, 45], breaks: [5, 10],
  },
  {
    id: 'fest', needs: ['calculator', 'calendar'], group: 'creator', name: 'Fest Event Planner', role: 'Fest Event Planner', icon: 'star', blurb: 'Run of show, budget split aur countdown checklist.',
    task: 'Hamare fest stall ka plan banao', unit: 'team session', schedule: 'days',
    items: { label: 'Kaunse kaam? (2 ya 3)', min: 2, max: 3, options: [opt('theme', 'Theme and design'), opt('posters', 'Posters'), opt('social', 'Social media'), opt('volunteers', 'Volunteers'), opt('setup', 'Setup and decor'), opt('rehearsal', 'Rehearsal')] },
    params: [
      { id: 'event', label: 'Kaisa stall?', options: [opt('tech', 'Tech stall'), opt('art', 'Art exhibition'), opt('quiz', 'Quiz night'), opt('games', 'Fun games stall')] },
      { id: 'budget', label: 'Budget', options: [opt(2000, 'Rs 2000'), opt(5000, 'Rs 5000'), opt(10000, 'Rs 10000')] },
      { id: 'team', label: 'Team size', options: [opt(3, '3 log'), opt(5, '5 log'), opt(8, '8 log')] },
      days([5, 7, 10]), perDay([30, 60, 90]), start(['13:00', '16:00', '18:00']),
    ],
    sessions: [20, 30, 45], breaks: [5, 10],
  },
  {
    id: 'debate', needs: ['lookup', 'calculator'], group: 'creator', name: 'Debate Prep Coach', role: 'Debate Prep Coach', icon: 'chat', blurb: 'For aur against points, opening line, 2 rebuttals.',
    task: 'Mujhe is debate ke liye taiyaar karo', unit: 'practice session', schedule: 'days',
    items: { label: 'Practice kis pe? (2 ya 3)', min: 2, max: 3, options: [opt('opening', 'Opening'), opt('args', 'Arguments'), opt('rebuttal', 'Rebuttals'), opt('delivery', 'Delivery')] },
    params: [
      { id: 'topic', label: 'Topic', options: Object.entries(LOOKUP.debate.topics).map(([id, t]) => opt(id, t.label)) },
      { id: 'side', label: 'Tumhari side', options: [opt('for', 'For'), opt('against', 'Against')] },
      { id: 'speech', label: 'Speech kitni lambi?', options: [opt(2, '2 minute'), opt(3, '3 minute'), opt(4, '4 minute')] },
      days([3, 5]), perDay([20, 30]), start(['07:00', '17:00', '20:00']),
    ],
    sessions: [10, 15], breaks: [5],
  },
  {
    id: 'career', needs: ['lookup'], group: 'career', name: 'Career Explorer', role: 'Career Explorer', icon: 'compass', blurb: '3 careers ka 2030 outlook aur is mahine kya try karein.',
    task: 'Mere interest se 3 careers explore karo', unit: 'explore session', schedule: 'days',
    items: { label: 'Kaise explore karoge? (2 ya 3)', min: 2, max: 3, options: [opt('watch', 'Dekho aur padho'), opt('task', 'Mini task karo'), opt('talk', 'Kisi se baat karo'), opt('club', 'Club ya event')] },
    params: [{ id: 'area', label: 'Interest area', options: Object.entries(LOOKUP.career.areas).map(([id, a]) => opt(id, a.label)) }, days([7, 14]), perDay([20, 30]), start(['10:00', '17:00', '20:00'])],
    sessions: [10, 15, 20], breaks: [5],
  },
  {
    id: 'collegeq', needs: ['lookup', 'calculator'], group: 'career', name: 'College Questions Coach', role: 'College Questions Coach', icon: 'search', blurb: 'Kisi bhi campus se poochne ke 10 sawaal, tumhari priorities se.',
    task: 'Kisi bhi college se poochne ke 10 sawaal banao', unit: 'research session', schedule: 'days',
    items: { label: 'Tumhari priorities (2 ya 3)', min: 2, max: 3, options: [opt('placements', 'Placement support'), opt('campus', 'Campus life'), opt('fees', 'Fees clarity'), opt('projects', 'Projects aur labs'), opt('faculty', 'Faculty'), opt('hostel', 'Hostel aur safety'), opt('internships', 'Internships')] },
    params: [{ id: 'interest', label: 'Kya padhna hai?', options: [opt('ai', 'AI and CS'), opt('business', 'Business'), opt('design', 'Design'), opt('science', 'Science')] }, days([7, 14]), perDay([20, 30]), start(['10:00', '17:00', '20:00'])],
    sessions: [10, 15, 20], breaks: [5],
  },
  {
    id: 'cricket', needs: ['calculator'], group: 'broad', name: 'Cricket Strategy Analyst', role: 'Cricket Strategy Analyst', icon: 'target', blurb: 'Match situation ki strategy, simple numbers ke saath.',
    task: 'Is match situation ki strategy banao', unit: 'practice block', schedule: 'days',
    items: { label: 'Kya practice karna hai? (2 ya 3)', min: 2, max: 3, options: [opt('batting', 'Batting'), opt('bowling', 'Bowling'), opt('fielding', 'Fielding'), opt('catching', 'Catching'), opt('running', 'Running between wickets')] },
    params: [
      { id: 'format', label: 'Format', options: [opt('box6', '6-over box'), opt('t10', 'T10'), opt('t20', 'T20')] },
      { id: 'situation', label: 'Situation', options: [opt('chase', 'Chase karna hai'), opt('defend', 'Defend karna hai')] },
      // CHECK-19 F2: an asking rate, not a raw target, so every number is scorable (each phase stays under 36 an over)
      { id: 'rate', label: 'Rate kitna?', options: [opt(6, '6 per over'), opt(8, '8 per over'), opt(10, '10 per over'), opt(12, '12 per over')] },
      days([3, 5, 7]), perDay([45, 60, 90]), start(['06:30', '16:00', '17:30']),
    ],
    sessions: [15, 20, 30], breaks: [5, 10],
  },
];
export const jobById = (id) => JOBS.find((j) => j.id === id) || null;

// The 4 tools a visitor can switch on. Each one is real code in lib/tools.js.
export const TOOLS = [
  { id: 'lookup', label: 'Lookup', agent: 'Lookup Tool', role: 'Curated data only', icon: 'search', blurb: 'Sirf hamari reviewed list padhta hai, web nahi.' },
  { id: 'calculator', label: 'Calculator', agent: 'Calculator Tool', role: 'Real maths, in code', icon: 'chart', blurb: 'Time split, totals aur template ka hisaab.' },
  { id: 'calendar', label: 'Calendar planner', agent: 'Calendar Tool', role: 'Real schedule, in code', icon: 'clock', blurb: 'Din aur time ke saath asli slots, koi clash nahi.' },
  { id: 'notes', label: 'Note-maker', agent: 'Note-maker Tool', role: 'Checklist, in code', icon: 'pen', blurb: 'Sab kuch ek checklist mein.' },
];
export const TOOL_IDS = TOOLS.map((t) => t.id);
export const toolById = (id) => TOOLS.find((t) => t.id === id) || null;

// 3 personality sliders, 5 stops each (0..4). Labels per stop are public text (TV, cards).
export const SLIDERS = [
  { id: 'strict', left: 'Strict', right: 'Chill', stops: ['Strict', 'Thoda strict', 'Balanced', 'Thoda chill', 'Chill'] },
  { id: 'funny', left: 'Serious', right: 'Funny', stops: ['Serious', 'Thoda serious', 'Balanced', 'Thoda funny', 'Funny'] },
  { id: 'detail', left: 'Short', right: 'Detailed', stops: ['Short', 'Thoda short', 'Balanced', 'Thoda detailed', 'Detailed'] },
];

export const VOICES = [
  { id: 'commentator', label: 'Cricket commentator' },
  { id: 'filmy', label: 'Filmy narrator' },
  { id: 'guru', label: 'Calm guru' },
  { id: 'senior', label: 'Helpful senior' },
  { id: 'robot', label: 'Robot mode' },
  { id: 'coach', label: 'Desi coach' },
];
export const voiceById = (id) => VOICES.find((v) => v.id === id) || null;

// Agent name generator: two fixed lists, the visitor picks 1 of 3 combinations (no text box).
export const NAME_ADJ = ['Nova', 'Turbo', 'Zen', 'Pixel', 'Cosmic', 'Swift', 'Neon', 'Desi', 'Rocket', 'Sonic', 'Mighty', 'Lucky'];
export const NAME_NOUN = ['Jugnu', 'Chai', 'Falcon', 'Comet', 'Panda', 'Mango', 'Samosa', 'Bolt', 'Orbit', 'Lassi', 'Kite', 'Tiger'];
export function agentName(nameId) {
  const m = /^(\d{1,2})\.(\d{1,2})$/.exec(String(nameId || ''));
  if (!m) return null;
  const a = NAME_ADJ[Number(m[1])];
  const n = NAME_NOUN[Number(m[2])];
  if (!a || !n || a === n) return null;
  return { adj: a, noun: n, text: `${a} ${n}` };
}

export const style = (strict) => (strict <= 1 ? 'strict' : strict >= 3 ? 'chill' : 'balanced');
export const detailLevel = (detail) => (detail >= 3 ? 'long' : 'short');

/**
 * Validate a design from the phone. Every field must be one of our ids or numbers; anything else is refused,
 * so no visitor text can reach the planner, the TV or a card (the optional first name is handled in lib/name.js).
 * Returns { ok: true, design } or { ok: false, message }.
 */
export function validateDesign(body = {}) {
  const job = typeof body.job === 'string' ? jobById(body.job) : null;
  if (!job) return { ok: false, message: 'Pehle agent ka template chuno.' };
  const ids = job.items.options.map((o) => o.id);
  const items = Array.isArray(body.items) ? [...new Set(body.items)] : [];
  const { min, max } = job.items;
  if (items.length < min || items.length > max || !items.every((i) => ids.includes(i))) return { ok: false, message: min === max ? 'Ek option chuno.' : `${min} se ${max} options chuno.` };
  const params = { ...(job.fixed || {}) };
  for (const p of job.params) {
    const v = body.params?.[p.id];
    const o = p.options.find((x) => x.id === v);
    if (!o) return { ok: false, message: `"${p.label}" chuno.` };
    if (o.for && !items.includes(o.for)) return { ok: false, message: `"${p.label}" apne chune hue options mein se chuno.` };
    params[p.id] = o.id;
  }
  const sl = Array.isArray(body.sliders) ? body.sliders : [];
  if (sl.length !== 3 || !sl.every((n) => Number.isInteger(n) && n >= 0 && n <= 4)) return { ok: false, message: 'Personality sliders set karo.' };
  const voice = typeof body.voice === 'string' ? voiceById(body.voice) : null;
  if (!voice) return { ok: false, message: 'Ek voice chuno.' };
  // the tools a template's fixed output needs are always on (locked on the phone); the rest are the visitor's choice
  const tools = Array.isArray(body.tools) ? TOOL_IDS.filter((t) => body.tools.includes(t) || job.needs.includes(t)) : [];
  if (!tools.length || (Array.isArray(body.tools) && body.tools.some((t) => !TOOL_IDS.includes(t)))) return { ok: false, message: 'Kam se kam ek tool on karo.' };
  const name = agentName(body.name);
  if (!name) return { ok: false, message: 'Agent ka naam chuno.' };
  return { ok: true, design: { job, items, params, sliders: sl, voice, tools, name, nameId: String(body.name) } };
}

export const itemLabel = (job, id) => job.items.options.find((o) => o.id === id)?.label || id;
export const paramLabel = (job, pid, v) => job.params.find((p) => p.id === pid)?.options.find((o) => o.id === v)?.label ?? String(v);

/** What the phone needs to draw the designer (labels only, no logic). */
export function bundle() {
  return {
    groups: GROUPS,
    jobs: JOBS.map(({ id, group, needs, name, role, icon, blurb, task, items, params }) => ({ id, group, needs, name, role, icon, blurb, task, items, params })),
    tools: TOOLS.map(({ id, label, agent, icon, blurb }) => ({ id, label, agent, icon, blurb })),
    sliders: SLIDERS, voices: VOICES, names: { adj: NAME_ADJ, noun: NAME_NOUN },
  };
}
