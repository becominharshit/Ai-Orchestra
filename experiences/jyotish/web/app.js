// AI Jyotish phone app.
//   form (name, DOB, place, time) -> palm photo -> Agent Orchestra (6 agents, real work) -> result
//   result: Tum kaun ho + palm overlay + past x3 visible, future x3 + share card behind the follow gate,
//   tabs Career / Dating / Health. Mirrored to the counter TV (palm + reading, never the name/DOB/place).
//
// What leaves the phone: sign, life-path number, age band, time-of-day bucket and the downscaled palm JPEG.
// The name, the DOB and the birth place never leave the phone (the place is only a badge on the result screen).
// Dating + Health are phone-only: they are not in the mirrored orchestra and never go to the TV.
import { api, track, tvMirror, tvToggle, counter, hero, isHero, h, downscaleImage, sleep } from '/core/kit.js';
import { Orchestra } from '/core/orchestra.js';
import { gate, isUnlocked } from '/core/gate.js';
import { makeShareCard, shareCard, sendToFriends } from '/core/sharecard.js';
import { chart, validDob, ELEMENT_HI, MASTER } from './lib/astro.js';
import { LINE_INFO, tvPaths } from './lib/palmlines.js';
import { palmView, constellation } from './palm.js';
import { AGENTS, ORX, fill } from './lib/publictext.js';
import { careCheck } from './lib/care.js';

const $ = (id) => document.getElementById(id);
const HERO_PALM = new URL('./assets/hero-palm.svg', import.meta.url).pathname;
const HERO = isHero();
const show = (id) => { for (const s of document.querySelectorAll('.jy-screen')) s.hidden = s.id !== id; window.scrollTo(0, 0); };

// Agent names, tasks and every log line come from lib/publictext.js: they reach the TV, so they are fixed or templated.

// ---------- state ----------
const st = { form: null, chart: null, palm: null, res: null, vibes: null, card: null, mirror: null, unlocked: false, tab: 'career' };

// ---------- 1. form ----------
const toggle = tvToggle((on) => st.mirror?.setEnabled(on));
$('tv-toggle').replaceWith(toggle);
$('tv-note').hidden = counter() === null;
$('form').dob.max = new Date().toISOString().slice(0, 10);

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  // care path on EVERY typed field (full typed values, before any trimming); nothing leaves the phone anyway
  const fd = new FormData(e.target);
  if (await careCheck(String(fd.get('name') || ''), String(fd.get('place') || ''))) { e.target.reset(); return; }
  const f = new FormData(e.target);
  const name = String(f.get('name') || '').trim();
  const dob = String(f.get('dob') || '');
  const err = !name ? 'Apna first name likho (yeh sirf tumhare phone pe rehta hai).' : !validDob(dob) ? 'Date of birth sahi se chuno.' : '';
  $('form-err').hidden = !err;
  $('form-err').textContent = err;
  if (err) return;
  st.form = { name: name.split(/\s+/)[0].slice(0, 20), dob, place: String(f.get('place') || '').trim().slice(0, 40), time: String(f.get('time') || '') };
  st.chart = chart(dob, st.form.time);
  show('s-palm');
});

// ---------- 2. palm photo ----------
const preview = palmView({ src: HERO_PALM, size: 'phone' });
$('palm-preview').appendChild(preview.el);
preview.el.classList.add('is-ghost');

$('palm-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    // downscale to max 768 px and re-encode as JPEG: this also drops EXIF (location, device)
    const dataUrl = await downscaleImage(file, 768, 0.82);
    st.palm = { dataUrl, src: dataUrl, kind: 'photo', kb: Math.round((dataUrl.length * 0.75) / 1024) };
    preview.setSrc(dataUrl);
    preview.el.classList.remove('is-ghost');
    await preview.loaded;
    const img = preview.el.querySelector('img');
    st.palm.w = img.naturalWidth; st.palm.h = img.naturalHeight;
    $('pick-text').textContent = 'Dusri photo lo';
    $('pick-label').classList.add('ghost');
    $('go').hidden = false;
  } catch {
    $('pick-text').textContent = 'Photo nahi khuli, ek aur try karo';
  }
});
$('go').addEventListener('click', () => start());
$('skip').addEventListener('click', () => { st.palm = { dataUrl: null, src: HERO_PALM, kind: 'demo' }; start(); });

