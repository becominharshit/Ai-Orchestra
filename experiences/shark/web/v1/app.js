// AI Sharks v1 phone app (SHARK_V2=0). Public name "AI Sharks", never "Shark Tank".
//   intro -> 60s pitch (voice or text) -> Agent Orchestra (Host, Safety, 3 sharks) -> the tank: 3 questions,
//   one per shark, ~15s each -> scoring -> follow gate -> score reveal + verdict + mini-MBA lesson -> share.
// Everything visible is mirrored to the counter TV (kit.tvMirror), except anything the visitor typed or said.
import { api, track, tvMirror, tvToggle, hero, isHero, h, sleep, safetyMode } from '/core/kit.js';

// v1 is free text only, so it plays only in live safety mode; degraded goes to v2's chips (CHECK-13b).
if ((await safetyMode().catch(() => 'degraded')) !== 'live') location.replace(`/shark/v2/${location.search}${location.hash}`);
import { Orchestra } from '/core/orchestra.js';
import { gate } from '/core/gate.js';
import { makeShareCard, shareCard, sendToFriends } from '/core/sharecard.js';
import { SHARKS, SHARK, avatar, talk, typeInto } from '../sharks.js';
import { speechSupported, listen } from '../voice.js';
import { ORX, fill } from '../tvtext.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of document.querySelectorAll('.sk-screen')) s.hidden = s.id !== id; window.scrollTo(0, 0); };
const IDS = ['vc', 'mkt', 'fin'];
const PITCH_MS = 60000;
const ANSWER_MS = 15000;
const MIN_PITCH = 15;
const HERO = isHero();

const AGENTS = {
  orchestrator: { id: 'host', name: 'Host Agent', role: 'Orchestrator', icon: 'crown' },
  agents: [
    { id: 'safety', name: 'Safety Agent', role: 'Family-friendly check', icon: 'shield' },
    { id: 'vc', name: 'Shark VC', role: 'Market + scale', icon: 'rocket', color: '#62BBF3' },
    { id: 'mkt', name: 'Shark Marketing', role: 'Customer + brand', icon: 'heart', color: '#FF8FC0' },
    { id: 'fin', name: 'Shark Finance', role: 'Price + margin', icon: 'chart', color: '#FFC861' },
    { id: 'lesson', name: 'Lesson Agent', role: 'Mini-MBA concept', icon: 'brain' },
  ],
};
const TOPIC = { vc: 'market + scale', mkt: 'customer + brand', fin: 'price + margin' };

const st = { mode: 'text', pitch: '', q: null, answers: {}, how: {}, v: null, orx: null, mirror: null, card: null, t0: 0, revealed: false, prompts: [] };
let mic = null;
let heroProfile = null;

// ---------- intro ----------
$('intro-bench').append(...SHARKS.map((s) => avatar(s.id, { label: true })));
$('redirect-bench').append(...SHARKS.map((s) => avatar(s.id)));
$('tv-toggle').replaceWith(tvToggle((on) => st.mirror?.setEnabled(on)));
if (!speechSupported()) {
  $('go-voice').hidden = true;
  $('go-text').className = 'pz-btn block';
  $('voice-note').textContent = 'Is browser mein voice nahi chalega, type karke pitch karo. Mazaa bilkul same!';
}
$('go-voice').addEventListener('click', () => openPitch('voice'));
$('go-text').addEventListener('click', () => openPitch('text'));

// ---------- pitch ----------
const RING = 2 * Math.PI * 54;
$('ring').style.strokeDasharray = String(RING);
let micTimer = null;
let micStart = 0;

function setPitch(text) {
  $('pitch').value = text.slice(0, 600);
  onPitchInput();
}
function onPitchInput() {
  const n = $('pitch').value.length;
  $('pitch-count').textContent = `${n}/600`;
  $('send-pitch').disabled = $('pitch').value.trim().length < MIN_PITCH;
  $('pitch-err').hidden = true;
}
$('pitch').addEventListener('input', onPitchInput);

