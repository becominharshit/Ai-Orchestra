// Build Your Own AI Agent, phone app.
//   template -> task chips -> personality sliders + voice -> tools + generated name (+ optional first name) -> live run
//   (Agent Orchestra) -> result (phone only, the template's fixed sections) -> follow gate -> Agent card PNG + story card.
// TV (CHECK-19 F1): the phone never posts to the TV. The server publishes the run to the counter TV on the same
// timeline this page plays locally; the phone only says whether the visitor allows the big screen.
// The optional first name is shown (phone and Agent card) only when the server says so (`owner`: on the allow-list and
// every check passed). Otherwise, and for anyone who skipped it, the result asks "Apne agent ke liye ek naam chuno" with
// 3 core-generated nicknames; the picked one goes on the phone and the card. Never any wording about a rejected name.
import { api, track, tvToggle, tvConsent, counter, hero, isHero, h, sleep, config } from '/core/kit.js';
import { Orchestra, iconSvg } from '/core/orchestra.js';
import { gate } from '/core/gate.js';
import { makeShareCard, shareCard, sendToFriends } from '/core/sharecard.js';
import { drawAgentCard } from './agentcard.js';
import { openingEvents } from './timeline.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['s-off', 's-job', 's-task', 's-persona', 's-tools', 's-run', 's-result'];
const STEP_OF = { 's-job': 0, 's-task': 1, 's-persona': 2, 's-tools': 3 };
let current = 's-job';
function show(id) {
  current = id;
  for (const s of SCREENS) $(s).hidden = s !== id;
  const n = STEP_OF[id];
  $('steps').hidden = n === undefined;
  [...$('steps').children].forEach((li, i) => { li.className = i < n ? 'done' : i === n ? 'on' : ''; });
  window.scrollTo(0, 0);
}
window.__agent = { get screen() { return current; } }; // test hook (read only)

let B = null; // bundle
let result = null;
let play = null; // the server's TV run id for this play (to stop it)
const S = { job: null, items: [], params: {}, sliders: [2, 2, 2], voice: null, tools: [], name: null, names: [], age17: false };
const FRIENDS_TEXT = 'Maine Zenith pe apna AI agent banaya, aur usne ek asli kaam karke dikhaya. Tum bhi banao!';
const stopTv = () => { if (play) { api('tv/end', { play }).catch(() => {}); play = null; } };

$('tv-toggle').replaceWith(tvToggle((on) => { if (!on) stopTv(); }, { hint: 'TV pe sirf agent ka generated naam, tools aur numbers. Tumhara naam kabhi nahi.' }));
document.addEventListener('click', (e) => { const b = e.target.closest('[data-back]'); if (b) show(b.dataset.back); });