function start() {
  run().catch((err) => {
    // api() already showed friendly screens for network / queue / 5xx; this is a 4xx. Back to the photo step.
    console.warn('[jyotish]', err?.message);
    show('s-palm');
  });
}

// ---------- 3. orchestra ----------
async function run() {
  track('start');
  show('s-run');
  const { sign, lifePath, age, time } = st.chart;
  const t0 = performance.now();

  const runPalm = palmView({ src: st.palm.src, size: 'phone' });
  $('run-palm').replaceChildren(runPalm.el);
  const orx = new Orchestra($('orx'), { title: ORX.title, mode: 'phone', ...AGENTS });
  st.mirror = tvMirror(orx);
  const mirror = st.mirror;

  // Both Claude calls start now, in parallel. The body has no name, no DOB and no birth place.
  const body = { sign: sign.id, number: lifePath.number, age, time, palm: st.palm.dataUrl };
  const reading = api('reading', body);
  const vibes = HERO ? null : api('vibes', { sign: sign.id, number: lifePath.number, age }).catch(() => null);
  $('tab-agents').hidden = HERO;
  // under 18 the Dating Agent is the Dosti Agent everywhere on the phone
  $('tab-agents').querySelector('[data-id=dating]').firstChild.nextSibling.textContent = ['kid', 'teen'].includes(age) ? 'Dosti Agent' : 'Dating Agent';
  if (vibes) watchTabAgents(vibes);
  // TV copy of the palm (memory only on the server, 5 min max), only with the TV switch on
  // TV copy of the palm (only with the TV switch on): inline pictures on the bus, which core drops at the end of the
  // session or after 3 minutes (CONTRACT Clarification 10). A small thumbnail for the scan (custom events are 8 KB),
  // the full photo in the result. The illustrated palm is drawn by the TV itself (no image sent).
  const tvThumb = mirror.enabled && st.palm.dataUrl ? thumbnail(st.palm.dataUrl) : Promise.resolve(null);

  orx.log('guru', ORX.log.plan);
  orx.assign('hast', ORX.task.hast);
  orx.assign('kaal', ORX.task.kaal);

  // Rashi Agent: sun sign, computed right here
  await orx.step('rashi', ORX.task.rashi, async () => {
    await sleep(650);
    orx.log('rashi', fill('rashi_log', { sign: sign.en, hi: sign.hi, element: sign.element }));
  });
  orx.handoff('rashi', 'kaal', fill('ho_sign', { sign: sign.en }));

  // Ank Agent: life-path number, computed right here. The log is mirrored to the TV, so it never shows the
  // digit roots of month/day/year (with the sign on screen they would give away the DOB).
  await orx.step('ank', ORX.task.ank, async () => {
    await sleep(650);
    orx.log('ank', fill(MASTER.includes(lifePath.number) ? 'ank_log_master' : 'ank_log', { n: lifePath.number }));
  });
  orx.handoff('ank', 'kaal', fill('ho_number', { n: lifePath.number }));

  // Hast Rekha Agent: palm scan while the vision call runs
  orx.status('hast', 'working');
  orx.log('hast', st.palm.kind === 'photo' ? fill('photo_log', { w: st.palm.w, h: st.palm.h, kb: Math.max(1, st.palm.kb) }) : ORX.log.demoPalm);
  runPalm.scan(true);
  const thumb = await tvThumb;
  const tvPhoto = st.palm.kind === 'photo' && mirror.enabled;
  mirror.custom('palm', thumb ? { state: 'scan', image: thumb } : { state: 'scan' });
  const tScan = performance.now();
  let res;
  try { res = await reading; } catch (e) { orx.status('hast', 'retry'); throw e; }
  const left = 2600 - (performance.now() - tScan);
  if (left > 0) await sleep(left);
  st.res = res;
  const lines = res.reading.palm.lines;
  runPalm.scan(false);
  const how = { vision: 'Claude vision', mixed: 'Claude vision + stock', stock: 'stock rekha set' }[res.palmSource];
  const sOf = (k) => lines.find((l) => l.kind === k)?.strength || 'clear';
  orx.log('hast', fill('traced_log', { how, a: sOf('heart'), b: sOf('head'), c: sOf('life'), d: sOf('fate') }));
  mirror.custom('palm', { state: 'lines', paths: tvPaths(lines) });
  const drawing = runPalm.draw(lines);
  orx.status('hast', 'done');
  orx.handoff('hast', 'kaal', ORX.handoff.palm);

  // Kaal Agent: the past + future section of the answer (checked by the server guard)
  await orx.step('kaal', ORX.task.kaal, async () => {
    await sleep(900);
    const src = { claude: 'Claude reply', mock: 'mock reply', fixture: 'offline reading', hero: 'hero demo reading' }[res.source];
    const n = res.guard.judged || 0;
    orx.log('kaal', n ? fill('kaal_log_swap', { src, n }) : fill('kaal_log', { src }));
    orx.log('kaal', ORX.log.picks);
  });
  orx.handoff('kaal', 'career', ORX.handoff.picks);

  // Career Agent: the career section of the answer
  await orx.step('career', ORX.task.career, async () => {
    await sleep(800);
    orx.log('career', fill('career_log', { a: res.reading.career.learn.length, b: res.reading.career.roles.length }));
  });
  orx.handoff('career', 'guru', ORX.handoff.career);
  await drawing;
  orx.done(fill('done', { s: Math.max(1, Math.round((performance.now() - t0) / 1000)) }));

  st.unlocked = isUnlocked('jyotish');
  sendTvResult(tvPhoto ? st.palm.dataUrl : null);
  await sleep(1200);
  renderResult();
}

