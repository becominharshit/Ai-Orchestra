// Builds print/PRINT_SPEC.pdf (print v5, counter map v4): the one document for the printer, and for Avi to
// approve before ordering. Page 1: purpose, recommendation, decisions. Page 2: go/no-go. Then sizes, notes, copy, files.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ALL, COUNTERS, FALLBACKS, WALL, SIZES, QUANTITIES, HANDLE, PROGRAMME, HERO_LINE, HERO_LINE_SHORT, PHOTO_CUE, pad } from './counters.mjs';
import { esc } from './art.mjs';

// Naive RGB -> CMYK (no ICC profile). Only a starting point for the printer: marked as an estimate.
function cmyk(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const k = 1 - Math.max(r, g, b);
  const c = (x) => (k >= 1 ? 0 : Math.round(((1 - x - k) / (1 - k)) * 100));
  return `C${c(r)} M${c(g)} Y${c(b)} K${Math.round(k * 100)}`;
}

// Suggested quantities per group (inference; Avi confirms).
const QTY = [
  { group: 'Counter sets (8 counters)', items: [['standee', 1], ['tent', 2], ['poster', 1]], of: () => COUNTERS },
  { group: 'Fallback tents (3 designs)', items: [['tent', 2]], of: () => FALLBACKS },
  { group: 'Live Projects side wall', items: [['posterA2', 2], ['poster', 2]], of: () => WALL },
];

const MATERIAL = {
  standee: 'Roll-up film or blockout PVC-free media, 200 to 250 micron, matte; standard 85 x 200 cm roll-up stand',
  tent: '300 to 350 gsm matte card, scored at the fold',
  poster: '170 to 250 gsm matte paper, or mounted on 5 mm foam board',
  posterA2: '170 to 250 gsm matte paper, or mounted on 5 mm foam board',
};

