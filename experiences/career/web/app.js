// Career Studio phone app.
//   A. Forecast preview: area -> top careers (badge, work split, source tooltip) -> WhatsApp form -> confirm -> send state
//   B. Job Time Machine: job -> Round 1 "2026" (3 quick tasks, ~60 s) -> follow gate -> Round 2 "2030" (Manager Agent +
//      Research / Draft / Analyst / Review agents, then 2 human-only calls) -> "Tumhara 2030 skill stack" -> share
// Privacy: the typed round-1 text never leaves the phone. The form values go only to POST /api/career/lead.
// Nothing personal is ever sent to the TV (tvMirror payloads are generated text only).
import { api, track, tvMirror, tvToggle, hero, isHero, h, counter, sleep } from '/core/kit.js';
import * as KIT from '/core/kit.js';
import { Orchestra, iconSvg } from '/core/orchestra.js';
import { gate } from '/core/gate.js';
import { makeShareCard, shareCard, sendToFriends } from '/core/sharecard.js';

const $ = (id) => document.getElementById(id);
// Share-card text comes from the server as public text { pt, text } (core CONTRACT 13) and is passed on as is:
// core's makeShareCard draws only those (a plain string is dropped in strict mode). The footer is a fixed label.
const cardText = (c) => ({ kicker: c.kicker, title: c.title, lines: c.lines, footer: c.footer.text });
// Visitor text that never leaves the phone still goes through core's care check (when the kit has it).
// kit.guardText(text) is true when the text is fine, false when it showed the care card instead.
const careHit = (text) => (typeof KIT.guardText === 'function' ? !KIT.guardText(text) : false);
const show = (id) => { for (const s of document.querySelectorAll('.cs-screen')) s.hidden = s.id !== id; window.scrollTo(0, 0); };
const FRIENDS_TEXT = 'Maine Zenith ki Career Studio try ki: Job Time Machine 2026 vs 2030. Tum bhi dekho tumhara 2030 career kya kehta hai!';
const JOB_AREA = { marketing: 'business-managing', finance: 'business-managing', product: 'business-managing', creator: 'business-managing', software: 'computers-coding' };
const KEYS = ['by_ai', 'with_ai', 'led_by_people'];

let B = null; // bundle from the server
let heroProfile = null;
// Play tokens (server-signed, single use): one completed play buys one WhatsApp form. Kept in memory only.
const plays = [];
const addPlay = (t) => { if (typeof t === 'string' && t) { plays.push(t); if (plays.length > 3) plays.shift(); } };
const nbf = (t) => { try { return JSON.parse(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).nbf || 0; } catch { return 0; } };
async function takePlay() {
  if (!plays.length) return null;
  plays.sort((a, b) => nbf(a) - nbf(b));
  const t = plays.shift();
  const wait = nbf(t) - Date.now();
  if (wait > 0) await sleep(Math.min(wait + 200, 20000));
  return t;
}
const state = { area: null, job: null, r1: { t0: 0, secs: 0, answers: [] }, r2: { secs: 0, picks: [] }, agents: null, source: null, card: null, fcCard: null, lead: null };

