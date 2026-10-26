// Shared safety (CONTRACT section 13, CHECK_build item 12).
//  - public text: only vetted bank lines and fixed templates may reach a TV, share card or reel
//  - judge(): one small Claude pass for phone-only AI text; it returns the ids it APPROVES, so anything it
//    omits, and any failure, counts as flagged (fails closed by design)
//  - care: self-harm / crisis detection (server side is the authority), care response, quiet operator alerts
import { detect, detectDeep, IMAGE_KEYS, isImagePayload } from '../web/care-words.js';
import { cleanText, hasProfanity } from './textfilter.js';
import { DemoFallback } from './claude.js';

const NICK = /^[A-Z][a-z]+[A-Z][a-z]+\d{0,2}$/; // core-generated nickname shape (section 12.2), max 12 chars

// Job / placement / salary guarantees (combined re-check: sentence level). A judged line with ANY guarantee or promise
// word and ANY job, placement, salary, package, LPA or company word anywhere in it is flagged (every experience).
const G_WORD = /(?:\b(?:guarantee[ds]?|guaranteed|guaranty|gaurantee[ds]?|garanti|garantee|promise[ds]?|promising|vaada|vada|waada|wada|pakk[aie]|pukka|pucca|assured?|assures|surely|sure[\s-]?shot|definite(?:ly)?|confirm(?:ed)?|lifetime|life[\s-]?long|secure[ds]?|security|ensure[ds]?|ensuring|certain|certainly|bharosa|bharosaa|bharose|zimmedari|zimmedaari|jimmedari|tay hai|tay he|mil hi jayegi|mil hi jayega|pakka hai|milegi hi|milega hi|zaroor milegi|zaroor milega|zarur milegi|jarur milegi)\b|\b100\s?(?:%|percent|per cent|pratishat)|\bsau (?:pratishat|percent)\b|\bhundred percent\b)/iu;
const J_WORD = /\b(?:jobs?|naukri|naukari|nokri|naukriyan|placements?|placed|salary|salaries|package|packages|lpa|ctc|compan(?:y|ies)|mnc|mncs|offer letters?|internships?|selection|hiring|rozgaa?r|employment|employed|employable|careers?|hire[ds]?|hiring|recruit(?:ed|s|ment|ing)?|naukri pakki)\b/iu;
const G_DEVA = /(?:गारंटी|गैरंटी|पक्का|पक्की|वादा|निश्चित|तय|भरोसा|ज़िम्मेदारी|जिम्मेदारी|ज़रूर मिलेगी|जरूर मिलेगी|ज़रूर मिलेगा|जरूर मिलेगा|100\s?%|सौ प्रतिशत)/u;
const J_DEVA = /(?:नौकरी|नौकरियां|जॉब|प्लेसमेंट|सैलरी|वेतन|पैकेज|कंपनी|कम्पनी|करियर|कैरियर)/u;
// Exam-result promises (sentence level): a promise word plus an exam OUTCOME word (marks, rank, topper, result,
// selection, pass/clear ...). Study advice ("exam se pehle revise karo", "pakka plan banao") stays fine: plain
// "exam", "boards" or "JEE" without an outcome is not enough, and the promise words here are the strict ones only.
const G_EXAM = /(?:\b(?:zimmedari|zimmedaari|jimmedari|responsibility|guarantee[ds]?|guaranteed|guaranty|gaurantee[ds]?|garanti|garantee|promise[ds]?|vaada|vada|waada|wada|pakk[aie]|pukka|pucca|assured?|surely|sure[\s-]?shot|confirm(?:ed)?|tay hai|milenge hi|milega hi|banoge hi|aaoge hi|zaroor (?:aayenge|aayega|milenge|milega|banoge|banogi|ban jaoge|ban jaogi|pass|clear|top))\b|\b100\s?(?:%|percent|per cent|pratishat)|\bsau (?:pratishat|percent)\b|\bhundred percent\b)/iu;
const EXAM_OUTCOME = /\b[3-9]\d(?:\.\d+)?\s?(?:%|percent|per cent)|\b(?:marks|mark|numbers?|nambar|percentile|percentage|ranks?|air|toppers?|top (?:karoge|karogi|karenge|aaoge|aaogi|kar loge)|first (?:aaoge|aaogi|aayega|position)|cut-?off|results?|selection|selected|admission|seat|pass (?:ho jaoge|ho jaogi|hoge|karoge|karogi|ho jayega)|clear (?:ho jayega|karoge|karogi|kar loge)|crack (?:karoge|karogi|kar loge|it)|grades?|cgpa|gpa|full marks|distinction)\b/iu;
const G_EXAM_DEVA = /(?:गारंटी|गैरंटी|पक्का|पक्की|पक्के|वादा|100\s?%|सौ प्रतिशत|ज़रूर (?:मिलेंगे|आएंगे|बनोगे)|जरूर (?:मिलेंगे|आएंगे|बनोगे))/u;
const EXAM_DEVA = /(?:अंक|नंबर|मार्क्स|प्रतिशत|रैंक|टॉपर|पास हो|रिजल्ट|परिणाम|सिलेक्शन|चयन|एडमिशन|सीट)/u;
const GUARANTEE_EXAM = { test: (t) => (G_EXAM.test(t) && EXAM_OUTCOME.test(t)) || (G_EXAM_DEVA.test(t) && (EXAM_DEVA.test(t) || EXAM_OUTCOME.test(t))) || (G_EXAM.test(t) && EXAM_DEVA.test(t)) };
const GUARANTEE = { test: (t) => (G_WORD.test(t) && J_WORD.test(t)) || (G_DEVA.test(t) && (J_DEVA.test(t) || J_WORD.test(t))) || (G_WORD.test(t) && J_DEVA.test(t)) };

