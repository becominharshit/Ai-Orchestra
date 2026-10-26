// Palm line data: the four lines the Hast Rekha Agent traces, the stock path set (offline, mock, or when the
// photo is not a clear palm), validation of model output, and the SVG path maths shared by phone and TV.
// Coordinates are normalised to the photo: x 0..1 left to right, y 0..1 top to bottom.

export const LINE_KINDS = ['heart', 'head', 'life', 'fate'];
export const LINE_INFO = {
  heart: { label: 'Heart line', hi: 'Hriday rekha', color: '#FF8FC0' },
  head: { label: 'Head line', hi: 'Mastishk rekha', color: '#7CCBFF' },
  life: { label: 'Life line', hi: 'Jeevan rekha', color: '#FFC861' },
  fate: { label: 'Fate line', hi: 'Bhagya rekha', color: '#B99BFF' },
};
export const STRENGTHS = ['soft', 'clear', 'deep'];

// Stock set, drawn to match demo/hero-palm.svg (a left palm, fingers up, thumb on the right of the image).
// On a real photo it lands where these lines usually are when the palm fills the frame.
export const STOCK_LINES = [
  { kind: 'heart', strength: 'deep', points: [[0.27, 0.585], [0.36, 0.566], [0.46, 0.556], [0.55, 0.542], [0.62, 0.52], [0.67, 0.49]] },
  { kind: 'head', strength: 'clear', points: [[0.73, 0.6], [0.64, 0.622], [0.55, 0.646], [0.46, 0.672], [0.38, 0.7], [0.32, 0.725]] },
  { kind: 'life', strength: 'deep', points: [[0.73, 0.607], [0.67, 0.66], [0.635, 0.73], [0.63, 0.8], [0.645, 0.87], [0.67, 0.94]] },
  { kind: 'fate', strength: 'soft', points: [[0.5, 0.95], [0.505, 0.87], [0.51, 0.79], [0.515, 0.71], [0.52, 0.63], [0.525, 0.57]] },
];

function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Stock lines as the schema shape [{ kind, found, strength, points:[{x,y}], meaning }].
 * seed adds a small, deterministic wobble so two visitors do not get identical drawings. seed '' = exact set.
 */
export function stockLines(seed = '') {
  const rnd = seed ? rng(seed) : null;
  return STOCK_LINES.map((l) => {
    const dx = rnd ? (rnd() - 0.5) * 0.03 : 0;
    const dy = rnd ? (rnd() - 0.5) * 0.03 : 0;
    const strength = rnd ? STRENGTHS[Math.floor(rnd() * 3)] : l.strength;
    return {
      kind: l.kind,
      found: true,
      strength,
      points: l.points.map(([x, y], i) => ({ x: r3(clamp01(x + dx + (rnd && i ? (rnd() - 0.5) * 0.012 : 0))), y: r3(clamp01(y + dy + (rnd && i ? (rnd() - 0.5) * 0.012 : 0))) })),
      meaning: '',
    };
  });
}

/**
 * Validate and tidy model output. Keeps the 4 known kinds once each, clamps to 0..1, keeps 3 to 12 points,
 * and fills any missing or broken line from the stock set. Returns { lines, fromStock: number of lines replaced }.
 */
export function cleanLines(lines, seed = '') {
  const stock = stockLines(seed);
  let fromStock = 0;
  const out = LINE_KINDS.map((kind, i) => {
    const l = Array.isArray(lines) ? lines.find((x) => x && x.kind === kind) : null;
    const pts = Array.isArray(l?.points) ? l.points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({ x: r3(clamp01(p.x)), y: r3(clamp01(p.y)) })) : [];
    // a usable trace has 3+ points and is not collapsed into a dot
    const span = pts.length ? Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) : 0;
    if (pts.length < 3 || span < 0.08) { fromStock += 1; return { ...stock[i], meaning: typeof l?.meaning === 'string' ? l.meaning : '' }; }
    return {
      kind,
      found: l.found !== false,
      strength: STRENGTHS.includes(l.strength) ? l.strength : 'clear',
      points: pts.slice(0, 12),
      meaning: typeof l.meaning === 'string' ? l.meaning : '',
    };
  });
  return { lines: out, fromStock };
}

/** Smooth SVG path through the points (Catmull-Rom to cubic Bezier), in a w x h box. */
export function smoothPath(points, w = 1000, h = 1000) {
  const p = points.map((q) => [q.x * w, q.y * h]);
  if (p.length < 2) return '';
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** TV-safe, compact form for the bus: [{ kind, strength, points:[{x,y}] }] (no free text). */
export const tvPaths = (lines) => lines.map((l) => ({ kind: l.kind, label: l.strength, points: l.points }));