const chip = (label, on, onClick, extra = {}) => h('button', { type: 'button', class: `ag-chip${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', onclick: onClick, ...extra }, label);
function flash(id, msg) { $(id).textContent = msg; $(id).hidden = false; }

/* ---------------- 1. template ---------------- */
function renderJobs() {
  const out = [];
  for (const g of B.groups) {
    const list = B.jobs.filter((j) => j.group === g.id);
    if (!list.length) continue;
    out.push(h('div', { class: 'ag-gh' }, g.label));
    out.push(h('div', { class: 'ag-jobs' }, ...list.map((j, i) => {
      const ic = h('span', { class: 'ag-job-ic' }); ic.appendChild(iconSvg(j.icon, 24));
      return h('button', { type: 'button', class: 'ag-job', style: `animation-delay:${i * 40}ms`, 'data-job': j.id, onclick: () => pickJob(j.id) }, ic, h('b', {}, j.name), h('small', {}, j.blurb));
    })));
  }
  $('jobs').replaceChildren(...out);
}
const validFor = (o) => !o.for || S.items.includes(o.for);
function fixParams() {
  for (const p of S.job.params) {
    const okOpts = p.options.filter(validFor);
    if (!okOpts.some((o) => o.id === S.params[p.id])) S.params[p.id] = okOpts[Math.min(1, okOpts.length - 1)]?.id ?? okOpts[0]?.id;
  }
}
function pickJob(id) {
  const j = B.jobs.find((x) => x.id === id);
  if (S.job?.id !== id) {
    S.job = j;
    S.items = j.items.options.slice(0, j.items.min).map((o) => o.id);
    S.params = {};
    fixParams();
    S.tools = B.tools.map((t) => t.id);
  }
  if (!S.started) { S.started = true; track('start'); }
  renderTask();
  show('s-task');
}

/* ---------------- 2. task ---------------- */
function renderTask() {
  const j = S.job;
  $('task-kicker').textContent = j.name;
  $('task-title').textContent = j.task;
  $('task-err').hidden = true;
  const single = j.items.max === 1;
  const toggle = (o) => {
    if (single) S.items = [o.id];
    else if (S.items.includes(o.id)) { if (S.items.length > j.items.min) S.items = S.items.filter((x) => x !== o.id); else return flash('task-err', `Kam se kam ${j.items.min} chuno.`); }
    else if (S.items.length >= j.items.max) return flash('task-err', `Max ${j.items.max}. Pehle ek hatao.`);
    else S.items = [...S.items, o.id];
    fixParams();
    renderTask();
  };
  const groups = [h('div', { class: 'ag-group' }, h('div', { class: 'ag-label' }, j.items.label), h('div', { class: 'ag-chips' }, ...j.items.options.map((o) => chip(o.label, S.items.includes(o.id), () => toggle(o), { 'data-item': o.id }))))];
  for (const p of j.params) {
    groups.push(h('div', { class: 'ag-group' }, h('div', { class: 'ag-label' }, p.label), h('div', { class: 'ag-chips' }, ...p.options.filter(validFor).map((o) => chip(o.label, S.params[p.id] === o.id, () => { S.params[p.id] = o.id; renderTask(); }, { 'data-param': `${p.id}:${o.id}` })))));
  }
  $('task-groups').replaceChildren(...groups);
}
$('to-persona').addEventListener('click', () => { renderPersona(); show('s-persona'); });

/* ---------------- 3. personality ---------------- */
function renderPersona() {
  $('sliders').replaceChildren(...B.sliders.map((s, i) => {
    const out = h('output', {}, s.stops[S.sliders[i]]);
    const input = h('input', { type: 'range', min: '0', max: '4', step: '1', value: String(S.sliders[i]), 'aria-label': `${s.left} se ${s.right}`, 'data-slider': s.id });
    input.addEventListener('input', () => { S.sliders[i] = Number(input.value); out.textContent = s.stops[S.sliders[i]]; input.style.setProperty('--p', `${S.sliders[i] * 25}%`); });
    input.style.setProperty('--p', `${S.sliders[i] * 25}%`);
    return h('div', { class: 'ag-slider' }, h('div', { class: 'ag-slider-top' }, h('span', {}, s.left), out, h('span', {}, s.right)), input);
  }));
  if (!S.voice) S.voice = B.voices[0].id;
  renderVoices();
}
function renderVoices() {
  $('voices').replaceChildren(...B.voices.map((v) => chip(v.label, S.voice === v.id, () => { S.voice = v.id; renderVoices(); }, { 'data-voice': v.id })));
}
$('to-tools').addEventListener('click', () => { renderTools(); if (!S.names.length) newNames(); show('s-tools'); });

/* ---------------- 4. tools + name ---------------- */
function renderTools() {
  const needs = S.job.needs || [];
  for (const n of needs) if (!S.tools.includes(n)) S.tools.push(n);
  $('tools').replaceChildren(...B.tools.map((t) => {
    const on = S.tools.includes(t.id);
    const locked = needs.includes(t.id);
    const ic = h('span', { class: 'ag-tool-ic' }); ic.appendChild(iconSvg(t.icon, 22));
    return h('button', { type: 'button', class: `ag-tool${on ? ' on' : ''}${locked ? ' locked' : ''}`, role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-disabled': locked ? 'true' : 'false', 'data-tool': t.id, onclick: () => {
      if (locked) return flash('tools-err', `${t.label} is template ke liye zaroori hai.`);
      $('tools-err').hidden = true;
      S.tools = on ? S.tools.filter((x) => x !== t.id) : B.tools.map((x) => x.id).filter((x) => x === t.id || S.tools.includes(x));
      renderTools();
    } }, ic, h('span', { class: 'ag-tool-txt' }, h('b', {}, t.label), h('small', {}, locked ? 'Is template ke liye zaroori' : t.blurb)), h('i', { class: 'ag-switch' }));
  }));
}
function newNames() {
  const { adj, noun } = B.names;
  const seen = new Set();
  const out = [];
  while (out.length < 3) {
    const a = Math.floor(Math.random() * adj.length);
    const n = Math.floor(Math.random() * noun.length);
    if (adj[a] === noun[n] || seen.has(`${a}.${n}`)) continue;
    seen.add(`${a}.${n}`);
    out.push({ id: `${a}.${n}`, text: `${adj[a]} ${noun[n]}` });
  }
  S.names = out;
  S.name = out[0].id;
  renderNames();
}
function renderNames() {
  $('names').replaceChildren(...S.names.map((n) => chip(n.text, S.name === n.id, () => { S.name = n.id; renderNames(); }, { 'data-name': n.id })));
}
$('more-names').addEventListener('click', newNames);
$('go').addEventListener('click', () => run().catch((err) => {
  if (err.care) return; // the kit shows the support card; nothing reaches the TV
  console.warn('[agent]', err.message);
  stopTv();
  show('s-tools');
  flash('tools-err', err.message || 'Kuch gadbad hui. Ek baar phir try karo.');
}));

/* ---------------- 5. run ---------------- */
const nameText = () => S.names.find((n) => n.id === S.name)?.text || '';
async function run() {
  const O = B.orx;
  const tools = B.tools.filter((t) => S.tools.includes(t.id));
  show('s-run');
  $('run-title').textContent = `${nameText()} kaam pe hai`;
  const init = {
    title: O.title, planTask: O.tasks.plan,
    orchestrator: { id: 'agent', name: nameText(), role: O.roles[S.job.id], icon: S.job.icon },
    agents: [
      { id: 'planner', name: O.planner.name, role: O.planner.role, icon: 'brain', label: O.tags.planner },
      ...tools.map((t) => ({ id: t.id, name: O.tools[t.id].name, role: O.tools[t.id].role, icon: t.icon, label: O.tags[t.id] })),
      { id: 'check', name: O.check.name, role: O.check.role, icon: 'shield', label: O.tags.check },
    ],
  };
  const orx = new Orchestra($('orx'), { title: init.title, mode: 'phone', orchestrator: init.orchestrator, agents: init.agents });
  for (const ev of openingEvents(init).slice(1)) orx.apply(ev);
  const firstName = $('first-name').value.trim();
  const body = { job: S.job.id, items: S.items, params: S.params, sliders: S.sliders, voice: S.voice, tools: S.tools, name: S.name, tv: counter() !== null && tvConsent(), ...(firstName ? { firstName } : {}) };
  let res;
  try {
    [res] = await Promise.all([api('run', body), sleep(1200)]);
  } catch (e) {
    orx.apply({ t: 'status', id: 'planner', state: 'retry' });
    throw e;
  }
  play = res.play;
  // the same timeline the server is publishing to the TV right now
  const t0 = performance.now();
  for (const { at, ev } of res.timeline) {
    const wait = at - (performance.now() - t0);
    if (wait > 4) await sleep(wait);
    orx.apply(ev);
  }
  result = res;
  await sleep(1300);
  renderResult();
}

/* ---------------- 6. result ---------------- */
const SRC = { claude: 'Plan banaya live Claude ne, tools chale asli code mein.', mock: 'Mock mode (no API key): tools phir bhi asli code mein chale.', fixture: 'Offline mode: banked plan, tools asli code mein chale.', hero: 'Demo profile (fictional, for filming)' };
const TOOL_ICON = { lookup: 'search', calculator: 'chart', calendar: 'clock', notes: 'pen' };
const toolLabel = (id) => B.tools.find((t) => t.id === id)?.label || id;
const hmText = (min) => `${Math.floor(min / 60)}h ${min % 60}m`;

function renderResult() {
  const r = result;
  const av = h('div', { class: 'ag-avatar' }); av.appendChild(iconSvg(r.agent.icon, 34));
  const persona = B.sliders.map((s, i) => h('span', { class: 'ag-pill' }, s.stops[r.agent.sliders[i]]));
  const kicker = r.owner ? `${r.owner} ka ${r.agent.job}` : 'Tumhara AI agent';
  renderNickPick();
  $('r-agent').replaceChildren(av, h('div', { class: 'ag-agent-txt' }, h('div', { class: 'pz-kicker' }, kicker), h('h2', { class: 'pz-display' }, r.agent.name), h('p', {}, r.agent.role), h('div', { class: 'ag-pills' }, ...persona, h('span', { class: 'ag-pill v' }, r.agent.voice))));
  $('r-intro').textContent = r.owner ? `${r.owner}, yeh raha tumhara plan. ${r.intro}` : r.intro;
  $('r-sections').replaceChildren(...r.sections.map(sectionEl), sectionEl({ title: `${r.agent.name} ke tips`, kind: 'list', items: r.tips }));
  $('r-plan').replaceChildren(...r.plan.map((p) => { const ic = h('span', { class: 'ag-plan-ic' }); ic.appendChild(iconSvg(TOOL_ICON[p.tool], 18)); return h('li', {}, ic, h('span', {}, h('b', {}, p.item ? `${toolLabel(p.tool)}: ${p.item}` : toolLabel(p.tool)), h('small', {}, p.why))); }));
  const out = [];
  const { calculator: calc, calendar: cal, lookup: look, notes } = r.outputs;
  if (calc && calc.perItem.length) out.push(calcSection(calc));
  if (cal && cal.days.length) out.push(calSection(cal));
  if (look) out.push(lookSection(look));
  if (notes) out.push(h('div', { class: 'ag-sec' }, h('h3', {}, h('span', { class: 'ag-tag' }, 'Notes'), 'Checklist'), h('ul', { class: 'ag-check' }, ...notes.items.map((t) => h('li', {}, t)))));
  $('r-out').replaceChildren(...out);
  $('r-tip').textContent = r.tip;
  $('r-note').textContent = r.note;
  $('r-src').textContent = SRC[r.source] || '';
  $('unlock').hidden = false;
  $('share-box').hidden = true;
  if (current !== 's-result') show('s-result');
  track('complete', undefined, { once: true });
}

/** No first name in use (skipped, or not used for any reason): the same friendly nickname picker for everyone. */
function renderNickPick() {
  const opts = result.owner ? null : result.nickOptions?.options;
  $('r-nick').hidden = !opts?.length;
  if (!opts?.length) return;
  $('nick-opts').replaceChildren(...opts.map((o) => chip(o.text, false, async () => {
    const r = await api('nickname', { id: o.id }).catch(() => null);
    if (r?.ok) { result.owner = r.nickname; renderResult(); }
    else if (r?.options) { result.nickOptions = r.options; renderNickPick(); } // an expired offer: fresh options, silently
  }, { 'data-nick': o.id })));
}

/** One fixed section of the template's output (text from the server: reviewed data and numbers). */
function sectionEl(s) {
  let body;
  if (s.kind === 'cards') body = h('div', { class: 'ag-cardsec' }, ...s.items.map((c) => h('div', { class: 'ag-fact' }, h('b', {}, c.title), h('ul', {}, ...c.lines.map((l) => h('li', {}, l))))));
  else if (s.kind === 'rows') body = h('div', { class: 'ag-rows' }, ...s.items.map(([a, b]) => h('div', { class: 'ag-rowi' }, h('span', {}, a), h('b', {}, b))));
  else body = h('ul', { class: 'ag-list' }, ...s.items.map((t) => h('li', {}, t)));
  return h('div', { class: 'ag-sec main' }, h('h3', {}, s.title), body);
}
function calcSection(c) {
  const tiles = [['Sessions', c.total], ['Focus time', hmText(c.focusMin)], ['Per session', `${c.sessionMin} min`], ['Break', `${c.breakMin} min`]];
  return h('div', { class: 'ag-sec' }, h('h3', {}, h('span', { class: 'ag-tag' }, 'Calculator'), 'Numbers'),
    h('div', { class: 'ag-tiles' }, ...tiles.map(([k, v]) => h('div', {}, h('b', {}, String(v)), h('small', {}, k)))),
    h('div', { class: 'ag-bars' }, ...c.perItem.map((p, i) => h('div', { class: 'ag-bar' }, h('span', {}, p.label), h('i', {}, h('b', { class: `c${i}`, style: `width:${p.percent}%` })), h('em', {}, `${p.sessions} x ${c.sessionMin}m`)))));
}
function calSection(c) {
  const shown = c.days.slice(0, 7);
  return h('div', { class: 'ag-sec' }, h('h3', {}, h('span', { class: 'ag-tag' }, 'Calendar'), `${c.days.length} din ka schedule`),
    h('div', { class: 'ag-days' }, ...shown.map((d) => h('div', { class: `ag-day${d.light ? ' light' : ''}` },
      h('div', { class: 'ag-day-h' }, h('b', {}, `Day ${d.day}`), h('span', {}, d.date), d.light ? h('em', {}, 'light day') : null),
      ...d.slots.map((s) => h('div', { class: `ag-slot c${s.item}` }, h('time', {}, `${s.start} to ${s.end}`), h('span', {}, s.label, s.topic ? h('small', {}, s.topic) : null)))))),
    h('p', { class: 'ag-extra' }, `${c.total} slots, ${c.breakMin} min break, ${c.clashes} clash.${c.days.length > 7 ? ` Pehle 7 din yahan, poora plan upar ke grid mein.` : ''}`));
}
function lookSection(l) {
  return h('div', { class: 'ag-sec' }, h('h3', {}, h('span', { class: 'ag-tag' }, 'Lookup'), 'Curated tips'),
    ...l.items.map((it) => h('div', { class: 'ag-fact' }, h('b', {}, it.label), h('ul', {}, ...it.facts.map((f) => h('li', {}, f))), it.topics.length ? h('small', {}, `Topics: ${it.topics.slice(0, 5).join(', ')}`) : null)),
    ...(l.paramFacts.length ? [h('div', { class: 'ag-fact' }, h('b', {}, 'Tumhare setting ke hisaab se'), h('ul', {}, ...l.paramFacts.map((f) => h('li', {}, f))))] : []),
    h('p', { class: 'ag-extra' }, `Source: ${l.source}. Web search nahi, sirf reviewed data.`));
}

/* ---------------- cards (after the follow gate) ---------------- */
let cards = { agent: null, story: null };
async function makeCards() {
  const c = result.card;
  const [agent, story] = await Promise.all([
    drawAgentCard(result.agentCard, (await config()).heroLine || '', result.owner || ''),
    // story card: the agent's name, template and role only (CHANGE-02a); never the first name
    makeShareCard({ kicker: S.age17 ? c.kickers.age17 : c.kickers.neutral, title: c.title, lines: c.lines, footer: c.footer }),
  ]);
  cards = { agent, story };
  $('agent-img').src = agent.url;
  $('card-img').src = story.url;
}
function renderKickerPick() {
  const c = result.card;
  $('kicker-pick').replaceChildren(
    chip(c.kickers.neutral.text, !S.age17, () => { S.age17 = false; renderKickerPick(); makeCards(); }),
    chip(c.kickers.age17.text, S.age17, () => { S.age17 = true; track('age_line'); renderKickerPick(); makeCards(); }));
}
$('unlock').addEventListener('click', async () => {
  await gate('agent', { reward: 'Tumhara Agent card + story card' });
  $('unlock').hidden = true;
  renderKickerPick();
  await makeCards();
  $('share-box').hidden = false;
});
$('dl-agent').addEventListener('click', () => {
  const a = h('a', { href: cards.agent.url, download: 'zenith-ai-agent-card.png' });
  document.body.appendChild(a); a.click(); a.remove();
  track('agent_card');
});
$('share').addEventListener('click', () => shareCard(cards.story, { filename: 'zenith-agent.png' }));
$('friends').addEventListener('click', () => sendToFriends(cards.story, { exp: 'agent', text: FRIENDS_TEXT, filename: 'zenith-agent.png' }));
$('again').addEventListener('click', () => { stopTv(); result = null; S.started = false; show('s-job'); });

/* ---------------- boot ---------------- */
try {
  B = await api('bundle');
} catch (e) {
  $('off-msg').textContent = e?.message || 'Yeh counter abhi band hai.';
  show('s-off');
}
if (B) {
  renderJobs();
  show('s-job');
  // ?demo=hero: the fictional filming profile designs itself screen by screen, then runs (no visitor data).
  if (isHero()) {
    const hp = await hero();
    if (hp?.profile) {
      const p = hp.profile;
      await sleep(1000); pickJob(p.job);
      S.items = p.items; S.params = { ...S.params, ...p.params }; fixParams(); renderTask();
      await sleep(1600); renderPersona(); show('s-persona');
      S.sliders = p.sliders; S.voice = p.voice; renderPersona();
      await sleep(1600); S.tools = p.tools; renderTools();
      const [a, n] = p.name.split('.').map(Number);
      S.names = [{ id: p.name, text: `${B.names.adj[a]} ${B.names.noun[n]}` }]; S.name = p.name; renderNames();
      $('hero-note').hidden = false; $('hero-note').textContent = hp.label;
      show('s-tools');
      await sleep(1600); $('go').click();
    }
  }
}