function micUi(state) {
  const box = $('micbox');
  box.dataset.state = state;
  $('mic-state').textContent = { idle: 'Tap karke bolo', listening: 'Sun rahe hain... bolte raho', stopped: 'Ho gaya! Edit karke bhejo', denied: 'Mic ki permission nahi mili. Type karo!', network: 'Voice ke liye net chahiye. Type karo!', error: 'Voice nahi chala. Type karo!' }[state] || '';
}
function stopPitchMic() {
  mic?.stop();
  mic = null;
  clearInterval(micTimer);
  micTimer = null;
}
function startPitchMic() {
  stopPitchMic();
  micStart = performance.now();
  mic = listen({ base: $('pitch').value, onText: (t) => setPitch(t), onState: (s) => { if (s !== 'listening') { clearInterval(micTimer); micTimer = null; } micUi(s); } });
  micTimer = setInterval(() => {
    const left = Math.max(0, PITCH_MS - (performance.now() - micStart));
    $('mic-time').textContent = `${Math.ceil(left / 1000)}s`;
    $('ring').style.strokeDashoffset = String(RING * (1 - left / PITCH_MS));
    if (left <= 0) { stopPitchMic(); micUi('stopped'); }
  }, 200);
}
$('mic').addEventListener('click', () => { if (mic?.active) { stopPitchMic(); micUi('stopped'); } else startPitchMic(); });

async function loadPrompts() {
  if (st.prompts.length) return st.prompts;
  try { st.prompts = (await api('prompts')).prompts || []; } catch { st.prompts = []; }
  return st.prompts;
}
function promptChips(list, onPick) {
  return list.map((p) => h('button', { class: 'sk-chip', type: 'button', onclick: () => onPick(p) }, p.prompt));
}

async function openPitch(mode, preset = '') {
  track('start', undefined, { once: true });
  st.mode = mode;
  show('s-pitch');
  const voice = mode === 'voice' && speechSupported();
  $('micbox').hidden = !voice;
  micUi('idle');
  $('mic-time').textContent = '60s';
  $('ring').style.strokeDashoffset = '0';
  setPitch(preset);
  const list = await loadPrompts();
  $('prompts').replaceChildren(...promptChips(list.slice(0, 8), (p) => { stopPitchMic(); micUi('idle'); setPitch(p.pitch); $('pitch').focus({ preventScroll: true }); }));
  if (!voice && !HERO) $('pitch').focus({ preventScroll: true });
}

$('send-pitch').addEventListener('click', () => {
  stopPitchMic();
  const pitch = $('pitch').value.trim();
  if (pitch.length < MIN_PITCH) return;
  st.pitch = pitch;
  play().catch((err) => {
    // Care path (CONTRACT 13.3): the kit already showed the care card and ended the TV mirror. No game, no score.
    if (err?.care) { st.mirror?.end(); show('s-intro'); return; }
    // kit.api already showed friendly screens for network/queue/5xx; this is a 4xx (e.g. too short).
    console.warn('[shark]', err.message);
    st.mirror?.end();
    show('s-pitch');
    $('pitch-err').textContent = err.message;
    $('pitch-err').hidden = false;
  });
});

// ---------- the run ----------
const SRC = { claude: 'claude reply', mock: 'mock reply', fixture: 'offline demo sharks', hero: 'hero demo pitch' };
const srcLabel = (r) => ({ claude: `claude reply in ${(r.ms / 1000).toFixed(1)}s`, mock: `mock reply in ${(r.ms / 1000).toFixed(1)}s`, fixture: 'offline demo sharks', hero: 'hero demo pitch' })[r.source] || r.source;

