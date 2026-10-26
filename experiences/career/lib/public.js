// Public text for Career Studio (BRAIN rule, CHECK_build item 12; core CONTRACT section 13).
// Everything that can reach the counter TV, a share card or the WhatsApp PDF is a reviewed BANK line or a fixed
// TEMPLATE with typed slots. Free AI text (the Job Time Machine drafts) is phone-only and passes the judge first.
//   registerPublic(safety)  registers every bank and template with core (ctx.safety) at boot
//   localSafety()           the same API when core's module is not there (dev, the Mac batch script, tests):
//                           exact bank lines, strict template matching, a rule-based judge that fails closed
// Ids are short; core namespaces them as career.<id>.
import { JOBS } from './jobs.js';
import { loadData, MODE_LABEL, careerView, zenithView, tooltip, DATA_VERSION } from './data.js';

const uniq = (a) => [...new Set(a.filter(Boolean))];
const toBank = (prefix, lines) => Object.fromEntries(uniq(lines).map((l, i) => [`${prefix}${String(i + 1).padStart(3, '0')}`, l]));

export function publicDefs() {
  const d = loadData();
  const careers = [...d.byId.values()];
  const labels = Object.values(MODE_LABEL);
  const jobLabels = JOBS.map((j) => j.label);
  const nouns = uniq(JOBS.map((j) => j.noun));
  const agentJobs = uniq(JOBS.flatMap((j) => Object.values(j.agents).map((a) => a.job)));
  const banks = {
    // orchestra: names, roles, tasks, handoff labels and fixed log lines
    orx: toBank('o', [
      'Manager Agent', 'Orchestrator', 'Research', 'Draft', 'Analyst', 'Review',
      'Research Agent', 'Draft Agent', 'Analyst Agent', 'Review Agent',
      ...agentJobs, ...labels, '2 calls insaan ke liye',
      'Research, Draft, Analyst aur Review ko kaam diya. Judgement, taste aur logon wali calls insaan ke liye.',
    ]),
    r1prompt: toBank('p', JOBS.flatMap((j) => j.r1.map((t) => t.prompt))),
    callq: toBank('q', JOBS.flatMap((j) => j.calls.map((c) => c.q))),
    skills: toBank('s', JOBS.flatMap((j) => j.skills.map((s) => s.skill))),
    areas: toBank('a', d.interest.areas.map((a) => a.label)),
    fixed: toBank('f', [
      'Tumhara 2030 skill stack', 'Career Forecast preview', 'A forecast, not a guarantee.', 'Job Time Machine',
      'For fun only', 'Forecast, guarantee nahi',
    ]),
    nouns: toBank('n', nouns),
    // names of the custom TV events (the bus checks them like any other text)
    events: toBank('e', ['r1', 'r1_done', 'call']),
  };
  const templates = {
    orx_title: ['{job} · 2030', { job: jobLabels }],
    orx_done_task: ['[{tag}] {task}: ho gaya', { tag: labels, task: agentJobs }],
    orx_ai_time: ['AI ne 4 kaam {n}s mein kiye. Ab 2 calls tumhari: judgement aur taste.', { n: 'int:0..3600' }],
    orx_call: ['Call {i}: {tag} wali call tumne li', { i: 'int:1..2', tag: labels }],
    orx_summary: ['2030 ka din done: AI {n}s, tumhari 2 calls', { n: 'int:0..3600' }],
    job: ['{job}', { job: jobLabels }],
    res_title: ['2030 ka {noun}', { noun: nouns }],
    card_title: ['2026 ka {noun} vs 2030 ka {noun2}', { noun: nouns, noun2: nouns }],
    card_r1: ['2026: {n}s, sab haath se', { n: 'int:0..3600' }],
    card_r2: ['2030: AI {n}s, maine 2 calls li', { n: 'int:0..3600' }],
    fc_line: ['{career}: {badge}', { career: careers.map((c) => c.title), badge: ['Growing', 'Changing'] }],
  };
  return { banks, templates };
}

/**
 * The WhatsApp PDF's text: fixed lines, data lines (career titles, lines, skills, sources, Zenith wording exactly as
 * zenith.json) and a few templates. lib/pdf.js checks every string it draws against these and refuses anything else.
 */
