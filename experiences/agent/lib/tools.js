// The agent's 4 tools. Plain, deterministic code: same input, same output, no network, no model.
//   calculator  real arithmetic (sessions, minutes, percentages and each template's own maths)
//   calendar    a real schedule: day by day slots (or spaced revision days, or one event day's timed blocks)
//   lookup      reads data/lookup.json only (curated, reviewed); never the web
//   notes       turns what the other tools produced into a checklist
// The planner (Claude, or a banked plan offline) only chooses WHICH tools run, in what order, with which knobs.
import { LOOKUP, itemLabel } from './jobs.js';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const SPACED = [0, 2, 6, 13]; // spaced revision: day 1, 3, 7, 14
export const isRest = (b) => b.tag === 'break' || b.tag === 'meal';

export const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
export const toHhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const hm = (min) => ({ h: Math.floor(min / 60), m: min % 60 });
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

/** Today in India (YYYY-MM-DD). The plan starts the day after. */
export function todayIst(now = Date.now()) {
  return new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
/** Day i (0 = first plan day) after `today`, as { iso, label: 'Mon 27 Oct' }. Pure UTC date arithmetic. */
export function planDate(today, i) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1 + i);
  return { iso: d.toISOString().slice(0, 10), label: `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}` };
}

/** How many sessions of S minutes (with B minute breaks between them) fit into P minutes. At least 1. */
export function sessionsPerDay(P, S, B) {
  return Math.max(1, Math.floor((P + B) / (S + B)));
}

/** Sessions per day for the whole plan. A light day (the middle day) gets half, at least 1. */
export function dayCounts(days, n, lightDay) {
  const counts = Array.from({ length: days }, () => n);
  const light = lightDay && days >= 3 && n >= 2 ? Math.floor((days - 1) / 2) : -1;
  if (light >= 0) counts[light] = Math.max(1, Math.floor(n / 2));
  return { counts, light };
}

/**
 * Split `total` units across items by integer weights (largest remainder). Every item gets at least 1 when
 * total >= items; the parts always add up to exactly `total`.
 */
export function split(total, weights) {
  const k = weights.length;
  if (total <= 0 || !k) return weights.map(() => 0);
  if (total < k) {
    const order = weights.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    const out = weights.map(() => 0);
    for (let j = 0; j < total; j++) out[order[j][1]] = 1;
    return out;
  }
  const rest = total - k;
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (rest * w) / sum);
  const out = raw.map((x) => 1 + Math.floor(x));
  let left = total - out.reduce((a, b) => a + b, 0);
  const byRem = raw.map((x, i) => [x - Math.floor(x), weights[i], i]).sort((a, b) => b[0] - a[0] || b[1] - a[1] || a[2] - b[2]);
  for (let j = 0; left > 0; j = (j + 1) % k, left--) out[byRem[j][2]] += 1;
  return out;
}

/** Percentages that add up to exactly 100 (largest remainder). */
export function percents(parts) {
  const sum = parts.reduce((a, b) => a + b, 0);
  if (!sum) return parts.map(() => 0);
  const raw = parts.map((p) => (p * 100) / sum);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let j = 0; left > 0; j++, left--) out[order[j % order.length][1]] += 1;
  return out;
}

/** Smooth weighted round robin: an order in which each item i appears exactly counts[i] times, spread out. */
export function interleave(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  const cur = counts.map(() => 0);
  const seq = [];
  for (let n = 0; n < total; n++) {
    let best = -1;
    for (let i = 0; i < counts.length; i++) {
      if (!counts[i]) continue;
      cur[i] += counts[i];
      if (best < 0 || cur[i] > cur[best]) best = i;
    }
    cur[best] -= total;
    seq.push(best);
  }
  return seq;
}

/** The planner's weights, plus one for the visitor's weak chapter or subject (JEE, mock). Max 4. */
export function weightsOf(design, plan) {
  const weakItem = design.job.id === 'jee' ? LOOKUP.jee.weak[design.params.weak]?.item : design.job.id === 'mock' ? design.params.weak : null;
  return design.items.map((id, i) => Math.min(4, (plan.weights[i] || 2) + (id === weakItem ? 1 : 0)));
}

