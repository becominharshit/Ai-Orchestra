// Checks for everything the agent TV hook draws (CHECK-19 F1). Pure module: the TV hook and the tests import it.
const ICONS = new Set(['spark', 'brain', 'star', 'eye', 'pen', 'chart', 'clock', 'film', 'search', 'code', 'chat', 'bolt', 'rocket', 'compass', 'target', 'shield']);
// numbers a stat may show (by its label); anything else is not drawn
const STAT_RANGE = { Din: [1, 31], Sessions: [1, 200], Blocks: [1, 20], Ghante: [0, 99], Steps: [1, 6] };

export const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
/** A label we may draw: a short string with no long digit runs (a phone number can never pass). */
export const labelOk = (s) => typeof s === 'string' && s.length > 0 && s.length <= 60 && !/\d[\d\s.()+-]{3,}\d/.test(s) && !/[<>@]/.test(s);
/** The spotlight payload, cleaned: only checked labels and in-range integers survive. */
export function cleanPayload(p) {
  if (!p || typeof p !== 'object' || !labelOk(p.title)) return null;
  const labels = Array.isArray(p.labels) ? p.labels.slice(0, 6) : [];
  return {
    kicker: labelOk(p.kicker) ? p.kicker : '', title: p.title, subtitle: labelOk(p.subtitle) ? p.subtitle : '', icon: ICONS.has(p.icon) ? p.icon : 'spark',
    tags: (Array.isArray(p.tags) ? p.tags : []).filter(labelOk).slice(0, 4),
    labels: labels.length === 6 && labels.every(labelOk) ? labels : ['', '', '', '', '', ''],
    scores: (Array.isArray(p.scores) ? p.scores : []).slice(0, 3).filter((s) => intIn(s?.value, 0, 4)).map((s) => s.value),
    stats: (Array.isArray(p.stats) ? p.stats : []).filter((s) => STAT_RANGE[s?.label] && intIn(s.value, ...STAT_RANGE[s.label])).slice(0, 4),
    skills: (Array.isArray(p.skills) ? p.skills : []).filter(labelOk).slice(0, 5),
    rows: (Array.isArray(p.rows) ? p.rows : []).slice(0, 14).filter((r) => Array.isArray(r?.items) && r.items.length <= 8 && r.items.every((i) => intIn(i, 0, 4)) && intIn(r.level ?? 0, 0, 1)),
    lines: (Array.isArray(p.lines) ? p.lines : []).filter(labelOk).slice(0, 2),
  };
}

