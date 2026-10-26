// Job Time Machine 2026 vs 2030: the 6 jobs, their careers.json ids, the 3 quick 2026 tasks, the 4 agents of the
// 2030 round, the 2 human-only calls and the 3 skills that hold. Every task points at a task text in careers.json
// (exact string), so its tag (Done by AI / Done with AI / Led by people) and share come from the dataset.
// Mapping gaps (also in DONE-03): Content Creator uses "marketing" (Marketing (Performance & Content)); Financial
// Analyst uses "finance" (Finance & Accounting); Doctor has no career in cf_data_v60, so its tags are marked
// illustrative and show no percentages.
// TODO(student): add a job (copy one block, pick a careers.json id, write 2 fixtures in fixtures/agents_<id>.json).
import { loadData, tooltip, MODE_LABEL, zenithCourses } from './data.js';

export const JOBS = [
  {
    id: 'marketing', label: 'Marketing Manager', noun: 'marketer', icon: 'target', careerId: 'marketing',
    context: 'Fictional sneaker brand "Udaan Kicks" for college students, launch week.',
    r1: [
      { kind: 'type', prompt: 'Udaan Kicks ke naye sneaker ka Instagram caption likho', placeholder: 'jaise: Fest ready, har step pe swag', task: 'First-draft copy, posts and creative variants' },
      { kind: 'bars', prompt: 'Weekly report: kaunsa ad sabse zyada chala? Sabse lambi bar tap karo', options: ['Reel ad', 'Story ad', 'Post ad'], widths: [0.55, 0.92, 0.38], correct: 1, task: 'Recurring campaign reporting' },
      { kind: 'choose', prompt: 'Launch ka vibe chuno', options: ['Bold aur loud', 'Calm aur premium', 'Funny aur meme wala'], task: 'Creative direction and brand judgement' },
    ],
    agents: {
      research: { job: 'Audience aur competitor research', task: 'Keyword, audience and competitor research' },
      draft: { job: '3 caption drafts likho', task: 'First-draft copy, posts and creative variants' },
      analyst: { job: 'Campaign report banao', task: 'Recurring campaign reporting' },
      review: { job: 'Brand fit check karo', task: 'Creative direction and brand judgement' },
    },
    calls: [
      { q: 'Launch ka main message kya hoga? Positioning ki call tumhari.', task: 'Positioning and messaging architecture', from: 'options' },
      { q: 'Kaunsa caption brand ki awaaz lagta hai?', task: 'Creative direction and brand judgement', from: 'drafts' },
    ],
    skills: [
      { skill: 'Positioning and messaging', zenith: 'product-thinking' },
      { skill: 'Creative direction and taste', zenith: 'talking-to-users' },
      { skill: 'Relationships and distribution', zenith: 'explaining-decisions' },
    ],
  },
  {
    id: 'finance', label: 'Financial Analyst', noun: 'analyst', icon: 'chart', careerId: 'finance',
    context: 'Fictional college cafe chain "Chai Point Zero", month-end close.',
    r1: [
      { kind: 'tap', prompt: 'Bank vs ledger: kaunsi entry match nahi karti? Tap karo', options: ['Canteen bill: dono mein same', 'Rent: dono mein same', 'Printer ink: sirf ledger mein', 'Salary: dono mein same'], correct: 2, task: 'Bookkeeping, entries and reconciliations' },
      { kind: 'trend', prompt: 'Monthly MIS: sales ka trend kaisa dikh raha hai?', options: ['Upar ja raha hai', 'Flat hai', 'Neeche ja raha hai'], correct: 0, task: 'Standard reporting packs and MIS' },
      { kind: 'choose', prompt: 'Agle quarter ka budget plan?', options: ['Safe: kharcha same', 'Balanced: thoda marketing pe', 'Bold: naya outlet kholo'], task: 'Budgeting, forecasting and scenario work' },
    ],
    agents: {
      research: { job: 'Audit sample check', task: 'First-pass audit testing and sampling' },
      draft: { job: 'MIS report draft', task: 'Standard reporting packs and MIS' },
      analyst: { job: '3 budget scenarios', task: 'Budgeting, forecasting and scenario work' },
      review: { job: 'Bank vs ledger match', task: 'Bookkeeping, entries and reconciliations' },
    },
    calls: [
      { q: 'Business team ko kya recommend karoge?', task: 'Business partnering and decision support', from: 'options' },
      { q: 'Kaunsa scenario CFO ko bhejoge? Final check tumhara.', task: 'Controls design and judgement calls', from: 'drafts' },
    ],
    skills: [
      { skill: 'Controls and judgement', zenith: 'business-finance-basics' },
      { skill: 'Business partnering', zenith: 'explaining-decisions' },
      { skill: 'Knowing when a number is wrong', zenith: 'how-businesses-make-money' },
    ],
  },
  {
    id: 'product', label: 'Product Manager', noun: 'PM', icon: 'compass', careerId: 'product',
    context: 'Fictional campus canteen app "CanteenGo".',
    r1: [
      { kind: 'type', prompt: "CanteenGo app: 'pre-order' feature ka 1 line spec likho", placeholder: 'jaise: Class se pehle order, line skip', task: 'Writing specs, PRDs and tickets' },
      { kind: 'choose', prompt: 'Time sirf 1 feature ka hai. Kaunsa pehle?', options: ['Pre-order', 'Dark mode', 'Loyalty points'], task: 'Prioritisation and trade-off decisions' },
      { kind: 'tap', prompt: '3 apps ke reviews padho: sabse common complaint kaunsi?', options: ['"Line bahut lambi hai"', '"Logo accha hai"', '"Colour pasand aaya"'], correct: 0, task: 'Competitive and market research' },
    ],
    agents: {
      research: { job: 'Reviews aur competitor research', task: 'Competitive and market research' },
      draft: { job: '3 spec drafts likho', task: 'Writing specs, PRDs and tickets' },
      analyst: { job: 'Usage data padho', task: 'Analysing usage data and experiment results' },
      review: { job: 'Roadmap update', task: 'Status reporting and roadmap upkeep' },
    },
    calls: [
      { q: 'Kaunsa feature pehle banega? Final call tumhari.', task: 'Prioritisation and trade-off decisions', from: 'options' },
      { q: 'Design aur tech team ko kaunsa spec bhejoge?', task: 'Cross-functional alignment and influence', from: 'drafts' },
    ],
    skills: [
      { skill: 'Customer discovery', zenith: 'talking-to-users' },
      { skill: 'Prioritisation under ambiguity', zenith: 'product-thinking' },
      { skill: 'Influence without authority', zenith: 'explaining-decisions' },
    ],
  },
  {
    id: 'software', label: 'Software Engineer', noun: 'engineer', icon: 'code', careerId: 'software-engineer',
    context: 'Fictional hostel tiffin delivery app "TiffinDash".',
    r1: [
      { kind: 'tap', prompt: 'Login button kaam nahi kar raha. Kaunsi line galat hai?', options: ['if (user) login()', 'button.onclick = login', 'pasword = input.value', 'return true'], correct: 2, mono: true, task: 'Fixing bugs and failing builds' },
      { kind: 'type', prompt: 'Us function ka naam likho jo cart ka total nikale', placeholder: 'jaise: getCartTotal', task: 'Writing standard application and CRUD code' },
      { kind: 'choose', prompt: 'Dinner time pe app slow hai. Kya karoge?', options: ['Cache lagao', 'Database badlo', 'Server double karo'], task: 'Designing systems and choosing trade-offs' },
    ],
    agents: {
      research: { job: 'Error logs padho', task: 'Debugging live production incidents' },
      draft: { job: 'Code ke 3 drafts', task: 'Writing standard application and CRUD code' },
      analyst: { job: 'Tests likho aur chalao', task: 'Writing unit and integration tests' },
      review: { job: 'Code review', task: 'Reviewing other people’s code' },
    },
    calls: [
      { q: 'Agle sprint mein kya banana hai? Business team ke saath final call.', task: 'Working out what to build with the business', from: 'options' },
      { q: 'Kaunsa fix ship karoge?', task: 'Designing systems and choosing trade-offs', from: 'drafts' },
    ],
    skills: [
      { skill: 'System design under real limits', zenith: 'system-design' },
      { skill: 'Debugging live systems', zenith: 'debugging-live-systems' },
      { skill: 'Judgement on what not to build', zenith: 'product-thinking' },
    ],
  },
  {
    id: 'creator', label: 'Content Creator', noun: 'creator', icon: 'film', careerId: 'marketing',
    context: 'Fictional student creator channel "CampusKaCreator", college fest week.',
    r1: [
      { kind: 'type', prompt: 'College fest reel ka hook likho (pehle 3 second)', placeholder: 'jaise: POV: fest ka pehla din', task: 'First-draft copy, posts and creative variants' },
      { kind: 'choose', prompt: 'Kaunsa thumbnail?', options: ['Close-up smile', 'Crowd ka wide shot', 'Bold text aur emoji'], task: 'Creative direction and brand judgement' },
      { kind: 'choose', prompt: 'Is hafte kis topic pe banaoge?', options: ['Fest vlog', 'Hostel life hacks', 'Tech unboxing'], task: 'Keyword, audience and competitor research' },
    ],
    agents: {
      research: { job: 'Trends aur audience research', task: 'Keyword, audience and competitor research' },
      draft: { job: '3 hook drafts likho', task: 'First-draft copy, posts and creative variants' },
      analyst: { job: 'Reel stats report', task: 'Recurring campaign reporting' },
      review: { job: 'Channel ki vibe check', task: 'Creative direction and brand judgement' },
    },
    calls: [
      { q: 'Collab kiske saath karoge?', task: 'Partner, PR and community relationships', from: 'options' },
      { q: 'Kaunsa hook sach mein tumhari awaaz hai?', task: 'Creative direction and brand judgement', from: 'drafts' },
    ],
    skills: [
      { skill: 'Creative direction and taste', zenith: 'talking-to-users' },
      { skill: 'Relationships and distribution', zenith: 'explaining-decisions' },
      { skill: 'Positioning and messaging', zenith: 'product-thinking' },
    ],
  },
  {
    id: 'doctor', label: 'Doctor', noun: 'doctor', icon: 'heart', careerId: null,
    context: 'Fictional city hospital OPD morning. Admin and communication tasks only, no diagnosis.',
    // No careers.json entry: tags are our team's reading, shown as illustrative, with no percentages.
    r1: [
      { kind: 'tap', prompt: 'Patient file mein allergy wali line dhoondo', options: ['BP normal hai', 'Penicillin se allergy', 'Neend theek hai', 'Paani kam peete hain'], correct: 1, mode: 'with_ai' },
      { kind: 'choose', prompt: 'OPD mein pehle kisko bulaoge?', options: ['Emergency tag wala patient', 'Routine check-up', 'Report collect karne wale'], correct: 0, mode: 'led_by_people' },
      { kind: 'type', prompt: 'Ghabraye hue patient ke liye ek warm line likho', placeholder: 'jaise: Aap sahi haathon mein ho', mode: 'led_by_people' },
    ],
    agents: {
      research: { job: 'Guidelines ka summary', mode: 'with_ai' },
      draft: { job: 'Visit notes ka draft', mode: 'with_ai' },
      analyst: { job: 'Reports mein flags dikhao', mode: 'with_ai' },
      review: { job: 'Notes mein kuch miss toh nahi', mode: 'with_ai' },
    },
    calls: [
      { q: 'Aaj OPD mein pehle kisko dekhoge? Yeh call doctor ki hai.', mode: 'led_by_people', from: 'options' },
      { q: 'Patient ko kaise samjhaoge? Sabse warm line chuno.', mode: 'led_by_people', from: 'drafts' },
    ],
    skills: [
      { skill: 'Patient se bharose wali baat' },
      { skill: 'Clinical judgement' },
      { skill: 'AI tools ko samajhdari se use karna' },
    ],
    note: 'AI assist karta hai, doctors decide karte hain. Doctor abhi Career Forecast data mein nahi hai, isliye yahan tags hamari team ki samajh hain, koi % nahi.',
  },
];