/** The shared numbers every tool agrees on (calculator reports them, calendar uses them). */
export function base(design, plan) {
  const { params, job } = design;
  if (job.schedule === 'spaced') {
    const counts = Array.from({ length: params.days }, (_, d) => (SPACED.includes(d) ? 1 : 0));
    const total = counts.reduce((a, b) => a + b, 0);
    return { n: 1, counts, light: -1, total, alloc: [total], focusMin: total * plan.sessionMin };
  }
  if (job.schedule === 'agenda') {
    const blocks = LOOKUP.hackathon.agenda;
    const work = blocks.filter((b) => !isRest(b));
    return { n: blocks.length, counts: [blocks.length], light: -1, total: work.length, alloc: [work.length], focusMin: work.reduce((a, b) => a + b.min, 0) };
  }
  const n = sessionsPerDay(params.perDay, plan.sessionMin, plan.breakMin);
  const { counts, light } = dayCounts(params.days, n, plan.lightDay);
  const total = counts.reduce((a, b) => a + b, 0);
  const alloc = split(total, weightsOf(design, plan));
  return { n, counts, light, total, alloc, focusMin: total * plan.sessionMin };
}

// ---------------- calculator ----------------
/** The worked example of a concept, computed here (never written by the model). */
export function conceptMath(c) {
  switch (c.kind) {
    case 'mul': return { value: c.a * c.b, shown: `${c.a} x ${c.b} = ${c.a * c.b}` };
    case 'div': { const v = Math.round((c.a / c.b) * 100) / 100; return { value: v, shown: `${c.a} / ${c.b} = ${v}` }; }
    case 'add': return { value: c.a + c.b, shown: `${c.a} + ${c.b} = ${c.a + c.b}` };
    case 'square': { const v = c.a * c.a - c.b * c.b; return { value: v, shown: `${c.a}^2 minus ${c.b}^2 = ${v}` }; }
    case 'frac': { const g = gcd(c.a, c.b); return { value: Math.round((c.a / c.b) * 1000) / 1000, shown: `${c.a} / ${c.b} = ${c.a / g} / ${c.b / g}` }; }
    case 'equilibrium': { const P = (c.a - c.b) / 4; return { value: P, shown: `${c.a} minus 2P = ${c.b} + 2P, toh P = ${P}, Q = ${c.a - 2 * P}` }; }
    case 'factorial': { const f = (n) => (n <= 1 ? 1 : n * f(n - 1)); return { value: f(c.a), shown: `${c.a}! = ${f(c.a)} (recursion se)` }; }
    default: return { value: 0, shown: '' };
  }
}

