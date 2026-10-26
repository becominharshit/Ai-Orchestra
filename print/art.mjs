// Vector art for the print files: QR codes, the agent-network background, the agent orchestra
// diagram, crop marks. Everything is plain SVG so Chrome keeps it vector in the PDF.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const qrcode = require('./vendor/qrcode-generator.cjs');

const C = { ink: '#19173D', deep: '#0B0A22', a1: '#62BBF3', a2: '#4E308D', a3: '#9C86F2', paper: '#F7F6F2', qr: '#0B0A22' };
const f = (n) => Math.round(n * 100) / 100;

// Small seeded random generator so the art is the same on every run.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- QR ----------
// Error correction H, quiet zone 4 modules, optional Zenith shield in the middle (H tolerates ~30% damage;
// the shield pad covers about 6%). Decoding of every QR is checked by verify.mjs.
export function qrSvg(url, { shieldHref = null, quiet = 4, version = 0 } = {}) {
  const q = qrcode(version, 'H'); // version 0 = smallest that fits
  q.addData(url, 'Byte');
  q.make();
  const n = q.getModuleCount();
  const N = n + quiet * 2;
  const k = shieldHref ? (n >= 37 ? 9 : 7) : 0;          // pad size in modules (odd so it centres)
  const c0 = Math.floor((n - k) / 2), c1 = c0 + k;          // pad range in module coordinates
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c)) continue;
      if (k && r >= c0 && r < c1 && c >= c0 && c < c1) continue;
      d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  let mark = '';
  if (k) {
    const p = quiet + c0;
    mark = `<rect x="${p}" y="${p}" width="${k}" height="${k}" rx="1.2" fill="#fff"/>` +
      `<image href="${shieldHref}" x="${p + 1}" y="${p + 0.8}" width="${k - 2}" height="${k - 1.6}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" data-url="${url}">` +
    `<rect width="${N}" height="${N}" fill="#fff"/><path d="${d}" fill="${C.qr}"/>${mark}</svg>`;
  return { svg, modules: n, version: (n - 17) / 4, total: N };
}