export const jobById = (id) => JOBS.find((j) => j.id === id) || null;

/** Resolve a task to its dataset tag: { mode, label, share, tip } (share/tip null when illustrative). */
function tag(career, t) {
  if (!career) return { mode: t.mode, label: MODE_LABEL[t.mode], share: null, tip: null, illustrative: true };
  const item = career.tasks.items.find((x) => x.text === t.task);
  if (!item) throw new Error(`jobs: task not in careers.json: ${t.task}`);
  return { mode: item.mode, label: MODE_LABEL[item.mode], share: item.share, tip: tooltip(career.tasks.src), task: item.text };
}

/** Everything the phone needs for one job (no secrets, no AI text). */
export function jobView(j) {
  const career = j.careerId ? loadData().byId.get(j.careerId) : null;
  const skills = j.skills.map((s) => {
    if (career && !career.skills_that_hold.includes(s.skill)) throw new Error(`jobs: skill not in careers.json: ${s.skill}`);
    return { skill: s.skill, courses: s.zenith ? zenithCourses(s.zenith, 2) : [] };
  });
  return {
    id: j.id, label: j.label, noun: j.noun, icon: j.icon,
    career: career ? { id: career.id, title: career.title, split: { ...career.work_split, tip: tooltip(career.work_split.src) } } : null,
    r1: j.r1.map((t) => ({ kind: t.kind, prompt: t.prompt, placeholder: t.placeholder, options: t.options, widths: t.widths, correct: t.correct, mono: t.mono, tag: tag(career, t) })),
    agents: Object.fromEntries(Object.entries(j.agents).map(([k, a]) => [k, { job: a.job, tag: tag(career, a) }])),
    calls: j.calls.map((c) => ({ q: c.q, from: c.from, tag: tag(career, c) })),
    skills,
    note: j.note || null,
    holdsTip: career ? tooltip(career.src) : null,
  };
}

