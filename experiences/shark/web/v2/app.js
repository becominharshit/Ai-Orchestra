// AI Sharks v2 phone app (TASK-13). Public name "AI Sharks"; fictional personas, not real people.
//   intro (solo / co-founders, optional nickname, big-screen turn) -> 4 pitch cards, 15 s each, voice first with
//   "Type karo" always visible -> review -> Agent Orchestra -> 3 follow-ups in character, 10 s each ->
//   follow gate -> 4-axis scorecard, per-shark Deal / Main out hoon, mini-MBA lesson, share card.
// TV rule (CHECK_build 12/13): the TV only ever gets the server's `tv` blocks (bank lines, templates, numbers)
// and fixed orchestra text from ../tvtext.js. The visitor's words and the model's lines stay on this phone.
import { api, track, tvMirror, tvToggle, hero, isHero, h, sleep, safetyMode as coreSafetyMode } from '/core/kit.js';
import { Orchestra } from '/core/orchestra.js';
import { gate } from '/core/gate.js';
import { makeShareCard, shareCard, sendToFriends } from '/core/sharecard.js';
import { PERSONA, avatar, talk, typeInto } from '../sharks.js';
import { speechSupported, listen } from '../voice.js';
import { ORX, COPY, fill } from '../tvtext.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of document.querySelectorAll('.sk-screen')) s.hidden = s.id !== id; window.scrollTo(0, 0); };
const HERO = isHero();
const CARD_MS = 15000;
const ANSWER_MS = 10000;
const CARDS = [
  { id: 'idea', kicker: 'Idea', q: 'Tumhara idea, ek line mein', hint: 'Kya banaoge? Jaise: hostel ke liye laundry app.' },
  { id: 'customer', kicker: 'Customer', q: 'Kaun khareedega?', hint: 'Tumhara pehla customer kaun hai?' },
  { id: 'problem', kicker: 'Problem', q: 'Kyun zaroori hai?', hint: 'Unki kya dikkat solve hogi?' },
  { id: 'paisa', kicker: 'Paisa', q: 'Kaise kamaoge?', hint: 'Price kya hoga, kharcha kitna?' },
];
const SRC = { claude: 'claude reply', mock: 'mock reply', fixture: 'offline demo sharks', hero: 'hero demo pitch' };

const st = { mode: 'text', coop: false, pick: null, safetyMode: 'degraded', parts: {}, q: null, answers: {}, v: null, orx: null, mirror: null, card: null, revealed: false, tvSent: false, turn: null, stage: null, prompts: [] };
let heroProfile = null;

// ---------- core stage (CONTRACT 12.4): big-screen turn, nickname, reward token ----------
const cfgP = fetch('/api/shark/config').then((r) => r.json()).catch(() => ({}));
const modeReady = applySafetyMode();

// safetyMode (core, CONTRACT 13): 'live' = typing and voice, gated by core's live crisis check; 'degraded' (no live
// AI check: no key, API down, cap, offline) = CHIPS ONLY. No typing or voice at all; the server refuses free text too.
async function applySafetyMode() {
  const m = await coreSafetyMode().catch(() => 'degraded');
  st.safetyMode = m === 'live' ? 'live' : 'degraded';
  const degraded = st.safetyMode === 'degraded';
  document.querySelector('.sk2').classList.toggle('degraded', degraded);
  // The default path's button goes above the fold (under the sharks); the others stay further down as options.
  const main = degraded ? $('go-pick') : speechSupported() ? $('go-voice') : $('go-text');
  for (const b of [$('go-pick'), $('go-voice'), $('go-text')]) { b.className = 'pz-btn ghost block'; if (b !== main) $('cta').append(b); }
  main.className = 'pz-btn block sk2-main';
  $('cta-main').replaceChildren(main);
  for (const id of ['go-voice', 'go-text', 'pick-own', 'pc-own-btn', 'answer-own', 'voice-note']) $(id).hidden = degraded || (id === 'go-voice' && !speechSupported());
  if (degraded) $('answer-row').hidden = true;
}

