// "Career Forecast: Ideas 4.0" PDF, 3 A4 pages, made in Node with pdf-lib (no Chromium in the image).
// Visual structure of the Career Forecast PDF (07_Build/career-forecast web/src/pdf/Pages.tsx): sky band on top,
// running header (brand + title, page n of N), body, running footer; cover with the sky arch; career cards with
// the work split bar; a Zenith page in zenith.json wording; source line with year under every figure.
// No pay, no score, no college data. No personal data in the PDF (the visitor's first name is only in the
// WhatsApp file name), so the same area gives the same content.
import { DATA_VERSION, preview, zenithView, areaById, loadData, MODE_LABEL } from './data.js';
import { qrcode } from '../../../core/web/vendor/qrcode-generator.mjs';
import { pdfChecker } from './public.js';

let lib = null;
async function pdfLib() {
  // Loaded lazily: if experiences/career/node_modules is missing in an image, only the PDF send falls back to the batch.
  lib ||= await import('pdf-lib');
  return lib;
}

const W = 595.28;
const H = 841.89;
const M = 44; // side margin
const C = {
  ink: [0x19, 0x17, 0x3d], ink2: [0x45, 0x43, 0x6a], ink3: [0x5f, 0x5c, 0x7d], line: [0xe2, 0xe0, 0xea],
  sky1: [0x62, 0xbb, 0xf3], sky2: [0x4e, 0x30, 0x8d], tint: [0xee, 0xf1, 0xfb], paper: [0xf7, 0xf6, 0xf2],
  growBg: [0xdc, 0xf1, 0xeb], growFg: [0x0b, 0x5e, 0x50], chBg: [0xfb, 0xeb, 0xcb], chFg: [0x71, 0x47, 0x00],
  byAi: [0x62, 0xbb, 0xf3], withAi: [0x8f, 0x6b, 0xff], people: [0x19, 0x17, 0x3d],
};
const TOTAL_PAGES = 3;
export const PDF_TITLE = 'Career Forecast: Ideas 4.0';
const FEST_LINE = 'KRMU Ideas 4.0, 27-28 Oct 2026';

