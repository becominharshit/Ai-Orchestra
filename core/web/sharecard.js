// Story-sized share card (1080x1920 PNG) drawn on a canvas, with Zenith branding and the handle.
//   const card = await makeShareCard({ exp: 'jyotish', kicker: 'Mera AI Bhavishya', title: 'Leo energy', lines: ['...'], footer: 'For fun only' });
//   img.src = card.url;  await shareCard(card, { filename: 'zenith-jyotish.png' });
import { qrCanvas } from './qr.js';
import { track, EXP, config } from './kit.js';

export const W = 1080;
export const H = 1920;
const HANDLE = '@zenith_school_of_ai';
const SITE = 'play.zenithschool.ai';
// Footer line for every experience (CONTRACT 12.9)
const FOOTER = '@zenith_school_of_ai · B.Tech in AI + mini-MBA. Ek degree, KRMU ki.';

/** The public link friends get. Opening it counts one anonymous ref_visit (see kit.js). */
export function shareLink(exp = EXP, base = 'https://play.zenithschool.ai') {
  return `${base}/${exp}?ref=share&exp=${encodeURIComponent(exp)}`;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxW && last.length) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

function seeded(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

async function fontsReady() {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load('600 110px Newsreader'),
    document.fonts.load('italic 500 60px Newsreader'),
    document.fonts.load('800 50px "Plus Jakarta Sans"'),
    document.fonts.load('500 44px "Plus Jakarta Sans"'),
    document.fonts.load('700 30px "JetBrains Mono"'),
  ]).catch(() => {});
}

/**
 * @param {{exp?:string, kicker?:string, title:string, lines?:string[], footer?:string, url?:string}} o
 * @returns {Promise<{canvas:HTMLCanvasElement, blob:Blob, url:string, width:number, height:number, layout:object}>}
 * layout = { titleSize, lineSize, rowsPerLine, given, rendered, shortened }: how the text was fitted.
 */
