// AI Sharks TV hook (loaded by core/web/tv.js for /tv/shark?c=<n>). The camera moment:
//   - idle:   two sharks flank the QR, banner "AI SHARKS. ASLI PAISA NAHI."
//   - tank:   the 3 sharks on stage, the active one asks its question in a big speech bubble (custom 'ask'),
//             then shows "Jawab mila" (custom 'answered'). The visitor's answer is NEVER sent to the TV.
//   - scoring: the core Agent Orchestra shows the sharks working.
//   - result: score cards flip in one by one, total, then the DEAL / MAIN OUT HOON stamp slams in.
// Every animation is event driven, so staff replay (R, 1/2/5) re-runs the whole show.
import { avatar, talk, typeInto, SHARKS, SHARK, PERSONA } from './sharks.js';

const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = new URL('./tv.css', import.meta.url).href;
document.head.appendChild(css);

const IDS = ['vc', 'mkt', 'fin'];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ui = {};
let runToken = 0;

function buildTank(stage) {
  const tank = el('section', 'sk-tv-tank');
  const head = el('header', 'sk-tv-head');
  ui.kicker = el('div', 'sk-tv-kicker', 'AI SHARKS · LIVE PITCH');
  ui.title = el('h2', 'pz-display sk-tv-title', '');
  ui.host = el('p', 'sk-tv-host', '');
  head.append(ui.kicker, ui.title, ui.host);
  ui.bubble = el('div', 'sk-tv-bubble');
  ui.who = el('div', 'sk-tv-who', '');
  ui.q = el('p', 'sk-tv-q', '');
  ui.bubble.append(ui.who, ui.q);
  const seats = el('div', 'sk-tv-seats');
  ui.seatsEl = seats;
  setSeats(['vc', 'mkt', 'fin']);
  ui.status = el('div', 'sk-tv-status', '');
  ui.dots = el('div', 'sk-tv-dots');
  for (let i = 0; i < 3; i++) ui.dots.appendChild(el('i'));
  const foot = el('div', 'sk-tv-foot');
  foot.append(ui.dots, ui.status);
  tank.append(head, ui.bubble, seats, foot);
  stage.appendChild(tank);
  ui.tank = tank;
}

// The 3 sharks on stage: v1 (vc, mkt, fin) or this game's v2 panel (seth, riya, kabir, mummy).
function setSeats(ids) {
  const want = (ids || []).filter((id) => SHARK[id]).slice(0, 3);
  if (!want.length || (ui.ids && want.join() === ui.ids.join())) return;
  ui.ids = want;
  ui.seats = {};
  ui.seatsEl.replaceChildren();
  for (const id of want) {
    const s = SHARK[id];
    const seat = el('div', 'sk-tv-seat');
    seat.dataset.shark = id;
    const av = avatar(id);
    const plate = el('div', 'sk-tv-plate');
    plate.append(el('b', '', s.name), el('small', '', s.catch ? `"${s.catch}"` : s.role));
    const badge = el('div', 'sk-tv-badge', 'Jawab mila');
    seat.append(av, plate, badge);
    ui.seatsEl.appendChild(seat);
    ui.seats[id] = { seat, av };
  }
}

function buildIdle(stage) {
  const idle = el('div', 'sk-tv-idle');
  const left = el('div', 'sk-tv-idle-side left');
  left.append(avatar('vc'), el('div', 'sk-tv-idle-bubble', 'Market kitna bada hai?'));
  const right = el('div', 'sk-tv-idle-side right');
  right.append(avatar('fin'), el('div', 'sk-tv-idle-bubble', 'Ek order pe kitna bachega?'));
  const mid = el('div', 'sk-tv-idle-side mid');
  mid.append(avatar('mkt'), el('div', 'sk-tv-idle-bubble', 'Pehla customer kaun hai?'));
  idle.append(left, right, mid);
  stage.appendChild(idle);
  ui.idle = { left, right, mid };
}
// v2: the personas flank the QR with their catchphrases.
function idleV2() {
  const set = (side, id) => { const p = PERSONA[id]; side.replaceChildren(avatar(id), el('div', 'sk-tv-idle-bubble', p.catch)); };
  set(ui.idle.left, 'kabir'); set(ui.idle.right, 'seth'); set(ui.idle.mid, 'riya');
}

function buildBanner(stage) {
  const b = el('div', 'sk-tv-banner');
  b.append(el('span', 'sk-tv-banner-main', 'AI SHARKS. ASLI PAISA NAHI.'), el('span', 'pz-forfun', 'For fun only'));
  stage.appendChild(b);
}

function resetTank() {
  runToken += 1;
  ui.tank?.classList.remove('show');
  if (!ui.seats) return;
  for (const id of ui.ids) ui.seats[id].seat.className = 'sk-tv-seat';
  ui.bubble.classList.remove('show');
  ui.q.textContent = '';
  ui.status.textContent = '';
  [...ui.dots.children].forEach((d) => { d.className = ''; });
}

