// AI Jyotish "Dost compatibility" (TASK-15): 2 to 4 friends on one phone -> squad vibe report.
// What leaves the phone: each friend's sun sign, life-path number and age band. Never names, DOBs or photos.
// Palm photos are optional and phone-only (downscaled, EXIF dropped, freed on "Naya squad").
// The TV and the share card show only reviewed lines from the server (public text) and generated nicknames.
import { api, track, tvMirror, tvToggle, counter, hero, isHero, h, downscaleImage, sleep } from '/core/kit.js';
import { Orchestra } from '/core/orchestra.js';
import { gate, isUnlocked } from '/core/gate.js';
import { makeShareCard, shareCard, sendToFriends } from '/core/sharecard.js';
import { chart, validDob } from './lib/astro.js';
import { stockLines } from './lib/palmlines.js';
import { fillFrom } from './lib/publictext.js';
import { DOST_ORX, DOST_LOG_TEMPLATES } from './lib/dosttext.js';
import { palmView } from './palm.js';
import { careCheck } from './lib/care.js';
import { bigScreenButton, pickNickname, rewardToken } from '/core/stage.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of document.querySelectorAll('.jy-screen')) s.hidden = s.id !== id; window.scrollTo(0, 0); };
const fill = (id, slots) => fillFrom(DOST_LOG_TEMPLATES, id, slots);
const ptx = (x) => ({ pt: x.pt, text: x.text, toString() { return x.text; } });
const HERO = isHero();
const st = { friends: [], res: null, card: null, mirror: null, turn: null };

$('tv-toggle').replaceWith(tvToggle((on) => st.mirror?.setEnabled(on), { hint: 'Sirf squad energy aur nicknames. Naam kabhi nahi.' }));
$('tv-note').hidden = counter() === null;
const today = new Date().toISOString().slice(0, 10);

// ---------- stage (CONTRACT 12): big-screen turn + the green-flag squad board, under a generated nickname only ----
if (!HERO) {
  bigScreenButton($('big'), { label: 'Big screen pe squad report', onTurn: (turn) => { st.turn = turn; $('squad').requestSubmit(); } });
  $('nick').addEventListener('click', async () => {
    const nick = await pickNickname({ title: 'Squad ka stage naam chuno' });
    if (!nick) return;
    $('nick').hidden = true;
    $('nick-note').hidden = false;
    $('nick-note').textContent = `Board pe naam: ${nick}. Asli naam kabhi nahi.`;
  });
} else { $('big').hidden = true; $('nick').hidden = true; }

// ---------- 1. friends ----------
function friendCard(i) {
  const card = h('fieldset', { class: 'jy-card dq-friend', 'data-i': String(i) },
    h('legend', { class: 'jy-card-k' }, `Dost ${i + 1}`),
    h('label', { class: 'pz-field' }, h('span', {}, 'First name (sirf is phone pe)'), h('input', { class: 'pz-input', name: `name${i}`, maxlength: '20', placeholder: 'jaise: Meher', autocapitalize: 'words' })),
    h('label', { class: 'pz-field' }, h('span', {}, 'Date of birth'), h('input', { class: 'pz-input', name: `dob${i}`, type: 'date', min: '1930-01-01', max: today })),
    h('label', { class: 'pz-btn ghost block jy-file dq-palm' }, h('input', { type: 'file', accept: 'image/*', capture: 'environment', 'data-i': String(i) }), h('span', {}, 'Palm photo (optional)')));
  if (i >= 2) card.appendChild(h('button', { class: 'jy-link dq-remove', type: 'button', onclick: () => { card.remove(); renumber(); } }, 'Hatao'));
  return card;
}
function renumber() {
  const cards = [...document.querySelectorAll('.dq-friend')];
  cards.forEach((c, i) => { c.querySelector('legend').textContent = `Dost ${i + 1}`; });
  $('add').hidden = cards.length >= 4;
}
for (let i = 0; i < 2; i++) $('friends').appendChild(friendCard(i));
let made = 2;
$('add').addEventListener('click', () => { if (document.querySelectorAll('.dq-friend').length < 4) $('friends').appendChild(friendCard(made++)); renumber(); });