async function loadStage() {
  // Only when core's Stage API is live (our server says so), so a missing module never 404s in the console.
  const cfg = await cfgP;
  if (!cfg.stage) return;
  try { st.stage = await import('/core/stage.js'); } catch { st.stage = null; return; }
  // "Big screen pe khelo": core's nickname picker + queue; onTurn runs when it is this phone's turn.
  await st.stage.bigScreenButton($('big-screen'), { onTurn: async (t) => { st.turn = t; await modeReady; if (st.safetyMode === 'live') startCards(speechSupported() ? 'voice' : 'text'); else openPick(); } });
  // Leaderboard without the big screen: pick a nickname (1 of 3, no text box).
  $('nick-box').hidden = false;
  $('nick-chips').replaceChildren(h('button', { class: 'sk-chip', type: 'button', 'data-pz': 'board-nick', onclick: async (e) => {
    const btn = e.currentTarget; // captured before the await (currentTarget is null afterwards)
    const n = await st.stage.pickNickname({ title: 'Leaderboard ke liye naam chuno' });
    if (n) { btn.textContent = `Leaderboard naam: ${n}`; btn.classList.add('picked'); }
  } }, 'Nickname chuno'));
}

// ---------- intro ----------
$('intro-panel').append(...['seth', 'riya', 'kabir'].map((id) => {
  const p = PERSONA[id];
  const el = avatar(id, { label: true });
  el.appendChild(h('div', { class: 'sk2-catch' }, `"${p.catch}"`));
  return el;
}));
$('intro-mummy').replaceChildren(avatar('mummy', { cls: 'mini' }), h('span', {}, h('b', {}, 'Kabhi kabhi Mummy Angel Investor bhi aa jaati hain: '), `"${PERSONA.mummy.catch}"`));
$('tv-toggle').replaceWith(tvToggle((on) => st.mirror?.setEnabled(on)));
for (const b of document.querySelectorAll('.sk2-seg')) {
  b.addEventListener('click', () => {
    st.coop = b.dataset.mode === 'coop';
    for (const x of document.querySelectorAll('.sk2-seg')) { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b ? 'true' : 'false'); }
    $('coop-note').hidden = !st.coop;
  });
}
if (!speechSupported()) {
  $('go-voice').hidden = true;
  $('voice-note').textContent = 'Is browser mein voice nahi chalega, type karke pitch karo. Mazaa bilkul same!';
}
$('go-voice').addEventListener('click', () => startCards('voice'));
$('go-text').addEventListener('click', () => startCards('text'));
loadStage();

// ---------- chip path: "Type karna nahi? Idea type chuno" ----------
let pcIdx = 0;
let pcGame = null;
async function openPick() {
  track('start', undefined, { once: true });
  st.mode = 'text';
  st.parts = {};
  st.pick = null;
  st.cardMirror = tvMirror(null);
  st.cardMirror.custom('card', { state: 'pitching', step: 1, items: ['seth', 'riya', 'kabir'].map((id) => ({ id })) }); // new player: TV clears the last verdict
  show('s-pick');
  const list = await loadPrompts();
  $('types').replaceChildren(...list.map((g) => h('button', { class: 'sk2-type-btn', type: 'button', 'data-pz': 'idea-type', onclick: () => { pcGame = g; st.pick = { game: g.id }; openPickCard(0); } }, g.prompt)));
}
function openPickCard(i) {
  pcIdx = i;
  const c = CARDS[i];
  show('s-pickcard');
  st.cardMirror?.custom('card', { state: 'pitching', step: i + 1, items: ['seth', 'riya', 'kabir'].map((id) => ({ id })) });
  $('pc-kicker').textContent = `Card ${i + 1}/4 · ${c.kicker}`;
  [...$('pc-dots').children].forEach((d, j) => { d.className = j < i ? 'done' : j === i ? 'on' : ''; });
  $('pc-q').textContent = c.q;
  $('pc-turn').hidden = !st.coop;
  $('pc-turn').textContent = turnLabel(i);
  $('pc-own').hidden = true;
  $('pc-own-btn').hidden = st.safetyMode !== 'live'; // chips only in degraded mode
  $('pc-text').value = '';
  const opts = pcGame?.cardChips?.[c.id] || [];
  $('pc-opts').replaceChildren(...opts.map((t, k) => h('button', { class: 'sk2-opt', type: 'button', 'data-pz': 'card-chip', onclick: (e) => {
    e.currentTarget.classList.add('picked');
    st.pick[c.id] = k;
    st.parts[c.id] = t;
    setTimeout(() => pickNext(), 250);
  } }, t)));
}
function pickNext() { if (pcIdx < 3) openPickCard(pcIdx + 1); else openReview(); }
$('go-pick').addEventListener('click', openPick);
$('pick-own').addEventListener('click', () => startCards(speechSupported() && st.safetyMode === 'live' ? 'voice' : 'text'));
$('pc-own-btn').addEventListener('click', () => { $('pc-own').hidden = false; $('pc-own-btn').hidden = true; $('pc-text').focus(); });
$('pc-own-next').addEventListener('click', () => {
  const c = CARDS[pcIdx];
  const t = $('pc-text').value.trim().slice(0, 220);
  if (pcIdx === 0 && (t.match(/[\p{L}\p{N}]/gu) || []).length < 4) return;
  delete st.pick[c.id];
  st.parts[c.id] = t;
  pickNext();
});

