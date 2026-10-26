// Build Your Own AI Agent, TV hook (/tv/agent?c=<counter from core's map>).
// CHECK-19 F1: every TV event of this experience is published by our server (core refuses them from phones), and this
// hook trusts nothing it is sent: a run shows only after its run id checks out with our server, and the result card
// is fetched from the server by that id (never taken from the bus payload). Every number is range-checked and every
// label length-checked before it is drawn. The words written in this file are fixed UI labels, never data.
import { iconSvg } from '/core/orchestra.js';
import { intIn, labelOk, cleanPayload } from './tvcheck.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const COLORS = ['#62BBF3', '#A88BFF', '#FFC861', '#5EEAD4', '#FF8FC0'];
const ICON = [[/Lookup/, 'search'], [/Calculator/, 'chart'], [/Calendar/, 'clock'], [/Note/, 'pen']];
let strip = null;
let runId = null; // the verified run of the session on screen
const clear = () => { strip?.remove(); strip = null; };
const hold = (ctx, on) => ctx.live?.classList.toggle('agt-hold', on);
async function check(id) {
  if (!intIn(id, 100000000, 999999999)) return null;
  try { const r = await fetch(`/api/agent/tv/${id}`, { cache: 'no-store' }); return r.ok ? r.json() : null; } catch { return null; }
}

export default {
  mount() {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/agent/tv.css';
    document.head.appendChild(l);
  },
  event(ev, ctx) {
    if (ev.t === 'init' || ev.t === 'reset') { clear(); runId = null; hold(ctx, true); return; }
    if (ev.t === 'custom' && ev.name === 'run') {
      const id = ev.data?.id;
      check(id).then((r) => { if (r?.ok) { runId = id; hold(ctx, false); } });
      return;
    }
    if (ev.t === 'custom' && ev.name === 'plan') {
      clear();
      strip = el('div', 'agt-strip');
      strip.appendChild(el('b', '', 'Plan'));
      const steps = (Array.isArray(ev.data?.tags) ? ev.data.tags : []).filter(labelOk).slice(0, 6);
      steps.forEach((t, i) => { const s = el('span', 'agt-dot'); s.dataset.label = t; s.appendChild(iconSvg(ICON.find(([re]) => re.test(t))?.[1] || 'spark', 20)); s.appendChild(el('i', '', String(i + 1))); strip.appendChild(s); });
      strip.appendChild(el('strong', 'agt-now', steps[0] || ''));
      ctx.live.appendChild(strip);
      return;
    }
    // light up the strip step that is running (one plan step per tool assignment, in order)
    if (strip && ev.t === 'assign' && ev.id !== 'planner' && ev.id !== 'check') {
      const dots = [...strip.querySelectorAll('.agt-dot')];
      const at = dots.findIndex((s) => !s.classList.contains('done'));
      if (at >= 0) {
        dots.forEach((s, i) => s.classList.toggle('on', i === at));
        dots[at].classList.add('done');
        strip.querySelector('.agt-now').textContent = dots[at].dataset.label;
      }
    }
  },
  result(p, ctx) {
    clear();
    ctx.spotlight.replaceChildren();
    const id = p?.id;
    if (!intIn(id, 100000000, 999999999)) return true; // not one of ours: show nothing
    check(id).then((r) => { const clean = r?.ok ? cleanPayload(r.payload) : null; if (clean) render(clean, ctx); });
    return true;
  },
  reset(ctx) { clear(); runId = null; hold(ctx, false); },
};

function render(p, ctx) {
  const card = el('div', 'agt-res');
  const left = el('section', 'agt-agent');
  const av = el('div', 'agt-av'); av.appendChild(iconSvg(p.icon, 64));
  const head = el('div', 'agt-head');
  head.append(el('div', 'agt-kicker', p.kicker), el('h2', 'pz-display agt-name', p.title), el('div', 'agt-role', p.subtitle));
  const top = el('div', 'agt-top'); top.append(av, head);
  left.appendChild(top);
  const bars = el('div', 'agt-bars');
  p.scores.forEach((v, i) => {
    const row = el('div', 'agt-barrow');
    const track = el('i'); const fill = el('b'); fill.style.width = `${(v / 4) * 100}%`; track.appendChild(fill);
    row.append(el('span', '', p.labels[i * 2]), track, el('span', 'r', p.labels[i * 2 + 1]));
    bars.appendChild(row);
  });
  left.appendChild(bars);
  const tools = el('div', 'agt-tools');
  for (const t of p.tags) tools.appendChild(el('span', '', t));
  left.appendChild(tools);
  const right = el('section', 'agt-task');
  right.appendChild(el('div', 'agt-kicker', 'Pehla task'));
  const stats = el('div', 'agt-stats');
  for (const s of p.stats) { const d = el('div'); d.append(el('b', '', String(s.value)), el('small', '', s.label)); stats.appendChild(d); }
  right.appendChild(stats);
  if (p.rows.length) {
    const grid = el('div', 'agt-grid');
    const cols = Math.max(...p.rows.map((r) => r.items.length), 1);
    grid.style.setProperty('--cols', cols);
    p.rows.forEach((r, d) => {
      const row = el('div', `agt-row${r.level ? ' light' : ''}`);
      row.appendChild(el('em', '', `D${d + 1}`));
      for (let j = 0; j < cols; j++) { const c = el('i'); const it = r.items[j]; if (it !== undefined) c.style.background = COLORS[it]; else c.className = 'empty'; row.appendChild(c); }
      grid.appendChild(row);
    });
    right.appendChild(grid);
    const legend = el('div', 'agt-legend');
    p.skills.forEach((s, i) => { const x = el('span', '', s); x.style.setProperty('--c', COLORS[i]); legend.appendChild(x); });
    right.appendChild(legend);
  } else if (p.skills.length) {
    const legend = el('div', 'agt-legend');
    p.skills.forEach((s, i) => { const x = el('span', '', s); x.style.setProperty('--c', COLORS[i]); legend.appendChild(x); });
    right.appendChild(legend);
  }
  for (const l of p.lines) right.appendChild(el('div', 'agt-line', l));
  card.append(left, right);
  ctx.spotlight.replaceChildren(card);
}