export function calculator(design, plan) {
  const { job, items, params } = design;
  const b = base(design, plan);
  const pct = percents(b.alloc);
  const out = {
    tool: 'calculator',
    perDay: b.n, light: b.light >= 0 ? { day: b.light + 1, sessions: b.counts[b.light] } : null,
    total: b.total, sessionMin: plan.sessionMin, breakMin: plan.breakMin, focusMin: b.focusMin, days: params.days,
    perItem: job.schedule === 'days' ? items.map((id, i) => ({ id, label: itemLabel(job, id), sessions: b.alloc[i], minutes: b.alloc[i] * plan.sessionMin, percent: pct[i] })) : [],
    extra: {},
  };
  const L = LOOKUP[job.id];
  const w = weightsOf(design, plan);
  switch (job.id) {
    case 'jee': out.extra = { perDayTypes: 3, totalTypes: 3 * params.days, weakSessions: b.alloc[items.indexOf(L.weak[params.weak].item)] }; break;
    case 'boards': { const d = split(params.days, L.cycles.map((c) => c.share)); let s = 1; out.extra = { cycles: L.cycles.map((c, i) => { const r = { name: c.name, from: s, to: s + d[i] - 1, days: d[i] }; s += d[i]; return r; }) }; break; }
    case 'concept': out.extra = { example: conceptMath(L.items[items[0]].calc), reviews: SPACED.filter((x) => x < params.days).length }; break;
    case 'lecture': out.extra = { episodes: 5, secondsEach: 60, totalSeconds: 300, wordsEach: 140, totalWords: 700, shotsEach: 4 }; break;
    case 'mock': {
      const buffer = Math.round(params.mins / 10);
      const parts = split(params.mins - buffer, w);
      const order = items.map((id, i) => ({ id, i })).sort((x, y) => (x.id === params.weak) - (y.id === params.weak) || w[y.i] - w[x.i] || x.i - y.i);
      out.extra = { mins: params.mins, buffer, sections: order.map(({ id, i }) => ({ id, label: itemLabel(job, id), minutes: parts[i], weak: id === params.weak })) };
      break;
    }
    case 'skill': out.extra = { weeks: Math.round(params.days / 7), weeklyMin: Math.round((b.focusMin * 7) / params.days) }; break;
    case 'mvp': out.extra = { buildDays: params.days, perTrack: out.perItem.map((p) => ({ label: p.label, sessions: p.sessions })) }; break;
    case 'hackathon': {
      const blocks = L.agenda;
      const byTag = {};
      for (const x of blocks) byTag[x.tag] = (byTag[x.tag] || 0) + x.min;
      out.extra = { totalMin: blocks.reduce((a, x) => a + x.min, 0), workMin: b.focusMin, breakMin: (byTag.break || 0) + (byTag.meal || 0), breaks: blocks.filter(isRest).length, team: params.team, byTag };
      break;
    }
    case 'cofounder': out.extra = { customers: 10, perWeek: split(10, [1, 2, 3, 4]), weeks: 4 }; break;
    case 'd2c': {
      const mins = { reel: 60, carousel: 45, bts: 30, story: 20, offer: 20 };
      const ps = split(5, w);
      out.extra = { posts: 5, postSplit: items.map((id, i) => ({ id, label: itemLabel(job, id), posts: ps[i] })), needMin: items.reduce((s, id, i) => s + ps[i] * mins[id], 0), haveMin: b.focusMin, postDays: Array.from({ length: 5 }, (_, k) => Math.floor((k * params.days) / 5) + 1) };
      out.extra.enough = out.extra.haveMin >= out.extra.needMin;
      break;
    }
    case 'creator': {
      const posts = Math.max(1, Math.round((params.posts * params.days) / 7));
      const ps = split(posts, w);
      const need = items.reduce((s, id, i) => s + ps[i] * L.minutesPerPost[id], 0);
      out.extra = { posts, postSplit: items.map((id, i) => ({ id, label: itemLabel(job, id), posts: ps[i], minutes: ps[i] * L.minutesPerPost[id] })), needMin: need, haveMin: b.focusMin, enough: b.focusMin >= need, postDays: Array.from({ length: posts }, (_, k) => Math.floor((k * params.days) / posts) + 1) };
      break;
    }
    case 'fest': {
      const cats = L.budget[params.event];
      const hundreds = split(params.budget / 100, cats.map((c) => c[1]));
      out.extra = { budget: params.budget, split: cats.map((c, i) => ({ label: c[0], rupees: hundreds[i] * 100, percent: c[1] })), team: params.team, tasks: b.total, perPerson: Math.ceil(b.total / params.team), showMin: L.agenda[params.event].reduce((a, x) => a + x.min, 0) };
      break;
    }
    case 'debate': {
      const parts = L.speech;
      const secs = split(params.speech * 60, parts.map((p) => p[1]));
      out.extra = { speechSec: params.speech * 60, timing: parts.map((p, i) => ({ label: p[0], seconds: secs[i] })) };
      break;
    }
    case 'career': out.extra = { careers: L.areas[params.area].careers.map((c) => ({ title: c.title, by_ai: c.split[0], with_ai: c.split[1], led_by_people: c.split[2] })) }; break;
    case 'collegeq': {
      // 10 questions across priorities by weight, at most 4 per priority (what the reviewed list has)
      let q = split(10, w).map((x) => Math.min(4, x));
      while (q.reduce((a, x) => a + x, 0) < Math.min(10, 4 * items.length)) { const i = q.findIndex((x) => x < 4); q[i] += 1; }
      q = q.slice();
      out.extra = { questions: q.reduce((a, x) => a + x, 0), perPriority: items.map((id, i) => ({ id, label: itemLabel(job, id), count: q[i] })) };
      break;
    }
    case 'cricket': {
      const overs = L.overs[params.format];
      const T = params.rate * overs;
      const ppO = Math.round(overs * 0.3);
      const deO = Math.max(1, Math.round(overs * 0.2));
      const miO = overs - ppO - deO;
      const ppR = Math.round(T * 0.32);
      const deR = Math.round(T * 0.28);
      const miR = T - ppR - deR;
      const rr = (r, o) => Math.round((r * 10) / o); // run rate in tenths (8.5 -> 85)
      out.extra = { situation: params.situation, overs, target: T, rrTenths: rr(T, overs), phases: [{ id: 'pp', overs: ppO, runs: ppR, rrTenths: rr(ppR, ppO) }, { id: 'mid', overs: miO, runs: miR, rrTenths: rr(miR, miO) }, { id: 'death', overs: deO, runs: deR, rrTenths: rr(deR, deO) }] };
      break;
    }
    default: break;
  }
  return out;
}

