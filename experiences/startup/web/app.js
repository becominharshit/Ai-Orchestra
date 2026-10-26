// AI Startup Studio, phone app.
//   intro -> problem area chip -> who + vibe chips (+ optional one-liner, live safety mode only) -> Agent Orchestra
//   (Founder assigns Research, Product, Brand, Finance, Pitch; each agent logs its section of the server's answer)
//   -> startup card -> follow gate -> live website /s/<code> + share card -> optional "pitch to AI Sharks".
// The TV only ever gets the server's { pt, text } lines (bank or template), never anything typed.
import { api, track, tvMirror, tvToggle, hero, isHero, h, guardText, safetyMode, sleep } from '/core/kit.js';
import { Orchestra } from '/core/orchestra.js';
import { gate } from '/core/gate.js';
import { makeShareCard, shareCard, sendToFriends } from '/core/sharecard.js';
import { bigScreenButton, currentTurn, rewardToken } from '/core/stage.js';
import { MARKS, paletteVars } from './logo.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of document.querySelectorAll('.st-screen')) s.hidden = s.id !== id; window.scrollTo(0, 0); };
const st = { cfg: null, mode: 'degraded', area: null, who: null, vibe: null, res: null, card: null, mirror: null, running: false };

/** A logo element: the fixed SVG mark + monogram (same templates as the website and the TV). */
export function logoEl(logo, mono, cls = 'st-logo-in') {
  return h('div', { class: `${cls} logo-${logo}` }, h('span', { class: 'ss-mark', html: MARKS[logo] || MARKS[0] }), h('span', { class: 'ss-mono' }, mono));
}

async function boot() {
  st.cfg = await api('config');
  st.mode = (await safetyMode()) === 'live' && st.cfg.safetyMode === 'live' ? 'live' : 'degraded';
  $('areas').replaceChildren(...st.cfg.areas.map((a) => h('button', { class: 'st-area-btn', type: 'button', 'data-pz': 'area', 'data-id': a.id, onclick: () => pickArea(a) }, h('b', {}, a.label), h('span', {}, a.sub))));
  $('who').replaceChildren(...st.cfg.who.map((w) => h('button', { class: 'st-chip', type: 'button', 'data-pz': 'who', 'data-id': w.id, onclick: (e) => choose('who', w.id, e.currentTarget) }, w.label)));
  const swatch = { desi: 1, tech: 0, eco: 2, bold: 3 };
  $('vibes').replaceChildren(...st.cfg.vibes.map((v) => h('button', { class: 'st-chip', type: 'button', 'data-pz': 'vibe', 'data-id': v.id, onclick: (e) => choose('vibe', v.id, e.currentTarget) },
    h('i', { class: 'st-sw', style: paletteVars(swatch[v.id] ?? 0) }), v.label)));
  $('idea-box').hidden = st.mode !== 'live'; // degraded safety mode = chips only (no typing anywhere)
}

function pickArea(a) {
  st.area = a.id;
  $('picked-label').textContent = a.label;
  $('idea').value = '';
  show('s-brief');
  updateBuild();
}
function choose(kind, id, btn) {
  st[kind] = id;
  for (const b of btn.parentElement.children) b.classList.toggle('on', b === btn);
  updateBuild();
}
function updateBuild() { $('build').disabled = !(st.area && st.who && st.vibe); }

$('tv-toggle').replaceWith(tvToggle((on) => st.mirror?.setEnabled(on), { hint: 'TV pe sirf AI ki banayi startup dikhegi. Tumhara likha kuch nahi.' }));
bigScreenButton($('bigscreen'), { onTurn: () => show('s-area') });
$('go').addEventListener('click', () => { track('start', undefined, { once: true }); show('s-area'); });
$('picked').addEventListener('click', () => show('s-area'));
$('build').addEventListener('click', () => run().catch(onError));

function onError(err) {
  st.running = false;
  if (err?.care) { $('idea').value = ''; show('s-brief'); return; } // the kit shows the support card over this; no orchestra, no TV
  console.warn('[startup]', err?.message);
  st.mirror?.end();
  show('s-brief');
  if (err?.message) { $('build').textContent = err.message; setTimeout(() => { $('build').textContent = 'Company banao'; }, 3500); }
}

