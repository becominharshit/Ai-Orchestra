// Builds out/PREVIEW_ALL.pdf: one A4 landscape page per format (standees, tents, posters) for Avi to review.
// Previews are cut to the trim (no crop marks) from the final PDFs with pdftoppm.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { COUNTERS, FALLBACKS, WALL, SIZES, pad } from './counters.mjs';
import { esc } from './art.mjs';

const run = promisify(execFile);

async function trimPng(pdf, S, dpi, out, { half = null } = {}) {
  const k = dpi / 25.4;
  let y = S.slug, h = S.trimH;
  if (half === 'bottom') { y = S.slug + S.trimH / 2; h = S.trimH / 2; } // tent: the upright face
  await run('pdftoppm', ['-r', String(dpi), '-jpeg', '-jpegopt', 'quality=86', '-singlefile', '-x', String(Math.round(S.slug * k)), '-y', String(Math.round(y * k)),
    '-W', String(Math.round(S.trimW * k)), '-H', String(Math.round(h * k)), pdf, out]);
  return out + '.jpg'; // JPEG keeps the review PDF light enough to email
}

export async function buildPreview(browser, manifest, results, { here, slides = [] }) {
  const tmp = path.join(here, 'out', 'tmp', 'preview');
  await fs.mkdir(tmp, { recursive: true });
  const ok = (f) => results.find((r) => r.file === f)?.ok;
  const item = async (size, c, dpi, opts) => {
    const m = manifest.find((x) => x.size === size && x.key === c.key);
    const img = await trimPng(path.join(here, m.file), SIZES[size], dpi, path.join(tmp, `${size}_${c.key}`), opts);
    return `<figure><img src="${pathToFileURL(img).href}"><figcaption><b>${c.id ? pad(c.id) : 'Wall'}</b> ${esc(c.name)}${c.fallback ? ' <span class="bad">FALLBACK</span>' : c.flagship ? ' <span class="new">NEW</span>' : ''}${ok(m.file) ? '' : ' <span class="bad">CHECK FAILED</span>'}</figcaption></figure>`;
  };
  const pages = [];
  const page = (title, note, cls, figs) => `<section class="${cls}"><header><div class="band"></div><h1>${title}</h1><p>${note}</p></header><div class="grid">${figs.join('')}</div>
    <footer>Zenith School of AI · KRMU Ideas 4.0 · print preview, not for printing (use the files in print/out/pdf) · all QR codes decoded back to their URLs</footer></section>`;
  pages.push(page('Roll-up standees, 850 x 2000 mm', 'One per counter. Shown to the trim. Bottom 220 mm stays free of text for the cassette.', 'st',
    await Promise.all(COUNTERS.map((c) => item('standee', c, 30)))));
  pages.push(page('A4 table tents', 'The visitor-facing face of each tent. The other face is identical and printed upside down, so the folded tent reads from both sides.', 'te',
    await Promise.all(COUNTERS.map((c) => item('tent', c, 120, { half: 'bottom' })))));
  pages.push(page('A3 posters, 297 x 420 mm', 'One per counter. Shown to the trim.', 'po',
    await Promise.all(COUNTERS.map((c) => item('poster', c, 70)))));
  // fallback tents (go/no-go for counters 2 and 4) and the Live Projects side wall (A2 poster + 16:9 slide)
  const extra = [];
  for (const fb of FALLBACKS) extra.push(await item('tent', fb, 120, { half: 'bottom' }));
  for (const w of WALL) {
    extra.push(await item('posterA2', w, 50));
    const sl = slides.find((x) => x.key === w.key);
    if (sl) extra.push(`<figure class="slide"><img src="${pathToFileURL(path.join(here, sl.file)).href}"><figcaption><b>TV</b> ${esc(w.name)} loop slide, 16:9</figcaption></figure>`);
  }
  pages.push(page('Fallback tents and the Live Projects wall',
    'Top: A4 fallback tents for the 26 Oct 12:00 go/no-go (counter 2 or 4). Bottom: Live Projects side-wall poster (A2, also A3) and the 16:9 loop slide for a spare TV.', 'fb', extra));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Zenith stall print preview</title>
<link rel="stylesheet" href="${pathToFileURL(path.join(here, 'templates', 'base.css')).href}">
<style>
@page { size: A4 landscape; margin: 0; }
html, body { background: #F7F6F2; color: #19173D; }
section { width: 297mm; height: 210mm; padding: 10mm 12mm 8mm; display: flex; flex-direction: column; page-break-after: always; overflow: hidden; background: #F7F6F2; }
section:last-child { page-break-after: auto; }
.band { height: 1.6mm; width: 40mm; background: linear-gradient(90deg,#62BBF3,#4E308D); border-radius: 1mm; margin-bottom: 3mm; }
h1 { font-family: Newsreader, serif; font-weight: 600; font-size: 20pt; line-height: 1.1; color: #19173D; }
header p { font-size: 9pt; color: #5b5a72; margin-top: 1mm; }
.grid { flex: 1; display: grid; gap: 4mm; margin-top: 4mm; min-height: 0; }
.st .grid { grid-template-columns: repeat(8, 1fr); align-items: center; align-content: center; gap: 2.5mm; }
.te .grid { grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(2, 1fr); }
.po .grid { grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(2, 1fr); justify-items: center; }
figure { margin: 0; display: flex; flex-direction: column; align-items: center; min-height: 0; }
img { display: block; border-radius: 1.2mm; box-shadow: 0 0 0 0.2mm #dcdae6; }
.st img { width: 100%; }
.te img { width: 100%; }
.po img { height: 72mm; }
.fb .grid { grid-template-columns: repeat(3, 1fr); grid-template-rows: auto auto; align-items: center; justify-items: center; }
.fb figure { width: 100%; }
.fb img { width: 100%; max-height: 64mm; object-fit: contain; }
.fb figure:nth-child(4) img { height: 82mm; max-height: 82mm; width: auto; }
.fb figure.slide { grid-column: span 2; }
.fb figure.slide img { width: 100%; max-height: 82mm; object-fit: contain; }
.new { color: #4E308D; font-weight: 800; }
figcaption { font-size: 7.6pt; margin-top: 1.4mm; text-align: center; color: #19173D; font-weight: 600; }
figcaption b { color: #4E308D; }
.bad { color: #b3261e; font-weight: 800; }
footer { font-size: 7pt; color: #5b5a72; margin-top: 2mm; }
</style></head><body>${pages.join('')}</body></html>`;
  const p = path.join(here, 'out', 'html', '_preview_all.html');
  await fs.writeFile(p, html);
  const pg = await browser.newPage();
  await pg.goto(pathToFileURL(p).href, { waitUntil: 'load' });
  await pg.evaluate(async () => { await document.fonts.ready; });
  await pg.pdf({ path: path.join(here, 'out', 'PREVIEW_ALL.pdf'), printBackground: true, preferCSSPageSize: true });
  await pg.close();
}