export function pdfDefs({ stopText = 'play.zenithschool.ai/stop' } = {}) {
  const d = loadData();
  const z = zenithView();
  const careers = [...d.byId.values()].map(careerView);
  const areaLabels = d.interest.areas.map((a) => a.label);
  return {
    banks: {
      pdf_fixed: toBank('x', [
        'Career Forecast: Ideas 4.0', 'Career Forecast', 'by Zenith School of AI', 'Career Forecast, by Zenith School of AI', 'zenithschool.ai',
        'A forecast, not a guarantee.', 'Is PDF mein', 'Aage kya?', 'Is area ke baaki careers (poore forecast mein):',
        'Poora forecast (sab careers, skills by year, course check): Career Studio counter ya zenithschool.ai.',
        'Badge = hiring outlook for 2030. Bar = how the work splits between AI and people.',
        'Poora Career Forecast dekho: sab careers, skills by year aur apne course ka check. Career Studio counter pe ya zenithschool.ai pe.',
        '2. Zenith School of AI: B.Tech in AI + mini-MBA, one KRMU degree.', 'Growing', 'Changing',
        `Message STOP to stop, ya ${stopText}`,
        `Data: ${DATA_VERSION}. Careers and work split: Zenith School of AI research, 2026.`,
      ]),
      pdf_data: toBank('d', [
        ...careers.flatMap((c) => [c.title, c.line, `Skills that hold: ${c.holds.join(', ')}`, `Source: ${c.split.tip}`]),
        z.programmeLine, z.degreeLine, `${z.tooltip}. ${z.footer}`, ...z.usps.flatMap((u) => [u.title, ...u.lines]),
      ]),
    },
    templates: {
      pdf_page: ['Page {n} of {total}', { n: 'int:1..3', total: 'int:3..3' }],
      pdf_area: ['{area}. KRMU Ideas 4.0, 27-28 Oct 2026.', { area: areaLabels }],
      pdf_top: ['Top careers: {area}', { area: areaLabels }],
      pdf_inside: ['1. {area}: top careers, kaam ka split (Done by AI / Done with AI / Led by people) aur skills that hold.', { area: areaLabels }],
      pdf_day: ['{d} {month} {y}', { d: 'int:1..31', month: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], y: 'int:2026..2030' }],
      pdf_split: ['{mode} {n}%', { mode: Object.values(MODE_LABEL), n: 'int:0..100' }],
    },
  };
}

/** A checker for the PDF (local, so the Mac batch script works without the server). */
export function pdfChecker(opts) {
  const s = localSafety();
  const { banks, templates } = pdfDefs(opts);
  for (const [id, lines] of Object.entries(banks)) s.bank(id, lines);
  for (const [id, [text, slots]] of Object.entries(templates)) s.template(id, text, slots);
  return s;
}

export function registerPublic(safety, { stopText } = {}) {
  const pub = publicDefs();
  const pdf = pdfDefs({ stopText });
  const banks = { ...pub.banks, ...pdf.banks };
  const templates = { ...pub.templates, ...pdf.templates };
  for (const [id, lines] of Object.entries(banks)) safety.bank(id, lines);
  for (const [id, [text, slots]] of Object.entries(templates)) safety.template(id, text, slots);
}

/**
 * Career rules on top of the judge (CHECK-03c): a model line is flagged when it puts the visitor down, uses job-loss
 * fear copy, or gives any medicine or dose instruction. Errs towards flagging.
 */