const AGENTS = (o) => ({
  orchestrator: { id: 'founder', name: o.founder, role: o.founderRole, icon: 'crown' },
  agents: [
    { id: 'research', name: o.research, role: o.researchRole, icon: 'search', label: o.sResearch },
    { id: 'product', name: o.product, role: o.productRole, icon: 'bolt', label: o.sProduct },
    { id: 'brand', name: o.brand, role: o.brandRole, icon: 'wand', label: o.sBrand },
    { id: 'finance', name: o.finance, role: o.financeRole, icon: 'chart', label: o.sFinance },
    { id: 'pitch', name: o.pitch, role: o.pitchRole, icon: 'rocket', label: o.sPitch },
  ],
});

async function run() {
  if (st.running) return;
  const idea = st.mode === 'live' ? $('idea').value.trim() : '';
  // care check on the typed line BEFORE anything starts (no orchestra, nothing on the TV). CONTRACT 13.3
  if (idea && !guardText(idea)) return;
  st.running = true;
  track('start', undefined, { once: true });
  const o = st.cfg.orx;
  const body = { area: st.area, who: st.who, vibe: st.vibe, ...(idea ? { idea } : {}) };
  // With a typed line, nothing exists on the phone graph or the TV until the server's live crisis check has answered
  // (CHECK-18 F2): a crisis line gets the care card and never starts the orchestra anywhere.
  let early = null;
  if (idea) {
    show('s-wait');
    early = await api('build', body);
  }
  show('s-run');
  const orx = new Orchestra($('orx'), { title: o.title, mode: 'phone', ...AGENTS(o) });
  st.mirror = tvMirror(orx);
  const t0 = performance.now();
  const call = early ? Promise.resolve(early) : api('build', body);
  call.catch(() => {}); // handled below

  // Founder plans and hands out the 5 tasks while the server works
  orx.status('founder', 'working');
  const tasks = [['research', o.tResearch], ['product', o.tProduct], ['brand', o.tBrand], ['finance', o.tFinance], ['pitch', o.tPitch]];
  for (const [id, task] of tasks) { orx.assign(id, task); orx.status(id, 'thinking'); await sleep(260); }
  orx.status('research', 'working');
  orx.progress(0.1);
  const res = await call.catch((e) => { orx.status('research', 'retry'); throw e; });
  st.res = res;
  const p = res.public;
  orx.log('founder', p.brief.text);

  // Each agent logs its own section of the structured answer (real data, registered templates only).
  const beat = (ms) => sleep(isHero() ? ms * 1.25 : ms);
  const section = async (id, logs, next, label, prog) => {
    orx.status(id, 'working');
    for (const l of logs) { orx.log(id, l.text); await beat(420); }
    orx.status(id, 'done');
    orx.handoff(id, next, label);
    orx.progress(prog);
    await beat(300);
  };
  await section('research', [p.logArea, p.who, p.market], 'product', o.hResearch, 0.28);
  await section('product', p.features, 'brand', o.hProduct, 0.46);
  await section('brand', [p.logName, p.logPalette, p.logLogo], 'finance', o.hBrand, 0.64);
  await section('finance', [p.price, p.margin, p.revenue], 'pitch', o.hFinance, 0.82);
  await section('pitch', [p.pitch], 'founder', o.hPitch, 1);
  orx.status('founder', 'done');
  const sec = (performance.now() - t0) / 1000;
  orx.done(`Startup ready in ${Math.min(120, Math.floor(sec))}.${Math.floor((sec * 10) % 10)}s`);

  // TV spotlight: bank and template lines only, plus numbers (palette, logo)
  st.mirror.result({
    kicker: p.kicker.text, title: p.name.text, tagline: p.tagline.text, area: p.area.text, mono: p.mono.text,
    features: p.features.map((f) => f.text), price: p.price.text, market: p.market.text, margin: p.margin.text, revenue: p.revenue.text,
    pitch: p.pitch.text, palette: res.picks.palette, logo: res.picks.logo,
  });

  st.card = await makeShareCard({ kicker: p.cardKicker, title: p.cardTitle, lines: [p.tagline, p.pitch, p.price] });
  await sleep(900);
  renderResult();
  st.running = false;
  if (currentTurn()) rewardToken(currentTurn());
}