// ---------- background: agent network + glows + horizon grid ----------
// w, h in mm (the bleed box). opts.scale sets line weights; opts.focus = {x, y} (mm) where the
// QR sits: scanner rings are drawn around it. opts.calm = [{x,y,w,h}] boxes where nodes are faded;
// opts.clear = boxes where no node is placed at all (chips, logo).
export function backgroundSvg(w, h, seed, opts = {}) {
  const s = opts.scale ?? 1;
  const R = rng(seed * 7919 + 13);
  const id = `g${seed}${Math.round(w)}`;
  const parts = [];
  parts.push(`<defs>
    <linearGradient id="${id}base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0B0A22"/><stop offset="0.55" stop-color="#16133A"/><stop offset="1" stop-color="#211552"/></linearGradient>
    <radialGradient id="${id}gA"><stop offset="0" stop-color="${C.a1}" stop-opacity="0.42"/><stop offset="1" stop-color="${C.a1}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}gB"><stop offset="0" stop-color="#6A45C9" stop-opacity="0.62"/><stop offset="1" stop-color="#4E308D" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}halo"><stop offset="0" stop-color="${C.a1}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.a1}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.a1}"/><stop offset="1" stop-color="${C.a3}"/></linearGradient>
    <linearGradient id="${id}fadeTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.a1}" stop-opacity="0"/><stop offset="1" stop-color="${C.a1}" stop-opacity="0.5"/></linearGradient>
  </defs>`);
  parts.push(`<rect width="${f(w)}" height="${f(h)}" fill="url(#${id}base)"/>`);
  // big soft glows
  parts.push(`<circle cx="${f(w * 0.98)}" cy="${f(h * 0.05)}" r="${f(Math.max(w, h) * 0.42)}" fill="url(#${id}gA)"/>`);
  parts.push(`<circle cx="${f(w * 0.02)}" cy="${f(h * 0.78)}" r="${f(Math.max(w, h) * 0.5)}" fill="url(#${id}gB)"/>`);
  const foci = opts.focus ? [].concat(opts.focus) : [];
  for (const fc of foci) parts.push(`<circle cx="${f(fc.x)}" cy="${f(fc.y)}" r="${f(fc.r0 * 2.2)}" fill="url(#${id}gB)" opacity="0.8"/>`);

  // horizon grid (bottom band), lines converge to a vanishing point
  if (opts.grid) {
    const top = opts.grid.top, bot = h, vx = w / 2, vy = top - (bot - top) * 0.9;
    const g = [];
    for (let i = 0; i <= 10; i++) {
      const t = Math.pow(i / 10, 1.9);
      const y = top + (bot - top) * t;
      g.push(`<line x1="0" y1="${f(y)}" x2="${f(w)}" y2="${f(y)}" stroke-opacity="${f(0.12 + 0.3 * t)}"/>`);
    }
    for (let i = -14; i <= 14; i++) {
      const xb = vx + i * (w / 7);
      const xt = vx + (xb - vx) * ((top - vy) / (bot - vy));
      g.push(`<line x1="${f(xt)}" y1="${f(top)}" x2="${f(xb)}" y2="${f(bot)}" stroke-opacity="0.32"/>`);
    }
    parts.push(`<g stroke="${C.a1}" stroke-width="${f(0.7 * s)}" fill="none">${g.join('')}</g>`);
    parts.push(`<rect x="0" y="${f(top - (bot - top) * 0.25)}" width="${f(w)}" height="${f((bot - top) * 0.25)}" fill="url(#${id}fadeTop)" opacity="0.35"/>`);
  }

  // scanner rings around the QR
  for (const fc of foci) {
    const { x, y, r0 } = fc;
    const rings = [];
    [1.0, 1.18, 1.42].forEach((m, i) => {
      const r = r0 * m;
      const dash = i === 1 ? `stroke-dasharray="${f(3 * s)} ${f(6 * s)}"` : (i === 2 ? `stroke-dasharray="${f(40 * s)} ${f(18 * s)} ${f(6 * s)} ${f(18 * s)}"` : '');
      rings.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${i === 0 ? C.a1 : C.a3}" stroke-opacity="${[0.55, 0.45, 0.3][i]}" stroke-width="${f([1.2, 0.9, 0.7][i] * s)}" ${dash}/>`);
    });
    // tick marks on the outer ring
    for (let a = 0; a < 360; a += 6) {
      const rad = (a * Math.PI) / 180, r1 = r0 * 1.55, r2 = r1 + (a % 30 === 0 ? 9 : 4) * s;
      rings.push(`<line x1="${f(x + r1 * Math.cos(rad))}" y1="${f(y + r1 * Math.sin(rad))}" x2="${f(x + r2 * Math.cos(rad))}" y2="${f(y + r2 * Math.sin(rad))}" stroke="${C.a1}" stroke-opacity="0.35" stroke-width="${f(0.6 * s)}"/>`);
    }
    parts.push(rings.join(''));
  }

  // agent network: dart-throwing points, each linked to its nearest neighbours
  // same visual density at every size: node size scales with s, so count scales with 1/s^2
  const count = opts.nodes ?? Math.round(((w * h) / (1860 * s * s)) * (opts.density ?? 1));
  const minD = Math.sqrt((w * h) / count) * 0.62;
  const pts = [];
  let tries = 0;
  while (pts.length < count && tries++ < count * 60) {
    const p = { x: R() * w, y: R() * h };
    const blocked = (opts.clear || []).some((b) => p.x > b.x - minD * 0.5 && p.x < b.x + b.w + minD * 0.5 && p.y > b.y - minD * 0.5 && p.y < b.y + b.h + minD * 0.5);
    if (!blocked && pts.every((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 > minD * minD)) pts.push(p);
  }
  const calm = opts.calm || [];
  const vis = (p) => {
    let v = 1;
    for (const b of calm) {
      const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
      const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
      const d = Math.hypot(dx, dy);
      v = Math.min(v, 0.18 + 0.82 * Math.min(1, d / (minD * 1.2)));
    }
    return v;
  };
  const edges = new Set();
  const E = [];
  pts.forEach((p, i) => {
    const near = pts.map((q, j) => [j, (q.x - p.x) ** 2 + (q.y - p.y) ** 2]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 2 + (R() < 0.35 ? 1 : 0));
    for (const [j, d2] of near) {
      if (Math.sqrt(d2) > minD * 2.6) continue;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (edges.has(key)) continue;
      edges.add(key);
      E.push([p, pts[j]]);
    }
  });
  const lines = E.map(([p, q]) => {
    const v = Math.min(vis(p), vis(q));
    return `<line x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(q.x)}" y2="${f(q.y)}" stroke-opacity="${f(0.36 * v)}"/>`;
  });
  parts.push(`<g stroke="url(#${id}edge)" stroke-width="${f(0.75 * s)}" fill="none">${lines.join('')}</g>`);
  // data packets travelling on some edges
  const packets = E.filter(() => R() < 0.22).map(([p, q]) => {
    const t = 0.2 + R() * 0.6;
    const v = Math.min(vis(p), vis(q));
    return `<circle cx="${f(p.x + (q.x - p.x) * t)}" cy="${f(p.y + (q.y - p.y) * t)}" r="${f(1.3 * s)}" fill="#fff" fill-opacity="${f(0.85 * v)}"/>`;
  });
  parts.push(packets.join(''));
  // nodes; about 1 in 8 is a "hot" agent with a halo and a ring
  const nodes = pts.map((p) => {
    const v = vis(p);
    const hot = R() < 0.13;
    const r = (hot ? 3.2 : 1.2 + R() * 1.4) * s;
    let out = '';
    if (hot) out += `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r * 6)}" fill="url(#${id}halo)" opacity="${f(v)}"/>` +
      `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r * 2.3)}" fill="none" stroke="${C.a1}" stroke-width="${f(0.6 * s)}" stroke-opacity="${f(0.7 * v)}"/>`;
    out += `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}" fill="${hot ? '#fff' : (R() < 0.5 ? C.a1 : C.a3)}" fill-opacity="${f((hot ? 1 : 0.75) * v)}"/>`;
    return out;
  });
  parts.push(nodes.join(''));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" preserveAspectRatio="none">${parts.join('')}</svg>`;
}

// ---------- agent orchestra: hub + named agents, the stall's signature visual ----------
export function orchestraSvg(orch, W, H, { fs = 20, seed = 1 } = {}) {
  const id = `o${seed}${Math.round(W)}`;
  const pad = fs * 0.75;
  const tw = (t, size, k = 0.6) => t.length * size * k + pad * 2;
  const n0 = orch.agents.length;
  const cx = W / 2, cy = n0 === 5 ? H * 0.4 : H / 2;
  const hubFs = fs * 1.15;
  const hubW = tw(orch.hub, hubFs, 0.6) + fs * 0.6, hubH = hubFs * 2.4;
  const n = orch.agents.length;
  const angles = n === 5 ? [-150, -30, 30, 150, 90] : n === 4 ? [-148, -32, 32, 148] : n === 3 ? [-155, -25, 90] : orch.agents.map((_, i) => -90 + (360 / n) * i);
  const pills = orch.agents.map((name, i) => {
    const a = (angles[i] * Math.PI) / 180;
    const w = tw(name, fs) + fs * 0.9, h = fs * 2.1; // + room for the status dot
    let x = cx + (W / 2 - w / 2 - 2) * Math.cos(a) * 1.0;
    let y = cy + (H / 2 - h / 2 - 2) * Math.sin(a) * 1.0;
    x = Math.min(W - w / 2 - 1, Math.max(w / 2 + 1, x));
    y = Math.min(H - h / 2 - 1, Math.max(h / 2 + 1, y));
    return { name, x, y, w, h };
  });
  const out = [];
  out.push(`<defs>
    <linearGradient id="${id}hub" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.a1}"/><stop offset="1" stop-color="${C.a2}"/></linearGradient>
    <radialGradient id="${id}glow"><stop offset="0" stop-color="${C.a1}" stop-opacity="0.45"/><stop offset="1" stop-color="${C.a1}" stop-opacity="0"/></radialGradient>
  </defs>`);
  // glow kept inside the diagram box (nothing hidden past the edge, so the 220 mm standee check measures real ink)
  out.push(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(Math.min(hubW * 0.95, W / 2))}" ry="${f(Math.min(hubH * 1.9, cy, H - cy))}" fill="url(#${id}glow)"/>`);
  // links: from the hub edge to the agent's inner edge, dashed, with a packet dot halfway
  pills.forEach((p) => {
    let sx, sy, ex, ey, c1x, c1y, c2x, c2y;
    if (Math.abs(p.x - cx) < 1) {              // agent straight below or above the hub
      const dir = p.y > cy ? 1 : -1;
      sx = cx; sy = cy + dir * hubH / 2; ex = p.x; ey = p.y - dir * p.h / 2;
      c1x = sx; c1y = (sy + ey) / 2; c2x = ex; c2y = (sy + ey) / 2;
    } else {
      const dir = p.x > cx ? 1 : -1;
      sx = cx + dir * hubW / 2; sy = cy; ex = p.x - dir * p.w / 2; ey = p.y;
      const k = Math.max(18, Math.abs(ex - sx) * 0.6);
      c1x = sx + dir * k; c1y = sy; c2x = ex - dir * k; c2y = ey;
    }
    out.push(`<path d="M${f(sx)} ${f(sy)} C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(ex)} ${f(ey)}" fill="none" stroke="${C.a1}" stroke-opacity="0.25" stroke-width="${f(fs * 0.4)}" stroke-linecap="round"/>`);
    out.push(`<path d="M${f(sx)} ${f(sy)} C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(ex)} ${f(ey)}" fill="none" stroke="${C.a1}" stroke-width="${f(fs * 0.1)}" stroke-dasharray="${f(fs * 0.45)} ${f(fs * 0.25)}"/>`);
    const t = 0.5, u = 1 - t;
    const bx = u ** 3 * sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t ** 3 * ex;
    const by = u ** 3 * sy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t ** 3 * ey;
    out.push(`<circle cx="${f(bx)}" cy="${f(by)}" r="${f(fs * 0.24)}" fill="#fff"/><circle cx="${f(bx)}" cy="${f(by)}" r="${f(fs * 0.55)}" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="${f(fs * 0.06)}"/>`);
    out.push(`<circle cx="${f(sx)}" cy="${f(sy)}" r="${f(fs * 0.18)}" fill="${C.a1}"/>`);
  });
  // agent pills
  pills.forEach((p) => {
    out.push(`<rect x="${f(p.x - p.w / 2)}" y="${f(p.y - p.h / 2)}" width="${f(p.w)}" height="${f(p.h)}" rx="${f(p.h / 2)}" fill="#120F33" stroke="${C.a1}" stroke-width="${f(fs * 0.08)}"/>`);
    out.push(`<circle cx="${f(p.x - p.w / 2 + pad * 0.9)}" cy="${f(p.y)}" r="${f(fs * 0.2)}" fill="#7CF0C5"/>`);
    out.push(`<text x="${f(p.x + fs * 0.45)}" y="${f(p.y + fs * 0.36)}" font-size="${f(fs)}" font-weight="700" fill="#fff" text-anchor="middle" font-family="Plus Jakarta Sans">${esc(p.name)}</text>`);
  });
  // hub
  out.push(`<rect x="${f(cx - hubW / 2)}" y="${f(cy - hubH / 2)}" width="${f(hubW)}" height="${f(hubH)}" rx="${f(hubH / 2)}" fill="url(#${id}hub)"/>`);
  out.push(`<rect x="${f(cx - hubW / 2 - fs * 0.35)}" y="${f(cy - hubH / 2 - fs * 0.35)}" width="${f(hubW + fs * 0.7)}" height="${f(hubH + fs * 0.7)}" rx="${f(hubH / 2 + fs * 0.35)}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="${f(fs * 0.05)}"/>`);
  out.push(`<text x="${f(cx)}" y="${f(cy - hubFs * 0.18)}" font-size="${f(fs * 0.55)}" font-weight="800" fill="#fff" fill-opacity="0.85" letter-spacing="${f(fs * 0.08)}" text-anchor="middle" font-family="Plus Jakarta Sans">ORCHESTRATOR</text>`);
  out.push(`<text x="${f(cx)}" y="${f(cy + hubFs * 0.72)}" font-size="${f(hubFs)}" font-weight="800" fill="#fff" text-anchor="middle" font-family="Plus Jakarta Sans">${esc(orch.hub)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}mm" height="${f(H)}mm">${out.join('')}</svg>`;
}

// ---------- crop marks + slug text (outside the bleed, black hairlines) ----------
export function marksSvg({ sheetW, sheetH, slug, trimW, trimH, bleed, label, folds = [] }) {
  const o = slug, gap = bleed + 1, len = slug - gap - 1.5, sw = 0.1;
  const L = [];
  const xs = [o, o + trimW], ys = [o, o + trimH];
  for (const x of xs) for (const y of ys) {
    const left = x === o, top = y === o;
    // horizontal mark
    L.push(`<line x1="${f(left ? x - gap - len : x + gap)}" y1="${f(y)}" x2="${f(left ? x - gap : x + gap + len)}" y2="${f(y)}"/>`);
    // vertical mark
    L.push(`<line x1="${f(x)}" y1="${f(top ? y - gap - len : y + gap)}" x2="${f(x)}" y2="${f(top ? y - gap : y + gap + len)}"/>`);
  }
  for (const fy of folds) {
    const y = o + fy;
    L.push(`<line x1="${f(o - gap - len)}" y1="${f(y)}" x2="${f(o - gap)}" y2="${f(y)}" stroke-dasharray="1.2 0.8"/>`);
    L.push(`<line x1="${f(o + trimW + gap)}" y1="${f(y)}" x2="${f(o + trimW + gap + len)}" y2="${f(y)}" stroke-dasharray="1.2 0.8"/>`);
  }
  const fsz = Math.min(3, slug * 0.22);
  const foldText = folds.map((fy) => `<text x="${f(o + trimW + gap)}" y="${f(o + fy - 1)}" font-size="${f(fsz * 0.8)}">FOLD</text>`).join('');
  return `<svg class="marks" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(sheetW)} ${f(sheetH)}">` +
    `<g stroke="#000" stroke-width="${sw}" fill="none">${L.join('')}</g>` +
    `<g fill="#000" font-family="Plus Jakarta Sans" font-weight="600">` +
    `<text x="${f(o + 4)}" y="${f(o - gap - fsz * 0.6)}" font-size="${f(fsz)}">${esc(label)}</text>${foldText}</g></svg>`;
}

// Simple camera glyph for the Instagram handle (outline only, not the brand logo).
export function camGlyph(size, color = '#fff') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${f(size)}mm" height="${f(size)}mm"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="${color}" stroke-width="2.2"/><circle cx="12" cy="12" r="4.3" fill="none" stroke="${color}" stroke-width="2.2"/><circle cx="17.4" cy="6.6" r="1.4" fill="${color}"/></svg>`;
}

// Corner brackets around the QR card (scanner frame look).
export function bracketsSvg(w, h, arm, stroke, color = C.a1) {
  const s = stroke / 2;
  const p = [
    `M${s} ${arm}V${s}H${arm}`, `M${w - arm} ${s}H${w - s}V${arm}`,
    `M${w - s} ${h - arm}V${h - s}H${w - arm}`, `M${arm} ${h - s}H${s}V${h - arm}`,
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" width="${f(w)}mm" height="${f(h)}mm"><path d="${p.join('')}" fill="none" stroke="${color}" stroke-width="${f(stroke)}" stroke-linecap="round"/></svg>`;
}

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