/** A <= 7 KB JPEG data URL of the palm for the scan event (the bus allows 8 KB per custom event). */
async function thumbnail(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  for (const [side, q] of [[220, 0.6], [180, 0.5], [140, 0.45]]) {
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k);
    cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const out = cv.toDataURL('image/jpeg', q);
    if (out.length < 7000) return out;
  }
  return null;
}

function sendTvResult(image) {
  const { sign, lifePath } = st.chart;
  const r = st.res.reading;
  const pub = st.res.public;
  const T = (x) => x.text;
  const open = st.unlocked || HERO;
  // TV: reviewed bank lines and templates only (res.public). Never the model's own wording, never name/DOB/place.
  st.mirror.result({
    kicker: T(pub.kicker),
    title: T(pub.title),
    sign: { id: sign.id, label: T(pub.sign), element: sign.element },
    number: lifePath.number,
    who: pub.who.map(T),
    past: pub.past.map(T),
    future: open ? pub.future.map(T) : [],
    locked: !open,
    ...(open ? {} : { hint: T(pub.hint) }),
    ...(image ? { image } : {}),
    paths: tvPaths(r.palm.lines),
    text: T(pub.tv),
    forFun: true,
  });
}

function watchTabAgents(p) {
  for (const a of document.querySelectorAll('.jy-ta')) { a.className = 'jy-ta is-working'; a.querySelector('b').textContent = 'WORKING'; }
  p.then((v) => {
    st.vibes = v?.vibes || null;
    for (const a of document.querySelectorAll('.jy-ta')) { a.className = `jy-ta ${v ? 'is-done' : 'is-retry'}`; a.querySelector('b').textContent = v ? 'DONE' : 'OFFLINE'; }
    if (!$('s-result').hidden) renderTab(st.tab);
  });
}