export const jobsBundle = () => JOBS.map(jobView);

/* ---------------- the 2030 round: one Claude call, one section per agent ---------------- */
export const AGENTS_SCHEMA = {
  type: 'object',
  properties: {
    plan: { type: 'string', description: 'Manager Agent: one short Hinglish line, how the team splits the day' },
    research: { type: 'array', items: { type: 'string' }, description: 'Research Agent: exactly 3 short findings' },
    drafts: { type: 'array', items: { type: 'string' }, description: 'Draft Agent: exactly 3 short alternative drafts for the second human call' },
    analysis: { type: 'string', description: 'Analyst Agent: one short insight line' },
    review: { type: 'string', description: 'Review Agent: one short line, what it checked and what the human must decide' },
    call_options: { type: 'array', items: { type: 'string' }, description: 'exactly 3 short options for the first human-only call' },
  },
  required: ['plan', 'research', 'drafts', 'analysis', 'review', 'call_options'],
};

export function agentsPrompt(j) {
  const system = `You are the Manager Agent of a small AI agent team in a career game for Indian school and college students (age 14 to 22) at a college fest.
The visitor plays one 2030 workday as a ${j.label}. Your team (Research, Draft, Analyst, Review agents) does the AI-able parts in seconds,
then hands the human-only calls (judgement, taste, people) back to the visitor.
Write in Hinglish (Roman script), positive, PG, fun but not cringe. Every string under 80 characters.
No numbers, percentages, prices, salaries or dates. No real brands or people. No em-dashes or en-dashes.
No job, placement, salary, medical or exam promises. Never give medical advice or a diagnosis.`;
  const user = `Job: ${j.label}
Scenario: ${j.context}
Research Agent task: ${j.agents.research.job}
Draft Agent task: ${j.agents.draft.job} (these 3 drafts are the choices for this human call: "${j.calls[1].q}")
Analyst Agent task: ${j.agents.analyst.job}
Review Agent task: ${j.agents.review.job}
First human-only call (give 3 options): "${j.calls[0].q}"`;
  return { system, messages: [{ role: 'user', content: user }] };
}