// ---------------- lookup ----------------
/** The topics of an item: a plain list, or the list for the template's topic setting (class, skill). */
export function topicsOf(design, entry) {
  if (Array.isArray(entry.topics)) return [...entry.topics];
  const key = design.params[design.job.topicParam];
  return [...(entry.topicsBy?.[key] || Object.values(entry.topicsBy || {})[0] || [])];
}
/** Read curated data for one item ('i1'..'i5') or all of them. Only data/lookup.json, nothing else. */
export function lookup(design, which = 'all') {
  const { job, items, params } = design;
  const L = LOOKUP[job.id];
  const ids = which === 'all' ? items : [items[Number(String(which).slice(1)) - 1]].filter(Boolean);
  const paramFacts = [];
  for (const [pid, table] of Object.entries(L.params || {})) paramFacts.push(...(table[params[pid]] || []));
  return {
    tool: 'lookup',
    items: ids.map((id) => {
      const e = L.items[id];
      return { id, label: itemLabel(job, id), facts: [...(e.facts || e.exam?.slice(0, 2) || [])], topics: e.questions ? [...e.questions] : topicsOf(design, e) };
    }),
    paramFacts, general: [...(L.general || [])], source: 'Zenith curated list',
  };
}

// ---------------- calendar ----------------
/**
 * A real schedule. `topics` (from an earlier lookup) labels each session with the next topic of its item.
 * Guarantees (tested): slots never overlap, each day ends within start + perDay, every item gets exactly
 * its share of sessions, and the same item never runs twice in a row on a day when another item is left.
 */
export function calendar(design, plan, { today, topics = {} } = {}) {
  const { job, items, params } = design;
  const b = base(design, plan);
  if (job.schedule === 'agenda') return agendaDay(design, today);
  const seq = job.schedule === 'spaced' ? Array.from({ length: b.total }, () => 0) : interleave(b.alloc);
  const cursor = items.map(() => 0);
  const start = toMin(params.start);
  const days = [];
  let k = 0;
  for (let d = 0; d < params.days; d++) {
    const slots = [];
    for (let j = 0; j < b.counts[d]; j++) {
      const i = seq[k++];
      const from = start + j * (plan.sessionMin + plan.breakMin);
      const id = items[i];
      slots.push({ start: toHhmm(from), end: toHhmm(from + plan.sessionMin), item: i, id, label: itemLabel(job, id), topic: null });
    }
    // spread: if two of the same item sit next to each other and a different one is later that day, swap them
    for (let j = 1; j < slots.length; j++) {
      if (slots[j].item !== slots[j - 1].item) continue;
      const s = slots.findIndex((x, q) => q > j && x.item !== slots[j].item);
      if (s > 0) {
        const here = slots[j];
        const later = slots[s];
        slots[j] = { ...later, start: here.start, end: here.end };
        slots[s] = { ...here, start: later.start, end: later.end };
      }
    }
    // topics in time order: each session of an item takes that item's next topic from the lookup
    for (const sl of slots) { const list = topics[sl.id]; if (list?.length) sl.topic = list[cursor[sl.item]++ % list.length]; }
    const date = planDate(today || todayIst(), d);
    if (slots.length || job.schedule !== 'spaced') days.push({ day: d + 1, date: date.label, iso: date.iso, light: d === b.light, slots });
  }
  const out = { tool: 'calendar', days, total: b.total, sessionMin: plan.sessionMin, breakMin: plan.breakMin, start: params.start, clashes: clashes(days) };
  if (job.id === 'fest') out.agenda = runOfShow(LOOKUP.fest.agenda[params.event], '10:00');
  return out;
}