// ---------- the 4 cards ----------
const RING = 2 * Math.PI * 54;
$('card-ring').style.strokeDasharray = String(RING);
let cardIdx = 0;
let mic = null;
let tick = null;
let cardT0 = 0;
let cardMs = CARD_MS;
let extended = false;

function stopMic() { mic?.stop(); mic = null; }
function micUi(state) {
  $('card').dataset.state = state;
  $('card-state').textContent = { idle: 'Tap karke bolo', listening: 'Sun rahe hain... bolte raho', stopped: 'Ho gaya! Edit karke aage badho', denied: 'Mic ki permission nahi mili. Type karo!', network: 'Voice ke liye net chahiye. Type karo!', error: 'Voice nahi chala. Type karo!', typing: 'Type kar rahe ho' }[state] || '';
}
function startMic() {
  if (!speechSupported()) return;
  stopMic();
  mic = listen({ base: $('card-text').value, onText: (t) => { $('card-text').value = t.slice(0, 220); }, onState: (s) => micUi(s) });
}
const turnLabel = (i) => (st.coop ? `Founder ${(i % 2) + 1} ki baari` : '');

async function loadPrompts() {
  if (st.prompts.length) return st.prompts;
  try { st.prompts = (await api('v2/prompts')).prompts || []; } catch { st.prompts = []; }
  return st.prompts;
}

async function startCards(mode) {
  track('start', undefined, { once: true });
  st.mode = mode;
  st.parts = {};
  st.pick = null;
  cardIdx = 0;
  st.cardMirror = tvMirror(null); // the previous card mirror (if any) is simply dropped, never ended
  show('s-cards');
  openCard(0); // first, so nothing the visitor types is reset when the prompts arrive
  const list = await loadPrompts();
  $('prompt-chips').replaceChildren(...list.slice(0, 8).map((p) => h('button', { class: 'sk-chip', type: 'button', onclick: () => { stopMic(); clearInterval(tick); st.parts = { ...p.parts }; st.pick = { game: p.id, idea: 0, customer: 0, problem: 0, paisa: 0 }; openReview(); } }, p.prompt)));
}