function setStep(step, n = 3) {
  while (ui.dots.children.length < n) ui.dots.appendChild(el('i'));
  while (ui.dots.children.length > n) ui.dots.lastChild.remove();
  [...ui.dots.children].forEach((d, j) => { d.className = j < step - 1 ? 'done' : j === step - 1 ? 'on' : ''; });
}

function onAsk({ id, step = 1, text = '' }, speed) {
  if (!SHARK[id] || !ui.seats[id]) return;
  ui.tank.classList.add('show');
  ui.tank.classList.remove('pitching');
  for (const k of ui.ids) {
    const s = ui.seats[k].seat;
    s.classList.toggle('active', k === id);
    s.classList.toggle('dim', k !== id);
  }
  setStep(step);
  ui.kicker.textContent = `AI SHARKS · SAWAAL ${step}/3`;
  ui.bubble.dataset.shark = id;
  ui.bubble.style.setProperty('--tail', `${[16.6, 50, 83.4][Math.max(0, ui.ids.indexOf(id))]}%`);
  ui.bubble.classList.remove('show'); void ui.bubble.offsetWidth; ui.bubble.classList.add('show');
  ui.who.textContent = SHARK[id].name;
  talk(ui.seats[id].av, Math.min(5000, text.length * 32) / speed);
  typeInto(ui.q, String(text), { cps: 36, speed });
  ui.status.textContent = 'Founder jawab de raha hai...';
}

function onAnswered({ id, step }) {
  if (!SHARK[id] || !ui.seats[id]) return;
  ui.seats[id].seat.classList.add('answered');
  ui.status.textContent = step >= 3 ? 'Teeno jawab mil gaye! Sharks score kar rahe hain...' : 'Jawab mil gaya! Agla shark ready...';
  setStep(step + 1);
}

// v2 pitch cards: the panel listens while the founder pitches card i of 4 (numbers only on the bus).
function onCard({ step = 1, items }, ctx) {
  // A new player's pitch cards: the previous player's verdict spotlight goes away.
  if (ctx?.spotlight) { ctx.spotlight.classList.remove('show'); ctx.spotlight.closest('.tv-frame')?.classList.remove('has-spot'); }
  setSeats((items || []).map((x) => x.id));
  ui.tank.classList.add('show', 'pitching');
  for (const k of ui.ids) { ui.seats[k].seat.className = 'sk-tv-seat listening'; }
  ui.bubble.classList.remove('show');
  ui.title.textContent = '';
  ui.host.textContent = '';
  ui.kicker.textContent = `AI SHARKS · PITCH CARD ${Math.max(1, Math.min(4, Number(step) || 1))}/4`;
  ui.title.textContent = ['Idea', 'Customer: kaun khareedega?', 'Problem: kyun zaroori hai?', 'Paisa: kaise kamaoge?'][Math.max(0, Math.min(3, (Number(step) || 1) - 1))];
  ui.status.textContent = 'Founder pitch kar raha hai...';
  setStep(Number(step) || 1, 4);
}