const CAREER_RULES = [
  // put-downs about the visitor
  /\b(tum|tu|aap|you)\b[^.!?]{0,40}\b(bekaar|bekar|nikamm\w*|nalayak|bewakoof|bevakoof|pagal|loser|useless|worthless|failure|stupid|dumb|lazy|kamzor)\b/i,
  /\bkuch (bhi )?nahi kar (paoge|paogi|paaoge|sakte|sakoge|sakogi|payega|payegi)\b/i,
  /\b(you('| a)re|you will be|you'll be|tum ho) (a )?(nothing|failure|loser|useless|worthless)\b/i,
  /\b(fail ho jaoge|fail ho jaogi|haar jaoge|haar jaogi|kabhi kamyab nahi)\b/i,
  // job-loss fear copy
  /\bnaukri\w* (kha|chheen|chhin|le|chali|khatam)\w*/i, /\bberozgaa?r\w*/i, /\b(career|job|naukri)\w* (khatam|barbaad|tabah|over)\b/i,
  /\b(unemploy\w*|jobless|lose (your|their|all) jobs?|jobs? (will )?(vanish|disappear|be gone)|replace (you|tumhe)|tumhe replace)\b/i,
  /\b(koi|no) (naukri|job|jobs) nahi (bachegi|milegi|rahegi)\b/i,
  // medicine, dose or treatment instructions
  /\b\d+(\.\d+)?\s?(mg|mcg|ml|g|iu|units?|tablets?|goli|golis)\b/i,
  /\b(dose|dosage|dosing|paracetamol|ibuprofen|aspirin|crocin|dolo|insulin|metformin|antibiotic\w*|steroid\w*|tablet\w*|capsule\w*|syrup|injection|inhaler|prescri\w*|medicin\w*|medic\w*|dawai|dawa|goli|drip|treatment|ilaaj|ilaj|diagnos\w*)\b/i,
  /\b(twice|thrice|once) a day\b|\bdin mein (ek|do|teen) baar\b|\b(khaana|khana) (ke )?(pehle|baad) lo\b/i,
];
export const careerRuleHit = (text) => typeof text !== 'string' || CAREER_RULES.some((re) => re.test(text));

/* ---------------- local fallback with the core API shape ---------------- */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function slotRe(type) {
  if (Array.isArray(type)) return `(${type.map(esc).join('|')})`;
  if (/^int:/.test(type) || type === 'count') return '(\\d{1,6})';
  return '([^\\n]{1,40})';
}
function slotOk(type, v) {
  if (Array.isArray(type)) return type.includes(v);
  const m = /^int:(-?\d+)\.\.(-?\d+)$/.exec(type);
  if (m) { const n = Number(v); return Number.isInteger(n) && n >= Number(m[1]) && n <= Number(m[2]); }
  if (type === 'count') return Number.isInteger(Number(v)) && Number(v) >= 0;
  return typeof v === 'string' && v.length <= 40;
}
// rule-based judge for phone-only AI text: anything risky or off-copy is flagged; it errs towards flagging
const JUDGE_RE = /[\u2013\u2014]|https?:|www\.|@|\d{6,}|\b(kill\w*|die|died|dead|suicid\w*|sex\w*|dat(e|ing)|boyfriend|girlfriend|love|crush|drug\w*|alcohol|sharaab|ganja|gun|bomb|maar\w*|marna|fail\w*|bekaar|stupid|idiot|ugly|fat|doctor\w*|diagnos\w*|medic\w*|dawai|dawa|tablet|disease|cancer|therapy|diet|weight|school|college|salary|lakh|crore|lpa|guarantee\w*|pakki)\b/i;

export function localSafety() {
  const banks = new Map();
  const templates = new Map();
  return {
    local: true,
    bank(id, lines) { banks.set(id, { ...lines }); },
    template(id, text, slots) {
      const names = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const re = new RegExp(`^${text.split(/\{\w+\}/).map(esc).reduce((acc, part, i) => acc + part + (i < names.length ? slotRe(slots[names[i]]) : ''), '')}$`);
      templates.set(id, { text, slots, names, re });
    },
    publicText(id, arg) {
      if (typeof arg === 'string') {
        const line = banks.get(id)?.[arg];
        if (line === undefined) throw new Error(`publicText: unknown line ${id}.${arg}`);
        return { pt: `career.${id}.${arg}`, text: line };
      }
      const t = templates.get(id);
      if (!t) throw new Error(`publicText: unknown template ${id}`);
      let text = t.text;
      for (const n of t.names) {
        if (!slotOk(t.slots[n], arg?.[n])) throw new Error(`publicText: bad slot ${id}.${n}`);
        text = text.replace(`{${n}}`, String(arg[n]));
      }
      return { pt: `career.${id}`, text };
    },
    /** true when `text` is a registered bank line or matches a registered template (what bus strict mode checks). */
    accepts(text) {
      if (typeof text !== 'string') return true;
      for (const b of banks.values()) if (Object.values(b).includes(text)) return true;
      for (const t of templates.values()) {
        const m = t.re.exec(text);
        if (m && t.names.every((n, i) => slotOk(t.slots[n], Array.isArray(t.slots[n]) ? m[i + 1] : /^int:|^count$/.test(t.slots[n]) ? Number(m[i + 1]) : m[i + 1]))) return true;
      }
      return false;
    },
    /** Find a bank line id by its text (used to send bank text by value). */
    lineId(id, text) { const b = banks.get(id); return b ? Object.keys(b).find((k) => b[k] === text) || null : null; },
    async judge(items) {
      const flagged = items.filter((x) => typeof x.text !== 'string' || !x.text.trim() || x.text.length > 160 || JUDGE_RE.test(x.text) || careerRuleHit(x.text)).map((x) => x.id);
      return { ok: items.filter((x) => !flagged.includes(x.id)), flagged };
    },
    input() { return false; }, // core's care path decides; locally the phone kit and core care-words do it
    async inputLive() { return false; },
    careResponse(res) { return res.status(200).json({ care: true }); },
  };
}