async function play() {
  st.answers = {}; st.how = {}; st.v = null; st.card = null; st.revealed = false; st.tvSent = false;
  st.orx?.destroy();
  show('s-run');
  const orx = new Orchestra($('orx'), { title: 'AI Sharks', mode: 'phone', ...AGENTS });
  st.orx = orx;
  st.mirror = tvMirror(orx);
  st.t0 = performance.now();

  // 1. Safety Agent (runs on the server before any Claude call) + Host hands the pitch to 3 sharks (1 Claude call).
  orx.assign('safety', 'Pitch family-friendly hai?');
  orx.status('safety', 'working');
  const call = api('questions', { pitch: st.pitch, mode: st.mode });
  call.catch(() => {}); // handled below; avoids an 'unhandled rejection' while the orchestra animates
  await sleep(650);
  for (const id of IDS) orx.assign(id, `Ek sawaal: ${TOPIC[id]}`);
  let res;
  try { res = await call; } catch (e) { orx.status('safety', 'retry'); throw e; }
  if (!res.safe) {
    orx.log('safety', 'idea change ka request, naya idea suggest kiya'); // never the reason: the TV is public
    orx.status('safety', 'done');
    orx.done('Naya idea try karte hain');
    st.mirror.end();
    return showRedirect(res);
  }
  // TV-bound text: bank lines and templates only (web/tvtext.js). Never model or visitor text.
  orx.log('safety', fill('logWordsV1', { n: Math.min(999, res.words || 0) }));
  orx.status('safety', 'done');
  orx.handoff('safety', 'host', 'pitch clear');
  orx.log('host', fill('logSource', { src: SRC[res.source] || 'mock reply', n: 3 }));
  orx.progress(0.2);
  for (const [i, id] of IDS.entries()) {
    orx.handoff('host', id, 'pitch');
    orx.status(id, 'working');
    await sleep(420);
    orx.log(id, ORX.lReady);
    orx.status(id, 'done');
    orx.progress(0.2 + 0.08 * (i + 1));
  }
  st.q = res;
  await sleep(700);

  // 2. The tank: each shark asks, the visitor answers (voice, chip or text). Answers never go to the TV.
  await runTank();

  // 3. Scoring (1 Claude call) + Lesson Agent.
  show('s-run');
  st.mirror.custom('tank', { state: 'scoring' });
  for (const id of IDS) { orx.assign(id, 'Score /10 + ek line kyun'); orx.status(id, 'working'); }
  orx.progress(0.6);
  // qtoken = the server's signed copy of the questions it issued; the client never sends question text back.
  const v = await api('verdict', { pitch: st.pitch, qtoken: res.qtoken, answers: st.answers });
  if (v.safe === false) { st.mirror.end(); return showRedirect(v); }
  for (const id of IDS) {
    orx.log(id, ORX.lSealed);
    orx.status(id, 'done');
    orx.handoff(id, 'lesson', 'score + why');
    await sleep(260);
  }
  orx.progress(0.85);
  await orx.step('lesson', 'Mini-MBA concept chuno', async () => {
    await sleep(500);
    orx.log('lesson', fill('logLesson', { concept: v.lesson.title }));
  });
  st.v = v;
  orx.done(`Verdict ready in ${((performance.now() - st.t0) / 1000).toFixed(0)}s`);
  await sleep(1100);
  showResult();
}

// ---------- tank ----------
async function runTank() {
  const q = st.q;
  show('s-tank');
  $('tank-idea').textContent = q.idea.title;
  $('tank-host').textContent = q.hostLine;
  $('tank-row').replaceChildren(...IDS.map((id) => avatar(id, { label: true })));
  st.mirror.custom('tank', { state: 'questions', title: q.tv.title, host: q.tv.host });
  await sleep(900);
  for (const [i, id] of IDS.entries()) {
    const { text, how } = await ask(i, id);
    st.answers[id] = text;
    st.how[id] = how;
    st.mirror.custom('answered', { id, step: i + 1 });
    st.orx.log(id, how === 'pass' ? ORX.lPass : fill('logAnswer', { how, n: Math.min(999, text.split(/\s+/).length) }));
    await sleep(500);
  }
}

function ask(i, id) {
  const q = st.q.questions[id];
  const row = [...$('tank-row').children];
  row.forEach((el, j) => { el.classList.toggle('is-active', j === i); el.classList.toggle('is-dim', j !== i); el.classList.toggle('is-done', j < i); });
  $('tank-kicker').textContent = `Step 2 of 3 · Sawaal ${i + 1}/3`;
  [...$('tank-dots').children].forEach((d, j) => { d.className = j < i ? 'done' : j === i ? 'on' : ''; });
  const bubble = $('bubble');
  bubble.dataset.shark = id;
  bubble.style.setProperty('--tail', `${[17, 50, 83][i]}%`);
  bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
  $('bubble-who').textContent = SHARK[id].name;
  const answer = $('answer');
  answer.value = '';
  $('answer-chips').replaceChildren();
  st.mirror.custom('ask', { id, step: i + 1, total: 3, text: st.q.tv.questions[id] }); // TV: bank question, phone: model question
  talk(row[i], Math.min(4200, q.q.length * 30));
  const typed = typeInto($('bubble-q'), q.q, { cps: 40 });

  return new Promise((resolve) => {
    let done = false;
    let extended = false;
    let lastInput = 0;
    let amic = null;
    let timer = null;
    let heroT = null;
    const bar = $('timer-bar');
    const finish = (text, how) => {
      if (done) return;
      done = true;
      amic?.stop();
      clearTimeout(timer);
      clearTimeout(heroT);
      $('answer-mic').classList.remove('on');
      $('answer-mic').onclick = null;
      $('send-answer').onclick = null;
      $('skip').onclick = null;
      answer.oninput = null;
      row[i].classList.add('is-done');
      resolve({ text: text.trim().slice(0, 200), how: text.trim() ? how : 'pass' });
    };
    const startTimer = (ms) => {
      bar.style.transition = 'none';
      bar.style.width = '100%';
      void bar.offsetWidth;
      bar.style.transition = `width ${ms}ms linear`;
      bar.style.width = '0%';
      clearTimeout(timer);
      timer = setTimeout(() => {
        const t = answer.value.trim();
        const typing = performance.now() - lastInput < 3500;
        if (!extended && (typing || amic?.active)) { extended = true; startTimer(10000); return; }
        finish(t, amic ? 'voice' : 'text');
      }, ms);
    };
    answer.oninput = () => { lastInput = performance.now(); };
    typed.then(() => {
      if (done) return;
      $('answer-chips').replaceChildren(...q.chips.map((c) => h('button', { class: 'sk-chip', type: 'button', onclick: (e) => { e.currentTarget.classList.add('picked'); answer.value = c; setTimeout(() => finish(c, 'chip'), 320); } }, c)));
      startTimer(ANSWER_MS);
      if (HERO && heroProfile?.answers?.[id]) {
        heroT = setTimeout(async () => { await typeInto({ set textContent(v) { answer.value = v; } }, heroProfile.answers[id], { cps: 34 }); setTimeout(() => finish(answer.value, 'text'), 700); }, 900);
      }
    });
    $('send-answer').onclick = () => finish(answer.value, amic ? 'voice' : 'text');
    $('skip').onclick = () => finish('', 'pass');
    const micBtn = $('answer-mic');
    micBtn.hidden = !speechSupported();
    micBtn.onclick = () => {
      if (amic?.active) { amic.stop(); micBtn.classList.remove('on'); return; }
      amic = listen({ base: answer.value, onText: (t) => { answer.value = t.slice(0, 200); lastInput = performance.now(); }, onState: (s) => micBtn.classList.toggle('on', s === 'listening') });
    };
    if (st.mode === 'voice' && speechSupported() && !HERO) typed.then(() => { if (!done && !amic) micBtn.click(); });
  });
}