// ---------- 4. result ----------
function renderResult() {
  const { sign, lifePath } = st.chart;
  const r = st.res.reading;
  $('r-const').replaceChildren(constellation(sign.id));
  $('r-kicker').textContent = `${st.form.name} ka AI Bhavishya`;
  $('r-title').textContent = r.title;
  $('r-badges').replaceChildren(
    h('span', { class: 'jy-badge' }, h('b', {}, sign.en), ` ${sign.hi}`),
    h('span', { class: 'jy-badge' }, h('b', {}, ELEMENT_HI[sign.element]), ` ${sign.element}`),
    h('span', { class: 'jy-badge num' }, 'Life path ', h('b', {}, String(lifePath.number))),
    // birth place: phone-only flavour, never sent anywhere
    st.form.place ? h('span', { class: 'jy-badge' }, h('b', {}, st.form.place.split(/[,\s]+/)[0].slice(0, 16)), ' ka sitara') : null);
  $('r-who').replaceChildren(...r.who.map((l) => h('li', {}, l)));

  const pv = palmView({ src: st.palm.src, size: 'phone' });
  $('r-palm').replaceChildren(pv.el);
  pv.show(r.palm.lines);
  $('r-legend').replaceChildren(...r.palm.lines.map((l) => h('li', { style: `--c:${LINE_INFO[l.kind].color}` },
    h('b', {}, LINE_INFO[l.kind].label), h('span', {}, l.meaning || LINE_INFO[l.kind].hi))));

  $('r-past').replaceChildren(...r.past.map((l) => h('li', {}, l)));
  renderFuture();
  $('tabs').hidden = HERO; // hero demo: Career only (Dating and Health never appear in footage)
  // under 18: the tab is about friendship, so call it that
  document.querySelector('#tabs [data-tab=dating]').textContent = ['kid', 'teen'].includes(st.chart.age) ? 'Dosti' : 'Dating';
  renderTab('career');
  $('r-src').textContent = { claude: 'Made live by Claude', mock: 'Mock mode (no API key)', fixture: 'Offline mode: ready-made reading', hero: 'Demo profile (fictional, for filming)' }[st.res.source] || '';
  show('s-result');
  track('complete');
}

function renderFuture() {
  const r = st.res.reading;
  const open = st.unlocked || HERO;
  // Locked: placeholder bars only. The real lines are not in the page until the gate is passed.
  $('r-future').replaceChildren(...(open ? r.future.map((l) => h('li', {}, l)) : [0, 1, 2].map(() => h('li', { class: 'locked', 'aria-label': 'Locked' }, h('span'), h('span')))));
  $('unlock').hidden = open;
  $('future-card').classList.toggle('is-open', open);
  $('share-box').hidden = !open;
  if (open && !st.card) buildCard();
}

// { pt, text } from the server, also usable as a plain string (core's card before and after section 13)
const ptx = (x) => ({ pt: x.pt, text: x.text, toString() { return x.text; } });

async function buildCard() {
  const c = st.res.public.card; // reviewed lines + the card_kicker template, chosen by the server
  st.card = await makeShareCard({ kicker: ptx(c.kicker), title: ptx(c.title), lines: c.lines.map(ptx), footer: ptx(c.footer) });
  $('card-img').src = st.card.url;
}