export async function buildSpec(browser, manifest, results, { here, slides = [] }) {
  const res = (f) => results.find((r) => r.file === f);
  const allOk = results.every((r) => r.ok) && slides.every((s) => s.ok);
  const qrCount = results.reduce((n, r) => n + r.qrs.length, 0) + slides.length;
  const tag = (c) => (c.fallback ? ' <b class="fb">FALLBACK</b>' : c.id === 0 ? ' <b class="wall">WALL</b>' : c.flagship ? ' <span class="new">NEW</span>' : '');
  const byKey = (k) => ALL.find((c) => c.key === k);

  const sizesRows = Object.entries(SIZES).map(([k, s]) => `<tr><td><b>${esc(s.label)}</b></td><td>${s.trimW} x ${s.trimH} mm</td><td>${s.bleed} mm all sides</td>
    <td>${s.trimW + 2 * s.slug} x ${s.trimH + 2 * s.slug} mm</td><td>${esc(MATERIAL[k])}</td></tr>`).join('');
  let grand = {};
  const qtyRows = QTY.map((g) => {
    const list = g.of();
    const cells = g.items.map(([size, n]) => { grand[size] = (grand[size] || 0) + n * list.length; return `${n * list.length} x ${esc(SIZES[size].label)} (${n} each)`; }).join('<br>');
    return `<tr><td><b>${esc(g.group)}</b></td><td>${list.map((c) => esc(c.name) + (c.fallback ? ` (${c.chip ?? 'counter ' + pad(c.id)})` : '')).join(', ')}</td><td>${cells}</td></tr>`;
  }).join('');
  const grandRow = `<tr><td><b>Total</b></td><td></td><td><b>${Object.entries(grand).map(([s, n]) => `${n} x ${esc(SIZES[s].label)}`).join('<br>')}</b></td></tr>`;

  const fileRows = manifest.map((m) => {
    const r = res(m.file);
    const roleCell = (fn) => r.qrs.map((q) => `${q.role}: ${fn(q)}`).join('<br>');
    const ok = (v, q) => (v === q.expect ? 'OK' : 'FAIL');
    return `<tr><td class="mono">${esc(path.basename(m.file))}</td><td>${m.counter ? pad(m.counter) + ' ' : ''}${esc(m.name)}${tag(byKey(m.key))}</td>
      <td class="mono">${[...new Set(r.qrs.map((q) => q.expect))].map(esc).join('<br>')}</td>
      <td>${roleCell((q) => `${q.codeMm} mm v${(q.modules - 17) / 4}`)}</td>
      <td>${roleCell((q) => `${ok(q.print.jsqr, q)} / ${ok(q.print.zxing, q)}`)}</td>
      <td>${roleCell((q) => `${q.phonePass} (${q.phone[0].distanceM} to ${q.phone[q.phone.length - 1].distanceM} m)`)}</td><td>${r.ok ? 'OK' : 'FAIL'}</td></tr>`;
  }).join('') + slides.map((s) => `<tr><td class="mono">${esc(path.basename(s.file))}<br>${esc(path.basename(s.pdf))}</td><td>${esc(byKey(s.key).name)} <b class="wall">SLIDE</b></td>
      <td class="mono">${esc(s.expect)}</td><td>${s.qrPx} px</td><td>${s.jsqr === s.expect ? 'OK' : 'FAIL'} / ${s.zxing === s.expect ? 'OK' : 'FAIL'}</td><td>full frame</td><td>${s.ok ? 'OK' : 'FAIL'}</td></tr>`).join('');

  const copyRows = ALL.map((c) => `<tr><td>${c.id ? pad(c.id) : 'wall'}</td><td><b>${esc(c.name)}</b>${tag(c)}</td><td>${esc(c.hook)}${c.sub ? `<br><span class="muted">${esc(c.sub)}</span>` : ''}</td>
    <td>${c.labels.map(esc).join('<br>') || '<span class="muted">none</span>'}</td><td class="mono">${esc(c.qr.url)}${c.follow ? `<br>+ follow QR` : ''}</td></tr>`).join('');

  const shot = (name) => pathToFileURL(path.join(here, '..', 'docs', 'shots', 'TASK-08', `${name}.png`)).href;
  const thumbs = COUNTERS.map((c) => `<figure><img src="${shot(`standee_${c.key}`)}"><figcaption>${pad(c.id)}</figcaption></figure>`).join('');
  const fbThumbs = FALLBACKS.map((c) => `<figure class="wide"><img src="${shot(`tent_${c.key}`)}"><figcaption>${esc(c.name)} (${esc(c.chip ?? 'counter ' + pad(c.id))})</figcaption></figure>`).join('');
  const files = (c, sizes) => sizes.map((k) => `<span class="mono">${esc(SIZES[k].file(c))}</span>`).join('<br>');
  const goRow = (id) => {
    const main = COUNTERS.find((c) => c.id === id);
    const fbs = FALLBACKS.filter((f) => f.fallbackFor.includes(main.key));
    return `<tr><td><b>${pad(id)}</b></td><td><b>GO</b>: ${esc(main.name)} runs.<br><span class="muted">Set up its standee, tents and poster (already printed).</span></td><td>${files(main, main.sizes)}</td></tr>
      <tr><td></td><td><b class="fb">NO-GO</b>: put the ${esc(main.name)} standee, tents and poster away. Put 2 fallback tents on the table, either:</td>
      <td>${fbs.map((f) => `<b>${esc(f.name)}</b> (QR ${esc(f.qr.url)})<br>${files(f, f.sizes)}`).join('<br><i>or</i><br>')}</td></tr>`;
  };

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Print spec v5: Zenith stall, KRMU Ideas 4.0</title>
<link rel="stylesheet" href="${pathToFileURL(path.join(here, 'templates', 'base.css')).href}">
<style>
@page { size: A4; margin: 14mm 14mm 14mm 14mm; }
html, body { background: #fff; }
body { color: var(--ink); font-size: 9.4pt; line-height: 1.42; }
h1 { font-family: Newsreader, serif; font-weight: 600; font-size: 23pt; line-height: 1.1; margin-bottom: 2mm; }
h2 { font-family: Newsreader, serif; font-weight: 600; font-size: 14pt; margin: 6mm 0 2mm; padding-top: 2.5mm; border-top: 0.8mm solid; border-image: linear-gradient(90deg,#62BBF3,#4E308D) 1; }
.band { height: 2.2mm; background: linear-gradient(90deg,#62BBF3,#4E308D); border-radius: 1mm; margin-bottom: 5mm; }
.sub { color: #5b5a72; }
.box { background: #F7F6F2; border-radius: 3mm; padding: 3mm 4mm; margin: 3mm 0; }
.box b { color: #4E308D; }
.rec { background: #19173D; color: #fff; border-radius: 3mm; padding: 3.5mm 4.5mm; margin: 3mm 0; font-weight: 700; font-size: 10.5pt; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0; font-size: 8.2pt; }
th, td { border-bottom: 0.25mm solid #dcdae6; padding: 1.4mm 1.6mm; text-align: left; vertical-align: top; }
th { background: #F7F6F2; font-weight: 700; }
tr, .box, .rec { page-break-inside: avoid; } h2 { page-break-after: avoid; }
.mono { font-family: Menlo, monospace; font-size: 7pt; word-break: break-all; }
.muted { color: #5b5a72; }
ul { margin: 1mm 0 1mm 5mm; } li { margin: 0.6mm 0; }
.chk li { list-style: none; margin-left: -4mm; } .chk li:before { content: "\\2610  "; }
.thumbs { display: flex; gap: 2mm; margin: 2mm 0; flex-wrap: wrap; } .thumbs figure { margin: 0; text-align: center; font-size: 7pt; color: #5b5a72; }
.thumbs img { width: 21mm; border-radius: 1mm; display: block; } .thumbs .wide img { width: 56mm; }
.ok { color: #1b7f4b; font-weight: 800; } .bad, .fb { color: #b3261e; font-weight: 800; } .wall, .new { color: #4E308D; font-weight: 800; }
.newpage { page-break-before: always; }
</style></head><body>
<div class="band"></div>
<h1>Print spec v5: Zenith stall, KRMU Ideas 4.0</h1>
<p class="sub">Print v5, counter map v4 · 8 counter sets, 3 fallback tents, Live Projects side wall · built ${new Date().toISOString().slice(0, 10)} by the print task (TASK-08) · print deadline 26 Oct 2026, 12:00 IST</p>
<div class="rec">Recommend: print the new standees for 2 and 4 now, plus the A4 fallback tents (cheap), so the order is not blocked on the 26 Oct 12:00 go/no-go.</div>
<div class="box"><b>Purpose.</b> This document tells the printer exactly what to print, at what size and on what material, and lets Avi approve the copy and quantities before the order goes out.
All ${manifest.length} print PDFs are vector, true to size, with 3 mm bleed, crop marks and TrimBox/BleedBox set; the Live Projects loop slide is a 1920 x 1080 PNG (plus PDF) for a spare TV.
QR check: <span class="${allOk ? 'ok' : 'bad'}">${results.filter((r) => r.ok).length + slides.filter((s) => s.ok).length}/${results.length + slides.length} files pass</span>, ${qrCount} QR codes decoded back to the exact URL by two decoders.</div>
<h2>What is needed from Avi</h2>
<ul class="chk">
<li>Approve the recommendation above, then send the order by 26 Oct, 12:00 with one standee proof first.</li>
<li>Approve the copy per counter (table "Copy and QR"), counter map v4: 1 AI Jyotish, 2 AI Startup Studio (new), 3 AI Sharks, 4 Build Your Own AI Agent (new), 5 Career Studio, 6 Squad Reel Studio, 7 AI ya Asli?, 8 AI Jyotish.</li>
<li>Every counter standee and tent also carries the follow QR (instagram.com/zenith_school_of_ai) and the photo-frame cue "${esc(PHOTO_CUE)}". Photo printouts are dropped.</li>
<li>Live Projects is a side-wall set (A2 + A3 posters, follow QR, no company or brand names until approvals) plus a 16:9 loop slide if a spare TV exists.</li>
<li>Confirm quantities (suggested below) and pick the printer and material.</li>
<li>Logo: the files use the official PNG from Website/Pics (4686 px wide, sharp at roll-up size). If a vector logo exists, send it and the files are rebuilt in one command.</li>
</ul>
<h2 class="newpage">Which file to use (go/no-go, 26 Oct 12:00)</h2>
<p>Counters 2 and 4 carry new experiences that go live only if they pass their checks at 26 Oct, 12:00, the same time as the printer deadline. Print their sets now (recommended) together with the cheap fallback tents. At go/no-go the team only decides what to set up at the counter:</p>
<table><tr><th>Counter</th><th>Outcome</th><th>Files</th></tr>${goRow(2)}${goRow(4)}</table>
<p><b>The generic "AI Experience" tent</b> (QR to the hub ${esc(FALLBACKS[0].qr.url)}) works at counter 2 or 4. Files whose name contains <b class="fb">FALLBACK</b> are set out only on a no-go.</p>
<div class="thumbs">${fbThumbs}</div>
<h2 class="newpage">Sizes, bleed, material</h2>
<table><tr><th>Item</th><th>Finished (trim)</th><th>Bleed</th><th>PDF page incl. marks</th><th>Material (suggested)</th></tr>${sizesRows}</table>
<h2>Quantities (suggested)</h2>
<table><tr><th>Group</th><th>Designs</th><th>Quantity</th></tr>${qtyRows}${grandRow}</table>
<p class="muted">Sizes from the TASK-08 brief and the lead's v5 brief. Quantities are a suggestion (inference): one standee and one poster per counter, two tents per counter and per fallback design (one per table side), two A2 and two A3 for the side wall. Change in spec.mjs (QTY) if needed.</p>
<h2>Production notes</h2>
<ul>
<li><b>Do not scale, crop or recolour the QR codes.</b> They are vector, dark on white, error correction H. The smallest standee main QR code area is ${Math.min(...results.filter((r) => r.size === 'standee').flatMap((r) => r.qrs.filter((q) => q.role === 'main').map((q) => q.codeMm)))} mm wide, excluding the white quiet zone (brief asks for at least 120 mm). The smaller follow QR on standees and tents is meant for close range (about 1 m and 25 cm).</li>
<li><b>Roll-up standee, cassette:</b> roll-up cassettes hide up to 200 mm at the bottom. Nothing is printed in the bottom 220 mm of the trim except background (the lowest text sits ${Math.min(...results.filter((r) => r.size === 'standee').map((r) => r.clearBottomMm))} mm above the bottom trim edge, measured on every file). The top 50 mm is clear for the clamp rail. If the stand needs more than 2000 mm of media, extend the bottom background; never scale or squash the art.</li>
<li><b>Finish:</b> matte everywhere. Gloss glares under stall lights, on camera and in phone scanners.</li>
<li><b>A4 table tent:</b> print single-sided, score and fold on the FOLD marks (the middle). The top half is upside down on purpose, so both sides read upright when folded.</li>
<li><b>A2 posters</b> are the A3 artwork scaled up as vector (no quality loss).</li>
<li><b>PDF boxes:</b> TrimBox = finished size, BleedBox = trim + 3 mm. Crop marks and the file label sit outside the bleed.</li>
</ul>
<h2>Colour (RGB to CMYK)</h2>
<p>The PDFs are RGB (sRGB), exported from the HTML sources. Please convert in your RIP to your press or flex profile with relative colorimetric intent and black point compensation, and print one proof.
The stage background is a deep navy (#0B0A22 to #211552), not black: keep it as a rich navy, do not flatten it to 100% K.</p>
<table><tr><th>Brand colour</th><th>RGB hex</th><th>Approx. CMYK (estimate, naive conversion)</th><th>Note</th></tr>
<tr><td>Zenith ink</td><td>#19173D</td><td>${cmyk('#19173D')}</td><td>text on light, base of the stage background</td></tr>
<tr><td>Gradient start (sky)</td><td>#62BBF3</td><td>${cmyk('#62BBF3')}</td><td>accents, rings, network lines</td></tr>
<tr><td>Gradient end (violet)</td><td>#4E308D</td><td>${cmyk('#4E308D')}</td><td>most likely to shift; check on the proof</td></tr>
<tr><td>Label yellow</td><td>#FFE27A</td><td>${cmyk('#FFE27A')}</td><td>"For fun only" chips, photo-frame cue</td></tr>
<tr><td>QR modules</td><td>#0B0A22 on white</td><td>${cmyk('#0B0A22')}</td><td>keep maximum contrast</td></tr></table>
<p class="muted">The CMYK values are an estimate from a plain formula, not an ICC conversion. The printer's proof is the reference.</p>
<h2>The 8 counter standees</h2>
<div class="thumbs">${thumbs}</div>
<h2>Copy and QR per design (for Avi's approval)</h2>
<table><tr><th>#</th><th>Design</th><th>Hook (Hinglish)</th><th>Labels</th><th>QR opens</th></tr>${copyRows}</table>
<p class="muted">Every file also carries the steps, ${esc(HANDLE)}, "${esc(PROGRAMME)}", zenithschool.ai and the small line "${esc(HERO_LINE_SHORT)}" (public hero line set in counters.mjs). The Live Projects wall hook and body use only website wording ("Work in industry starting 1st year"; "4 mandatory real-world live projects with 30+ companies"). No em-dashes in any file (checked on the extracted PDF text).</p>
<h2>File list and QR verification</h2>
<p class="muted">Decoded from the PDF raster (poppler pdftoppm). "jsQR / ZXing": two independent decoders on a sharp raster (7 px per module). "Phone sim": decodes out of attempts (2 decoders x distances) at the resolution a phone camera preview (about 1920 px wide, 70 degree view) sees from each distance; required at the nominal distance (standee 2 m, A2 1.4 m, A3 1 m, tent 0.6 m; follow QR: standee 1 m, tent 25 cm). Tents carry each QR on both faces.</p>
<table><tr><th>File (print/out/pdf)</th><th>Design</th><th>QR encodes</th><th>Code area, version</th><th>jsQR / ZXing</th><th>Phone sim (pass/tries)</th><th>All checks</th></tr>${fileRows}</table>
</body></html>`;
  const p = path.join(here, 'out', 'html', '_print_spec.html');
  await fs.writeFile(p, html);
  const page = await browser.newPage();
  await page.goto(pathToFileURL(p).href, { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.pdf({ path: path.join(here, 'PRINT_SPEC.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.close();
}