/** Trim an answer (Claude, mock or fixture) to exactly the shape the phone uses. */
export function cleanAgents(a) {
  const s = (x) => String(x ?? '').replace(/[\u2013\u2014]/g, ',').slice(0, 120);
  const three = (arr) => { const v = (Array.isArray(arr) ? arr : []).map(s).filter(Boolean).slice(0, 3); while (v.length < 3) v.push('...'); return v; };
  return { plan: s(a.plan), research: three(a.research), drafts: three(a.drafts), analysis: s(a.analysis), review: s(a.review), call_options: three(a.call_options) };
}

/* ---------------- Doctor: bank-only (medical text is never free-written) ---------------- */
// Reviewed lines; the model only PICKS ids (strict enum schema). No diagnosis, medicine, dose or health advice.
export const DOCTOR_BANK = {
  plan: { pl1: 'AI notes, summary aur flags banayega. Har decision doctor ka rahega.', pl2: 'Paperwork AI ka, patient ke saath baat aur faisle doctor ke.' },
  research: { re1: 'OPD ki list sorted hai', re2: 'Allergy wali info file mein highlight hai', re3: 'Lab reports ready hain', re4: 'Do patients ke follow-up due hain', re5: 'Guidelines ka short summary ready hai', re6: 'Emergency tag wala ek patient list mein hai' },
  drafts: { dr1: 'Aap sahi haathon mein ho, hum har step saath chalenge', dr2: 'Sawaal poochna bilkul theek hai, main yahan hoon', dr3: 'Aaj ka plan simple hai, main aapko samjhata hoon', dr4: 'Ghabrao mat, hum saath milke samjhenge', dr5: 'Aap ne sahi time pe aake accha kiya', dr6: 'Har sawaal ka jawab milega, aaram se' },
  analysis: { an1: 'Reports mein flagged values review ke liye ek jagah dikh rahi hain', an2: 'Aaj ki OPD ka schedule ready hai', an3: 'Follow-up wale patients ki list ready hai' },
  review: { rv1: 'Notes complete lag rahe hain. Har faisla doctor ka.', rv2: 'Sab draft hai. Kya kehna aur kya karna hai, doctor decide karenge.', rv3: 'Paperwork check ho gaya. Patient se baat doctor karenge.' },
  call_options: { co1: 'Emergency tag wale patient ko pehle', co2: 'Follow-up wale patients ko pehle', co3: 'Jo sabse pehle aaye unko pehle', co4: 'Buzurg patient jo der se wait kar rahe hain', co5: 'Bachche wala case pehle', co6: 'Jo report lene aaye unko jaldi free karo' },
};
const ids = (k) => Object.keys(DOCTOR_BANK[k]);
const arr3 = (k) => ({ type: 'array', items: { type: 'string', enum: ids(k) } });
export const DOCTOR_SCHEMA = {
  type: 'object',
  properties: { plan: { type: 'string', enum: ids('plan') }, research: arr3('research'), drafts: arr3('drafts'), analysis: { type: 'string', enum: ids('analysis') }, review: { type: 'string', enum: ids('review') }, call_options: arr3('call_options') },
  required: ['plan', 'research', 'drafts', 'analysis', 'review', 'call_options'],
};
export function doctorPrompt() {
  const list = Object.entries(DOCTOR_BANK).map(([k, v]) => `${k}:\n${Object.entries(v).map(([id, t]) => `  ${id}: ${t}`).join('\n')}`).join('\n');
  return {
    system: 'You arrange a fictional, non-medical hospital OPD morning for a career game. You never write text: you only pick line ids from the list. Pick 3 different ids for every list field and 1 id for the others.',
    messages: [{ role: 'user', content: `Pick ids for: plan, research (3), drafts (3), analysis, review, call_options (3).\n${list}` }],
  };
}
/** ids -> reviewed text. Unknown or repeated ids fall back to the first unused bank lines (never free text). */
export function doctorFromPicks(p = {}) {
  const one = (k) => DOCTOR_BANK[k][p?.[k]] ?? Object.values(DOCTOR_BANK[k])[0];
  const three = (k) => {
    const want = [...new Set(Array.isArray(p?.[k]) ? p[k] : [])].filter((id) => id in DOCTOR_BANK[k]);
    for (const id of ids(k)) if (want.length < 3 && !want.includes(id)) want.push(id);
    return want.slice(0, 3).map((id) => DOCTOR_BANK[k][id]);
  };
  return { plan: one('plan'), research: three('research'), drafts: three('drafts'), analysis: one('analysis'), review: one('review'), call_options: three('call_options') };
}