const palms = new Map(); // card index -> data URL (phone only)
$('friends').addEventListener('change', async (e) => {
  const inp = e.target;
  if (inp.type !== 'file' || !inp.files?.[0]) return;
  const i = inp.dataset.i;
  try {
    palms.set(i, await downscaleImage(inp.files[0], 768, 0.82));
    inp.nextSibling.textContent = 'Palm photo ready';
  } catch { inp.nextSibling.textContent = 'Photo nahi khuli, phir try karo'; }
  inp.value = '';
});

$('squad').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cards = [...document.querySelectorAll('.dq-friend')];
  // care path on every typed field (full values, before the first-name cut)
  if (await careCheck(...cards.map((c) => c.querySelector('input[name^=name]').value))) { e.target.reset(); return; }
  const friends = cards.map((c) => ({ i: c.dataset.i, name: c.querySelector('input[name^=name]').value.trim().split(/\s+/)[0].slice(0, 20), dob: c.querySelector('input[type=date]').value }));
  const bad = friends.findIndex((f) => !f.name || !validDob(f.dob));
  $('squad-err').hidden = bad < 0;
  if (bad >= 0) { $('squad-err').textContent = `Dost ${bad + 1} ka first name aur date of birth bharo.`; return; }
  st.friends = friends.map((f) => ({ ...f, chart: chart(f.dob), palm: palms.get(f.i) || null }));
  run().catch((err) => { console.warn('[dost]', err?.message); show('s-squad'); });
});

// ---------- 2. agents ----------
async function run() {
  track('start');
  show('s-run');
  const t0 = performance.now();
  const orx = new Orchestra($('orx'), { title: DOST_ORX.title, mode: 'phone', orchestrator: DOST_ORX.orchestrator, agents: DOST_ORX.agents });
  st.mirror = tvMirror(orx);
  const body = { friends: st.friends.map((f) => ({ sign: f.chart.sign.id, number: f.chart.lifePath.number, age: f.chart.age })) };
  const call = api('dost', body);
  orx.assign('squad', DOST_ORX.task.squad);

  await orx.step('rashi', DOST_ORX.task.rashi, async () => {
    for (const [i, f] of st.friends.entries()) {
      await sleep(320);
      orx.log('rashi', fill('dost_log_friend', { i: i + 1, sign: f.chart.sign.en, n: f.chart.lifePath.number }));
    }
  });
  orx.handoff('rashi', 'squad', DOST_ORX.handoff.signs);
  await orx.step('ank', DOST_ORX.task.ank, async () => { await sleep(500); });
  orx.handoff('ank', 'squad', DOST_ORX.handoff.numbers);

  orx.status('squad', 'working');
  let res;
  try { res = await call; } catch (e) { orx.status('squad', 'retry'); throw e; }
  st.res = res;
  await sleep(700);
  const k = new Set(st.friends.map((f) => f.chart.sign.element)).size;
  orx.log('squad', fill('dost_log_mix', { n: st.friends.length, k, score: res.score }));
  orx.log('squad', DOST_ORX.log.picks);
  orx.status('squad', 'done');
  orx.handoff('squad', 'roles', DOST_ORX.handoff.energy);
  await orx.step('roles', DOST_ORX.task.roles, async () => {
    await sleep(800);
    orx.log('roles', fill('dost_log_roles', { n: st.friends.length }));
  });
  orx.handoff('roles', 'guru', DOST_ORX.handoff.roles);
  orx.done(fill('dost_done', { s: Math.max(1, Math.round((performance.now() - t0) / 1000)) }));
  sendTv();
  await sleep(1200);
  render();
}

