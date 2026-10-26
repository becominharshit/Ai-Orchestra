// AI Startup Studio TV hook (CONTRACT 6 and 12.7).
//  - result(): the "company is born" spotlight, revealed agent by agent (Research, Product, Brand, Finance, Pitch).
//    Every string comes from the bus payload, which core already checked against our registered banks and templates.
//  - stagePanels(): "Aaj ki startups" in the idle loop (generated names only, from /api/startup/today).
import { MARKS, paletteVars } from './logo.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
let today = { rows: [] };
let made = 0; // startups made today (server-only count, see server.js /today)

function logo(i, mono) {
  const box = el('div', `stv-logo logo-${Number(i) || 0}`);
  const mark = el('span', 'ss-mark');
  mark.innerHTML = MARKS[Number(i)] || MARKS[0]; // fixed SVG from our own file, no visitor data
  box.append(mark, el('span', 'ss-mono', String(mono || '')));
  return box;
}

async function refresh() {
  try { const r = await fetch('/api/startup/today', { cache: 'no-store' }); if (r.ok) { today = await r.json(); made = Number(today.made) || 0; } } catch { /* keep the last list */ }
}

export default {
  mount(ctx) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/startup/tv.css';
    document.head.appendChild(link);
    refresh();
    setInterval(refresh, 20000);
  },

  result(p, ctx) {
    const card = el('div', 'stv-card');
    card.setAttribute('style', paletteVars(Number(p.palette) || 0));
    const left = el('div', 'stv-left');
    const brand = el('div', 'stv-brand stv-r', undefined);
    brand.dataset.step = '3';
    brand.append(logo(p.logo, p.mono), el('h2', 'stv-name', p.title || ''));
    const kick = el('div', 'stv-kicker', `${p.kicker || ''}`);
    const area = el('div', 'stv-area', p.area || '');
    const tag = el('p', 'stv-tag stv-r', p.tagline || ''); tag.dataset.step = '3';
    const pitch = el('blockquote', 'stv-pitch stv-r', p.pitch || ''); pitch.dataset.step = '5';
    left.append(kick, area, brand, tag, pitch);

    const right = el('div', 'stv-right');
    const block = (step, label, ...kids) => { const b = el('div', 'stv-sec stv-r'); b.dataset.step = String(step); b.append(el('div', 'stv-sec-k', label), ...kids); return b; };
    const feats = el('ol', 'stv-feat');
    for (const f of (p.features || []).slice(0, 3)) feats.appendChild(el('li', '', f));
    const tiles = el('div', 'stv-tiles');
    tiles.append(el('b', '', p.price || ''), el('span', '', p.margin || ''));
    right.append(
      block(1, 'RESEARCH', el('p', 'stv-big', p.market || '')),
      block(2, 'PRODUCT', feats),
      block(4, 'FINANCE', tiles, el('p', 'stv-rev', p.revenue || '')),
    );
    card.append(left, right);
    ctx.spotlight.replaceChildren(card);
    // agent by agent: Research, Product, Brand, Finance, Pitch (respects ?speed=)
    const sp = Number(ctx.speed) || 1;
    for (const r of card.querySelectorAll('.stv-r')) r.style.animationDelay = `${(0.35 + Number(r.dataset.step) * 0.75) / sp}s`;
    return true;
  },

  stagePanels() {
    if (!today.rows?.length) return [];
    return [{
      id: 'today',
      render(box) {
        box.classList.add('stv-today');
        const k = el('div', 'tv-idle-kicker', 'AAJ KI STARTUPS');
        k.prepend(el('span', 'tv-dot'));
        const grid = el('ol', 'stv-board');
        for (const r of today.rows.slice(0, 6)) {
          const li = el('li');
          li.setAttribute('style', paletteVars(Number(r.palette) || 0));
          const txt = el('div', 'stv-board-t');
          txt.append(el('b', '', r.title), el('span', '', r.area));
          li.append(logo(r.logo, r.mono), txt);
          grid.appendChild(li);
        }
        box.append(k, el('h2', 'pz-display tv-panel-title', 'Aaj stall pe bani startups'), grid, el('p', 'tv-hook', made > 0 ? `Aaj ki startups: ${made}` : 'Scan karo, apni startup 90 second mein'));
      },
    }];
  },

  reset() {},
};
