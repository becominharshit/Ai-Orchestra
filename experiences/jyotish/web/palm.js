// Palm overlay renderer, shared by the phone (app.js) and the counter TV (tv.js).
//   const pv = palmView({ src, size: 'phone' | 'tv' });  parent.append(pv.el);
//   pv.scan(true)            laser sweep + grid while the Hast Rekha Agent works
//   await pv.draw(lines)     glowing line-by-line trace with a travelling spark and labels
//   pv.show(lines)           same, no animation (result screens, catching up)
// Lines: [{ kind, strength|label, points:[{x,y}] }] in 0..1 image coordinates (see lib/palmlines.js).
// Also: constellation(signId) -> SVG element of the sign's stars.
import { LINE_INFO, smoothPath } from './lib/palmlines.js';
import { CONSTELLATIONS } from './lib/astro.js';

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const div = (cls, text) => { const e = document.createElement('div'); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STRENGTH_HI = { soft: 'halki', clear: 'saaf', deep: 'gehri' };
let uid = 0;

// label anchor per line: which point, and which side of it the chip sits
// (chosen so chips sit over the photo or to its right, never outside the left edge of the card)
const ANCHOR = { heart: [-1, 'r'], head: [0, 'r'], life: [-1, 'r'], fate: [1, 'l'] };

export function palmView({ src = '', size = 'phone', speed = 1, fit = false, fallback = '' } = {}) {
  const id = `jp${++uid}`;
  const el = div(`jp-palm jp-${size}`);
  const frame = div('jp-frame');
  const img = document.createElement('img');
  img.className = 'jp-img';
  img.alt = 'Palm photo';
  img.decoding = 'async';
  const svgEl = sv('svg', { class: 'jp-svg', viewBox: '0 0 1000 1333', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const defs = sv('defs');
  const glow = sv('filter', { id: `${id}-glow`, x: '-20%', y: '-20%', width: '140%', height: '140%' });
  glow.append(sv('feGaussianBlur', { stdDeviation: '9' }));
  defs.append(glow);
  const grid = sv('g', { class: 'jp-grid' });
  const gLines = sv('g', { class: 'jp-lines' });
  svgEl.append(defs, grid, gLines);
  const scanbar = div('jp-scanbar');
  const hud = div('jp-hud');
  for (const c of ['tl', 'tr', 'bl', 'br']) hud.appendChild(div(`jp-corner ${c}`));
  const status = div('jp-status');
  const labels = div('jp-labels');
  const clip = div('jp-clip');
  clip.append(img, scanbar);
  frame.append(clip, svgEl, labels, hud, status);
  el.appendChild(frame);

  let W = 1000;
  let H = 1333;
  let ar = 0.75;
  let loaded = Promise.resolve();
  // fit: size the frame to the largest box of the photo's aspect that fits inside el (TV panels)
  const fitFrame = () => {
    if (!fit) return;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const w = Math.min(b.width, b.height * ar);
    frame.style.width = `${w.toFixed(1)}px`;
    frame.style.height = `${(w / ar).toFixed(1)}px`;
  };
  if (fit) { el.classList.add('is-fit'); new ResizeObserver(fitFrame).observe(el); }
  function setSrc(s) {
    if (!s) { el.classList.add('no-img'); return; }
    el.classList.remove('no-img');
    loaded = new Promise((res) => {
      img.onload = () => {
        ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.75;
        W = 1000; H = Math.round(1000 / ar);
        svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
        frame.style.setProperty('--ar', String(ar));
        fitFrame();
        buildGrid();
        res();
      };
      // e.g. the TV copy of a photo expired (5 min): show the illustrated palm instead
      img.onerror = () => { if (fallback && img.src !== new URL(fallback, location.href).href) img.src = fallback; else { el.classList.add('no-img'); res(); } };
    });
    img.src = s;
  }
  function buildGrid() {
    grid.replaceChildren();
    const step = 1000 / 14;
    for (let x = step / 2; x < W; x += step) for (let y = step / 2; y < H; y += step) grid.appendChild(sv('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 2.2, style: `--d:${((x * 7 + y * 3) % 1000) / 1000}` }));
  }
  setSrc(src);

  function scan(on, text = 'HAST REKHA AGENT · SCANNING') {
    el.classList.toggle('is-scanning', !!on);
    status.textContent = on ? text : '';
  }

  function lineNodes(l, i) {
    const info = LINE_INFO[l.kind] || LINE_INFO.heart;
    const d = smoothPath(l.points, W, H);
    const g = sv('g', { class: `jp-line jp-${l.kind}`, style: `--c:${info.color};--i:${i}` });
    const halo = sv('path', { d, class: 'jp-halo', filter: `url(#${id}-glow)`, pathLength: '1' });
    const core = sv('path', { d, class: 'jp-core', pathLength: '1' });
    const hot = sv('path', { d, class: 'jp-hot', pathLength: '1' });
    const spark = sv('circle', { r: 11, class: 'jp-spark' });
    const mo = sv('animateMotion', { dur: `${1.15 / speed}s`, begin: 'indefinite', fill: 'freeze', path: d, calcMode: 'spline', keyTimes: '0;1', keySplines: '0.4 0 0.2 1' });
    spark.appendChild(mo);
    g.append(halo, core, hot, spark);
    // label chip
    const [ai, side] = ANCHOR[l.kind] || [0, 'r'];
    const p = l.points[(ai + l.points.length) % l.points.length];
    const chip = div(`jp-chip side-${side}`);
    chip.style.left = `${(p.x * 100).toFixed(1)}%`;
    chip.style.top = `${(p.y * 100).toFixed(1)}%`;
    chip.style.setProperty('--c', info.color);
    const strength = l.strength || l.label;
    chip.append(div('jp-chip-k', info.label), div('jp-chip-v', STRENGTH_HI[strength] || ''));
    return { g, mo, chip };
  }

  /** Animated trace, one line after another. Resolves when the last line is drawn. */
  async function draw(lines, { gap = 520 } = {}) {
    await loaded;
    gLines.replaceChildren();
    labels.replaceChildren();
    el.classList.add('is-drawing');
    const nodes = (lines || []).map(lineNodes);
    for (const [i, n] of nodes.entries()) {
      gLines.appendChild(n.g);
      // restart CSS animation per line
      n.g.classList.add('go');
      try { n.mo.beginElement(); } catch { /* SMIL missing: the stroke still draws */ }
      setTimeout(() => { labels.appendChild(n.chip); }, 780 / speed);
      if (i < nodes.length - 1) await sleep(gap / speed);
    }
    await sleep(1150 / speed);
    el.classList.remove('is-drawing');
    el.classList.add('is-drawn');
  }

  /** Static (already drawn) lines. */
  function show(lines) {
    loaded.then(() => {
      gLines.replaceChildren();
      labels.replaceChildren();
      for (const n of (lines || []).map(lineNodes)) { n.g.classList.add('static'); gLines.appendChild(n.g); labels.appendChild(n.chip); }
      el.classList.add('is-drawn');
    });
  }

  return { el, setSrc, scan, draw, show, get loaded() { return loaded; } };
}

/** The sign's constellation as an SVG (stars + lines), for headers and the TV. */
export function constellation(signId, { cls = 'jp-const' } = {}) {
  const c = CONSTELLATIONS[signId] || CONSTELLATIONS.leo;
  const s = sv('svg', { viewBox: '-10 -10 120 120', class: cls, 'aria-hidden': 'true' });
  const g = sv('g', { class: 'jp-const-lines' });
  for (const [a, b] of c.l) {
    const [x1, y1] = c.s[a];
    const [x2, y2] = c.s[b];
    g.appendChild(sv('line', { x1: x1 * 100, y1: y1 * 100, x2: x2 * 100, y2: y2 * 100, pathLength: '1' }));
  }
  const st = sv('g', { class: 'jp-const-stars' });
  c.s.forEach(([x, y], i) => st.appendChild(sv('circle', { cx: x * 100, cy: y * 100, r: i % 3 ? 2.6 : 3.6, style: `--i:${i}` })));
  s.append(g, st);
  return s;
}