$('unlock').addEventListener('click', async () => {
  await gate('jyotish', { reward: 'Tumhari 3 future predictions + share card', title: 'Follow karo, future unlock karo' });
  st.unlocked = true;
  renderFuture();
  st.mirror?.custom('future', { future: st.res.public.future.map((x) => x.text), locked: false });
  $('future-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('friends').addEventListener('click', () => st.card && sendToFriends(st.card, { text: 'Mera AI Bhavishya aa gaya! Tum bhi apna haath dikhao.', filename: 'zenith-jyotish.png' }));
$('story').addEventListener('click', () => st.card && shareCard(st.card, { filename: 'zenith-jyotish.png' }));

// ---------- tabs ----------
for (const b of document.querySelectorAll('#tabs [role=tab]')) b.addEventListener('click', () => { renderTab(b.dataset.tab); track('jy_tab', { tab: b.dataset.tab }); });

function renderTab(tab) {
  if (HERO && tab !== 'career') tab = 'career';
  st.tab = tab;
  for (const b of document.querySelectorAll('#tabs [role=tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const t of ['career', 'dating', 'health']) $(`tab-${t}`).hidden = t !== tab;
  const el = $(`tab-${tab}`);
  const waiting = () => h('p', { class: 'jy-wait' }, h('span', { class: 'pz-spinner' }), 'Agent abhi likh raha hai...');
  if (tab === 'career') {
    const c = st.res.reading.career;
    el.replaceChildren(
      h('div', { class: 'jy-card-k' }, h('i', { class: 'jy-ico career' }), 'Career Agent'),
      h('h3', { class: 'pz-display jy-tabh' }, c.headline),
      h('ul', { class: 'jy-bullets' }, ...c.read.map((l) => h('li', {}, l))),
      h('div', { class: 'jy-sub-k' }, 'Ab yeh seekho'),
      h('div', { class: 'jy-chips' }, ...c.learn.map((l) => h('span', {}, l))),
      h('div', { class: 'jy-sub-k' }, 'Explore karo'),
      h('div', { class: 'jy-chips alt' }, ...c.roles.map((l) => h('span', {}, l))),
      h('a', { class: 'pz-btn block jy-cta', href: '/career' }, 'Career Studio try karo (Counter ', h('span', { 'data-pz-counter-of': 'career' }, '5'), ')'));
  } else if (tab === 'dating') {
    const d = st.vibes?.dating;
    const minor = ['kid', 'teen'].includes(st.chart.age);
    el.replaceChildren(h('div', { class: 'jy-card-k' }, h('i', { class: 'jy-ico dating' }), minor ? 'Dosti Agent · dosti aur confidence' : 'Dating Agent · dosti aur confidence'),
      ...(d ? [
        h('h3', { class: 'pz-display jy-tabh' }, d.title),
        h('span', { class: 'jy-adj' }, `Aaj ka vibe: ${d.adj}`),
        h('div', { class: 'jy-sub-k' }, minor ? 'Dosti forecast' : 'Rizz forecast'),
        h('p', { class: 'jy-rizz' }, d.rizz),
        h('div', { class: 'jy-sub-k' }, 'Green flags'),
        h('div', { class: 'jy-chips green' }, ...d.flags.map((l) => h('span', {}, l))),
        h('div', { class: 'jy-sub-k' }, 'Vibe match signs'),
        h('ul', { class: 'jy-bullets' }, ...d.signs.map((l) => h('li', {}, l))),
      ] : [waiting()]),
      h('p', { class: 'jy-fine' }, 'Sab PG, sab positive. Bas vibes ki baat.'));
  } else {
    const v = st.vibes?.health;
    el.replaceChildren(h('div', { class: 'jy-card-k' }, h('i', { class: 'jy-ico health' }), 'Health Agent · vibe check'),
      h('p', { class: 'jy-nomed' }, 'Not medical advice. Just for fun.'),
      ...(v ? [
        h('h3', { class: 'pz-display jy-tabh' }, v.type),
        h('span', { class: 'jy-adj' }, `${v.adj} energy`),
        h('p', { class: 'jy-rizz' }, v.line),
        h('div', { class: 'jy-sub-k' }, '3 superfoods'),
        h('div', { class: 'jy-chips green' }, ...v.superfoods.map((l) => h('span', {}, l))),
        h('div', { class: 'jy-sub-k' }, '3 aadatein skip karo'),
        h('div', { class: 'jy-chips skip' }, ...v.skip.map((l) => h('span', {}, l))),
      ] : [waiting()]));
  }
}

// ---------- restart ----------
$('again').addEventListener('click', () => {
  st.mirror?.end();
  Object.assign(st, { palm: null, res: null, vibes: null, card: null, mirror: null, chart: null });
  $('form').reset();
  preview.setSrc(HERO_PALM);
  preview.el.classList.add('is-ghost');
  $('go').hidden = true;
  $('pick-text').textContent = 'Palm ki photo lo';
  $('pick-label').classList.remove('ghost');
  show('s-form');
});

// ---------- ?demo=hero: fictional profile, illustrated palm, runs by itself (filming) ----------
if (HERO) {
  const hp = await hero();
  if (hp) {
    const f = $('form');
    f.name.value = hp.profile.name || '';
    f.dob.value = hp.profile.dob || '';
    f.place.value = hp.profile.place || '';
    f.time.value = hp.profile.time || '';
    $('hero-note').hidden = false;
    $('hero-note').textContent = hp.label;
    setTimeout(() => {
      f.requestSubmit();
      setTimeout(() => $('skip').click(), 900);
    }, 1200);
  }
}