/** inputLive() result helpers (CHECK-20 F8): never treat 'unchecked' as a crisis. */
export const isCrisis = (r) => r === true;
export const isUnchecked = (r) => r === 'unchecked';

export function createSafety({ config, claude, analytics, log = () => {}, now = () => Date.now() }) {
  const banks = new Map(); // `${exp}.${id}` -> Map(key -> line)
  const templates = new Map(); // `${exp}.${id}` -> { text, slots, re, names }
  const lists = new Map(); // `${exp}.${name}` or `core.${name}` -> string[]
  const lineIndex = new Map(); // exp -> Set(all bank lines) for the bus check
  const untemplated = new Map(); // exp -> count (warn mode)
  const strict = config.publicTextStrict;

  // Core lists experiences can reference as `list:<name>` (or `list:<exp>.<name>` for their own).
  lists.set('core.signs', ['Mesh', 'Vrishabh', 'Mithun', 'Kark', 'Simha', 'Kanya', 'Tula', 'Vrishchik', 'Dhanu', 'Makar', 'Kumbh', 'Meen',
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']);
  lists.set('core.sources', ['claude reply', 'mock reply', 'offline fixture', 'hero demo fixture']);

  // Copy rules (Avi, 24 Oct): no who-coded-what claims in public ("directed and tested", "3 din", students coded alone or did
  // not code, ...). "first-years" and "agents ke saath" appear only in the configured hero line (PUBLIC_HERO_LINE), which is always allowed.
  const FORBIDDEN = /first[\s-]?years?|direct aur test|directed and tested|\b3 din\b|agents ke saath|zenith x ai agents|ai agents ne banaya|students? ne (?:hi |akele )?code kiya|students? (?:didn'?t|did not|never) code|students? coded (?:it )?(?:alone|themselves|everything)|bina agents ke/i;
  const lineOk = (line) => typeof line === 'string' && line.length > 0 && line.length <= 200 && !/[\u2013\u2014]/.test(line) && cleanText(line) === line && !detect(line)
    && (line === config.publicHeroLine || line === config.publicHeroLineHi || !FORBIDDEN.test(line));

  function bank(exp, id, entries) {
    const full = `${exp}.${id}`;
    const m = new Map(Object.entries(entries || {}));
    for (const [k, line] of m) if (!lineOk(line)) throw new Error(`safety.bank ${full}.${k}: line fails the copy rules (dashes, profanity, care words or over 200 chars)`);
    banks.set(full, m);
    const set = lineIndex.get(exp) || new Set();
    for (const line of m.values()) set.add(line);
    lineIndex.set(exp, set);
  }

  function list(exp, name, values) {
    if (!Array.isArray(values) || !values.length) throw new Error('safety.list needs a non-empty array');
    for (const v of values) if (!lineOk(String(v))) throw new Error(`safety.list ${exp}.${name}: value fails the copy rules: ${v}`);
    lists.set(`${exp}.${name}`, values.map(String));
  }

  function slotValues(exp, spec) {
    if (Array.isArray(spec)) return spec.map(String);
    if (typeof spec === 'string' && spec.startsWith('list:')) {
      const n = spec.slice(5);
      return lists.get(n.includes('.') ? n : `${exp}.${n}`) || lists.get(`core.${n}`) || null;
    }
    return null;
  }

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function slotRe(exp, spec) {
    const vals = slotValues(exp, spec);
    if (vals) return `(${vals.map(esc).sort((a, b) => b.length - a.length).join('|')})`;
    if (spec === 'nickname') return '([A-Z][a-z]+[A-Z][a-z]+\\d{0,2})';
    if (spec === 'count') return '(\\d{1,4})'; // at most 4 digits per number slot (CHECK-20 F6)
    const m = /^int:(-?\d+)\.\.(-?\d+)$/.exec(spec || '');
    if (m) { if (Math.max(Math.abs(Number(m[1])), Math.abs(Number(m[2]))) > 9999) throw new Error(`safety.template: ${spec} is wider than 4 digits (a number slot may never spell a phone number)`); return '(-?\\d{1,4})'; }
    const lb = /^label:([A-Z][A-Za-z]{1,11})$/.exec(spec || '');
    if (lb) return `(${lb[1]} #\\d{1,5})`;
    // CHECK_build 13: slots are int, enum (array or list:), count, nickname or a numbered label. Never free text.
    throw new Error(`safety.template: slot type ${JSON.stringify(spec)} is not allowed (int:a..b, an enum array, list:<name>, count, nickname, label:<Word>)`);
  }
  let slotCtx = null;
  let knownNickname = () => false;
  function slotOk(exp, spec, v) {
    const vals = slotValues(exp, spec);
    if (vals) return vals.includes(String(v));
    if (spec === 'nickname') {
      if (typeof v !== 'string' || v.length > 12 || !NICK.test(v)) return false;
      // provenance (CHECK-16): the phone's own generated nickname, or any nickname core generated (server side)
      return slotCtx && 'nickname' in slotCtx ? slotCtx.nickname === v : knownNickname(v);
    }
    if (spec === 'count') return /^\d{1,4}$/.test(String(v));
    const m = /^int:(-?\d+)\.\.(-?\d+)$/.exec(spec);
    if (m) { const n = Number(v); return /^-?\d+$/.test(String(v)) && n >= Number(m[1]) && n <= Number(m[2]); }
    const lb = /^label:([A-Z][A-Za-z]{1,11})$/.exec(spec);
    if (lb) return new RegExp(`^${lb[1]} #\\d{1,5}$`).test(String(v));
    return false;
  }

  function template(exp, id, text, slots = {}) {
    const full = `${exp}.${id}`;
    if (!lineOk(text.replace(/\{[a-zA-Z]\w*\}/g, 'x'))) throw new Error(`safety.template ${full}: text fails the copy rules`);
    const names = [];
    const pattern = text.split(/(\{[a-zA-Z]\w*\})/).map((part) => {
      const m = /^\{([a-zA-Z]\w*)\}$/.exec(part);
      if (!m) return esc(part);
      if (!(m[1] in slots)) throw new Error(`safety.template ${full}: slot {${m[1]}} has no type`);
      names.push(m[1]);
      return slotRe(exp, slots[m[1]]);
    }).join('');
    templates.set(full, { exp, text, slots, names, re: new RegExp(`^${pattern}$`) });
  }

  /** { pt, text } for a bank line or a filled template. Throws on unknown ids or bad slots. */
  function publicText(exp, id, keyOrSlots) {
    const full = id.includes('.') && (banks.has(id) || templates.has(id)) ? id : `${exp}.${id}`;
    if (banks.has(full)) {
      const line = banks.get(full).get(String(keyOrSlots));
      if (line === undefined) throw new Error(`publicText: no line ${full}:${keyOrSlots}`);
      return { pt: `${full}:${keyOrSlots}`, text: line };
    }
    const t = templates.get(full);
    if (!t) throw new Error(`publicText: no bank or template ${full}`);
    const slots = keyOrSlots || {};
    for (const n of t.names) if (!slotOk(t.exp, t.slots[n], slots[n])) throw new Error(`publicText: ${full} slot ${n} rejects ${JSON.stringify(slots[n])}`);
    const text = t.text.replace(/\{([a-zA-Z]\w*)\}/g, (_, n) => String(slots[n]));
    return { pt: full, slots: Object.fromEntries(t.names.map((n) => [n, slots[n]])), text };
  }

  /** Is this exact string public text for `exp` (a bank line, a filled template, a number, or a core line)? */
  function isPublic(exp, s, ctx = null) {
    slotCtx = ctx;
    try { return isPublicInner(exp, s); } finally { slotCtx = null; }
  }
  function isPublicInner(exp, s) {
    if (typeof s !== 'string') return true;
    if (s === '' || CORE_LINES.has(s)) return true;
    if (/^-?\d+(\.\d+)?%?$/.test(s)) return s.replace(/\D/g, '').replace(/^0+/, '').length <= 4; // a plain number is public only up to 4 digits (CHECK-20 F6)
    if (lineIndex.get(exp)?.has(s)) return true;
    for (const t of templates.values()) {
      if (t.exp !== exp) continue;
      const m = t.re.exec(s);
      if (m && t.names.every((n, i) => slotOk(t.exp, t.slots[n], m[i + 1]))) return true;
    }
    return false;
  }
  // Lines core itself puts on a TV event (kit defaults, stage, sample-free core copy).
  const CORE_LINES = new Set(['For fun only', 'Agent Orchestra', 'Orchestrator']);

  /** Bus hook: returns null if fine, or a rejection reason. Counts untemplated text in warn mode. */
  function checkTvText(exp, values, ctx = null) {
    const bad = values.filter((v) => !isPublic(exp, v, ctx));
    if (!bad.length) return null;
    untemplated.set(exp, (untemplated.get(exp) || 0) + bad.length);
    // count-only warning either way, so builders can see what was dropped (never the text itself)
    log({ kind: 'public_text', exp, untemplated: bad.length, dropped: strict });
    if (!strict) return null;
    return `text is not a registered bank line or template (${bad.length})`;
  }

  // ---------- judge ----------
  const RULES = [
    /\b(stupid|idiot|bewakoof|bevakoof|pagal|ugly|fat|mota|moti|kaala|kaali|loser|nikamma|nalayak|dumb|useless|fail ho|fail hoge|haar jaoge|kabhi nahi)\b/i, // negative about a person
    /\b(maar|maro|kill|khoon|blood|gun|bandook|chaku|knife|bomb|attack|ladai|fight|violence|hinsa)\b/i, // violent
    /\b(sexy|sex|kiss|hot|nude|body|figure|bed|boobs)\b/i, // sexual / body
    /\b(school|college|vidyalaya|dps|kv|st\.? [a-z]+|class [0-9]+[a-z]?|section [a-z])\b/i, // identifying a school
    /\b(doctor|dawai|dawa|medicine|tablet|disease|bimari|beemari|cancer|diabetes|pregnan\w*|depression|anxiety|bmi|weight|vajan|diet|calorie|therapy)\b/i, // medical
    /\b(girlfriend|boyfriend|gf|bf|crush|shaadi|shadi|pyaar|pyar|love|date|dating|romance|romantic|propose|marriage)\b/i, // romantic
    GUARANTEE, // job / placement / salary guarantees anywhere in the line (copy rule: never promise outcomes)
    GUARANTEE_EXAM, // exam marks / rank / result / selection promises anywhere in the line
  ];
  function rulePass(lines) {
    return lines.filter((l) => typeof l.text === 'string' && !detect(l.text) && cleanText(l.text) === l.text.replace(/\s{2,}/g, ' ').trim() && !RULES.some((re) => re.test(l.text))).map((l) => l.id);
  }
  const JUDGE_SCHEMA = { type: 'object', properties: { approved: { type: 'array', items: { type: 'string' } } }, required: ['approved'] };
  const JUDGE_SYSTEM = `You review short lines that an app will show to a school or college student at a fest stall in India.
Return the ids of the lines you APPROVE. Approve a line only if it is positive, PG and safe for a 13 year old: not negative about any person,
not violent, not sexual or about bodies or looks, does not identify a real person, school or college, not medical or about health or diet,
not romantic, no profanity, nothing about self-harm. Never approve a line that promises or guarantees a job, placement, salary,
package, LPA, company, exam marks, rank, result, selection or any other outcome ("100% job", "pakki naukri", "we promise you a job",
"100% marks pakke", "rank guaranteed", "topper ban jaoge pakka"). When unsure, do not approve.
Lines may be in Hinglish.`;

  /**
   * judge(lines, { exp }) -> { ok: lines approved, flagged: ids }. The model returns APPROVED ids; every line it
   * does not approve (including ones it omits) is flagged. Any failure flags all. Mock/offline: rule pass.
   */
  async function judge(exp, lines) {
    const all = (lines || []).filter((l) => l && typeof l.id === 'string');
    // ids must be unique: a line sharing its id with another is flagged (no approving a bad line by its twin)
    const counts = all.reduce((m, l) => m.set(l.id, (m.get(l.id) || 0) + 1), new Map());
    const dupes = all.filter((l) => counts.get(l.id) > 1).map((l) => l.id);
    const list = all.filter((l) => counts.get(l.id) === 1);
    if (!list.length) return { ok: [], flagged: [...new Set(dupes)] };
    let approved;
    try {
      const out = await claude.run({
        exp, task: 'judge', system: JUDGE_SYSTEM, effort: 'low', maxTokens: 400, schema: JUDGE_SCHEMA,
        messages: [{ role: 'user', content: JSON.stringify(list.map((l) => ({ id: l.id, text: String(l.text).slice(0, 300) }))) }],
        mock: () => ({ approved: rulePass(list) }),
      });
      approved = new Set((out.approved || []).map(String));
      // the model can only approve what also passes the deterministic rules
      const rules = new Set(rulePass(list));
      approved = new Set([...approved].filter((id) => rules.has(id)));
    } catch (e) {
      if (e instanceof DemoFallback && (e.reason === 'demo_mode' || e.reason === 'no_key' || e.reason === 'spend_cap')) approved = new Set(rulePass(list));
      else { log({ kind: 'judge', exp, err: e?.reason || e?.name || 'error' }); approved = new Set(); }
    }
    const ok = list.filter((l) => approved.has(l.id));
    return { ok, flagged: [...list.filter((l) => !approved.has(l.id)).map((l) => l.id), ...new Set(dupes)] };
  }

  // ---------- care ----------
  const alerts = new Map(); // `${exp}:${c}` -> [{ id, at }]
  const careLocked = new Map(); // pz_sid -> until (ms): nothing from this phone reaches a TV meanwhile
  const LOCK_MS = 15 * 60 * 1000;
  let alertSeq = 0;
  const lastAlert = new Map(); // sid -> at (dedupe)

  function raise(exp, c, sid, kind = 'care', ref = null) {
    if (sid) {
      if (kind === 'care') careLocked.set(sid, now() + LOCK_MS);
      if (now() - (lastAlert.get(sid) || 0) < 60000) return false;
      lastAlert.set(sid, now());
    }
    const cn = Number.isInteger(Number(c)) && Number(c) >= 0 && Number(c) <= 99 ? Number(c) : 0;
    const key = `${exp}:${cn}`;
    const entry = { id: ++alertSeq, at: new Date(now()).toISOString(), kind, exp, ...(ref ? { ref } : {}) }; // time, experience and kind only (+ the page path for a report)
    // Page reports have their OWN bucket (CHECK-20 F2): however many reports arrive, they never push out a care or
    // language alert. Care and language: last 20 per counter. Reports: last 50 overall.
    if (kind === 'report') {
      // one entry per page (a repeat report refreshes it), last 200 pages: a flood from many IPs cannot push a real report out (N16)
      const i = reports.findIndex((r) => r.ref && r.ref === entry.ref);
      if (i >= 0) reports.splice(i, 1);
      reports.push({ ...entry, key });
      if (reports.length > 200) reports.splice(0, reports.length - 200);
      return true;
    }
    const list = alerts.get(key) || [];
    list.push(entry);
    alerts.set(key, list.slice(-20));
    return true;
  }
  const reports = []; // { id, at, kind: 'report', exp, ref, key }
  const isCareLocked = (sid) => !!sid && (careLocked.get(sid) || 0) > now();
  const strip = ({ key: _k, ...a }) => a;
  function alertsFor(exp, c) { const key = `${exp}:${Number(c) || 0}`; return [...(alerts.get(key) || []), ...reports.filter((r) => r.key === key).map(strip)]; }
  /** every counter's alerts, newest first: { id, at, kind, exp, c } only (the all-counters safety panel) */
  function allAlerts() {
    const cOf = (k) => Number(k.slice(k.lastIndexOf(':') + 1));
    return [...[...alerts.entries()].flatMap(([k, list]) => list.map((a) => ({ ...a, c: cOf(k) }))), ...reports.map((r) => ({ ...strip(r), c: cOf(r.key) }))].sort((x, y) => y.id - x.id);
  }
  function dismiss(exp, c, id) {
    const key = `${exp}:${Number(c) || 0}`;
    alerts.set(key, (alerts.get(key) || []).filter((a) => a.id !== Number(id)));
    const i = reports.findIndex((r) => r.id === Number(id));
    if (i >= 0) reports.splice(i, 1);
  }

  // Numbered labels ("Idea #142"): stable per session and word, never derived from visitor text.
  const labels = new Map(); // `${sid}|${word}` -> label
  let labelSeq = 100;
  function ideaLabel(req, word = 'Idea') {
    if (!/^[A-Z][A-Za-z]{1,11}$/.test(word)) throw new Error('ideaLabel: word must be one capitalised word');
    const key = `${req?.sid || 'anon'}|${word}`;
    if (!labels.has(key)) { labelSeq += 1 + Math.floor(Math.random() * 3); labels.set(key, `${word} #${labelSeq}`); }
    if (labels.size > 50000) labels.delete(labels.keys().next().value);
    return labels.get(key);
  }

  // ---------- live crisis gate (combined re-check, BRAIN 24 Oct) ----------
  // In live mode the model is the MAIN gate: every free-text string a route checks goes to one small Claude call,
  // schema { crisis, confidence }, with a 3 s deadline. The rules are the offline backstop: they answer first (a
  // rule hit is a crisis, no call needed) and they are all there is when the live check is unavailable.
  // Degraded mode = the live check is unavailable (no key, mock, demo, offline, spend cap, or it failed or timed out
  // in the last minute): the kit shows the care line more prominently and every rule hit (care or language) raises
  // the quiet operator alert.
  const CRISIS_SCHEMA = { type: 'object', properties: { crisis: { type: 'boolean' }, confidence: { type: 'number' } }, required: ['crisis', 'confidence'] };
  const CRISIS_SYSTEM = `You check messages typed by a student (13 to 25 years old) at a fest stall in India: English, Hinglish or Hindi.
Answer crisis=true if any message suggests self-harm, suicide, wanting to die, not wanting to exist, being a burden, a goodbye or
final message, asking how to hurt oneself (methods, amounts, places), or being in danger. Indirect, hinted and joking-but-possible
cases count. Err towards true. confidence = how likely (0 to 1) it is that the writer may be at risk.
Not a crisis: exam stress, boredom, tiredness, sports, movie plots, "dying of laughter", "is pitch ne maar diya", ending poverty or plastic.`;
  // CHECK-21 L1: 6 s deadline (about 5% of calls took over 3 s), one fast retry when the first attempt ERRORS (not when
  // it is slow), and a timed-out line FAILS CLOSED: 'timeout' is returned, never 'clear'.
  const LIVE_TIMEOUT_MS = Number.isFinite(config.careLiveTimeoutMs) ? config.careLiveTimeoutMs : 6000;
  const LIVE_THRESHOLD = 0.4;
  const LIVE_MAX_STRINGS = 16; // per request (CHECK-16d: pitches have many parts)
  const LIVE_MAX_CHARS = 1200; // per string (a pitch can be 700)
  // CHECK-21 L2: degraded only when the live check is really unavailable: 3 or more failures in 60 s, or an auth or
  // quota error (then for 10 minutes). One slow call is handled per request (L1) and does not darken the site.
  const failures = []; // ms of recent failures
  let hardFailAt = -Infinity;
  const liveStats = { calls: 0, crisis: 0, unavailable: 0, timeouts: 0, retries: 0 };
  // every string, except a real image payload in an image field (N20a)
  const strings = (v, out = [], d = 0, k = null) => { if (d > 6) return out; if (typeof v === 'string') { if (!(k && IMAGE_KEYS.has(k) && isImagePayload(v))) out.push(v); } else if (Array.isArray(v)) v.forEach((x) => strings(x, out, d + 1, k)); else if (v && typeof v === 'object') Object.entries(v).forEach(([kk, x]) => strings(x, out, d + 1, kk)); return out; };
  const recentFailures = () => { const t = now(); while (failures.length && t - failures[0] > 60000) failures.shift(); return failures.length; };
  const isHard = (e) => { const st = Number(e?.detail || e?.status); return st === 401 || st === 403 || st === 429 || e?.reason === 'spend_cap' || e?.reason === 'no_key' || /quota|credit|billing|auth/i.test(String(e?.detail || e?.message || '')); };
  /** 'live' when the live crisis check is available, else 'degraded'. */
  function safetyMode() {
    if (claude?.mode?.() !== 'live' || config.offline) return 'degraded';
    if (now() - hardFailAt < 10 * 60 * 1000) return 'degraded';
    return recentFailures() >= 3 ? 'degraded' : 'live';
  }
  /** One model check on ALL free text: 'crisis' | 'clear' | 'timeout' (fail closed) | 'unavailable' (no live check). */
  async function liveCheck(exp, values) {
    if (claude?.mode?.() !== 'live' || config.offline) return 'unavailable';
    const texts = strings(values).filter((t) => /\p{L}/u.test(t)).map((t) => t.slice(0, LIVE_MAX_CHARS)).slice(0, LIVE_MAX_STRINGS);
    if (!texts.length) return 'clear';
    liveStats.calls++;
    const start = now();
    let timer;
    const deadline = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('care_timeout'), { reason: 'timeout' })), LIVE_TIMEOUT_MS); });
    const attempt = () => claude.run({ exp, task: 'care', system: CRISIS_SYSTEM, effort: 'low', maxTokens: 300, schema: CRISIS_SCHEMA, timeoutMs: Math.max(500, LIVE_TIMEOUT_MS - (now() - start)), messages: [{ role: 'user', content: JSON.stringify(texts) }] });
    try {
      let out;
      try { out = await Promise.race([attempt(), deadline]); } catch (e) {
        if (e?.reason === 'timeout' || isHard(e)) throw e;
        liveStats.retries++; // an error, not a slow call: one fast retry inside the same deadline
        out = await Promise.race([attempt(), deadline]);
      }
      const hit = out?.crisis === true || Number(out?.confidence) >= LIVE_THRESHOLD;
      if (hit) liveStats.crisis++;
      return hit ? 'crisis' : 'clear';
    } catch (e) {
      failures.push(now());
      if (isHard(e)) hardFailAt = now();
      if (e?.reason === 'timeout') { liveStats.timeouts++; return 'timeout'; }
      // N21a: still an error after the retry (or an auth / quota error): the line FAILS CLOSED like a timeout
      liveStats.unavailable++;
      return 'timeout';
    } finally { clearTimeout(timer); }
  }
  let onCare = () => {};
  const counterOf = (req) => Number(req?.headers?.['x-pz-counter'] ?? req?.body?.c ?? 0);
  // degraded mode: a rule-based language hit raises the quiet alert too (time and experience only, no lock)
  function languageAlert(exp, req, values) {
    if (safetyMode() !== 'degraded') return;
    if (strings(values).some((t) => hasProfanity(t))) raise(exp, counterOf(req), req?.sid ? `lang:${req.sid}` : null, 'language');
  }

  /**
   * Server-side input check (the authority). Sync: the rules answer now (true = crisis, answer with careResponse(res)).
   * In live mode the live check also runs on all of this text in the background; if it finds a crisis the session is
   * care-locked (its next request gets the care response, nothing from it reaches a TV). Prefer inputLive().
   */
  // input() is deprecated for visitor text (CHECK-16d): a live-only catch reaches only the session's NEXT request.
  // Count-only warning: first call per experience, then every 100th. Never the text.
  const syncCalls = new Map();
  function warnSync(exp) {
    const n = (syncCalls.get(exp) || 0) + 1;
    syncCalls.set(exp, n);
    if (n === 1 || n % 100 === 0) log({ kind: 'safety', warn: 'sync_input_deprecated', exp, calls: n, use: 'await ctx.safety.inputLive()' });
  }
  function input(exp, req, ...values) {
    warnSync(exp);
    if (values.some((v) => detectDeep(v))) {
      raise(exp, counterOf(req), req?.sid);
      return true;
    }
    // the live check found a crisis in this phone's earlier text: answer this request with the care card once
    if (req?.sid && modelPending.has(req.sid)) { modelPending.delete(req.sid); return true; }
    languageAlert(exp, req, values);
    if (claude?.mode?.() === 'live') {
      liveCheck(exp, values).then((r) => { if (r === 'crisis') { raise(exp, counterOf(req), req?.sid); if (req?.sid) modelPending.add(req.sid); onCare(req?.sid, exp); } }).catch(() => {});
    }
    return false;
  }
  const modelPending = new Set();
  /** Async: rules, then (live mode) the live check on all the text, at most 3 s, before answering. The main gate. */
  async function inputLive(exp, req, ...values) {
    if (req?.sid && modelPending.has(req.sid)) { modelPending.delete(req.sid); return true; }
    if (values.some((v) => detectDeep(v))) { raise(exp, counterOf(req), req?.sid); return true; }
    const r = await liveCheck(exp, values);
    if (r === 'crisis') { raise(exp, counterOf(req), req?.sid); onCare(req?.sid, exp); return true; }
    // L1 fail closed: the live check timed out on this text, so it is not used. The route answers with
    // careResponse(res), which tells the phone 'unchecked' (care line shown prominently, chips path offered).
    if (r === 'timeout') { if (req) req.pzUnchecked = true; return 'unchecked'; }
    languageAlert(exp, req, values);
    return false;
  }
  // inputLive() answers: true = crisis (care card), 'unchecked' = the live check could not decide (fail closed: the text is
  // not used, the phone gets the calm notice + chips path), false = fine. Use these instead of truthiness (CHECK-20 F8).
  const UNCHECKED_BODY = { unchecked: true, care: false, chips: true, message: 'Yeh line abhi check nahi ho payi, isliye use nahi ki. Chips se aage badho.' };
  function uncheckedResponse(res) { return res.status(200).json(UNCHECKED_BODY); }
  function careResponse(res) {
    if (res?.req?.pzUnchecked) return uncheckedResponse(res);
    return res.status(200).json({ care: true });
  }

  // agent ids an experience registered (optional): then its inits may only use these
  const agentReg = new Map();
  function agents(exp, ids) {
    for (const id of ids) if (!/^[a-z][a-z0-9_-]{0,23}$/.test(id)) throw new Error(`safety.agents: bad id ${id}`);
    agentReg.set(exp, new Set([...(agentReg.get(exp) || []), ...ids]));
  }

  return {
    FORBIDDEN, strict, agents, agentIds: (exp) => agentReg.get(exp) || null, setNicknameCheck: (fn) => { knownNickname = fn; },
    bank, list, template, publicText, isPublic, checkTvText, judge, rulePass, ideaLabel, copyOk: lineOk, listValues: (exp, name) => slotValues(exp, `list:${name}`)?.map(String) || null,
    care: { detect, detectDeep }, input, inputLive, liveCheck, safetyMode, liveStats: () => ({ ...liveStats }), careResponse, uncheckedResponse, isCrisis, isUnchecked, raise, alertsFor, allAlerts, dismiss, isCareLocked,
    setOnCare: (fn) => { onCare = fn; },
    stats: () => ({ strict, untemplated: Object.fromEntries(untemplated), banks: banks.size, templates: templates.size, syncInput: Object.fromEntries(syncCalls) }),
    registry: () => ({ banks: [...banks].map(([id, m]) => ({ id, lines: [...m.values()] })), templates: [...templates].map(([id, t]) => ({ id, text: t.text })) }),
  };
}