function sendTv() {
  const p = st.res.public;
  // TV: reviewed lines + generated nicknames only (never typed names)
  st.mirror.result({
    kind: 'dost',
    kicker: p.kicker.text,
    title: p.energy.text,
    text: p.energyLine.text,
    tag: p.score.text,
    items: p.roles.map((r) => ({ label: r.tv.text, note: r.line.text })),
    lines: p.lines.map((x) => x.text),
    forFun: true,
  });
}

// ---------- 3. report ----------
function render() {
  const p = st.res.public;
  $('r-energy').textContent = p.energy.text;
  $('r-line').textContent = p.energyLine.text;
  $('r-score').textContent = p.score.text;
  $('r-roles').replaceChildren(...p.roles.map((r, i) => {
    const f = st.friends[i];
    const li = h('li', { class: 'dq-role' });
    if (f.palm) {
      const pv = palmView({ src: f.palm, size: 'phone' });
      pv.el.classList.add('dq-mini');
      pv.show(stockLines(`${f.chart.sign.id}:${f.chart.lifePath.number}`));
      li.appendChild(pv.el);
    }
    li.append(h('div', {}, h('b', {}, f.name), h('span', { class: 'dq-nick' }, ` · ${r.nick}`), h('div', { class: 'dq-rolename' }, r.role.text), h('div', { class: 'pz-dim' }, r.line.text)));
    return li;
  }));
  $('r-lines').replaceChildren(...p.lines.map((x) => h('li', {}, x.text)));
  const open = isUnlocked('jyotish') || HERO;
  $('unlock').hidden = open;
  $('share-box').hidden = !open;
  if (open) buildCard();
  const b = st.res.board;
  $('r-board').hidden = !b?.ok;
  if (b?.ok) $('r-board').textContent = `Aaj ki green-flag squads board pe: #${b.rank}`;
  if (st.turn) { const t = st.turn; st.turn = null; setTimeout(() => rewardToken(t), 1500); }
  $('r-src').textContent = { claude: 'Picked live by Claude from reviewed lines', mock: 'Mock mode (no API key)', fixture: 'Offline mode: ready-made picks', hero: 'Demo squad (fictional, for filming)' }[st.res.source] || '';
  show('s-result');
  track('complete');
}

async function buildCard() {
  if (st.card) return;
  const c = st.res.public.card;
  st.card = await makeShareCard({ kicker: ptx(c.kicker), title: ptx(c.title), lines: c.lines.map(ptx), footer: ptx(st.res.public.hint) });
  $('card-img').src = st.card.url;
}

$('unlock').addEventListener('click', async () => {
  await gate('jyotish', { reward: 'Squad ka share card', title: 'Follow karo, squad card unlock karo' });
  $('unlock').hidden = true;
  $('share-box').hidden = false;
  await buildCard();
});
$('friends-share').addEventListener('click', () => st.card && sendToFriends(st.card, { text: 'Hamari squad ka AI vibe report aa gaya! Apni squad ke saath try karo.', filename: 'zenith-dost.png' }));
$('story').addEventListener('click', () => st.card && shareCard(st.card, { filename: 'zenith-dost.png' }));
$('again').addEventListener('click', () => {
  st.mirror?.end();
  palms.clear();
  Object.assign(st, { friends: [], res: null, card: null, mirror: null });
  $('friends').replaceChildren(friendCard(0), friendCard(1));
  made = 2;
  renumber();
  show('s-squad');
});

// ---------- ?demo=hero: a fictional squad for filming ----------
if (HERO) {
  const hp = await hero();
  const squad = hp?.profile?.dost;
  if (squad?.length) {
    while (document.querySelectorAll('.dq-friend').length < squad.length) $('friends').appendChild(friendCard(made++));
    renumber();
    squad.forEach((f, i) => { $('squad')[`name${i}`].value = f.name; $('squad')[`dob${i}`].value = f.dob; });
    $('hero-note').hidden = false;
    $('hero-note').textContent = `${hp.label}: fictional squad`;
    setTimeout(() => $('squad').requestSubmit(), 1200);
  }
}