/** Timed blocks from a start time (real clock arithmetic; crosses midnight into "Day 2"). */
export function runOfShow(blocks, start) {
  let t = toMin(start);
  return blocks.map((x) => { const r = { label: x.label, tag: x.tag || null, min: x.min, start: toHhmm(t), end: toHhmm(t + x.min), day: Math.floor(t / 1440) + 1 }; t += x.min; return r; });
}

/** Hackathon: one 24-hour plan, each work block owned by a role (the team's strengths go first). */
function agendaDay(design, today) {
  const L = LOOKUP.hackathon;
  const roleFor = { code: 0, design: 1, pitch: 2, research: 3 };
  const team = L.roles.slice(0, Math.max(2, design.params.team));
  const blocks = runOfShow(L.agenda, design.params.start).map((x) => ({ ...x, owner: isRest(x) ? 'Poori team' : team[roleFor[x.tag] % team.length] }));
  const d0 = planDate(today || todayIst(), 0);
  return { tool: 'calendar', days: [], agenda: blocks, total: blocks.filter((x) => !isRest(x)).length, sessionMin: 0, breakMin: 0, start: design.params.start, clashes: 0, date: d0.label };
}

/** Overlapping slots in a schedule (always 0 for ours; the test proves it and the log line says it). */
export function clashes(days) {
  let n = 0;
  for (const d of days) {
    const s = [...d.slots].sort((a, b) => toMin(a.start) - toMin(b.start));
    for (let j = 1; j < s.length; j++) if (toMin(s[j].start) < toMin(s[j - 1].end)) n += 1;
  }
  return n;
}

// ---------------- notes ----------------
/** A checklist from whatever ran before it. `max` items (the Detailed slider decides). Phone only. */
export function notes(design, outputs, max = 6) {
  const { job } = design;
  const out = [];
  const cal = outputs.calendar;
  const calc = outputs.calculator;
  const look = outputs.lookup;
  if (cal?.days?.length) {
    for (const d of cal.days.slice(0, 3)) {
      if (!d.slots.length) continue;
      const names = [...new Set(d.slots.map((s) => s.label))];
      out.push(`Day ${d.day} (${d.date}): ${names.join(' + ')}, ${d.slots.length} ${d.slots.length === 1 ? 'slot' : 'slots'}, ${d.slots[0].start} se`);
    }
    const light = cal.days.find((d) => d.light);
    if (light) out.push(`Day ${light.day} light day hai: halka kaam, recap.`);
  }
  if (cal?.agenda?.length && job.id === 'hackathon') out.push(`${cal.agenda[0].start} se shuru, har block ka ek owner.`);
  if (calc && calc.total) {
    const t = hm(calc.focusMin);
    out.push(`Total: ${calc.total} ${job.unit}s, ${t.h}h ${t.m}m.`);
  }
  if (look) {
    for (const it of look.items) if (it.facts[0]) out.push(`${it.label}: ${it.facts[0]}`);
    if (look.paramFacts[0]) out.push(look.paramFacts[0]);
  }
  out.push('Har din ke end pe 1 line likho: aaj kya seekha.');
  const list = out.slice(0, max);
  if (job.study) list.push('Apne teacher/mentor se bhi discuss karo.');
  return { tool: 'notes', items: list };
}