function renderResult() {
  const { res } = st;
  const p = res.public;
  $('card').setAttribute('style', paletteVars(res.picks.palette));
  $('r-logo').replaceChildren(logoEl(res.picks.logo, p.mono.text));
  $('r-area').textContent = p.area.text;
  $('r-name').textContent = p.name.text;
  $('r-tag').textContent = p.tagline.text;
  $('r-pitch').textContent = p.pitch.text;
  $('r-note').hidden = !res.note;
  $('r-note').querySelector('span').textContent = res.note || '';
  $('r-research').textContent = p.research.text;
  $('r-who').textContent = p.who.text;
  $('r-market').textContent = p.market.text;
  $('r-feat').replaceChildren(...p.features.map((f) => h('li', {}, f.text)));
  $('r-price').textContent = p.price.text;
  $('r-margin').textContent = p.margin.text;
  $('r-rev').textContent = p.revenue.text;
  $('r-plan').replaceChildren(...p.plan.map((f) => h('li', {}, f.text)));
  $('r-src').textContent = { claude: 'Made live by the AI agents', mock: 'Mock mode (no API key)', composed: 'Offline mode: reviewed banks se assemble hui', hero: 'Demo profile (fictional, for filming)' }[res.source] || '';
  // "Pitch to AI Sharks" (optional): only chip ids travel, the idea type and the AI Sharks counter
  const c = res.shark.counter;
  $('shark').href = `/shark/?${c ? `c=${c}&` : ''}idea=${encodeURIComponent(res.shark.idea)}`;
  $('unlock').hidden = false;
  $('site-box').hidden = true;
  $('unlock').textContent = res.page ? 'Live website unlock karo' : 'Story card unlock karo';
  show('s-result');
  track('complete');
}

$('unlock').addEventListener('click', async () => {
  await gate('startup', { reward: st.res.page ? 'Tumhari startup ki live website + story card' : 'Tumhari startup ka story card' });
  $('unlock').hidden = true;
  const page = st.res.page;
  const url = page ? `${location.origin}${page.path}` : '';
  $('site-url').textContent = page ? `${location.host}${page.path}` : '';
  $('site-open').href = url || '#';
  for (const id of ['site-open', 'site-share']) $(id).hidden = !page;
  $('site-url').parentElement.hidden = !page;
  $('card-img').src = st.card.url;
  $('site-box').hidden = false;
});
$('site-open').addEventListener('click', () => track('site_open'));
$('site-share').addEventListener('click', async () => {
  const url = `${location.origin}${st.res.page.path}`;
  try {
    if (navigator.share) await navigator.share({ title: st.res.public.name.text, text: 'Meri startup ki website dekho!', url });
    else { await navigator.clipboard.writeText(url); $('site-share').textContent = 'Link copy ho gaya'; }
    track('share');
  } catch { /* cancelled */ }
});
$('share').addEventListener('click', () => shareCard(st.card, { filename: 'zenith-startup.png' }));
$('friends').addEventListener('click', () => sendToFriends(st.card, { exp: 'startup', filename: 'zenith-startup.png', text: 'Maine 90 second mein AI Startup Studio pe apni startup banayi. Tum bhi banao!' }));
$('shark').addEventListener('click', () => track('shark_link'));
$('again').addEventListener('click', () => {
  st.mirror?.end();
  st.who = null; st.vibe = null;
  for (const b of document.querySelectorAll('.st-chip.on')) b.classList.remove('on');
  updateBuild();
  show('s-area');
});

await boot();

// ?demo=hero: the fictional filming profile picks its chips and runs by itself.
if (isHero()) {
  const hp = await hero();
  if (hp?.profile) {
    $('hero-note').hidden = false;
    $('hero-note').textContent = hp.label;
    const tap = async (sel) => { await sleep(900); document.querySelector(sel)?.click(); };
    await tap('#go');
    await tap(`[data-pz="area"][data-id="${hp.profile.area}"]`);
    await tap(`[data-pz="who"][data-id="${hp.profile.who}"]`);
    await tap(`[data-pz="vibe"][data-id="${hp.profile.vibe}"]`);
    await tap('#build');
  }
}

// Test hook (Playwright) only with ?test=1 or hero
if (new URLSearchParams(location.search).has('test') || isHero()) {
  window.__startup = { get screen() { return document.querySelector('.st-screen:not([hidden])')?.id; }, get res() { return st.res; }, get mode() { return st.mode; } };
}