export async function makeShareCard({ exp = EXP, kicker = '', title = '', lines = [], footer = '', url } = {}) {
  await fontsReady();
  // Public text rule (CONTRACT 13.2): title and lines come from publicText() results ({ pt, text }) your server returned.
  const strict = (await config()).publicTextStrict;
  const pub = (v, what) => {
    if (v && typeof v === 'object' && typeof v.text === 'string' && v.pt) return v.text;
    if (typeof v === 'string' && v && !/^-?\d+(\.\d+)?$/.test(v)) {
      console.warn(`[sharecard] ${what} is a plain string, not publicText()${strict ? '; dropped (PUBLIC_TEXT_STRICT)' : ''}`);
      return strict ? null : v;
    }
    return typeof v === 'string' ? v : null;
  };
  const sources = [title, ...(lines || []), kicker, ...(footer === 'For fun only' ? [] : [footer])].filter((v) => v !== '');
  title = pub(title, 'title') || '';
  lines = (lines || []).map((l, i) => pub(l, `line ${i + 1}`)).filter((l) => l !== null);
  // test/ops hook: which public-text ids built this card, and how many plain strings were dropped (no text kept)
  (globalThis.__pzShareCards ||= []).push({ pt: sources.filter((v) => v && typeof v === 'object' && v.pt).map((v) => v.pt), dropped: sources.filter((v) => typeof v === 'string' && v && !/^-?\d+(\.\d+)?$/.test(v)).length, strict });
  // kicker and footer too: publicText only ("For fun only" is a core line and always allowed)
  const CORE_OK = new Set(['For fun only']);
  const pubOrCore = (v, what) => (typeof v === 'string' && CORE_OK.has(v) ? v : pub(v, what));
  kicker = pubOrCore(kicker, 'kicker') || '';
  footer = pubOrCore(footer, 'footer') || '';
  const link = url || shareLink(exp);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#120c3d'); bg.addColorStop(0.55, '#0a0826'); bg.addColorStop(1, '#050411');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const orb = (x, y, r, c) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
  orb(930, 260, 620, 'rgba(98,187,243,0.36)');
  orb(120, 1500, 760, 'rgba(143,107,255,0.34)');
  orb(980, 1700, 420, 'rgba(255,143,192,0.16)');
  // grid
  ctx.strokeStyle = 'rgba(150,165,255,0.07)'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }

  // agent network motif (top band): an orchestrator hub with 8 agents on an orbit
  const rnd = seeded(exp + title);
  const hub = [W / 2, 360];
  const grad = ctx.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#7CCBFF'); grad.addColorStop(1, '#A88BFF');
  ctx.save();
  ctx.strokeStyle = 'rgba(159,216,255,0.22)'; ctx.lineWidth = 2; ctx.setLineDash([6, 12]);
  ctx.beginPath(); ctx.ellipse(hub[0], hub[1], 380, 170, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  const pts = Array.from({ length: 8 }, (_, i) => { const a = ((i * 45 + 22.5 + (rnd() - 0.5) * 8) * Math.PI) / 180; return [hub[0] + Math.cos(a) * 380, hub[1] + Math.sin(a) * 170]; });
  for (const p of pts) {
    const lg = ctx.createLinearGradient(hub[0], hub[1], p[0], p[1]); lg.addColorStop(0, 'rgba(159,216,255,0.75)'); lg.addColorStop(1, 'rgba(168,139,255,0.15)');
    ctx.strokeStyle = lg; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hub[0], hub[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
  }
  pts.forEach((p, i) => {
    orb(p[0], p[1], 54, i % 2 ? 'rgba(168,139,255,0.5)' : 'rgba(124,203,255,0.5)');
    ctx.fillStyle = '#100c36'; ctx.beginPath(); ctx.arc(p[0], p[1], 19, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = i % 2 ? '#A88BFF' : '#7CCBFF'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#EAF6FF'; ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fill();
  });
  orb(hub[0], hub[1], 190, 'rgba(143,107,255,0.65)');
  ctx.fillStyle = '#1a1452'; ctx.beginPath(); ctx.arc(hub[0], hub[1], 62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = grad; ctx.lineWidth = 8; ctx.stroke();
  // spark in hub
  ctx.fillStyle = '#EAF6FF'; ctx.beginPath();
  const s = 30; ctx.moveTo(hub[0], hub[1] - s); ctx.lineTo(hub[0] + 8, hub[1] - 8); ctx.lineTo(hub[0] + s, hub[1]); ctx.lineTo(hub[0] + 8, hub[1] + 8); ctx.lineTo(hub[0], hub[1] + s); ctx.lineTo(hub[0] - 8, hub[1] + 8); ctx.lineTo(hub[0] - s, hub[1]); ctx.lineTo(hub[0] - 8, hub[1] - 8); ctx.closePath(); ctx.fill();

  // brand row
  ctx.textBaseline = 'alphabetic';
  orb(96, 132, 30, 'rgba(124,203,255,0.9)');
  ctx.fillStyle = '#9fd8ff'; ctx.beginPath(); ctx.arc(96, 132, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F1F2FF'; ctx.font = '600 46px Newsreader'; ctx.fillText('Zenith School of AI', 126, 148);

  // kicker + title. Text never disappears: the title shrinks (112 -> 72 px) before it is cut to 3 lines, and
  // the lines shrink (42 -> 30 px, then fewer wrapped rows) before any line is shortened with an ellipsis.
  const layout = { titleSize: 112, lineSize: 42, rowsPerLine: 3, given: lines.length, rendered: 0, shortened: 0 };
  let y = 700;
  ctx.font = '700 30px "JetBrains Mono"';
  ctx.fillStyle = '#9fd8ff';
  const k = String(kicker).toUpperCase();
  let kx = 80;
  for (const ch of k) { ctx.fillText(ch, kx, y); kx += ctx.measureText(ch).width + 5; }
  y += 40;
  let tl;
  for (const size of [112, 100, 88, 80, 72]) {
    ctx.font = `600 ${size}px Newsreader`;
    tl = wrap(ctx, title, W - 160, 3);
    layout.titleSize = size;
    if (!tl.length || !tl[tl.length - 1].endsWith('\u2026')) break; // fits without an ellipsis
  }
  const tg = ctx.createLinearGradient(80, 0, W - 80, 0); tg.addColorStop(0, '#FFFFFF'); tg.addColorStop(0.55, '#CFE9FF'); tg.addColorStop(1, '#C9B6FF');
  for (const l of tl) { y += layout.titleSize; ctx.fillStyle = tg; ctx.fillText(l, 80, y); }
  y += 56;

  // lines in glass cards: up to 6, all of them always drawn
  if (lines.length > 6) console.warn(`[sharecard] ${lines.length} lines given, only 6 fit a story card; the rest are not drawn`);
  const items = lines.slice(0, 6).map(String);
  const bottom = H - 450;
  const plan = (size, rows) => {
    ctx.font = `500 ${size}px "Plus Jakarta Sans"`;
    const lh = Math.round(size * 1.33);
    const wrapped = items.map((line) => wrap(ctx, line, W - 160 - 130, rows));
    const heights = wrapped.map((wl) => 46 + wl.length * lh + 18);
    const total = heights.reduce((a, b) => a + b, 0) + 24 * Math.max(0, items.length - 1);
    return { size, rows, lh, wrapped, heights, total };
  };
  let p = null;
  for (const [size, rows] of [[42, 3], [38, 3], [34, 3], [34, 2], [30, 2], [30, 1]]) { p = plan(size, rows); if (y + p.total <= bottom) break; }
  layout.lineSize = p.size;
  layout.rowsPerLine = p.rows;
  for (const [i, wl] of p.wrapped.entries()) {
    const hgt = p.heights[i];
    rr(ctx, 80, y, W - 160, hgt, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    ctx.strokeStyle = 'rgba(186,196,255,0.18)'; ctx.lineWidth = 2; ctx.stroke();
    const by = y + 23 + p.lh / 2 + 8;
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(146, by, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b0a24'; ctx.font = '800 30px "Plus Jakarta Sans"'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), 146, by + 11); ctx.textAlign = 'left';
    ctx.font = `500 ${p.size}px "Plus Jakarta Sans"`; ctx.fillStyle = '#F1F2FF';
    wl.forEach((l, j) => ctx.fillText(l, 210, y + 46 + p.size * 0.95 + j * p.lh));
    if (wl.length && wl[wl.length - 1].endsWith('\u2026')) layout.shortened += 1;
    layout.rendered += 1;
    y += hgt + 24;
  }

  // footer label (e.g. For fun only)
  const fy = H - 420;
  if (footer) {
    ctx.font = '800 30px "Plus Jakarta Sans"';
    const fw = ctx.measureText(footer).width + 56;
    rr(ctx, 80, fy, fw, 60, 30);
    const fg = ctx.createLinearGradient(80, 0, 80 + fw, 0); fg.addColorStop(0, '#FFE08A'); fg.addColorStop(1, '#FFC15E');
    ctx.fillStyle = fg; ctx.fill();
    ctx.fillStyle = '#1b1640'; ctx.fillText(footer, 108, fy + 41);
  }

  // bottom block: handle, site, programme, QR
  const by = H - 300;
  // the public hero line (config) sits just above the bottom block
  const hero = (await config()).heroLine || '';
  if (hero) { ctx.fillStyle = 'rgba(222,226,255,0.85)'; ctx.font = '700 30px "Plus Jakarta Sans"'; ctx.textAlign = 'center'; ctx.fillText(hero, W / 2, by - 26); ctx.textAlign = 'left'; }
  rr(ctx, 60, by, W - 120, 240, 40);
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
  ctx.strokeStyle = 'rgba(186,196,255,0.2)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#FFFFFF'; ctx.font = '800 54px "Plus Jakarta Sans"'; ctx.fillText(HANDLE, 104, by + 92);
  ctx.fillStyle = '#9fd8ff'; ctx.font = '700 34px "JetBrains Mono"'; ctx.fillText(SITE, 104, by + 148);
  ctx.fillStyle = 'rgba(222,226,255,0.78)';
  let fsz = 26;
  do { ctx.font = `600 ${fsz}px "Plus Jakarta Sans"`; fsz -= 1; } while (ctx.measureText(FOOTER).width > W - 104 - 300 && fsz > 16);
  ctx.fillText(FOOTER, 104, by + 200);
  rr(ctx, W - 290, by + 30, 180, 180, 24); ctx.fillStyle = '#fff'; ctx.fill();
  qrCanvas(ctx, link, W - 280, by + 40, 160, { margin: 1 });

  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  return { canvas: cv, blob, url: URL.createObjectURL(blob), width: cv.width, height: cv.height, layout };
}

/** Share via the Web Share API (with the PNG file) or fall back to a download. Counts 'share'. */
export async function shareCard(card, { filename = `zenith-${EXP}.png`, text = `Try karo: ${SITE} ${HANDLE}`, exp = EXP } = {}) {
  const file = new File([card.blob], filename, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      track('share', undefined, { exp });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
  }
  const a = document.createElement('a');
  a.href = card.url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  track('share', undefined, { exp });
  return 'downloaded';
}

/**
 * "Doston ko bhejo": Web Share API with the PNG + text + link; else WhatsApp (wa.me) with text + link; else copy link.
 * Returns 'shared' | 'whatsapp' | 'copied' | 'cancelled'. Counts 'share'.
 */
export async function sendToFriends(card, { exp = EXP, text = 'Maine Zenith School of AI ka AI experience try kiya. Tum bhi khelo!', filename = `zenith-${EXP}.png` } = {}) {
  const link = shareLink(exp);
  const file = card ? new File([card.blob], filename, { type: 'image/png' }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file], text, url: link })) {
      await navigator.share({ files: [file], text, url: link });
      track('share', undefined, { exp });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ text, url: link });
      track('share', undefined, { exp });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
  }
  // No 'noopener' feature string: with it window.open always returns null and we could not detect a blocked popup.
  const wa = window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`, '_blank');
  if (wa) { try { wa.opener = null; } catch { /* ignore */ } track('share', undefined, { exp }); return 'whatsapp'; }
  try { await navigator.clipboard.writeText(link); } catch { /* nothing else to try */ }
  track('share', undefined, { exp });
  return 'copied';
}