// ---------- redirect ----------
async function showRedirect(res) {
  show('s-redirect');
  $('redirect-msg').textContent = res.message;
  // Self-harm ("care"): a caring line only. No idea chips, no game, no score.
  $('s-redirect').classList.toggle('care', !!res.care);
  $('redirect-title').textContent = res.care ? 'Hum tumhare saath hain' : 'Chalo, naya idea!';
  $('redirect-kicker').textContent = res.care ? 'Ek zaroori baat' : 'Sharks ka chhota sa request';
  $('redirect-again').textContent = res.care ? 'Wapas shuru karo' : 'Naya pitch karo';
  const list = res.care ? [] : res.prompts?.length ? res.prompts : (await loadPrompts()).slice(0, 4);
  $('redirect-prompts').replaceChildren(...promptChips(list, (p) => openPitch('text', p.pitch)));
}
$('redirect-again').addEventListener('click', () => ($('s-redirect').classList.contains('care') ? show('s-intro') : openPitch(st.mode)));

// ---------- result ----------
// The share card is drawn only after the gate (inside reveal), never before.
async function buildCard() {
  if (!st.revealed) throw new Error('locked');
  const { v, q } = st;
  const deal = v.verdict === 'deal';
  st.card = await makeShareCard({
    kicker: 'AI Sharks ne kaha',
    title: deal ? 'DEAL!' : 'Main out hoon',
    lines: [
      `Idea: ${q.idea.title}`,
      `Score ${v.total}/30 · ${v.ins} of 3 sharks in`,
      `VC ${v.sharks.vc.score} · Marketing ${v.sharks.mkt.score} · Finance ${v.sharks.fin.score}`,
      `Mini-MBA lesson: ${v.lesson.title}`,
    ],
    footer: 'For fun only · Asli paisa nahi',
  });
  return st.card;
}

function showResult() {
  const { v, q } = st;
  $('r-idea').textContent = q.idea.title;
  $('stamp').textContent = '?';
  $('stamp').className = 'sk-stamp';
  $('total').textContent = 'Sharks ne decide kar liya!';
  $('stampbox').className = 'sk-stampbox locked';
  // Gate rule: no score, in/out, line or verdict text is in the DOM before "Maine follow kar liya".
  $('cards').replaceChildren(...IDS.map((id) => h('div', { class: 'sk-card locked', 'data-shark': id },
    avatar(id),
    h('div', { class: 'sk-card-body' },
      h('div', { class: 'sk-card-top' }, h('b', {}, SHARK[id].name), h('span', { class: 'sk-pill' }, 'LOCKED')),
      h('div', { class: 'sk-score' }, h('span', { class: 'n' }, '?'), h('small', {}, '/10')),
      h('p', { class: 'sk-line' }, 'Score ready hai...'),
      h('p', { class: 'sk-why' }, 'Follow karke unlock karo.')))));
  $('unlock').hidden = false;
  $('after').hidden = true;
  $('r-src').textContent = { claude: 'Made live by Claude', mock: 'Mock mode (no API key)', fixture: 'Offline mode: demo sharks', hero: 'Demo pitch (fictional, for filming)' }[v.source] || '';
  show('s-result');
  track('complete');
  if (HERO) setTimeout(() => $('unlock').click(), 1800);
}

