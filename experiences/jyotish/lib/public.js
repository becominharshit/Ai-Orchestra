// AI Jyotish public text (CONTRACT section 13, CHECK_build item 12): EVERY string that can reach the counter TV,
// the share card or the stage board is a reviewed bank line or a fixed template from this file. The model's own
// wording is phone-only (server.js, after the judge). server.js registers all of this with ctx.safety; tests use
// `matches()` to prove that every string in the TV stream is registered.
//
// Reading banks: sign lines come from fixtures/reading.json (one reviewed set per sign) plus GENERIC lines below.
// Ids are stable: <bank>_<sign>_<n> for sign lines, <bank>_g<nn> for generic ones (APPEND ONLY).
import fs from 'node:fs';
import { SIGNS, LIFE_PATHS, ELEMENT_HI } from '../web/lib/astro.js';
import { LINE_KINDS, STRENGTHS } from '../web/lib/palmlines.js';
import { AGENTS, ORX, UI, TEMPLATES, TOKENS } from '../web/lib/publictext.js';

export { AGENTS, ORX, UI, TEMPLATES, TOKENS };

const here = new URL('..', import.meta.url);
const FIX = JSON.parse(fs.readFileSync(new URL('fixtures/reading.json', here), 'utf8'));

export const NUMBER_LINES = {
  1: 'Life path 1: tum naturally lead karte ho, log tumhare peeche chal padte hain.',
  2: 'Life path 2: tum team ke sabse bharosemand saathi ho.',
  3: 'Life path 3: tumhari creativity aur baaton mein sparkle hai.',
  4: 'Life path 4: tum mazboot neev banate ho, har kaam step by step.',
  5: 'Life path 5: tumhe change aur adventure se energy milti hai.',
  6: 'Life path 6: tum sabka khayal rakhte ho, squad ke caretaker.',
  7: 'Life path 7: tum deep thinker ho, sawaal ke andar sawaal dhoondhte ho.',
  8: 'Life path 8: tumhare andar big-vision wala boss mode hai.',
  9: 'Life path 9: tum bade dil wale ho, duniya ko better banana chahte ho.',
  11: 'Life path 11, master number: tumhari intuition ekdum laser jaisi hai.',
  22: 'Life path 22, master number: tum bade sapno ko asli plan mein badalte ho.',
  33: 'Life path 33, master number: tum logon ko sikhane aur uthane ke liye bane ho.',
};

