// _sample web app: the reference flow every experience follows.
//   form -> Agent Orchestra (3 agents doing real work) -> result -> follow gate -> share card, mirrored to the TV.
import { api, track, tvMirror, tvToggle, hero, isHero, h, guardText } from '/core/kit.js';
import { Orchestra } from '/core/orchestra.js';
import { gate } from '/core/gate.js';
import { makeShareCard, shareCard, sendToFriends } from '/core/sharecard.js';
import { bigScreenButton, currentTurn, rewardToken } from '/core/stage.js';

const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of document.querySelectorAll('.sx-screen')) s.hidden = s.id !== id; window.scrollTo(0, 0); };

// Same computation as the server (Number Agent = real work in code).
function wordNumber(word) {
  const letters = word.replace(/[^a-z]/gi, '').toLowerCase();
  const sum = [...letters].reduce((s, ch) => s + (ch.charCodeAt(0) - 96), 0);
  let n = sum;
  while (n > 9) n = String(n).split('').reduce((a, b) => a + Number(b), 0);
  return { letters: letters.length, vowels: (letters.match(/[aeiou]/g) || []).length, sum, number: Math.max(1, n) };
}

const AGENTS = {
  orchestrator: { id: 'conductor', name: 'Vibe Conductor', role: 'Orchestrator', icon: 'spark' },
  agents: [
    { id: 'number', name: 'Number Agent', role: 'Word score, in code', icon: 'dice', label: 'NUMBER' },
    { id: 'vibe', name: 'Vibe Agent', role: 'Claude call', icon: 'brain', label: 'VIBE' },
    { id: 'card', name: 'Card Agent', role: 'Share card, canvas', icon: 'card', label: 'CARD' },
  ],
};

$('tv-toggle').replaceWith(tvToggle((on) => mirror?.setEnabled(on)));
// "Big screen pe khelo" (CONTRACT 12.4): pick a generated nickname, wait in the counter's queue, then play
bigScreenButton($('bigscreen'), { onTurn: () => $('form').requestSubmit() });
let mirror = null;
let result = null;

async function run(word, subject) {
  // Care check on the visitor's text BEFORE anything starts (no orchestra, nothing on the TV). CONTRACT 13.3.
  if (!guardText(word)) return;
  track('start');
  show('s-run');
  const orx = new Orchestra($('orx'), { title: 'Vibe Scanner', mode: 'phone', ...AGENTS });
  mirror = tvMirror(orx);
  const t0 = performance.now();

  // Number Agent: computed here. The log never echoes the typed word (it could be a name; the TV must not show it).
  orx.assign('vibe', 'Vibe report likho (Claude)');
  const call = api('vibe', { word, subject });
  const num = await orx.step('number', 'Word ka number nikalo', async () => {
    await new Promise((r) => setTimeout(r, 500));
    const n = wordNumber(word);
    orx.log('number', `${n.letters} letters, ${n.vowels} vowels, sum ${n.sum} -> number ${n.number}`);
    return n;
  });
  orx.handoff('number', 'vibe', `lucky number = ${num.number}`);
  orx.status('vibe', 'working');

  let res;
  try {
    res = await call;
  } catch (e) {
    orx.status('vibe', 'retry');
    throw e;
  }
  // TV text is templated (CONTRACT 13.2): no AI text in log lines; the server registered this template
  const src = { claude: 'claude reply', mock: 'mock reply', fixture: 'offline fixture', hero: 'hero demo fixture' }[res.source];
  orx.log('vibe', `${src} in ${(res.ms / 1000).toFixed(1)}s, ${res.vibe.lines.length} lines`);
  orx.status('vibe', 'done');
  orx.handoff('vibe', 'card', 'title + 3 lines');

  const card = await orx.step('card', 'Story card banao', async () => {
    // share cards are public: bank lines only ({ pt, text } from the server)
    const c = await makeShareCard({ kicker: res.public.kicker, title: res.public.title, lines: [res.public.superpower, ...res.public.lines.slice(0, 2)], footer: 'For fun only' });
    orx.log('card', `${c.width}x${c.height} PNG ready, ${Math.round(c.blob.size / 1024)} KB`);
    return c;
  });
  orx.done(`Vibe report ready in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  // TV-safe payload: no name, no typed word. Only the generated result.
  mirror.result({ kicker: 'Vibe report', title: res.public.title.text, lines: [res.public.superpower.text, ...res.public.lines.map((l) => l.text)], number: num.number, forFun: true });

  result = { ...res, card };
  await new Promise((r) => setTimeout(r, 1400));
  renderResult();
  // a big-screen turn ends with the reward token ("Counter pe dikhao")
  if (currentTurn()) rewardToken(currentTurn());
}

function renderResult() {
  const { vibe, source } = result;
  $('r-title').textContent = vibe.title;
  $('r-super').textContent = vibe.superpower;
  $('r-lines').replaceChildren(...vibe.lines.map((l, i) => h('li', { class: i === 2 ? 'locked' : '' }, l)));
  $('r-src').textContent = source === 'claude' ? 'Made live by Claude' : source === 'mock' ? 'Mock mode (no API key)' : 'Offline mode: ready-made answer';
  $('unlock').hidden = false;
  $('share-box').hidden = true;
  show('s-result');
  track('complete');
}

$('unlock').addEventListener('click', async () => {
  await gate('_sample', { reward: 'Tumhari secret vibe + story card' });
  $('r-lines').lastElementChild?.classList.remove('locked');
  $('unlock').hidden = true;
  $('card-img').src = result.card.url;
  $('share-box').hidden = false;
});
$('share').addEventListener('click', () => shareCard(result.card, { filename: 'zenith-vibe.png' }));
// "Doston ko bhejo": card + text + https://play.zenithschool.ai/_sample?ref=share&exp=_sample (counts a ref_visit when opened)
$('friends').addEventListener('click', () => sendToFriends(result.card, { exp: '_sample', filename: 'zenith-vibe.png' }));
$('again').addEventListener('click', () => { mirror?.end(); show('s-form'); });

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  run(String(f.get('word') || ''), String(f.get('subject') || 'coding')).catch((err) => {
    // err.care: the kit is showing the support card; nothing else to do. Otherwise a 4xx: back to the form.
    if (err.care) return;
    console.warn('[sample]', err.message);
    show('s-form');
  });
});

// ?demo=hero: fill the fictional profile and run the whole flow by itself (for filming).
if (isHero()) {
  const hp = await hero();
  if (hp) {
    const form = $('form');
    form.word.value = hp.profile.word || '';
    form.subject.value = hp.profile.subject || 'coding';
    $('hero-note').hidden = false;
    $('hero-note').textContent = hp.label;
    setTimeout(() => form.requestSubmit(), 1200);
  }
}