/* ---------------- small UI helpers ---------------- */
for (const el of document.querySelectorAll('[data-icon]')) el.appendChild(iconSvg(el.dataset.icon, 26));
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) show(go.dataset.go);
  const i = e.target.closest('.cs-i');
  const tip = $('tip');
  if (i) {
    tip.textContent = i.dataset.tip;
    tip.hidden = false;
    const r = i.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 24);
    tip.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, r.left - w / 2))}px`;
    tip.style.top = `${r.bottom + 8}px`;
  } else if (!tip.hidden) tip.hidden = true;
});
const tipBtn = (text) => h('button', { class: 'cs-i', type: 'button', 'data-tip': text, 'aria-label': `Source: ${text}` }, 'i');
const tagEl = (tag) => h('span', { class: `cs-tag ${tag.mode}` }, tag.label, tag.share ? ` · ${tag.share}% of the job` : '');
const tagWithTip = (tag) => h('span', { class: 'cs-tagline' }, tagEl(tag), tag.tip ? tipBtn(tag.tip) : (tag.illustrative ? h('small', {}, '(illustrative)') : null));

function splitEl(split, label) {
  return h('div', { class: 'cs-split' },
    h('div', { class: 'cs-split-head' }, h('span', {}, label), tipBtn(split.tip)),
    h('div', { class: 'cs-split-bar', role: 'img', 'aria-label': KEYS.map((k) => `${B.data.modes[k]} ${split[k]}%`).join(', ') },
      ...KEYS.map((k) => h('i', { class: k, style: `width:${split[k]}%` }))),
    h('div', { class: 'cs-key' }, ...KEYS.map((k) => h('span', { class: k }, `${B.data.modes[k]} ${split[k]}%`))));
}

$('tv-toggle').replaceWith(tvToggle((on) => { mirror?.setEnabled(on); }));
let mirror = null;

/* ================= A. Forecast preview ================= */
function renderAreas() {
  $('areas').replaceChildren(...B.data.areas.map((a) => h('button', { class: 'cs-area', type: 'button', onclick: () => openArea(a.area.id) }, a.area.label)));
}

async function openArea(id) {
  const pv = B.data.areas.find((a) => a.area.id === id);
  state.area = id;
  track('area_pick', { area: B.data.areas.findIndex((a) => a.area.id === id) });
  $('fc-kicker').textContent = `Top careers · ${pv.careers.length} of ${pv.total}`;
  $('fc-title').textContent = pv.area.label;
  $('fc-legend').replaceChildren(h('div', { class: 'cs-key' }, ...KEYS.map((k) => h('span', { class: k }, B.data.modes[k]))));
  $('fc-cards').replaceChildren(...pv.careers.map((c, i) => h('article', { class: 'cs-card', style: `animation-delay:${i * 90}ms` },
    h('div', { class: 'cs-card-top' }, h('h3', {}, c.title), h('span', { class: `cs-badge ${c.badge}` }, c.badge)),
    h('p', {}, c.line, ' ', tipBtn(c.lineTip)),
    splitEl(c.split, 'Kaam ka split, 2030'),
    h('div', { class: 'cs-holds' }, h('b', {}, 'Skills that hold: '), c.holds.join(', ')))));
  $('fc-pdf').href = `/api/career/preview.pdf?area=${encodeURIComponent(id)}`;
  show('s-fc');
  api('preview', { area: id }).then((r) => {
    addPlay(r.playToken);
    return makeShareCard(cardText(r.card)).then((c) => { state.fcCard = c; });
  }).catch(() => {});
  track('complete', undefined, { once: true });
  const m = tvMirror(null);
  m.result({ kicker: 'Career Forecast preview', title: pv.area.label, lines: pv.careers.map((c) => `${c.title}: ${c.badge}`), footer: 'A forecast, not a guarantee.' });
  state.fcCard = null;

}
$('go-fc').addEventListener('click', () => { track('start'); show('s-areas'); });
$('fc-friends').addEventListener('click', () => sendToFriends(state.fcCard, { text: FRIENDS_TEXT, filename: 'zenith-career.png' }));
$('fc-wa').addEventListener('click', () => openWaForm());

/* ---------- WhatsApp capture ---------- */
function openWaForm() {
  const pv = B.data.areas.find((a) => a.area.id === state.area);
  if (!pv) return show('s-areas');
  $('wa-area').replaceChildren(h('span', {}, pv.area.label));
  $('wa-err').hidden = true;
  show('s-wa');
}
const form = $('wa-form');
function setupForm() {
  $('wa-band').replaceChildren(h('option', { value: '' }, 'Chuno'), ...B.bands.map((b) => h('option', { value: b.id }, b.label)));
  $('wa-purpose').textContent = B.purpose;
  $('wa-optout').textContent = `${B.optOut}. Message STOP to stop, ya ${B.stopText}`;
  $('wa-optout2').textContent = `${B.optOut}. Message STOP to stop, ya ${B.stopText}`;
  $('wa-intro').textContent = B.wa.live
    ? 'Zenith team tumhara Career Forecast PDF WhatsApp pe bhejegi, aur baad mein Zenith ke updates bhi.'
    : 'Zenith team tumhara Career Forecast PDF WhatsApp pe bhejegi (48 ghante ke andar), aur baad mein Zenith ke updates bhi.';
}
// the unticked box blocks submit (the server refuses it too)
$('wa-consent').addEventListener('change', () => { $('wa-submit').disabled = !$('wa-consent').checked; });

function localPhone(raw) {
  let d = String(raw || '').replace(/[\s().-]/g, '');
  if (d.startsWith('+91')) d = d.slice(3); else if (d.length === 12 && d.startsWith('91')) d = d.slice(2); else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
const formErr = (msg) => { $('wa-err').textContent = msg; $('wa-err').hidden = false; };
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(form);
  if (!$('wa-consent').checked) return formErr('Pehle consent wala box tick karo.');
  const firstName = String(f.get('firstName') || '').trim();
  if (!firstName) return formErr('Apna first name likho.');
  const phone = localPhone(f.get('phone'));
  if (!phone) return formErr('WhatsApp number 10 digit ka Indian mobile number hona chahiye.');
  if (!f.get('band')) return formErr('Class ya age band chuno.');
  state.lead = { firstName, phone, band: String(f.get('band')), area: state.area, consent: true, consentVersion: B.consentVersion, counter: counter() };
  $('wa-mask').textContent = `+91 ${phone.slice(0, 2)}xxxxx${phone.slice(-3)}, sahi hai?`;
  show('s-wa-confirm');
});
$('wa-edit').addEventListener('click', () => { show('s-wa'); form.phone.focus(); });
let playTokenUsed = null;
$('wa-yes').addEventListener('click', async () => {
  $('wa-yes').disabled = true;
  try {
    playTokenUsed = await takePlay();
    const r = await api('lead', { ...state.lead, playToken: playTokenUsed });
    state.lead = null; // drop the values from memory as soon as the server has them
    form.reset();
    $('wa-submit').disabled = true;
    $('wa-copy').textContent = r.copy;
    $('wa-pdf').href = `/api/career/preview.pdf?area=${encodeURIComponent(state.area)}`;
    const st = $('wa-state');
    st.classList.remove('ok');
    st.hidden = r.path !== 'live';
    show('s-wa-done');
    if (r.path === 'live' && r.job) pollSend(r.job);
  } catch (err) {
    if (err.care) { form.reset(); state.lead = null; show('s-home'); return; }
    if (err.status === 400 && err.data?.error === 'bad_input') addPlay(playTokenUsed); // not used by the server
    show('s-wa');
    formErr(err.message);
  } finally { $('wa-yes').disabled = false; }
});
async function pollSend(job) {
  const st = $('wa-state');
  $('wa-state-text').textContent = 'Bhej rahe hain...';
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    let s;
    try { s = await fetch(`/api/career/wa/status?j=${encodeURIComponent(job)}`).then((r) => r.json()); } catch { continue; }
    if (s.state === 'sent') { $('wa-state-text').textContent = 'Bhej diya'; st.classList.add('ok'); return; }
    if (s.state === 'batch' || s.state === 'unknown') { st.hidden = true; $('wa-copy').textContent = 'Tumhara forecast PDF 48 ghante mein WhatsApp pe aayega'; return; }
  }
  st.hidden = true;
  $('wa-copy').textContent = 'Tumhara forecast PDF 48 ghante mein WhatsApp pe aayega';
}
$('wa-friends').addEventListener('click', () => sendToFriends(state.fcCard, { text: FRIENDS_TEXT, filename: 'zenith-career.png' }));

/* ================= B. Job Time Machine ================= */
function renderJobs() {
  $('jobs').replaceChildren(...B.jobs.map((j) => {
    const ico = h('span', { class: 'cs-job-ico' }); ico.appendChild(iconSvg(j.icon, 22));
    return h('button', { class: 'cs-job', type: 'button', 'data-job': j.id, onclick: () => startJob(j.id) }, ico, h('b', {}, j.label), h('small', {}, j.career ? 'Data: AI Role Atlas 2026' : 'AI assists, doctors decide'));
  }));
}
$('go-jtm').addEventListener('click', () => { track('start'); show('s-jobs'); });

let clockTimer = null;
function runClock(el, bar, t0, limit = 60) {
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const s = Math.round((performance.now() - t0) / 1000);
    el.textContent = `${s}s`;
    if (bar) bar.style.width = `${Math.min(100, (s / limit) * 100)}%`;
  }, 250);
}

async function startJob(id) {
  const j = B.jobs.find((x) => x.id === id);
  state.job = j;
  state.r1 = { t0: performance.now(), secs: 0, answers: [] };
  state.r2 = { secs: 0, picks: [] };
  state.agents = null;
  state.card = null;
  $('r1-job').textContent = `Tum aaj ke (2026) ${j.label} ho. 3 kaam, apne haath se.`;
  show('s-r1');
  mirror = tvMirror(null);
  runClock($('r1-clock'), $('r1-bar'), state.r1.t0);
  // prefetch the 2030 answer while round 1 is played (the agents' work is shown only in round 2)
  state.agentsP = api('agents', { job: j.id }).catch((e) => ({ error: e }));
  for (let i = 0; i < j.r1.length; i++) {
    $('r1-step').textContent = `Kaam ${i + 1} of ${j.r1.length}`;
    mirror.custom('r1', { step: i + 1, of: j.r1.length, prompt: j.r1[i].prompt, job: j.label });
    const ans = await playTask(j.r1[i], i);
    state.r1.answers.push(ans);
  }
  clearInterval(clockTimer);
  state.r1.secs = Math.max(1, Math.round((performance.now() - state.r1.t0) / 1000));
  track('r1_done');
  $('mid-title').textContent = `2026: 3 kaam, ${state.r1.secs} second, sab haath se`;
  $('mid-tags').replaceChildren(...j.r1.map((t) => h('li', {}, h('span', {}, t.tag.task || t.prompt.split(':')[0].slice(0, 46)), tagWithTip(t.tag))));
  $('mid-line').textContent = '2030 mein inme se kaun sa kaam AI karega? Upar tags dekho. Ab wahi din, 2030 mein, tumhari AI agent team ke saath.';
  mirror.custom('r1_done', { seconds: state.r1.secs, job: j.label });
  show('s-mid');
}

/** One 2026 task. Resolves with what was picked (index) or 'typed' (the text itself stays on the phone). */
function playTask(t, i) {
  return new Promise((resolve) => {
    const box = $('r1-task');
    const done = (ans, feedback) => {
      box.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
      box.appendChild(h('div', { class: 'cs-tagline' }, feedback ? h('b', {}, feedback) : null, h('span', {}, '2030 mein yeh kaam:'), tagEl(t.tag), t.tag.tip ? tipBtn(t.tag.tip) : t.tag.illustrative ? h('small', {}, '(illustrative)') : null));
      setTimeout(() => resolve(ans), isHero() ? 1600 : 1300);
    };
    const kids = [h('div', { class: 'pz-kicker' }, `Kaam ${i + 1}`), h('h3', {}, t.prompt)];
    if (t.kind === 'type') {
      const inp = h('input', { class: 'pz-input', maxlength: '80', placeholder: t.placeholder || '', 'aria-label': t.prompt, autocomplete: 'off' });
      const btn = h('button', { class: 'pz-btn block', type: 'button' }, 'Ho gaya');
      const stopForCare = () => { inp.value = ''; clearInterval(clockTimer); mirror?.end(); show('s-home'); };
      btn.addEventListener('click', async () => {
        const typed = inp.value.trim();
        if (careHit(typed)) return stopForCare(); // core shows its care card; the game stops, the text is dropped
        if (typed && !isHero()) {
          // core's live crisis gate on the server (up to about 3 s); the text is not stored there
          btn.disabled = true;
          try { await api('check', { text: typed }); } catch (e) { if (e.care) return stopForCare(); }
          btn.disabled = false;
        }
        done('typed', typed ? 'Nice!' : 'Chalo, aage!');
      });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
      kids.push(h('div', { class: 'cs-type' }, inp, btn));
      if (isHero() && heroProfile?.profile?.typed?.[i]) setTimeout(() => typeInto(inp, heroProfile.profile.typed[i]).then(() => btn.click()), 700);
    } else {
      if (t.kind === 'trend') kids.push(h('div', { class: 'cs-trend', 'aria-hidden': 'true' }, ...[28, 34, 31, 42, 47, 55, 61, 70].map((v) => h('i', { style: `height:${v}%` }))));
      const opts = t.options.map((o, k) => {
        const b = h('button', { class: `cs-opt${t.mono ? ' mono' : ''}`, type: 'button' }, o, t.kind === 'bars' ? h('span', { class: 'cs-bar', style: `width:${Math.round(t.widths[k] * 100)}%` }) : null);
        b.addEventListener('click', () => {
          if (typeof t.correct === 'number') {
            b.classList.add(k === t.correct ? 'right' : 'wrong');
            if (k !== t.correct) opts[t.correct].classList.add('right');
            done(k, k === t.correct ? 'Sahi!' : 'Close! Sahi jawab highlight hai.');
          } else { b.classList.add('picked'); done(k, 'Accha choice!'); }
        });
        return b;
      });
      kids.push(h('div', { class: 'cs-opts' }, ...opts));
      if (isHero()) { const pick = heroProfile?.profile?.picks?.[i] ?? 0; setTimeout(() => opts[pick]?.click(), 1400); }
    }
    box.replaceChildren(h('div', {}, ...kids));
    box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
  });
}
async function typeInto(inp, text) { for (const ch of text) { inp.value += ch; await sleep(55); } await sleep(300); }

$('go-r2').addEventListener('click', async () => {
  // Round 2 is behind the follow gate (honour-based; no Instagram calls). Nothing of round 2 renders before this resolves.
  if (isHero()) setTimeout(() => document.querySelector('[data-pz="gate-unlock"]')?.click(), 1800);
  await gate('career', { reward: 'Round 2: wahi din, 2030 mein, AI agent team ke saath' });
  runRound2().catch((e) => { if (!e.care) console.warn('[career]', e.message); show(e.care ? 's-home' : 's-jobs'); });
});

const AG = [
  { id: 'research', name: 'Research', role: 'Research Agent', icon: 'search' },
  { id: 'draft', name: 'Draft', role: 'Draft Agent', icon: 'pen' },
  { id: 'analyst', name: 'Analyst', role: 'Analyst Agent', icon: 'chart' },
  { id: 'review', name: 'Review', role: 'Review Agent', icon: 'shield' },
];

async function runRound2() {
  const j = state.job;
  show('s-r2');
  $('calls').hidden = true;
  $('calls').replaceChildren();
  const orx = new Orchestra($('orx'), { title: `${j.label} · 2030`, mode: 'phone', orchestrator: { id: 'manager', name: 'Manager Agent', role: 'Orchestrator', icon: 'crown' }, agents: AG });
  mirror = tvMirror(orx);
  const t0 = performance.now();
  runClock($('r2-clock'), null, t0);
  for (const a of AG) orx.assign(a.id, j.agents[a.id].job);
  orx.status('manager', 'thinking');
  let res = await state.agentsP;
  if (res?.error) res = await api('agents', { job: j.id });
  const A = res.agents;
  addPlay(res.playToken);
  state.agents = A;
  state.source = res.source;
  orx.status('manager', 'working');
  // TV-safe log lines are fixed templates; the model's own words go to a phone-only panel (judged on the server).
  orx.log('manager', 'Research, Draft, Analyst aur Review ko kaam diya. Judgement, taste aur logon wali calls insaan ke liye.');
  const out = $('agent-out');
  out.replaceChildren(h('div', { class: 'pz-kicker' }, 'Agents ka kaam (sirf tumhare phone pe)'), h('p', { class: 'cs-plan' }, A.plan));
  out.hidden = false;
  const said = {
    research: () => h('li', {}, h('b', {}, 'Research: '), A.research.join(' · ')),
    draft: () => h('li', {}, h('b', {}, 'Draft: '), `3 drafts ready. Pehla: "${A.drafts[0]}"`),
    analyst: () => h('li', {}, h('b', {}, 'Analyst: '), A.analysis),
    review: () => h('li', {}, h('b', {}, 'Review: '), A.review),
  };
  const outList = h('ul', { class: 'cs-out' });
  out.appendChild(outList);
  for (const a of AG) {
    orx.handoff('manager', a.id, j.agents[a.id].tag.label);
    await orx.step(a.id, j.agents[a.id].job, async () => {
      await sleep(isHero() ? 1100 : 850);
      orx.log(a.id, `[${j.agents[a.id].tag.label}] ${j.agents[a.id].job}: ho gaya`);
      outList.appendChild(said[a.id]());
    });
  }
  const aiSecs = Math.max(1, Math.round((performance.now() - t0) / 1000));
  orx.handoff('review', 'manager', '2 calls insaan ke liye');
  orx.log('manager', `AI ne 4 kaam ${aiSecs}s mein kiye. Ab 2 calls tumhari: judgement aur taste.`);
  orx.progress(0.8);
  $('r2-step').textContent = 'Tumhari calls';
  // the human-only calls come back to the visitor
  $('calls').hidden = false;
  for (let i = 0; i < j.calls.length; i++) {
    const c = j.calls[i];
    const opts = c.from === 'drafts' ? A.drafts : A.call_options;
    const pick = await humanCall(c, opts, i);
    state.r2.picks.push(pick);
    orx.log('manager', `Call ${i + 1}: ${c.tag.label} wali call tumne li`);
    mirror.custom('call', { step: i + 1, q: c.q, tagLabel: c.tag.label }); // never the chosen AI text
  }
  clearInterval(clockTimer);
  state.r2.secs = Math.max(1, Math.round((performance.now() - t0) / 1000));
  state.r2.aiSecs = aiSecs;
  orx.done(`2030 ka din done: AI ${aiSecs}s, tumhari 2 calls`);
  track('r2_done');
  await buildResult();
}

function humanCall(c, opts, i) {
  return new Promise((resolve) => {
    const buttons = opts.map((o, k) => {
      const b = h('button', { class: 'cs-opt', type: 'button' }, o);
      b.addEventListener('click', () => {
        buttons.forEach((x) => { x.disabled = true; });
        b.classList.add('picked');
        setTimeout(() => resolve(k), 600);
      });
      return b;
    });
    const card = h('div', { class: 'cs-call' }, h('div', { class: 'pz-kicker' }, `Human call ${i + 1} of 2`), h('h3', {}, c.q), h('div', { class: 'cs-opts' }, ...buttons), tagWithTip(c.tag));
    $('calls').appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (isHero()) { const p = heroProfile?.profile?.calls?.[i] ?? 0; setTimeout(() => buttons[p]?.click(), 2200); }
  });
}

async function buildResult() {
  const j = state.job;
  const tags = j.calls.map((c) => c.tag.label);
  $('res-title').textContent = `2026 ka ${j.noun} vs 2030 ka ${j.noun}`;
  $('res-vs').replaceChildren(
    h('div', {}, h('div', { class: 'y' }, '2026'), h('small', {}, `3 kaam, ${state.r1.secs}s, sab haath se`)),
    h('div', {}, h('div', { class: 'y' }, '2030'), h('small', {}, `AI agents: 4 kaam ${state.r2.aiSecs}s mein. Tum: 2 human calls`)));
  $('res-split').replaceChildren(j.career ? splitEl(j.career.split, `${j.career.title}: kaam ka split`) : h('span'));
  $('res-skills').replaceChildren(...j.skills.map((s, i) => h('li', { style: `animation-delay:${i * 120}ms` }, h('b', {}, s.skill),
    s.courses.length ? h('small', {}, 'B.Tech in AI + mini-MBA mein: ', `${s.courses[0].course} (Sem ${s.courses[0].semester})`) : null)));
  $('res-zline').replaceChildren(
    j.career ? document.createTextNode('Skills that hold: Zenith AI Role Atlas. Courses: as published on zenithschool.ai. ') : document.createTextNode('Doctor banne ka raasta medical college se hota hai. Health-tech mein AI products banana pasand ho, toh B.Tech in AI + mini-MBA, one KRMU degree ek raasta hai. '),
    j.career ? tipBtn(j.holdsTip) : tipBtn(B.data.zenith.tooltip));
  $('res-note').hidden = !j.note;
  $('res-note').textContent = j.note || '';
  $('res-src').textContent = { claude: 'Drafts made live by Claude', mock: 'Mock mode (no API key)', fixture: 'Offline mode: ready-made drafts', hero: 'Hero demo (fictional)' }[state.source] || '';
  show('s-result');
  track('complete');
  const cardPt = await api('card', { job: j.id, r1: state.r1.secs, r2: state.r2.aiSecs });
  const card = await makeShareCard(cardText(cardPt));
  state.card = card;
  $('res-card').src = card.url;
  mirror?.result({
    kicker: 'Tumhara 2030 skill stack', title: `2030 ka ${j.noun}`, job: j.label, noun: j.noun,
    lines: j.skills.map((s) => s.skill), r1: state.r1.secs, r2: state.r2.aiSecs,
    ...(j.career ? { split: { by_ai: j.career.split.by_ai, with_ai: j.career.split.with_ai, led_by_people: j.career.split.led_by_people } } : {}),
    forFun: true,
  });
}
$('res-friends').addEventListener('click', () => sendToFriends(state.card, { text: FRIENDS_TEXT, filename: 'zenith-time-machine.png' }));
$('res-story').addEventListener('click', () => state.card && shareCard(state.card, { filename: 'zenith-time-machine.png' }));
$('res-again').addEventListener('click', () => { mirror?.end(); show('s-jobs'); });
$('res-to-fc').addEventListener('click', () => { mirror?.end(); const a = JOB_AREA[state.job?.id]; if (a) openArea(a); else show('s-areas'); });

/* ================= boot ================= */
B = await fetch('/api/career/bundle').then((r) => r.json());
renderAreas();
renderJobs();
setupForm();
const p = new URLSearchParams(location.search);
if (p.get('part') === 'forecast') show('s-areas');
else if (p.get('part') === 'jtm') show('s-jobs');

// ?demo=hero: a seeded, fictional Job Time Machine run for filming (fixtures only, nothing counted or saved).
if (isHero()) {
  heroProfile = await hero();
  if (heroProfile) {
    $('hero-note').hidden = false;
    $('hero-note').textContent = heroProfile.label;
    setTimeout(() => { show('s-jobs'); setTimeout(() => startJob(heroProfile.profile.job || 'marketing'), 1200); }, 1500);
    // continue to round 2 by itself
    const obs = new MutationObserver(() => { if (!$('s-mid').hidden) { obs.disconnect(); setTimeout(() => $('go-r2').click(), 2200); } });
    obs.observe($('s-mid'), { attributes: true, attributeFilter: ['hidden'] });
  }
}