const GENERIC = {
  title: ['Spark Starter', 'Idea Engine', 'Squad Sunshine', 'Quiet Genius', 'Bright Builder', 'Wonder Mind', 'Bold Dreamer', 'Kind Captain', 'Story Maker', 'Code Poet', 'Stage Star', 'Calm Hero'],
  who: [
    'Tum woh dost ho jo har plan mein energy le aata hai.',
    'Tumhare dimaag mein ideas ki playlist hamesha on rehti hai.',
    'Tumhari curiosity tumhe roz kuch naya sikhati hai.',
    'Tum chhoti cheezon mein bhi bada idea dhoondh lete ho.',
    'Tumhari vibe group chat ka mood set kar deti hai.',
    'Tum jahan jaate ho, wahan thodi roshni le jaate ho.',
    'Tum naye tools ko aise seekhte ho jaise game ka naya level.',
    'Tumhare andar ek creator aur ek captain dono hain.',
    'Tum doston ki jeet pe sabse zor se taali bajate ho.',
    'Tumhari soch thodi alag hai, aur isi liye kaam ki hai.',
    'Tum kisi bhi project ko apna bana lete ho.',
    'Tumhare notes, playlists aur plans sab mein ek style hai.',
    'Tum bolte kam ho, par jab bolte ho toh idea solid hota hai.',
    'Tum har din ko ek naya experiment samajhte ho.',
    'Tumhari energy dekh ke squad ka josh double ho jaata hai.',
    'Tumhare saath naye kaam shuru karna sabko aasaan lagta hai.',
  ],
  past: [
    'Ek baar tumne fest ke liye poora poster khud design kiya.',
    'Tumne kisi dost ko naya game ya app sikhaya, aur woh ab expert hai.',
    'Ek baar tumhari ek doodle ne poori class ka mood bana diya.',
    'Tumne ek purane gadget ko khol ke samjha ki woh kaise chalta hai.',
    'Ek trip pe tum hi the jisne sabke liye playlist banayi.',
    'Tumne ek group project mein sabko ek saath jod diya.',
    'Ek baar tumne bina kisi ke bole ek naye bande ko welcome kiya.',
    'Tumne koi hobby shuru ki aur use weekend ka favourite kaam bana diya.',
    'Ek baar tumhare idea pe poore squad ne haan bola.',
    'Tumne kisi competition mein pehli baar haath uthaya aur maza aaya.',
    'Tumne ek chhota sa video banaya jo doston ko yaad reh gaya.',
    'Ek baar tumne kuch aisa seekha jo poore group ke kaam aaya.',
    'Tumhara ek message kisi dost ka poora din bana gaya.',
    'Tumne ek tricky puzzle chupchaap solve kar diya.',
    'Ek baar tumne fest mein last minute pe poora show bacha liya.',
    'Tumhara ek reel doston ke group chat mein legendary ban gaya.',
    'Tumne kisi junior ko pehli baar stage pe jaane ka josh diya.',
  ],
  future: [
    'Agle kuch mahino mein tum ek nayi skill unlock karoge.',
    'Ek naya project tumhe apne jaise curious logon se milayega.',
    'Tumhara ek idea kisi club ya fest ka highlight banega.',
    'Tum ek AI tool se kuch aisa banaoge jo sab use karenge.',
    'Ek hackathon ya competition tumhari team ko yaad rahega.',
    'Tum ek chhota channel ya page shuru karoge jo log pasand karenge.',
    'Ek nayi dosti tumhare plans ko aur mazedaar banayegi.',
    'Tum stage pe apna idea present karoge aur log taali bajayenge.',
    'Ek purana sapna chhote steps mein sach hone lagega.',
    'Tum kisi ko kuch aisa sikhaoge jo woh hamesha yaad rakhega.',
    'Tumhari ek creation kisi ka din bana degi.',
    'Is saal tum ek naye shehar ya fest ko explore karoge.',
    'Ek naya mentor tumhe ek naya raasta dikhayega.',
    'Tumhare notebook ka ek idea asli project ban jayega.',
    'Ek din tumhara banaya hua app kisi fest mein log try karenge.',
    'Tum ek stage pe apna idea present karoge aur log tumhe dhoondhenge.',
    'Tumhara bold idea ek poori team ka mission ban jayega.',
  ],
};

// palm line meanings (phone legend), 6 per kind; the first 2 per kind are the fixture lines
const MEANINGS_EXTRA = {
  heart: ['Hriday rekha clear: tum doston ke liye hamesha present ho.', 'Heart line lambi: tumhari care sabko feel hoti hai.', 'Dil ki rekha mein warmth: squad ka comfort zone tum ho.', 'Heart line upar mudti: tumhari kindness door tak jaati hai.'],
  head: ['Mastishk rekha gehri: tum ek idea pe tik ke kamaal karte ho.', 'Head line thodi curve wali: creativity ka full mode.', 'Dimaag ki line saaf: plan banana tumhara game hai.', 'Head line lambi: sawaal poochna tumhara superpower.'],
  life: ['Jeevan rekha ka bada curve: naye adventures ke liye energy ready.', 'Life line saaf: tumhari routine tumhari taakat hai.', 'Jeevan rekha strong: josh aur patience dono saath.', 'Life line gehri: tum har din ko full use karte ho.'],
  fate: ['Bhagya rekha seedhi: tumhara raasta tumhare haath mein.', 'Fate line upar tak: bade goals ki taraf steady chaal.', 'Bhagya rekha halki par saaf: naye raaste khud banaoge.', 'Fate line ka twist: tum plan B ko bhi plan A bana dete ho.'],
};