function sendTvResult() {
  if (st.tvSent || !st.v) return;
  st.tvSent = true;
  const { v, q } = st;
  st.mirror?.result({
    kicker: 'AI Sharks ka verdict',
    title: v.tv.title,
    verdict: v.verdict,
    score: v.total,
    max: 30,
    ins: v.ins,
    scores: v.tv.sharks.map((x) => ({ id: x.id, score: x.score, label: x.label, line: x.line })),
    lesson: { title: v.tv.lesson, icon: v.lesson.icon },
    lines: [v.tv.line],
    forFun: true,
  });
}

async function reveal() {
  const { v } = st;
  st.revealed = true;
  $('unlock').hidden = true;
  sendTvResult(); // the TV reveal starts with the phone reveal, never before the gate
  const cards = [...$('cards').children];
  for (const [i, id] of IDS.entries()) {
    await sleep(i ? 750 : 350);
    const card = cards[i];
    const s = v.sharks[id];
    card.querySelector('.sk-pill').textContent = s.in ? 'IN' : 'OUT';
    card.querySelector('.sk-line').textContent = s.line;
    card.querySelector('.sk-why').textContent = s.why;
    card.classList.remove('locked');
    card.classList.add('open', s.in ? 'is-in' : 'is-out');
    talk(card.querySelector('.sk-av'), 1200);
    countUp(card.querySelector('.n'), s.score, 650);
  }
  await sleep(900);
  const deal = v.verdict === 'deal';
  $('stampbox').className = `sk-stampbox open ${deal ? 'deal' : 'out'}`;
  $('stamp').textContent = deal ? 'DEAL!' : 'Main out hoon';
  $('stamp').className = 'sk-stamp slam';
  $('total').textContent = `${v.total}/30 · ${v.ins} of 3 sharks in`;
  navigator.vibrate?.(deal ? [40, 60, 80] : 60);
  await sleep(700);
  $('r-compliment').textContent = v.compliment;
  $('r-fix').textContent = v.fix;
  $('r-lesson-title').textContent = v.lesson.title;
  $('r-lesson-explain').textContent = v.lesson.explain;
  $('r-lesson-z').textContent = v.lesson.zenith;
  $('r-programme').textContent = v.programme;
  $('after').hidden = false;
  const card = await buildCard();
  $('card-img').src = card.url;
}

function countUp(el, to, ms) {
  const t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  tick();
}

$('unlock').addEventListener('click', async () => {
  if (HERO) setTimeout(() => document.querySelector('[data-pz="gate-unlock"]')?.click(), 2200);
  await gate('shark', { reward: 'Teeno sharks ke score, verdict aur tumhara mini-MBA lesson' });
  reveal();
});
// Gate rule: share and friend share do nothing until the verdict is revealed (even if clicked from script).
$('share').addEventListener('click', () => { if (st.revealed && st.card) shareCard(st.card, { filename: 'zenith-ai-sharks.png' }); });
$('friends').addEventListener('click', () => { if (st.revealed && st.card) sendToFriends(st.card, { text: 'Maine AI Sharks ko apna startup idea pitch kiya! Tum bhi try karo:', filename: 'zenith-ai-sharks.png' }); });
$('again').addEventListener('click', () => { st.mirror?.end(); st.tvSent = false; openPitch(st.mode); });

// ---------- ?demo=hero: a fictional pitch, end to end, for filming ----------
if (HERO) {
  const hp = await hero();
  if (hp?.profile) {
    heroProfile = hp.profile;
    $('hero-note').hidden = false;
    $('hero-note').textContent = hp.label;
    setTimeout(async () => {
      await openPitch('text');
      await typeInto({ set textContent(v) { setPitch(v); } }, hp.profile.pitch, { cps: 70 });
      setTimeout(() => $('send-pitch').click(), 800);
    }, 1400);
  }
}

// test hook (Playwright): read-only view of the flow
// Test hook (Playwright) only with ?test=1 or hero, and it never tells the verdict before the reveal.
if (new URLSearchParams(location.search).has('test') || HERO) {
  window.__shark = { get screen() { return document.querySelector('.sk-screen:not([hidden])')?.id; }, get verdict() { return st.revealed ? st.v?.verdict : undefined; }, get source() { return st.revealed ? st.v?.source : st.q?.source; } };
}
