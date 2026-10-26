// AI Jyotish "Dost compatibility" (TASK-15): 2 to 4 friends on one phone get a squad vibe report.
// Everything is reviewed bank text (friendship only, PG, positive), keyed by signs and life-path numbers.
// The model may only pick ids and one adjective (DOST_SCHEMA); names and DOBs never leave the phone.
// Every line here can reach the TV and the share card, so it is registered as public text (server.js).
// APPEND ONLY: ids are positions.
import { SIGNS, LIFE_PATHS } from '../web/lib/astro.js';
import { ADJ } from './banks.js';
import { DOST_ORX, DOST_LOG_TEMPLATES } from '../web/lib/dosttext.js';

export { DOST_ORX, DOST_LOG_TEMPLATES };

const bank = (prefix, rows) => rows.map((r, i) => ({ id: `${prefix}${String(i + 1).padStart(2, '0')}`, ...(typeof r === 'string' ? { text: r } : r) }));

// squad energy types: name + one line
export const ENERGY = bank('se', [
  { text: 'Startup Co-founders', line: 'Is squad ke paas idea bhi hai, plan bhi, aur pitch karne ka josh bhi.' },
  { text: 'Festival Crew', line: 'Jahan yeh squad pahunche, wahan fest shuru ho jaata hai.' },
  { text: 'Hackathon Squad', line: 'Idea se demo tak, poori team ek saath muskurati hui.' },
  { text: 'Road Trip Gang', line: 'Is squad ke saath har raasta ek nayi kahani ban jaata hai.' },
  { text: 'Band on Tour', line: 'Har kisi ka apna sur hai, aur saath mein ek hit gaana.' },
  { text: 'Meme Council', line: 'Group chat ki sabse tez aur sabse funny cabinet.' },
  { text: 'Gully Cricket Legends', line: 'Kaun batting karega pe debate, phir sab saath mein jeet celebrate.' },
  { text: 'Robot Builders Club', line: 'Wires, ideas aur jugaad: yeh squad kuch bhi bana sakta hai.' },
  { text: 'Film Crew', line: 'Ek likhta hai, ek shoot karta hai, aur sab hero ban jaate hain.' },
  { text: 'Treasure Hunters', line: 'Har sawaal ek clue hai, aur yeh squad har clue solve karta hai.' },
  { text: 'Debate Club Stars', line: 'Baatein solid, dosti usse bhi solid.' },
  { text: 'Chai Adda Thinkers', line: 'Ek cup chai aur is squad ke paas duniya ka agla bada idea.' },
  { text: 'Game Dev Studio', line: 'Yeh squad khelta bhi hai aur naye game banata bhi hai.' },
  { text: 'Science Fair Champions', line: 'Curiosity full, experiment ready, aur poster ekdum shandaar.' },
  { text: 'Space Mission Crew', line: 'Har kisi ka role clear, aur mission ek: stars tak pahunchna.' },
  { text: 'Night Market Explorers', line: 'Naye rang, naye log, naye plans: yeh squad sab explore karta hai.' },
]);

// roles: name + one line about what that friend brings
export const ROLES = bank('sr', [
  { text: 'The Planner', line: 'Har plan ka backup ready rakhta hai.' },
  { text: 'The Hype Person', line: 'Squad ki energy ka official charger.' },
  { text: 'The Idea Machine', line: 'Har minute ek naya idea, aur kuch toh kamaal ke.' },
  { text: 'The Calm Captain', line: 'Sabko shaanti se ek direction mein le jaata hai.' },
  { text: 'The Playlist DJ', line: 'Har moment ka perfect gaana iske paas hai.' },
  { text: 'The Memory Keeper', line: 'Har yaadgaar pal ki photo aur kahani iske paas.' },
  { text: 'The Fixer', line: 'Jugaad ho ya code, sab theek kar deta hai.' },
  { text: 'The Storyteller', line: 'Sabse simple baat ko bhi blockbuster bana deta hai.' },
  { text: 'The Explorer', line: 'Naya raasta, nayi jagah, sabse pehle yahi chalta hai.' },
  { text: 'The Peacemaker', line: 'Har debate ko chai pe settle kar deta hai.' },
  { text: 'The Designer', line: 'Har cheez ko thoda stylish aur bahut cool bana deta hai.' },
  { text: 'The Coder', line: 'Idea ko app mein badalne wala jaadugar.' },
  { text: 'The Cheerleader', line: 'Har chhoti jeet pe sabse zor se taali.' },
  { text: 'The Navigator', line: 'Map, time aur plan, sab iski pocket mein.' },
  { text: 'The Researcher', line: 'Kisi bhi sawaal ka jawab dhoondh ke laata hai.' },
  { text: 'The Joke Engine', line: 'Har serious moment ko halka aur mazedaar bana deta hai.' },
  { text: 'The Photographer', line: 'Squad ke best angles isi ke phone mein milte hain.' },
  { text: 'The Timekeeper', line: 'Sabko time pe laane wala silent hero.' },
  { text: 'The Bridge Builder', line: 'Naye logon ko squad se jod deta hai.' },
  { text: 'The Spark', line: 'Jab sab ruk jaate hain, yeh shuru kar deta hai.' },
]);

