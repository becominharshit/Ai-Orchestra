// Career Forecast data: a READ-ONLY copy of Lead Magnet/04_Data/app_json/cf_data_v60 (see data/cf_data_v60/COPIED_FROM.md).
// Display rules from the data README that this file enforces:
//   - every number shown has the tooltip of its nearest `src` (sources[src].tooltip includes the year)
//   - card_line can be null: fall back to reason
//   - task mode: by_ai = "Done by AI", with_ai = "Done with AI", led_by_people = "Led by people"
//   - Zenith wording exactly as in zenith.json, tooltip "As published on zenithschool.ai"
//   - never a college score, rank, rating or fee (none is loaded here), and we never show pay (no salary promises)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_VERSION = 'cf_data_v60';
export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', DATA_VERSION);
export const DATA_FILES = ['careers.json', 'interest_map.json', 'zenith.json', 'sources.json'];

export const MODE_LABEL = { by_ai: 'Done by AI', with_ai: 'Done with AI', led_by_people: 'Led by people' };
// Only these badges are shown in the preview (task: "top careers with growing/changing badge"; no fear copy).
export const PREVIEW_BADGES = ['Growing', 'Changing'];
export const PREVIEW_COUNT = 3;

const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));

let cache = null;
export function loadData() {
  if (cache) return cache;
  const careers = read('careers.json');
  const interest = read('interest_map.json');
  const zenith = read('zenith.json');
  const sources = read('sources.json').sources;
  const byId = new Map(careers.careers.map((c) => [c.id, c]));
  cache = { careers, interest, zenith, sources, byId };
  return cache;
}

/** Tooltip text for a src id (includes the year; says so when unverified). */
export function tooltip(src) {
  const s = loadData().sources[src];
  if (!s) return 'Source missing';
  return s.status === 'unverified' ? `${s.tooltip} (unverified)` : s.tooltip;
}
export function sourceYear(src) { return loadData().sources[src]?.year ?? null; }

export function areas() {
  return loadData().interest.areas.map((a) => ({ id: a.id, label: a.label, short: a.short_label }));
}
export function areaById(id) { return loadData().interest.areas.find((a) => a.id === id) || null; }

/** The career fields the phone and the PDF use. No pay, no score. */
export function careerView(c) {
  const ws = c.work_split;
  return {
    id: c.id,
    title: c.title,
    badge: c.badge,
    line: c.card_line || c.reason,
    lineSrc: c.src,
    lineTip: tooltip(c.src),
    split: { by_ai: ws.by_ai, with_ai: ws.with_ai, led_by_people: ws.led_by_people, src: ws.src, tip: tooltip(ws.src) },
    holds: (c.skills_that_hold || []).slice(0, 3),
  };
}

/** Top careers of an area for the preview: rank order, Growing or Changing only, at most 3. */
export function preview(areaId) {
  const d = loadData();
  const a = areaById(areaId);
  if (!a) return null;
  const list = [...a.careers].sort((x, y) => x.rank - y.rank).map((r) => d.byId.get(r.career_id)).filter(Boolean);
  const top = list.filter((c) => PREVIEW_BADGES.includes(c.badge)).slice(0, PREVIEW_COUNT);
  return { area: { id: a.id, label: a.label, short: a.short_label }, careers: top.map(careerView), total: list.length };
}

/** Zenith wording exactly as published (zenith.json). Placement and package figures are deliberately not used here. */
export function zenithView() {
  const z = loadData().zenith;
  return {
    programmeLine: 'B.Tech in AI + mini-MBA, one KRMU degree', // _COMMON_RULES programme line
    programme: z.programme,
    degreeLine: z.degree_line,
    footer: z.footer,
    usps: z.usps.map((u) => ({ title: u.title, lines: u.lines })),
    tooltip: z.tooltip, // "As published on zenithschool.ai"
    srcTip: tooltip(z.src),
  };
}

/** Zenith courses for a skill_map key, exact names. Courses whose name has a dash character are left out (copy rule). */
export function zenithCourses(skillKey, max = 2) {
  const list = loadData().zenith.skill_map[skillKey] || [];
  return list.filter((x) => !/[\u2013\u2014]/.test(x.course)).slice(0, max).map((x) => ({ course: x.course, semester: x.semester, elective: x.elective }));
}

/** The phone's data bundle (small): areas + their preview, Zenith wording. */
export function phoneBundle() {
  return {
    version: DATA_VERSION,
    modes: MODE_LABEL,
    areas: areas().map((a) => preview(a.id)),
    zenith: zenithView(),
  };
}