function openCard(i) {
  cardIdx = i;
  const c = CARDS[i];
  // TV: which card is on (numbers and bank enums only), sharks listening. Never the spoken words.
  st.cardMirror?.custom('card', { state: 'pitching', step: i + 1, items: ['seth', 'riya', 'kabir'].map((id) => ({ id })) });
  $('card-kicker').textContent = `Card ${i + 1}/4 · ${c.kicker}`;
  [...$('card-dots').children].forEach((d, j) => { d.className = j < i ? 'done' : j === i ? 'on' : ''; });
  $('card-q').textContent = c.q;
  $('card-hint').textContent = c.hint;
  $('card-turn').hidden = !st.coop;
  $('card-turn').textContent = turnLabel(i);
  $('card-text').value = st.parts[c.id] || '';
  $('card-err').hidden = true;
  $('card-prompts').hidden = i !== 0;
  $('card-next').textContent = i < 3 ? 'Agla card' : 'Pitch check karo';
  const el = $('card'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  micUi('idle');
  extended = false;
  cardMs = CARD_MS;
  cardT0 = performance.now();
  clearInterval(tick);
  tick = setInterval(onTick, 200);
  if (st.mode === 'voice' && !HERO) startMic();
}

function onTick() {
  const left = Math.max(0, cardMs - (performance.now() - cardT0));
  $('card-time').textContent = `${Math.ceil(left / 1000)}s`;
  $('card-ring').style.strokeDashoffset = String(RING * (1 - left / cardMs));
  if (left > 0) return;
  const text = $('card-text').value.trim();
  if (!text && !extended) { extended = true; cardMs += 10000; $('card-err').textContent = 'Bas ek line bolo ya likho, phir aage!'; $('card-err').hidden = false; return; }
  if (!text && cardIdx === 0) return; // the idea card needs at least a few words
  nextCard();
}

function nextCard() {
  const text = $('card-text').value.trim();
  if (cardIdx === 0 && (text.match(/[\p{L}\p{N}]/gu) || []).length < 4) { $('card-err').textContent = 'Idea card mein thoda aur batao! Ek line kaafi hai.'; $('card-err').hidden = false; return; }
  stopMic();
  clearInterval(tick);
  st.parts[CARDS[cardIdx].id] = text.slice(0, 220);
  if (cardIdx < 3) openCard(cardIdx + 1);
  else openReview();
}
$('card-next').addEventListener('click', nextCard);
$('card-mic').addEventListener('click', () => { if (mic?.active) { stopMic(); micUi('stopped'); } else startMic(); });
$('card-type').addEventListener('click', () => { stopMic(); micUi('typing'); extended = true; cardMs = Math.max(cardMs, performance.now() - cardT0 + 20000); $('card-text').focus(); });
$('card-text').addEventListener('input', () => { if (!mic?.active) micUi('typing'); });

function openReview() {
  stopMic();
  clearInterval(tick);
  show('s-review');
  $('review-err').hidden = true;
  $('review').replaceChildren(...CARDS.map((c, i) => h('label', { class: 'sk-field sk2-rv' },
    h('span', {}, `${i + 1}. ${c.kicker}${st.coop ? ` · Founder ${(i % 2) + 1}` : ''}`),
    h('textarea', { class: 'pz-input sk-text small', rows: '2', maxlength: '220', 'data-part': c.id, readonly: st.safetyMode !== 'live' }, st.parts[c.id] || ''))));
}
$('send').addEventListener('click', () => {
  for (const t of $('review').querySelectorAll('textarea')) {
    const k = t.dataset.part;
    const v = t.value.trim().slice(0, 220);
    if (st.pick && v !== st.parts[k]) delete st.pick[k]; // edited: no longer the reviewed chip
    st.parts[k] = v;
  }
  play().catch((err) => {
    if (err?.care) { st.mirror?.end(); show('s-intro'); return; } // the kit showed the care card (Tele-MANAS)
    console.warn('[shark]', err.message);
    st.mirror?.end();
    show('s-review');
    $('review-err').textContent = err.message;
    $('review-err').hidden = false;
  });
});

// ---------- the run ----------
function agents(panel) {
  return {
    orchestrator: { id: 'host', name: ORX.host, role: ORX.hostRole, icon: 'crown' },
    agents: [
      { id: 'safety', name: ORX.safety, role: ORX.safetyRole, label: ORX.safetyLabel, icon: 'shield' },
      ...panel.map((id) => ({ id, name: ORX[id], role: ORX[`${id}Role`], label: ORX[`${id}Label`], icon: PERSONA[id].icon, color: PERSONA[id].color })),
      { id: 'score', name: ORX.score, role: ORX.scoreRole, label: ORX.scoreLabel, icon: 'target' },
      { id: 'lesson', name: ORX.lesson, role: ORX.lessonRole, label: ORX.lessonLabel, icon: 'brain' },
    ],
  };
}

async function play() {
  st.cardMirror = null; // superseded by the orchestra mirror (ending it would end a big-screen turn)
  st.answers = {}; st.v = null; st.card = null; st.revealed = false; st.tvSent = false;
  show('s-run');
  // The panel is decided by the server; the orchestra starts once we know it (fast: 1 call).
  const call = api('v2/questions', { parts: st.parts, pick: st.pick || undefined, mode: st.mode, coop: st.coop });
  call.catch(() => {});
  const res = await call;
  if (!res.safe) return showRedirect(res);
  st.q = res;
  st.orx?.destroy();
  const orx = new Orchestra($('orx'), { title: ORX.title, mode: 'phone', ...agents(res.panel) });
  st.orx = orx;
  st.mirror = tvMirror(orx);
  st.t0 = performance.now();

  orx.assign('safety', ORX.tSafety);
  orx.status('safety', 'working');
  await sleep(500);
  orx.log('safety', fill('logWords', { n: Math.min(999, res.words || 0) }));
  orx.status('safety', 'done');
  orx.handoff('safety', 'host', ORX.hClear);
  orx.log('host', fill('logSource', { src: SRC[res.source] || 'mock reply', n: res.panel.length }));
  orx.progress(0.2);
  for (const [i, id] of res.panel.entries()) {
    orx.handoff('host', id, ORX.hPitch);
    orx.assign(id, ORX.tAsk);
    orx.status(id, 'working');
    await sleep(380);
    orx.log(id, ORX.lReady);
    orx.status(id, 'done');
    orx.progress(0.2 + 0.08 * (i + 1));
  }
  await sleep(600);

  await runTank();

  show('s-run');
  st.mirror.custom('tank', { state: 'scoring' });
  for (const id of res.panel) { orx.assign(id, ORX.tTake); orx.status(id, 'working'); }
  orx.assign('score', ORX.tScore);
  orx.status('score', 'working');
  orx.progress(0.6);
  const vcall = api('v2/verdict', { parts: st.parts, pick: st.pick || undefined, qtoken: res.qtoken, answers: st.answers, mode: st.mode, coop: st.coop });
  vcall.catch(() => {});
  const v = await vcall;
  if (v.safe === false) { st.mirror.end(); return showRedirect(v); }
  orx.log('score', ORX.lAxes);
  orx.status('score', 'done');
  for (const id of res.panel) {
    orx.log(id, ORX.lSealed);
    orx.status(id, 'done');
    orx.handoff(id, 'lesson', ORX.hScore);
    await sleep(240);
  }
  orx.progress(0.85);
  await orx.step('lesson', ORX.tLesson, async () => { await sleep(450); orx.log('lesson', fill('logLesson', { concept: v.lesson.title })); });
  st.v = v;
  orx.done(fill('doneReady', { s: Math.min(999, Math.round((performance.now() - st.t0) / 1000)) }));
  await sleep(1000);
  showResult();
}

// ---------- follow-ups ----------
async function runTank() {
  const q = st.q;
  show('s-tank');
  $('tank-idea').textContent = q.idea.title;
  $('tank-host').textContent = q.hostLine;
  $('tank-row').replaceChildren(...q.panel.map((id) => avatar(id, { label: true })));
  st.mirror.custom('tank', { state: 'questions', title: q.tv.title, host: q.tv.host, items: q.panel.map((id) => ({ id })) });
  await sleep(800);
  for (const [i, id] of q.panel.entries()) {
    const { text, how } = await ask(i, id);
    st.answers[id] = text;
    st.mirror.custom('answered', { id, step: i + 1 });
    st.orx.log(id, how === 'pass' ? ORX.lPass : fill('logAnswer', { how, n: Math.min(999, text.split(/\s+/).length) }));
    await sleep(450);
  }
}

function ask(i, id) {
  const q = st.q.questions[id];
  const row = [...$('tank-row').children];
  row.forEach((el, j) => { el.classList.toggle('is-active', j === i); el.classList.toggle('is-dim', j !== i); el.classList.toggle('is-done', j < i); });
  $('tank-kicker').textContent = `Sawaal ${i + 1}/3 · ${PERSONA[id].short}`;
  [...$('tank-dots').children].forEach((d, j) => { d.className = j < i ? 'done' : j === i ? 'on' : ''; });
  const bubble = $('bubble');
  bubble.dataset.shark = id;
  bubble.style.setProperty('--tail', `${[17, 50, 83][i]}%`);
  bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
  $('bubble-who').textContent = PERSONA[id].name;
  $('answer-turn').hidden = !st.coop;
  $('answer-turn').textContent = st.coop ? `Founder ${(i % 2) + 1} jawab do` : '';
  const answer = $('answer');
  answer.value = '';
  $('answer-row').classList.remove('open');
  $('answer-own').hidden = true; // chips-only in degraded; in live the text box is always shown
  $('answer-own').onclick = () => { $('answer-row').classList.add('open'); $('answer-own').hidden = true; answer.focus(); };
  $('answer-chips').replaceChildren();
  st.mirror.custom('ask', { id, step: i + 1, total: 3, text: st.q.tv.questions[id] }); // TV: bank question only
  talk(row[i], Math.min(4000, q.q.length * 30));
  const typed = typeInto($('bubble-q'), q.q, { cps: 42 });

  return new Promise((resolve) => {
    let done = false; let extendedA = false; let lastInput = 0; let amic = null; let timer = null; let heroT = null;
    const bar = $('timer-bar');
    const finish = (text, how) => {
      if (done) return;
      done = true;
      amic?.stop(); clearTimeout(timer); clearTimeout(heroT);
      $('answer-mic').classList.remove('on');
      $('answer-mic').onclick = null; $('send-answer').onclick = null; $('skip').onclick = null; answer.oninput = null;
      row[i].classList.add('is-done');
      resolve({ text: text.trim().slice(0, 200), how: text.trim() ? how : 'pass' });
    };
    const startTimer = (ms) => {
      bar.style.transition = 'none'; bar.style.width = '100%'; void bar.offsetWidth;
      bar.style.transition = `width ${ms}ms linear`; bar.style.width = '0%';
      clearTimeout(timer);
      timer = setTimeout(() => {
        const typing = performance.now() - lastInput < 3500;
        if (!extendedA && (typing || amic?.active)) { extendedA = true; startTimer(8000); return; }
        finish(answer.value, amic ? 'voice' : 'text');
      }, ms);
    };
    answer.oninput = () => { lastInput = performance.now(); };
    typed.then(() => {
      if (done) return;
      $('answer-chips').replaceChildren(...q.chips.map((c) => h('button', { class: 'sk-chip', type: 'button', onclick: (e) => { e.currentTarget.classList.add('picked'); answer.value = c; setTimeout(() => finish(c, 'chip'), 300); } }, c)));
      startTimer(ANSWER_MS);
      if (HERO && heroProfile?.chips) heroT = setTimeout(() => document.querySelector('#answer-chips .sk-chip')?.click(), 1200);
      else if (HERO && heroProfile?.answers?.[id]) heroT = setTimeout(async () => { await typeInto({ set textContent(t) { answer.value = t; } }, heroProfile.answers[id], { cps: 36 }); setTimeout(() => finish(answer.value, 'text'), 600); }, 700);
    });
    $('send-answer').onclick = () => finish(answer.value, amic ? 'voice' : 'text');
    $('skip').onclick = () => finish('', 'pass');
    const micBtn = $('answer-mic');
    micBtn.hidden = !speechSupported() || st.safetyMode !== 'live';
    micBtn.onclick = () => {
      if (amic?.active) { amic.stop(); micBtn.classList.remove('on'); return; }
      amic = listen({ base: answer.value, onText: (t) => { answer.value = t.slice(0, 200); lastInput = performance.now(); }, onState: (s) => micBtn.classList.toggle('on', s === 'listening') });
    };
    if (st.mode === 'voice' && speechSupported() && !HERO) typed.then(() => { if (!done && !amic) micBtn.click(); });
  });
}

// ---------- redirect ----------
async function showRedirect(res) {
  st.mirror?.end();
  show('s-redirect');
  $('redirect-msg').textContent = res.message;
  $('s-redirect').classList.toggle('care', !!res.care);
  $('redirect-title').textContent = res.care ? 'Hum tumhare saath hain' : 'Chalo, naya idea!';
  $('redirect-kicker').textContent = res.care ? 'Ek zaroori baat' : 'Sharks ka chhota sa request';
  $('redirect-again').textContent = res.care ? 'Wapas shuru karo' : 'Naya pitch karo';
  const list = res.care ? [] : (await loadPrompts()).slice(0, 4);
  $('redirect-prompts').replaceChildren(...list.map((p) => h('button', { class: 'sk-chip', type: 'button', onclick: () => { st.parts = { ...p.parts }; st.pick = { game: p.id, idea: 0, customer: 0, problem: 0, paisa: 0 }; openReview(); } }, p.prompt)));
}
$('redirect-again').addEventListener('click', () => ($('s-redirect').classList.contains('care') ? show('s-intro') : startCards(st.mode)));

// ---------- scorecard ----------
const AX = [['idea', COPY.axisIdea], ['customer', COPY.axisCustomer], ['money', COPY.axisMoney], ['energy', COPY.axisEnergy]];

function showResult() {
  const { q } = st;
  $('r-idea').textContent = q.idea.title;
  $('stamp').textContent = '?';
  $('stamp').className = 'sk-stamp';
  $('total').textContent = 'Sharks ne decide kar liya!';
  $('stampbox').className = 'sk-stampbox locked';
  // Gate rule: no score, deal or take is in the DOM before "Maine follow kar liya".
  $('axes').replaceChildren(...AX.map(([id, label]) => h('div', { class: 'sk2-axis', 'data-axis': id }, h('span', {}, label), h('i', {}, h('b')), h('em', {}, '?'))));
  $('cards').replaceChildren(...q.panel.map((id) => h('div', { class: 'sk-card locked', 'data-shark': id },
    avatar(id),
    h('div', { class: 'sk-card-body' },
      h('div', { class: 'sk-card-top' }, h('b', {}, PERSONA[id].name), h('span', { class: 'sk-pill' }, 'LOCKED')),
      h('p', { class: 'sk-line' }, 'Faisla ready hai...'),
      h('p', { class: 'sk-why' }, 'Follow karke unlock karo.')))));
  $('unlock').hidden = false;
  $('after').hidden = true;
  $('r-src').textContent = { claude: 'Made live by Claude', mock: 'Mock mode (no API key)', fixture: 'Offline mode: demo sharks', hero: 'Demo pitch (fictional, for filming)' }[st.v.source] || '';
  show('s-result');
  track('complete');
  if (HERO) setTimeout(() => $('unlock').click(), 1600);
}

function sendTvResult() {
  if (st.tvSent || !st.v) return;
  st.tvSent = true;
  const tv = st.v.tv;
  st.mirror?.result({
    kicker: COPY.kickerVerdict,
    title: tv.title,
    verdict: tv.verdict,
    score: tv.total,
    max: tv.max,
    ins: tv.deals,
    values: tv.axes.map((a) => ({ id: a.id, label: a.label, value: a.value })),
    scores: tv.sharks.map((s) => ({ id: s.id, label: s.deal ? 'DEAL' : 'OUT', line: s.take })),
    lesson: { title: tv.lesson },
    lines: [tv.line],
    forFun: true,
  });
}

// The TV reveal (tv.js) takes about 8 s (axis bars, 3 sharks, total, stamp); we hold it ~5 s more for the crowd
// before the board post ends a big-screen turn. Keep in sync with tv.js.
const TV_REVEAL_MS = 13000;
async function postBoard(btoken) {
  for (let i = 0; i < 3; i++) {
    const r = await api('v2/board', { btoken }).catch(() => null);
    if (r?.reason === 'too_early') { await sleep(r.retryMs || 1000); continue; }
    return r;
  }
  return null;
}

async function buildCard() {
  if (!st.revealed) throw new Error('locked');
  const sh = st.v.share;
  const coop = st.coop ? [sh.coop].filter(Boolean) : [];
  st.card = await makeShareCard({ kicker: sh.kicker, title: sh.title, lines: [...coop, ...sh.lines].slice(0, 6), footer: sh.footer });
  return st.card;
}

async function reveal() {
  const { v } = st;
  st.revealed = true;
  $('unlock').hidden = true;
  st.tvRevealAt = performance.now();
  sendTvResult(); // the TV reveal starts with the phone reveal, never before the gate
  for (const el of $('axes').children) {
    const n = v.axes[el.dataset.axis];
    el.classList.add('open');
    el.querySelector('b').style.width = `${n * 10}%`;
    el.querySelector('em').textContent = `${n}/10`;
    await sleep(260);
  }
  const cards = [...$('cards').children];
  for (const [i, id] of st.q.panel.entries()) {
    await sleep(i ? 650 : 300);
    const s = v.sharks[id];
    const card = cards[i];
    card.querySelector('.sk-pill').textContent = s.deal ? 'DEAL' : 'OUT';
    card.querySelector('.sk-line').textContent = s.take;
    card.querySelector('.sk-why').textContent = `"${PERSONA[id].catch}"`;
    card.classList.remove('locked');
    card.classList.add('open', s.deal ? 'is-in' : 'is-out');
    talk(card.querySelector('.sk-av'), 1100);
  }
  await sleep(800);
  const deal = v.verdict === 'deal';
  $('stampbox').className = `sk-stampbox open ${deal ? 'deal' : 'out'}`;
  $('stamp').textContent = deal ? 'DEAL!' : 'Main out hoon';
  $('stamp').className = 'sk-stamp slam';
  $('total').textContent = `${v.total}/40 · ${v.deals} of 3 sharks Deal`;
  navigator.vibrate?.(deal ? [40, 60, 80] : 60);
  await sleep(600);

  $('r-compliment').textContent = v.compliment;
  $('r-fix').textContent = v.fix;
  $('r-lesson-title').textContent = v.lesson.title;
  $('r-lesson-explain').textContent = v.lesson.explain;
  $('r-lesson-z').textContent = v.lesson.zenith;
  $('r-programme').textContent = v.programme;
  $('after').hidden = false;
  const card = await buildCard();
  $('card-img').src = card.url;
  // Leaderboard + big-screen end: only after the TV reveal has finished, because a board post ends the turn and
  // the TV would switch to the next player's nickname mid-reveal (CHECK-13 F4). The server enforces it too.
  await sleep(Math.max(0, TV_REVEAL_MS - (performance.now() - st.tvRevealAt)));
  if (v.btoken) {
    const b = await postBoard(v.btoken);
    if (b?.ok && b.rank) { $('r-board').hidden = false; $('r-board').textContent = `Aaj ke leaderboard pe #${b.rank}!`; }
  }
  if (st.turn && st.stage?.rewardToken) { const t = st.turn; st.turn = null; try { await st.stage.rewardToken(t); } catch { /* optional */ } }
}

$('unlock').addEventListener('click', async () => {
  if (HERO) setTimeout(() => document.querySelector('[data-pz="gate-unlock"]')?.click(), 2000);
  await gate('shark', { reward: 'Scorecard, sharks ka faisla aur tumhara mini-MBA lesson' });
  reveal();
});
$('share').addEventListener('click', () => { if (st.revealed && st.card) shareCard(st.card, { filename: 'zenith-ai-sharks.png' }); });
$('friends').addEventListener('click', () => { if (st.revealed && st.card) sendToFriends(st.card, { text: 'Maine AI Sharks ko apna startup idea pitch kiya! Tum bhi try karo:', filename: 'zenith-ai-sharks.png' }); });
$('again').addEventListener('click', () => { st.mirror?.end(); show('s-intro'); });

// ---------- ?demo=hero: a fictional pitch, end to end, for filming ----------
if (HERO) {
  const hp = await hero();
  const v2 = hp?.profile?.v2;
  if (v2) {
    heroProfile = v2;
    $('hero-note').hidden = false;
    $('hero-note').textContent = hp.label;
    setTimeout(async () => {
      await modeReady;
      if (st.safetyMode !== 'live') {
        // Degraded: the hero pitch is played with chips (laundry idea type, first reviewed answer on every card).
        await openPick();
        await sleep(900);
        document.querySelectorAll('[data-pz="idea-type"]')[Math.max(0, (st.prompts || []).findIndex((g) => g.id === 'laundry'))]?.click();
        for (let i = 0; i < 4; i++) { await sleep(800); document.querySelector('[data-pz="card-chip"]')?.click(); await sleep(400); }
        await sleep(900);
        $('send').click();
        heroProfile = { answers: null, chips: true };
        return;
      }
      st.mode = 'text';
      st.coop = false;
      track('start', undefined, { once: true });
      st.cardMirror = tvMirror(null);
      show('s-cards');
      st.parts = {};
      for (let i = 0; i < 4; i++) {
        openCard(i);
        await typeInto({ set textContent(t) { $('card-text').value = t; } }, v2.parts[CARDS[i].id], { cps: 60 });
        await sleep(500);
        nextCard();
      }
      await sleep(900);
      $('send').click();
    }, 1200);
  }
}

// Test hook (Playwright) only with ?test=1 or hero, and it never tells the verdict before the reveal.
if (new URLSearchParams(location.search).has('test') || HERO) {
  window.__shark = { get screen() { return document.querySelector('.sk-screen:not([hidden])')?.id; }, get verdict() { return st.revealed ? st.v?.verdict : undefined; }, get source() { return st.revealed ? st.v?.source : st.q?.source; }, get panel() { return st.q?.panel; }, get card() { return cardIdx; }, get safetyMode() { return st.safetyMode; } };
}