// ---------- result ----------
async function reveal(payload, ctx) {
  const token = ++runToken;
  const speed = ctx.speed || 1;
  const deal = payload.verdict === 'deal';
  const card = el('div', `sk-tv-reveal ${deal ? 'deal' : 'out'}`);
  const head = el('header', 'sk-tv-rhead');
  head.append(el('div', 'sk-tv-kicker', payload.kicker || 'AI SHARKS KA VERDICT'), el('h2', 'pz-display sk-tv-title', payload.title || ''));
  const row = el('div', 'sk-tv-rrow');
  const cols = {};
  const scores = Object.fromEntries((payload.scores || []).map((s) => [s.id, s]));
  const v2 = Array.isArray(payload.values);
  const RIDS = (payload.scores || []).map((s) => s.id).filter((id) => SHARK[id]).slice(0, 3);
  const ids = RIDS.length ? RIDS : IDS;
  for (const id of ids) {
    const s = scores[id] || {};
    const col = el('div', 'sk-tv-rcol');
    col.dataset.shark = id;
    const av = avatar(id);
    const name = el('b', 'sk-tv-rname', SHARK[id].name);
    const sc = el('div', 'sk-tv-rscore');
    const n = el('span', 'n', '?');
    if (v2) { n.textContent = s.label === 'DEAL' ? 'DEAL' : 'OUT'; n.classList.add('word'); } else sc.append(n, el('small', '', '/10'));
    const isIn = s.label === 'IN' || s.label === 'DEAL';
    const pill = el('span', `sk-tv-pill ${isIn ? 'in' : 'out'}`, v2 ? (isIn ? 'DEAL' : 'MAIN OUT HOON') : isIn ? 'MAIN IN' : 'MAIN OUT');
    const line = el('p', 'sk-tv-rline', s.line || '');
    const why = el('p', 'sk-tv-rwhy', s.why || '');
    col.append(av, name, sc, pill, line, why);
    row.appendChild(col);
    cols[id] = { col, n, av, score: Number(s.score) || 0, isIn };
  }
  const stamp = el('div', 'sk-tv-stamp', deal ? 'DEAL!' : 'MAIN OUT HOON');
  const bottom = el('div', 'sk-tv-rbottom');
  const meter = el('div', 'sk-tv-meter');
  const fill = el('i');
  meter.appendChild(fill);
  const total = el('div', 'sk-tv-total', '');
  const lesson = el('div', 'sk-tv-lesson', payload.lesson?.title ? `Mini-MBA lesson: ${payload.lesson.title}` : '');
  bottom.append(total, meter, lesson);
  // v2: the 4-axis scorecard bars.
  const axes = el('div', 'sk-tv-axes');
  const bars = [];
  if (v2) for (const a of payload.values.slice(0, 4)) {
    const ax = el('div', 'sk-tv-axis');
    const bar = el('i'); const b2 = el('b'); bar.appendChild(b2);
    const num = el('em', '', '0');
    ax.append(el('span', '', a.label || ''), bar, num);
    axes.appendChild(ax);
    bars.push({ b: b2, num, value: Number(a.value) || 0 });
  }
  card.classList.toggle('v2', v2);
  card.append(head, ...(v2 ? [axes] : []), row, stamp, bottom);
  ctx.spotlight.replaceChildren(card);
  ui.tank?.classList.remove('show');

  await wait(700 / speed);
  for (const x of bars) {
    if (token !== runToken) return;
    x.b.style.width = `${x.value * 10}%`;
    count(x.num, x.value, 500 / speed);
    await wait(380 / speed);
  }
  for (const id of ids) {
    if (token !== runToken) return;
    const c = cols[id];
    c.col.classList.add('open', (v2 ? c.isIn : c.score >= 7) ? 'in' : 'out');
    talk(c.av, 1100 / speed);
    if (!v2) count(c.n, c.score, 700 / speed);
    await wait(1100 / speed);
  }
  if (token !== runToken) return;
  const sum = Number(payload.score) || ids.reduce((t, id) => t + cols[id].score, 0);
  const max = Number(payload.max) || 30;
  total.textContent = v2 ? `${sum}/${max} · ${payload.ins ?? ''} of 3 sharks Deal` : `${sum}/${max} · ${payload.ins ?? ''} of 3 sharks in`;
  bottom.classList.add('show');
  fill.style.width = `${Math.round((sum / max) * 100)}%`;
  await wait(900 / speed);
  if (token !== runToken) return;
  card.classList.add('stamped');
  burst(card, deal);
}

function count(node, to, ms) {
  const t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    node.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  tick();
}

function burst(card, deal) {
  const b = el('div', 'sk-tv-burst');
  const colors = deal ? ['#3EE6A8', '#FFE08A', '#7CCBFF', '#fff'] : ['#FF8FC0', '#C9B6FF', '#7CCBFF', '#fff'];
  for (let i = 0; i < 28; i++) {
    const p = el('i');
    const a = (i / 28) * Math.PI * 2;
    const r = 18 + (i % 4) * 7;
    p.style.setProperty('--x', `${Math.cos(a) * r}em`);
    p.style.setProperty('--y', `${Math.sin(a) * r * 0.6}em`);
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${(i % 5) * 30}ms`;
    b.appendChild(p);
  }
  card.appendChild(b);
}

export default {
  mount(ctx) {
    ctx.stage.classList.add('sk-tv');
    buildIdle(ctx.stage);
    buildTank(ctx.stage);
    buildBanner(ctx.stage);
    fetch('/api/shark/config').then((r) => r.json()).then((c) => { if (c?.v2 && c?.v2ready) idleV2(); }).catch(() => {});
  },
  event(ev, ctx) {
    if (ev.t === 'init' || ev.t === 'reset') { resetTank(); return; }
    if (ev.t !== 'custom') return;
    const d = ev.data || {};
    if (ev.name === 'tank') {
      if (d.state === 'questions') {
        resetTank();
        setSeats(Array.isArray(d.items) ? d.items.map((x) => x.id) : ['vc', 'mkt', 'fin']);
        ui.tank.classList.remove('pitching');
        setStep(1, 3);
        ui.title.textContent = d.title || '';
        ui.host.textContent = d.host || '';
        ui.kicker.textContent = 'AI SHARKS · LIVE PITCH';
        ui.status.textContent = 'Sharks sawaal soch rahe hain...';
        ui.tank.classList.add('show');
      } else if (d.state === 'scoring') {
        ui.tank.classList.remove('show');
      }
    } else if (ev.name === 'ask') onAsk(d, ctx.speed || 1);
    else if (ev.name === 'answered') onAnswered(d);
    else if (ev.name === 'card') onCard(d, ctx);
  },
  result(payload, ctx) {
    reveal(payload, ctx);
    return true;
  },
  reset() { resetTank(); },
};