export const SQUAD_LINES = bank('sl', [
  'Is squad ke saath har plan ek adventure ban jaata hai.',
  'Tum log milke kisi bhi group project ko festival bana dete ho.',
  'Is squad ka group chat kabhi boring nahi hota.',
  'Ek ka idea, doosre ka plan, teesre ka josh: perfect combo.',
  'Tum sab ek doosre ki jeet pe sabse zor se taali bajate ho.',
  'Is squad mein har kisi ki ek alag superpower hai.',
  'Fest ho ya hackathon, yeh squad sabse alag chamakta hai.',
  'Tum logon ki dosti mein trust bhi hai aur timepass bhi.',
  'Ek saath tum log kuch bhi seekh sakte ho, record time mein.',
  'Is squad ki playlist aur plans, dono legendary hain.',
  'Tum sab milke ek mini startup jaise kaam karte ho.',
  'Is squad ki inside jokes ki library kaafi badi hai.',
  'Naye log is squad se milke turant comfortable feel karte hain.',
  'Tum log ek doosre ke best hype manager ho.',
  'Is squad ka agla trip already sabke dimaag mein plan hai.',
  'Ek baar yeh squad decide kar le, toh kaam ho ke rehta hai.',
  'Tum sab ki energy alag hai, isi liye team ekdum balanced hai.',
  'Is squad ke saath canteen bhi ek brainstorm room ban jaata hai.',
  'Agle saal is squad ka ek idea poore campus mein chalega.',
  'Tum log milke har challenge ko game bana dete ho.',
]);

// generated nicknames for the TV (names never go there). CamelCase, letters only, at most 12 characters.
export const NICKS = ['TurboJugnu', 'ChillSamosa', 'NeonTitli', 'ZoomPatang', 'CosmicChai', 'PixelMor', 'RocketLadoo', 'SunnyBadal', 'BoltBulbul', 'JazzyJalebi', 'StarKoyal', 'GlowGendha', 'SwiftHiran', 'BrightTara', 'MangoMantra', 'CloudChidiya'];

export const DOST_UI = { kicker: 'Dost compatibility', card: 'Hamari squad ka AI vibe report', hint: 'Sirf maze ke liye: dosti ki vibes' };

export const DOST_TEMPLATES = {
  ...DOST_LOG_TEMPLATES,
  dost_role_tv: ['{nick}: {role}', { nick: NICKS, role: ROLES.map((r) => r.text) }],
  dost_score: ['Green flag energy {score}%', { score: 'int:0..100' }],
  dost_kicker: ['{n} dost · {energy}', { n: 'int:2..4', energy: ENERGY.map((e) => e.text) }],
};

/** All Dost banks for registration: { bankName: { id: text } }. */
export function dostBanks() {
  const orx = { dost_title: DOST_ORX.title, squad_name: 'Squad Agent', squad_role: 'Squad energy match', roles_name: 'Role Agent', roles_role: 'Who brings what', rashi_role2: 'Sun signs, in code', ank_role2: 'Life paths, in code' };
  for (const [k, v] of Object.entries(DOST_ORX.task)) orx[`dtask_${k}`] = v;
  for (const [k, v] of Object.entries(DOST_ORX.log)) orx[`dlog_${k}`] = v;
  for (const [k, v] of Object.entries(DOST_ORX.handoff)) orx[`dho_${k}`] = v;
  return {
    dost_orx: orx,
    dost_ui: Object.fromEntries(Object.entries(DOST_UI).map(([k, v]) => [`dui_${k}`, v])),
    dost_energy: Object.fromEntries(ENERGY.map((e) => [e.id, e.text])),
    dost_energy_line: Object.fromEntries(ENERGY.map((e) => [`${e.id}_l`, e.line])),
    dost_role: Object.fromEntries(ROLES.map((r) => [r.id, r.text])),
    dost_role_line: Object.fromEntries(ROLES.map((r) => [`${r.id}_l`, r.line])),
    dost_line: Object.fromEntries(SQUAD_LINES.map((l) => [l.id, l.text])),
    dost_tok: { dtok_dost: 'dost', dtok_squad: 'squad', dtok_target: 'target', dtok_compass: 'compass', dtok_roles: 'roles' },
  };
}

const pick = (ids, description) => ({ type: 'string', enum: ids, description });
export const DOST_SCHEMA = {
  type: 'object',
  properties: {
    energy: pick(ENERGY.map((e) => e.id), 'one SQUAD ENERGY id'),
    roles: { type: 'array', items: { type: 'string', enum: ROLES.map((r) => r.id) }, description: 'one different ROLE id per friend, in friend order' },
    lines: { type: 'array', items: { type: 'string', enum: SQUAD_LINES.map((l) => l.id) }, description: 'exactly 2 different SQUAD LINES ids' },
    adj: pick(ADJ, 'one adjective for the squad'),
  },
  required: ['energy', 'roles', 'lines', 'adj'],
};