export async function buildPdf({ areaId, stopText = 'play.zenithschool.ai/career/stop', date = new Date() }) {
  const { PDFDocument, StandardFonts, rgb } = await pdfLib();
  const pv = preview(areaId);
  if (!pv) throw new Error('unknown area');
  const z = zenithView();
  const d = loadData();
  const doc = await PDFDocument.create();
  doc.setTitle(PDF_TITLE);
  doc.setAuthor('Zenith School of AI');
  doc.setSubject(`${pv.area.label}. Data ${DATA_VERSION}.`);
  doc.setProducer('play-zenith career studio');
  doc.setCreator('play-zenith');
  const f = { r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold), d: await doc.embedFont(StandardFonts.TimesRomanBold) };
  const col = (c) => rgb(c[0] / 255, c[1] / 255, c[2] / 255);
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

  // text helpers (standard fonts are WinAnsi: anything else becomes a plain fallback, never an error)
  const safe = (font, s) => [...String(s ?? '')].map((ch) => { try { font.encodeText(ch); return ch; } catch { return ch === '\u2014' || ch === '\u2013' ? '-' : '?'; } }).join('');
  const wrap = (font, size, s, maxW) => {
    const words = safe(font, s).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) <= maxW) cur = t; else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  // BRAIN rule: every string in the PDF is a registered bank line or template (lib/public.js). Anything else is refused.
  const checker = pdfChecker({ stopText });
  function text(p, s, x, y, { font = f.r, size = 11, color = C.ink, maxW, lh = 1.35, align = 'left', parts } = {}) {
    // parts: a line joined from several bank lines (the list of the area's other careers); each part is checked
    if (!(parts ? parts.every((x) => checker.accepts(x)) : checker.accepts(String(s)))) throw new Error('pdf: text is not a registered bank line or template');
    const lines = maxW ? wrap(font, size, s, maxW) : [safe(font, s)];
    lines.forEach((l, i) => {
      const w = font.widthOfTextAtSize(l, size);
      const xx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      p.drawText(l, { x: xx, y: y - i * size * lh, size, font, color: col(color) });
    });
    return y - lines.length * size * lh;
  }
  function skyBand(p, y, h, x0 = 0, x1 = W) {
    const n = 60;
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) p.drawRectangle({ x: x0 + i * w, y, width: w + 0.6, height: h, color: col(mix(C.sky1, C.sky2, i / (n - 1))) });
  }
  function wordmark(p, x, y, r) {
    // gradient disc approximated by rings, like the CF wordmark
    for (let i = 10; i >= 1; i--) p.drawCircle({ x, y, size: (r * i) / 10, color: col(mix(C.sky2, C.sky1, i / 10)) });
    p.drawCircle({ x, y, size: r * 0.36, color: col([255, 255, 255]) });
  }
  function qr(p, value, x, y, size) {
    const q = qrcode(0, 'M');
    q.addData(value);
    q.make();
    const n = q.getModuleCount();
    const cell = size / (n + 2);
    p.drawRectangle({ x, y, width: size, height: size, color: col([255, 255, 255]) });
    for (let r = 0; r < n; r++) for (let c2 = 0; c2 < n; c2++) {
      if (q.isDark(r, c2)) p.drawRectangle({ x: x + (c2 + 1) * cell, y: y + size - (r + 2) * cell, width: cell + 0.05, height: cell + 0.05, color: col(C.ink) });
    }
  }
  function shell(n) {
    const p = doc.addPage([W, H]);
    skyBand(p, H - 6, 6);
    if (n > 1) {
      wordmark(p, M + 7, H - 32, 7);
      text(p, PDF_TITLE, M + 20, H - 36, { font: f.b, size: 10.5 });
      text(p, `Page ${n} of ${TOTAL_PAGES}`, W - M, H - 36, { size: 10, color: C.ink3, align: 'right' });
    }
    p.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.8, color: col(C.line) });
    text(p, 'Career Forecast, by Zenith School of AI', M, 30, { size: 9, color: C.ink3 });
    text(p, 'zenithschool.ai', W / 2, 30, { size: 9, color: C.ink3, align: 'center' });
    text(p, 'A forecast, not a guarantee.', W - M, 30, { size: 9, color: C.ink3, align: 'right' });
    return p;
  }
  const day = `${date.getUTCDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][date.getUTCMonth()]} ${date.getUTCFullYear()}`;

  // ---------- page 1: cover ----------
  {
    const p = shell(1);
    wordmark(p, M + 14, H - 70, 14);
    text(p, 'Career Forecast', M + 36, H - 76, { font: f.d, size: 18 });
    text(p, 'by Zenith School of AI', W - M, H - 76, { size: 11, color: C.ink3, align: 'right' });
    let y = text(p, PDF_TITLE, M, H - 190, { font: f.d, size: 40, maxW: W - 2 * M, lh: 1.1 });
    y = text(p, `${pv.area.label}. ${FEST_LINE}.`, M, y - 14, { size: 15, color: C.ink2, maxW: W - 2 * M });
    text(p, day, M, y - 6, { size: 12, color: C.ink3 });
    // the sky arch (half disc drawn in vertical strips, gradient left to right)
    const cx = W / 2; const base = 330; const r = (W - 2 * M - 120) / 2;
    const strips = 260;
    for (let i = 0; i < strips; i++) {
      const x0 = cx - r + (2 * r * i) / strips;
      const mid = x0 + r / strips - cx;
      const h = Math.sqrt(Math.max(0, r * r - mid * mid)) * 0.62;
      p.drawRectangle({ x: x0, y: base, width: (2 * r) / strips + 0.6, height: h, color: col(mix([0x72, 0xc2, 0xf4], [0x60, 0x45, 0x98], i / (strips - 1))) });
    }
    p.drawRectangle({ x: M, y: base - 3, width: W - 2 * M, height: 3, color: col(C.ink) });
    // what is inside
    let iy = text(p, 'Is PDF mein', M, 280, { font: f.b, size: 12.5 });
    const inside = [
      `1. ${pv.area.label}: top careers, kaam ka split (Done by AI / Done with AI / Led by people) aur skills that hold.`,
      '2. Zenith School of AI: B.Tech in AI + mini-MBA, one KRMU degree.',
    ];
    for (const l of inside) iy = text(p, l, M, iy - 6, { size: 11, color: C.ink2, maxW: W - 2 * M - 150 });
    qr(p, 'https://zenithschool.ai', W - M - 112, 92, 112);
    text(p, 'zenithschool.ai', W - M - 56, 78, { size: 9.5, color: C.ink3, align: 'center' });
    text(p, 'Poora forecast (sab careers, skills by year, course check): Career Studio counter ya zenithschool.ai.', M, 120, { size: 10.5, color: C.ink2, maxW: W - 2 * M - 150 });
  }

  // ---------- page 2: top careers of the area ----------
  {
    const p = shell(2);
    let y = text(p, `Top careers: ${pv.area.label}`, M, H - 92, { font: f.d, size: 26, maxW: W - 2 * M, lh: 1.15 });
    y = text(p, 'Badge = hiring outlook for 2030. Bar = how the work splits between AI and people.', M, y - 4, { size: 10.5, color: C.ink2, maxW: W - 2 * M });
    y -= 10;
    for (const c of pv.careers) {
      const top = y;
      const inner = W - 2 * M - 28;
      const lineLines = wrap(f.r, 10.5, c.line, inner).length;
      const holdLines = wrap(f.r, 10, `Skills that hold: ${c.holds.join(', ')}`, inner).length;
      const hgt = 26 + lineLines * 14 + 58 + holdLines * 13.5 + 22;
      p.drawRectangle({ x: M, y: top - hgt, width: W - 2 * M, height: hgt, borderColor: col(C.line), borderWidth: 1.2, color: col([255, 255, 255]) });
      let cy = top - 22;
      text(p, c.title, M + 14, cy, { font: f.b, size: 14 });
      const badge = c.badge;
      const bw = f.b.widthOfTextAtSize(badge, 9.5) + 16;
      const bx = W - M - 14 - bw;
      p.drawRectangle({ x: bx, y: cy - 5, width: bw, height: 17, color: col(badge === 'Growing' ? C.growBg : C.chBg) });
      text(p, badge, bx + 8, cy, { font: f.b, size: 9.5, color: badge === 'Growing' ? C.growFg : C.chFg });
      cy = text(p, c.line, M + 14, cy - 18, { size: 10.5, color: C.ink2, maxW: inner });
      // split bar
      const bxs = M + 14; const bwid = inner; const by = cy - 16;
      const parts = [['by_ai', C.byAi], ['with_ai', C.withAi], ['led_by_people', C.people]];
      let x = bxs;
      for (const [k, cc] of parts) { const w = (bwid * c.split[k]) / 100; p.drawRectangle({ x, y: by, width: w, height: 12, color: col(cc) }); x += w; }
      let lx = bxs;
      for (const [k, cc] of parts) {
        p.drawRectangle({ x: lx, y: by - 16, width: 8, height: 8, color: col(cc) });
        const label = `${MODE_LABEL[k]} ${c.split[k]}%`;
        text(p, label, lx + 12, by - 15, { size: 9.5, color: C.ink });
        lx += f.r.widthOfTextAtSize(label, 9.5) + 30;
      }
      cy = text(p, `Skills that hold: ${c.holds.join(', ')}`, M + 14, by - 34, { size: 10, color: C.ink, maxW: inner, lh: 1.35 });
      text(p, `Source: ${c.split.tip}`, M + 14, cy - 4, { size: 8.5, color: C.ink3 });
      y = top - hgt - 12;
    }
    const a = areaById(areaId);
    const shown = new Set(pv.careers.map((c) => c.id));
    const rest = [...a.careers].sort((x1, x2) => x1.rank - x2.rank).map((r) => d.byId.get(r.career_id)).filter((c) => c && !shown.has(c.id)).map((c) => c.title);
    if (rest.length) {
      y = text(p, 'Is area ke baaki careers (poore forecast mein):', M, y - 4, { font: f.b, size: 10.5 });
      text(p, rest.join(' · '), M, y - 3, { size: 10, color: C.ink2, maxW: W - 2 * M, parts: rest });
    }
  }

  // ---------- page 3: Zenith (wording exactly from zenith.json) ----------
  {
    const p = shell(3);
    let y = text(p, z.programmeLine, M, H - 92, { font: f.d, size: 24, maxW: W - 2 * M, lh: 1.15 });
    y = text(p, z.degreeLine, M, y - 4, { size: 11, color: C.ink2, maxW: W - 2 * M });
    y -= 12;
    for (const u of z.usps) {
      p.drawRectangle({ x: M, y: y - 4, width: 4, height: 14, color: col(C.sky2) });
      y = text(p, u.title, M + 14, y, { font: f.b, size: 12, maxW: W - 2 * M - 14 });
      for (const l of u.lines) y = text(p, l, M + 14, y - 2, { size: 10.5, color: C.ink2, maxW: W - 2 * M - 14 });
      y -= 12;
    }
    y = text(p, `${z.tooltip}. ${z.footer}`, M, y, { size: 9, color: C.ink3, maxW: W - 2 * M });
    // next step box
    const bh = 112;
    const bt = y - 18;
    p.drawRectangle({ x: M, y: bt - bh, width: W - 2 * M, height: bh, color: col(C.tint) });
    let by = text(p, 'Aage kya?', M + 16, bt - 22, { font: f.b, size: 12.5 });
    by = text(p, 'Poora Career Forecast dekho: sab careers, skills by year aur apne course ka check. Career Studio counter pe ya zenithschool.ai pe.', M + 16, by - 4, { size: 10.5, color: C.ink2, maxW: W - 2 * M - 32 });
    text(p, `Message STOP to stop, ya ${stopText}`, M + 16, by - 8, { font: f.b, size: 10.5, color: C.ink });
    text(p, `Data: ${DATA_VERSION}. Careers and work split: Zenith School of AI research, 2026.`, M, bt - bh - 18, { size: 8.5, color: C.ink3, maxW: W - 2 * M });
  }

  return Buffer.from(await doc.save({ useObjectStreams: true }));
}

/** WhatsApp file name: Career_Forecast_<FirstName>.pdf (letters and marks only), else Career_Forecast.pdf. */
export function pdfFileName(first) {
  const n = String(first || '').replace(/[^\p{L}\p{M}]/gu, '').slice(0, 40);
  return n ? `Career_Forecast_${n}.pdf` : 'Career_Forecast.pdf';
}