const pad = (n) => String(n).padStart(2, '0');
function readingBanks() {
  const b = { title: {}, who: {}, past: {}, future: {}, tvline: {}, num: {}, meaning: {}, career: {} };
  SIGNS.forEach((s, i) => {
    const f = FIX[i];
    b.title[`title_${s.id}`] = f.title;
    f.who.slice(0, 2).forEach((t, j) => { b.who[`who_${s.id}_${j + 1}`] = t; });
    f.past.forEach((t, j) => { b.past[`past_${s.id}_${j + 1}`] = t; });
    f.future.forEach((t, j) => { b.future[`future_${s.id}_${j + 1}`] = t; });
    b.tvline[`tv_${s.id}`] = f.tvLine;
    const c = f.career;
    b.career[`car_${s.id}_h`] = c.headline;
    c.read.forEach((t, j) => { b.career[`car_${s.id}_r${j + 1}`] = t; });
    c.learn.forEach((t, j) => { b.career[`car_${s.id}_l${j + 1}`] = t; });
    c.roles.forEach((t, j) => { b.career[`car_${s.id}_o${j + 1}`] = t; });
  });
  for (const kind of LINE_KINDS) {
    const base = [FIX[0], FIX[1]].map((f) => f.palm.lines.find((l) => l.kind === kind).meaning);
    [...base, ...MEANINGS_EXTRA[kind]].forEach((t, j) => { b.meaning[`meaning_${kind}_${j + 1}`] = t; });
  }
  for (const k of ['title', 'who', 'past', 'future']) GENERIC[k].forEach((t, j) => { b[k][`${k}_g${pad(j + 1)}`] = t; });
  for (const n of LIFE_PATHS) b.num[`num_${n}`] = NUMBER_LINES[n];
  return b;
}

/** All banks: { bankName: { id: text } }. */
export function banks() {
  const orx = { orx_title: ORX.title, guru_name: AGENTS.orchestrator.name, guru_role: AGENTS.orchestrator.role };
  for (const a of AGENTS.agents) { orx[`${a.id}_name`] = a.name; orx[`${a.id}_role`] = a.role; }
  for (const [k, v] of Object.entries(ORX.task)) orx[`task_${k}`] = v;
  for (const [k, v] of Object.entries(ORX.log)) orx[`log_${k}`] = v;
  for (const [k, v] of Object.entries(ORX.handoff)) orx[`ho_${k}`] = v;
  const sign = Object.fromEntries(SIGNS.map((s) => [`sign_${s.id}`, `${s.en} · ${s.hi}`]));
  const tok = Object.fromEntries([...new Set(TOKENS)].map((t) => [`tok_${t}`, t]));
  return { orx, ui: Object.fromEntries(Object.entries(UI).map(([k, v]) => [`ui_${k}`, v])), sign, tok, ...readingBanks() };
}

export const ELEMENT_LABEL = ELEMENT_HI;

// ---- local matcher (same rule the core bus applies in PUBLIC_TEXT_STRICT) ----
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function slotRe(type) {
  if (Array.isArray(type)) return `(${type.map(esc).join('|')})`;
  if (type === 'count' || /^int:/.test(type)) return '(\\d+)';
  if (type === 'nickname') return '([A-Za-z0-9]{1,12})';
  throw new Error(`unknown slot type ${type}`);
}
export function templateRegex(text, slots) {
  const names = [];
  const re = esc(text).replace(/\\\{(\w+)\\\}/g, (_, n) => { names.push(n); return slotRe(slots[n]); });
  return { re: new RegExp(`^${re}$`), names };
}
function inRange(type, v) {
  const m = /^int:(\d+)\.\.(\d+)$/.exec(type || '');
  return !m || (Number(v) >= Number(m[1]) && Number(v) <= Number(m[2]));
}
/** Build a matcher over extra registries (e.g. the Dost banks) too. */
export function makeMatcher(extraBanks = {}, extraTemplates = {}) {
  const lines = new Set(Object.values({ ...banks(), ...extraBanks }).flatMap((b) => Object.values(b)));
  const tpls = Object.values({ ...TEMPLATES, ...extraTemplates }).map(([t, s]) => ({ ...templateRegex(t, s), slots: s }));
  return (str) => {
    if (lines.has(str)) return true;
    return tpls.some(({ re, names, slots }) => { const m = re.exec(str); return m && names.every((n, i) => inRange(slots[n], m[i + 1])); });
  };
}