export function dostSystem() {
  const rows = (t, list, f = (x) => x.text) => `${t}\n${list.map((x) => `${x.id}: ${f(x)}`).join('\n')}`;
  return `You are the Squad Agent and the Role Agent at the Zenith School of AI "AI Jyotish" stall at a college fest in India.
A group of 2 to 4 friends (many under 18) gets a playful squad vibe report. It is about FRIENDSHIP only, never romance.
You do not write any text: only choose ids from the reviewed lists. Pick the squad energy that fits the mix of sun signs,
elements and life-path numbers, one different role per friend (in the given order), 2 different squad lines and one adjective.

${rows('SQUAD ENERGY', ENERGY, (x) => `${x.text} : ${x.line}`)}

${rows('ROLES', ROLES, (x) => `${x.text} : ${x.line}`)}

${rows('SQUAD LINES', SQUAD_LINES)}

ADJECTIVES\n${ADJ.join(', ')}`;
}
export const dostUserText = (friends) => `${friends.map((f, i) => `Friend ${i + 1}: ${f.sign.en} (${f.sign.element}), life path ${f.number}, age band ${f.age}`).join('\n')}\nPick the ids now.`;

function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
}

// role leanings by element and life path, so offline picks still feel like the people in the squad
const ELEMENT_ROLES = { Fire: ['sr02', 'sr20', 'sr03', 'sr13'], Earth: ['sr01', 'sr04', 'sr14', 'sr18'], Air: ['sr08', 'sr16', 'sr19', 'sr09'], Water: ['sr10', 'sr06', 'sr05', 'sr11'] };
const NUMBER_ROLES = { 1: 'sr04', 2: 'sr10', 3: 'sr08', 4: 'sr01', 5: 'sr09', 6: 'sr06', 7: 'sr15', 8: 'sr14', 9: 'sr19', 11: 'sr20', 22: 'sr12', 33: 'sr13' };

/** Fun compatibility in code: element harmony + number variety. Always 70..99 (positive only). */
export function squadScore(friends) {
  const els = friends.map((f) => f.sign.element);
  const kinds = new Set(els).size;
  const nums = new Set(friends.map((f) => f.number)).size;
  const harmony = els.filter((e, i) => els.some((x, j) => j !== i && ((e === 'Fire' && x === 'Air') || (e === 'Air' && x === 'Fire') || (e === 'Earth' && x === 'Water') || (e === 'Water' && x === 'Earth') || e === x))).length;
  const raw = 72 + harmony * 4 + kinds * 3 + nums * 2;
  return Math.max(70, Math.min(99, raw));
}

export function seedOf(friends) { return friends.map((f) => `${f.sign.id}${f.number}`).join('-'); }

/** Deterministic pick (offline, mock, and fill-in): energy by element mix, roles by element + number. */
export function defaultDostPick(friends) {
  const seed = seedOf(friends);
  const r = rng(seed);
  const energyIdx = Math.floor(r() * ENERGY.length);
  const used = new Set();
  const roles = friends.map((f) => {
    const cands = [NUMBER_ROLES[f.number], ...ELEMENT_ROLES[f.sign.element], ...ROLES.map((x) => x.id)];
    const id = cands.find((c) => c && !used.has(c));
    used.add(id);
    return id;
  });
  const l1 = Math.floor(r() * SQUAD_LINES.length);
  const l2 = (l1 + 1 + Math.floor(r() * (SQUAD_LINES.length - 1))) % SQUAD_LINES.length;
  return { energy: ENERGY[energyIdx].id, roles, lines: [SQUAD_LINES[l1].id, SQUAD_LINES[l2].id], adj: ADJ[Math.floor(r() * ADJ.length)] };
}

/** Validate a model pick against the banks; fix what is missing, duplicated or unknown. */
export function resolveDost(pick, friends) {
  const d = defaultDostPick(friends);
  let fixed = 0;
  const energy = ENERGY.some((e) => e.id === pick?.energy) ? pick.energy : (fixed += 1, d.energy);
  const used = new Set();
  const roles = friends.map((_, i) => {
    const id = pick?.roles?.[i];
    if (ROLES.some((x) => x.id === id) && !used.has(id)) { used.add(id); return id; }
    fixed += 1;
    const alt = [d.roles[i], ...ROLES.map((x) => x.id)].find((c) => !used.has(c));
    used.add(alt);
    return alt;
  });
  const lines = [...new Set((pick?.lines || []).filter((id) => SQUAD_LINES.some((l) => l.id === id)))].slice(0, 2);
  for (const id of d.lines) if (lines.length < 2 && !lines.includes(id)) { lines.push(id); fixed += 1; }
  while (lines.length < 2) { const x = SQUAD_LINES.find((l) => !lines.includes(l.id)).id; lines.push(x); fixed += 1; }
  const adj = ADJ.includes(pick?.adj) ? pick.adj : (fixed += 1, d.adj);
  return { pick: { energy, roles, lines, adj }, fixed };
}

/** Nickname per friend for the TV: deterministic from the squad, distinct, never a name. */
export function nicksFor(friends) {
  const r = rng(`nick:${seedOf(friends)}`);
  const pool = [...NICKS];
  return friends.map(() => pool.splice(Math.floor(r() * pool.length), 1)[0]);
}
