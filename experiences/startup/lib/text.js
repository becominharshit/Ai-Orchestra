// Public text (CONTRACT 13): everything that can reach the TV, the share card or the /s/<code> page is registered here,
// as a bank line or a template with typed slots. publicFor(picks) builds those lines for one startup.
import { AREAS, SUFFIXES, WHO, VIBES, PALETTES, LOGOS, UNITS, ORX, areaById } from './content.js';
import { ALL_NAMES, initials } from './names.js';
import { nameOf, numbers } from './compose.js';

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export function registerText(safety) {
  safety.bank('orx', ORX);
  for (const a of AREAS) {
    const lines = {};
    a.tag.forEach((t, i) => { lines[`t${i}`] = t; });
    a.research.forEach((t, i) => { lines[`r${i}`] = t; });
    a.feat.forEach((t, i) => { lines[`f${i}`] = t; });
    a.plan.forEach((t, i) => { lines[`p${i}`] = t; });
    a.pitch.forEach((t, i) => { lines[`x${i}`] = t; });
    safety.bank(`a_${a.id}`, lines);
  }
  safety.bank('areas', Object.fromEntries(AREAS.map((a) => [a.id, a.label])));
  safety.bank('who', Object.fromEntries(WHO.map((w) => [w.id, w.label])));
  safety.bank('vibes', Object.fromEntries(VIBES.map((v) => [v.id, v.label])));
  safety.bank('palettes', Object.fromEntries(PALETTES.map((p, i) => [`c${i}`, p.name])));
  safety.bank('logos', Object.fromEntries(LOGOS.map((l, i) => [`l${i}`, l])));
  safety.list('areaLabels', AREAS.map((a) => a.label));
  safety.list('whoLabels', WHO.map((w) => w.label));
  safety.list('vibeLabels', VIBES.map((v) => v.label));
  safety.list('paletteNames', PALETTES.map((p) => p.name));
  safety.list('logoNames', LOGOS);
  safety.list('units', UNITS);
  safety.list('names', ALL_NAMES); // every generated name that passed the blocklist (lib/names.js)
  safety.list('letters', LETTERS);
  safety.template('name', '{name}', { name: 'list:names' });
  safety.template('mono', '{a}{b}', { a: 'list:letters', b: 'list:letters' });
  safety.template('cardTitle', 'Meri startup: {name}', { name: 'list:names' });
  safety.template('brief', 'Brief: {area}, vibe {vibe}', { area: 'list:areaLabels', vibe: 'list:vibeLabels' });
  safety.template('logArea', 'Problem area: {area}', { area: 'list:areaLabels' });
  safety.template('whoLine', 'Pehle customers: {who}', { who: 'list:whoLabels' });
  safety.template('market', 'Rough estimate: lagbhag {n} lakh log', { n: 'int:1..999' });
  safety.template('logName', 'Naam: {name}', { name: 'list:names' });
  safety.template('logPalette', 'Palette: {palette}', { palette: 'list:paletteNames' });
  safety.template('logLogo', 'Logo: {logo}', { logo: 'list:logoNames' });
  safety.template('price', '₹{p} per {unit}', { p: 'int:1..9999', unit: 'list:units' });
  safety.template('margin', 'Har {unit} pe lagbhag ₹{m} margin', { unit: 'list:units', m: 'int:1..9999' });
  // the revenue line is labelled as a playful estimate everywhere it shows (CHECK-18 N7)
  safety.template('revK', 'Sapno ka revenue: agar 1,000 customers, toh ₹{k} hazaar (rough andaaza)', { k: 'int:1..999' });
  safety.template('revL', 'Sapno ka revenue: agar 1,000 customers, toh ₹{l}.{d} lakh (rough andaaza)', { l: 'int:1..999', d: 'int:0..9' });
  safety.template('done', 'Startup ready in {sec}.{tenth}s', { sec: 'int:0..120', tenth: 'int:0..9' });
}

/** Every public line of one startup, as core publicText results ({ pt, text }). */
export function publicFor(safety, p) {
  const area = areaById(p.area);
  const pt = (bank, key) => safety.publicText(bank, key);
  const name = nameOf(p);
  const n = numbers(p);
  const mono = initials(name);
  return {
    kicker: pt('orx', 'kicker'),
    cardKicker: pt('orx', 'cardKicker'),
    name: pt('name', { name }),
    cardTitle: pt('cardTitle', { name }),
    mono: pt('mono', { a: mono[0], b: mono[1] || mono[0] }),
    area: pt('areas', area.id),
    who: pt('whoLine', { who: WHO.find((w) => w.id === p.who).label }),
    vibe: pt('vibes', p.vibe),
    tagline: pt(`a_${area.id}`, `t${p.tagline}`),
    research: pt(`a_${area.id}`, `r${p.research}`),
    market: pt('market', { n: p.market }),
    features: p.features.map((i) => pt(`a_${area.id}`, `f${i}`)),
    palette: pt('palettes', `c${p.palette}`),
    logo: pt('logos', `l${p.logo}`),
    price: pt('price', { p: p.price, unit: area.unit }),
    margin: pt('margin', { unit: area.unit, m: n.margin }),
    revenue: n.revKind === 'lakh' ? pt('revL', { l: n.revL, d: n.revD }) : pt('revK', { k: n.revK }),
    plan: p.plan.map((i) => pt(`a_${area.id}`, `p${i}`)),
    pitch: pt(`a_${area.id}`, `x${p.pitch}`),
    // orchestra log lines (templates with real data)
    brief: pt('brief', { area: area.label, vibe: VIBES.find((v) => v.id === p.vibe).label }),
    logArea: pt('logArea', { area: area.label }),
    logName: pt('logName', { name }),
    logPalette: pt('logPalette', { palette: PALETTES[p.palette].name }),
    logLogo: pt('logLogo', { logo: LOGOS[p.logo] }),
  };
}

export const SUFFIX_LIST = SUFFIXES;
