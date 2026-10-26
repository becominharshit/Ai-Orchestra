// Builds every print file for the Zenith stall at KRMU Ideas 4.0.
//   cd print && npm install && node make.mjs
// Output: out/pdf/*.pdf (vector, true physical size, 3 mm bleed, crop marks, TrimBox/BleedBox set),
//         out/html/*.html (the filled sources), out/manifest.json, PRINT_SPEC.pdf,
//         out/PREVIEW_ALL.pdf (3 A4 landscape review pages), ../docs/shots/TASK-08/*.png (previews from the PDFs).
// Then it runs verify.mjs (QR decode of every PDF raster, page boxes, copy checks).
// Env: CHROME=/path/to/chrome (default: macOS Google Chrome).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { PDFDocument, PDFName } from 'pdf-lib';
import { ALL, COUNTERS, WALL, SIZES, HANDLE, PROGRAMME, HERO_LINE_SHORT, SITE, EVENT, FOLLOW, PHOTO_CUE, pad } from './counters.mjs';
import { qrSvg, backgroundSvg, orchestraSvg, marksSvg, camGlyph, esc } from './art.mjs';
import { verifyAll, decodeJsqr, decodeZxing } from './verify.mjs';
import { PNG } from 'pngjs';
import { buildSpec } from './spec.mjs';
import { buildPreview } from './preview.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const SHOTS = path.join(HERE, '..', 'docs', 'shots', 'TASK-08');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHIELD = '../../assets/logo/zenith_shield.png'; // relative to out/html/
const MM = 96 / 25.4; // CSS px per mm
const PT = 72 / 25.4; // PDF points per mm

// Per-size layout numbers (mm on the trim) that the templates read as tokens.
const LAYOUT = {
  standee: { qr: 350, qrTop: 688, ring: 0.75, bgScale: 2.2, grid: 1790, stepLines: 3, minBottom: 220 }, // cassettes hide up to 200 mm
  tent:    { qr: 80, ring: 0.72, bgScale: 0.5, stepLines: 1 },
  poster:  { qr: 118, qrTop: 186, ring: 0.74, bgScale: 0.65, stepLines: 2 },
  posterA2: { qr: 118, qrTop: 186, ring: 0.74, bgScale: 0.92, stepLines: 2 }, // numbers in A3 units (scaled)
  followQr: { standee: 150, tent: 27 }, // follow QR incl. quiet zone, mm
};

const arrow = `<svg class="arr" viewBox="0 0 24 24"><path d="M12 3v15M5 12l7 7 7-7" fill="none" stroke="#4E308D" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// QR version per URL, chosen by pickVersions() so the code decodes cleanly in both decoders.
const QR_VERSION = new Map();

function qrBlock(c, size) {
  const q = qrSvg(c.qr.url, { shieldHref: SHIELD, version: QR_VERSION.get(c.qr.url) ?? 0 });
  size = SIZES[size]?.template || size;
  const g = size === 'standee' ? 22 : size === 'poster' ? 6.5 : 0;
  const arm = size === 'standee' ? 60 : 18, bw = size === 'standee' ? 3.2 : 1;
  const corner = (pos) => {
    const [v, h] = pos.split('');
    const css = `position:absolute;width:${arm}mm;height:${arm}mm;${v === 't' ? 'top' : 'bottom'}:-${g}mm;${h === 'l' ? 'left' : 'right'}:-${g}mm;` +
      `border:0 solid #62BBF3;border-${v === 't' ? 'top' : 'bottom'}-width:${bw}mm;border-${h === 'l' ? 'left' : 'right'}-width:${bw}mm;` +
      `border-${v === 't' ? 'top' : 'bottom'}-${h === 'l' ? 'left' : 'right'}-radius:${arm * 0.55}mm;`;
    return `<span style="${css}"></span>`;
  };
  const brackets = g ? ['tl', 'tr', 'bl', 'br'].map(corner).join('') : '';
  return `<div class="qrwrap"><div class="qrframe" style="position:relative">${brackets}<div class="qrcard">` +
    `<div class="qrlabel">${arrow}${esc(c.qr.label)}</div>` +
    `<div class="qr" data-role="main" data-expect="${esc(c.qr.url)}" data-url="${esc(c.qr.url)}" data-modules="${q.modules}" data-total="${q.total}">${q.svg}</div>` +
    `<div class="qrurl">${esc(c.qr.short)}</div></div></div></div>`;
}

// Second, smaller QR on every counter standee and tent: follow @zenith_school_of_ai (plain, no shield: it is small).
function followQr(size) {
  const q = qrSvg(FOLLOW.url, { version: QR_VERSION.get(FOLLOW.url) ?? 0 });
  const mm = LAYOUT.followQr[size];
  return `<div class="fcard"><div class="qr" data-role="follow" data-expect="${esc(FOLLOW.url)}" data-url="${esc(FOLLOW.url)}" data-modules="${q.modules}" data-total="${q.total}" style="width:${mm}mm;height:${mm}mm">${q.svg}</div>` +
    `<div class="flabel">${esc(FOLLOW.label)}</div></div>`;
}
// photo-frame cue: four frame corners around a small camera
const frameGlyph = (mm) => `<svg viewBox="0 0 24 24" width="${mm}mm" height="${mm}mm"><path d="M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6" fill="none" stroke="#FFE27A" stroke-width="2.4" stroke-linecap="round"/><rect x="7" y="9" width="10" height="7" rx="1.6" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12.5" r="2" fill="#fff"/></svg>`;
const photoCue = (mm) => `<div class="photo">${frameGlyph(mm)}<span data-fit="1">${esc(PHOTO_CUE)}</span></div>`;

const chipOf = (c) => esc(c.chip ?? `Counter ${pad(c.id)}`);
const labelsHtml = (c) => c.labels.length ? `<div class="labels">${c.labels.map((l) => `<span class="chip fun">${esc(l)}</span>`).join('')}</div>` : '';
const stepsHtml = (c, lines) => c.steps.map((t, i) => `<div class="step"><span class="n">${i + 1}</span><span class="t" data-fit="${lines}">${esc(t)}</span></div>`).join('');

function tentFace(c, which) {
  return `<div class="face ${which}">${qrBlock(c, 'tent')}
    <div class="col" data-fitbox data-calm>
      <img src="../../assets/logo/zenith_logo_white.png" alt="Zenith School of AI">
      <div class="crow"><span class="chip grad">${chipOf(c)}</span><span class="chip line">${esc(c.pillar)}</span>${c.flagship ? '<span class="chip new">New</span>' : ''}</div>
      <h1 class="display" data-fit="2">${c.nameHtml}</h1>
      <p class="hook" data-fit="3">${esc(c.hook)}</p>
      ${labelsHtml(c)}
      <div class="steps">${stepsHtml(c, 1)}</div>
      <div class="foot">${c.follow ? followQr('tent') : ''}<div class="ftext"><div class="handle">${camGlyph(4.8)}<span>${esc(HANDLE)}</span></div>${c.follow ? photoCue(3.4) : ''}<span class="prog">${esc(PROGRAMME).replace('Ek degree, KRMU ki.', 'Ek&nbsp;degree, KRMU&nbsp;ki.').replace(', KRMU', ',&nbsp;KRMU')}</span>${c.heroIsHook ? '' : `<span class="viral" data-fit="1">${esc(HERO_LINE_SHORT)}</span>`}</div></div>
    </div></div>`;
}

function fill(tpl, tokens) {
  return tpl.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
    if (!(k in tokens)) throw new Error(`missing token ${k}`);
    return tokens[k];
  });
}

async function buildHtml(c, size) {
  const S = SIZES[size], L = LAYOUT[size];
  const sheetW = S.trimW + 2 * S.slug, sheetH = S.trimH + 2 * S.slug;
  const tpl = await fs.readFile(path.join(HERE, 'templates', `${S.template || size}.html`), 'utf8');
  const label = `${c.fallback ? `FALLBACK tent (for ${c.fallbackFor} if it is a no-go) | ` : ''}Zenith School of AI | ${EVENT} | print v5 | ${c.chip ?? `Counter ${pad(c.id)}`} ${c.name} | ${S.label} | trim ${S.trimW} x ${S.trimH} mm | bleed ${S.bleed} mm | RGB, see PRINT_SPEC.pdf`;
  const folds = size === 'tent' ? [S.trimH / 2] : [];
  const tokens = {
    TITLE: esc(`${c.chip ?? `Counter ${pad(c.id)}`} ${c.name}: ${S.label}`),
    CHIP: chipOf(c), SCALE: S.scale ?? 1,
    SHEET_W: sheetW, SHEET_H: sheetH, SLUG: S.slug, TRIM_W: S.trimW, TRIM_H: S.trimH,
    BLEED_X: S.slug - S.bleed, BLEED_W: S.trimW + 2 * S.bleed, BLEED_H: S.trimH + 2 * S.bleed,
    BG: '', // drawn after layout (needs the measured QR position), see render()
    MARKS: marksSvg({ sheetW, sheetH, slug: S.slug, trimW: S.trimW, trimH: S.trimH, bleed: S.bleed, label, folds }),
    NUM: pad(c.id), PILLAR: esc(c.pillar), EVENT: esc(EVENT),
    NEW: c.flagship ? '<span class="chip new">New</span>' : '',
    NAME_HTML: c.nameHtml, HOOK: esc(c.hook), SUB: esc(c.sub), LABELS: labelsHtml(c),
    QR_TOP: L.qrTop ?? 0, QR_MM: L.qr, QR_BLOCK: size === 'tent' ? '' : qrBlock(c, size),
    STEPS: stepsHtml(c, L.stepLines),
    TV_LINE: esc(c.tvLine),
    ORCH: size === 'standee' ? orchestraSvg(c.orchestra, 750, 150, { fs: 18, seed: c.seed }) : '',
    CAM: camGlyph(size === 'standee' ? 38 : 7.6),
    FOLLOW_QR: size === 'standee' && c.follow ? followQr('standee') : '',
    PHOTO: size === 'standee' && c.follow ? photoCue(20) : '',
    HANDLE: esc(HANDLE), PROGRAMME: esc(PROGRAMME), SITE: esc(SITE),
    HERO_LINE: c.heroIsHook ? '' : `<div class="viral" data-fit="1">${esc(HERO_LINE_SHORT)}</div>`,
    FACES: size === 'tent' ? tentFace(c, 'top') + tentFace(c, 'bot') : '',
  };
  return { html: fill(tpl, tokens), sheetW, sheetH };
}

async function render(browser, c, size) {
  const S = SIZES[size], L = LAYOUT[size];
  const { html, sheetW, sheetH } = await buildHtml(c, size);
  const base = `${size}_${c.key}`;
  const htmlPath = path.join(OUT, 'html', `${base}.html`);
  await fs.writeFile(htmlPath, html);
  const page = await browser.newPage();
  await page.setViewport({ width: Math.ceil(sheetW * MM), height: Math.ceil(sheetH * MM), deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.evaluate(() => window.__fitAll());
  // Measure, in mm on the sheet: every QR and every block that should stay calm behind text.
  const geo = await page.evaluate((MM) => {
    const sheet = document.querySelector('.sheet').getBoundingClientRect();
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left - sheet.left) / MM, y: (r.top - sheet.top) / MM, w: r.width / MM, h: r.height / MM }; };
    const qrs = [...document.querySelectorAll('.qr')].map((el) => ({ url: el.dataset.url, expect: el.dataset.expect, role: el.dataset.role, modules: +el.dataset.modules, total: +el.dataset.total, ...box(el) }));
    const calm = [...document.querySelectorAll('.header, .crow, .namebox, .steps, .footer, .orch, .fcard, [data-calm]')].map(box);
    const fonts = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`);
    const clear = [...document.querySelectorAll('.chip, .header img, .col img')].map(box);
    // lowest printed element on the trim (text, chips, QR, diagram), for the roll-up cassette check
    const trim = document.querySelector('.trim').getBoundingClientRect();
    const inks = [...document.querySelectorAll('.trim *')].filter((el) => el.children.length === 0 || el.tagName === 'svg')
      .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const lowest = Math.max(...inks.map((r) => r.bottom));
    const clearBottomMm = (trim.bottom - lowest) / MM;
    return { qrs, calm, clear, fonts, clearBottomMm };
  }, MM);
  const off = S.slug - S.bleed; // sheet mm -> bleed-box mm
  const focus = geo.qrs.filter((q) => q.role === 'main').map((q) => ({ x: q.x + q.w / 2 - off, y: q.y + q.h / 2 - off, r0: q.w * L.ring }));
  const calm = geo.calm.map((b) => ({ x: b.x - off, y: b.y - off, w: b.w, h: b.h }));
  const clear = geo.clear.map((b) => ({ x: b.x - off, y: b.y - off, w: b.w, h: b.h }));
  const bg = backgroundSvg(S.trimW + 2 * S.bleed, S.trimH + 2 * S.bleed, c.seed + ({ tent: 500, poster: 1000, posterA2: 1500 }[size] ?? 0), {
    scale: L.bgScale, density: size === 'standee' ? 1 : 0.55, focus, calm, clear, grid: L.grid ? { top: L.grid + S.bleed } : null,
  });
  await page.evaluate((svg) => { document.querySelector('.bleed').innerHTML = svg; }, bg);
  await fs.writeFile(htmlPath, await page.content()); // the exact source that was printed
  const pdfPath = path.join(OUT, 'pdf', S.file(c));
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
  await page.close();
  await setBoxes(pdfPath, S, `${c.chip ?? `Counter ${pad(c.id)}`} ${c.name}: ${S.label}`);
  return {
    counter: c.id, key: c.key, fallback: c.fallback, fallbackFor: c.fallbackFor || null, name: c.name, size, file: path.relative(HERE, pdfPath), html: path.relative(HERE, htmlPath),
    sheet: { w: sheetW, h: sheetH }, trim: { w: S.trimW, h: S.trimH }, bleed: S.bleed, slug: S.slug,
    expectUrl: c.qr.url, qrs: geo.qrs, labels: c.labels, fonts: geo.fonts.length, clearBottomMm: +geo.clearBottomMm.toFixed(1),
  };
}

// 16:9 loop slide (1920 x 1080) for a spare TV: PNG for the TV, PDF as a vector copy. QR decoded from the PNG.
async function renderSlide(browser, c) {
  const tpl = await fs.readFile(path.join(HERE, 'templates', 'slide.html'), 'utf8');
  const html = fill(tpl, {
    TITLE: esc(`${c.name}: 16:9 loop slide`), BG: '', EVENT: esc(EVENT), CHIP: chipOf(c), PILLAR: esc(c.pillar),
    NAME_HTML: c.nameHtml, HOOK: esc(c.hook), SUB: esc(c.sub), QR_BLOCK: qrBlock(c, 'slide'), CAM: camGlyph(11),
    HANDLE: esc(HANDLE), PROGRAMME: esc(PROGRAMME), SITE: esc(SITE), HERO_SHORT: c.heroIsHook ? '' : esc(HERO_LINE_SHORT),
  });
  const htmlPath = path.join(OUT, 'html', `slide_${c.key}.html`);
  await fs.writeFile(htmlPath, html);
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.evaluate(() => window.__fitAll());
  const geo = await page.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    return { qr: box(document.querySelector('.qr')), calm: [...document.querySelectorAll('.header, .left, .foot, .right')].map(box),
      clear: [...document.querySelectorAll('.chip, .header img')].map(box) };
  });
  const bg = backgroundSvg(1920, 1080, c.seed + 2000, { scale: 2.4, density: 0.7, calm: geo.calm, clear: geo.clear,
    focus: [{ x: geo.qr.x + geo.qr.w / 2, y: geo.qr.y + geo.qr.h / 2, r0: geo.qr.w * 0.72 }] });
  await page.evaluate((svg) => { document.querySelector('.bleed').innerHTML = svg; }, bg);
  await fs.writeFile(htmlPath, await page.content());
  const png = path.join(OUT, 'pdf', `slide_${c.key}_16x9_1920x1080.png`);
  await page.screenshot({ path: png });
  const pdf = path.join(OUT, 'pdf', `slide_${c.key}_16x9.pdf`);
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  await page.close();
  await fs.copyFile(png, path.join(SHOTS, `slide_${c.key}.png`));
  // decode the QR from the PNG the TV will show, full frame and cropped
  const img = PNG.sync.read(await fs.readFile(png));
  const full = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
  const r = { file: path.relative(HERE, png), pdf: path.relative(HERE, pdf), key: c.key, size: 'slide', expect: c.qr.url,
    jsqr: decodeJsqr(full), zxing: decodeZxing(full), qrPx: Math.round(geo.qr.w) };
  r.ok = r.jsqr === c.qr.url && r.zxing === c.qr.url;
  console.log(r.ok ? 'OK  ' : 'FAIL', r.file, `jsqr ${r.jsqr === c.qr.url ? '+' : '-'} zxing ${r.zxing === c.qr.url ? '+' : '-'}`);
  return r;
}

// Chrome writes only a MediaBox. Printers want TrimBox (finished size) and BleedBox (trim + bleed).
async function setBoxes(pdfPath, S, title) {
  const doc = await PDFDocument.load(await fs.readFile(pdfPath));
  doc.setTitle(title);
  doc.setAuthor('Zenith School of AI');
  doc.setCreator('play-zenith/print/make.mjs');
  for (const p of doc.getPages()) {
    const { width, height } = p.getMediaBox();
    const tw = S.trimW * PT, th = S.trimH * PT, b = S.bleed * PT;
    const x = (width - tw) / 2, y = (height - th) / 2;
    p.setTrimBox(x, y, tw, th);
    p.setBleedBox(x - b, y - b, tw + 2 * b, th + 2 * b);
    p.node.set(PDFName.of('ArtBox'), p.node.get(PDFName.of('TrimBox')));
  }
  await fs.writeFile(pdfPath, await doc.save());
}

// Some matrices trip a decoder at some sizes (a mask/finder quirk, not a print problem). For each URL we try
// the smallest version and the next two, rasterise each at 10 sizes (150 to 360 px, about 3.3 to 8 px per
// module, including awkward non-integer module sizes) and keep the first version that both jsQR and ZXing decode every time.
async function pickVersions(browser) {
  const urls = [...new Set(ALL.map((c) => c.qr.url))];
  const page = await browser.newPage();
  const tmp = path.join(OUT, 'tmp');
  await fs.mkdir(tmp, { recursive: true });
  const report = {};
  for (const url of urls) {
    const base = qrSvg(url).version;
    let chosen = null;
    report[url] = [];
    for (const v of [base, base + 1, base + 2]) {
      const { svg } = qrSvg(url, { shieldHref: '../assets/logo/zenith_shield.png', version: v });
      let pass = 0, tot = 0;
      for (const px of [150, 170, 190, 217, 240, 265, 281, 310, 330, 360]) {
        const f = path.join(tmp, '_qrtest.html');
        await fs.writeFile(f, `<body style="margin:0;background:#fff"><div style="width:${px}px;height:${px}px;padding:16px">${svg.replace('../assets', '../../assets')}</div>`);
        await page.setViewport({ width: px + 32, height: px + 32 });
        await page.goto(pathToFileURL(f).href, { waitUntil: 'load' });
        const png = PNG.sync.read(Buffer.from(await page.screenshot()));
        const img = { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
        tot++;
        if (decodeJsqr(img) === url && decodeZxing(img) === url) pass++;
      }
      report[url].push({ version: v, pass, of: tot });
      if (pass === tot) { chosen = v; break; }
    }
    if (chosen === null) chosen = report[url].sort((a, b) => b.pass - a.pass)[0].version;
    QR_VERSION.set(url, chosen);
    console.log('qr', url, 'version', chosen, JSON.stringify(report[url]));
  }
  await page.close();
  await fs.writeFile(path.join(OUT, 'qr_versions.json'), JSON.stringify(report, null, 2));
}

async function main() {
  const only = process.argv.slice(2); // optional filters, e.g. `node make.mjs standee c01`
  await fs.mkdir(path.join(OUT, 'html'), { recursive: true });
  await fs.mkdir(path.join(OUT, 'pdf'), { recursive: true });
  await fs.mkdir(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--font-render-hinting=none'] });
  const manifest = [];
  if (!only.length) await cleanOutputs();
  try {
    await pickVersions(browser);
    const jobs = [];
    for (const size of Object.keys(SIZES)) for (const c of ALL) {
      if (!c.sizes.includes(size)) continue;
      const tag = `${size}_${c.key}`;
      if (!only.length || only.every((o) => tag.includes(o))) jobs.push({ c, size });
    }
    const build = async (list) => {
      for (const { c, size } of list) {
        const m = await render(browser, c, size);
        const i = manifest.findIndex((x) => x.file === m.file);
        if (i >= 0) manifest[i] = m; else manifest.push(m);
        console.log('built', m.file, `QR v${QR_VERSION.get(c.qr.url) ?? 'auto'}`, m.qrs.map((q) => `${q.w.toFixed(1)}mm`).join(' '));
      }
    };
    await build(jobs);
    let results = await verifyAll(manifest, { here: HERE, shots: SHOTS });
    // If a QR fails any decode in the real PDF, move that URL to the next QR version and rebuild its files.
    for (let round = 0; round < 2; round++) {
      // URLs whose QR failed a required decode in some file (main QR or the follow QR)
      const failed = (q) => q.print.jsqr !== q.expect || q.print.zxing !== q.expect || (q.role !== 'follow' && q.hires.jsqr !== q.expect) ||
        q.phone.some((p) => p.distanceM === q.nominalM && (p.jsqr !== q.expect || p.zxing !== q.expect));
      const badUrls = [...new Set(results.flatMap((r) => r.qrs.filter(failed).map((q) => q.expect)))];
      if (!badUrls.length) break;
      for (const u of badUrls) {
        const v = QR_VERSION.get(u) || qrSvg(u).version;
        QR_VERSION.set(u, v + 1);
        console.log(`retry: ${u} -> QR version ${v + 1}`);
      }
      const uses = (c) => badUrls.includes(c.qr.url) || (c.follow && badUrls.includes(FOLLOW.url));
      const redo = jobs.filter(({ c, size }) => uses(c) && (c.follow || size !== 'slide'));
      await build(redo);
      const redoFiles = new Set(redo.map(({ c, size }) => manifest.find((m) => m.key === c.key && m.size === size).file));
      const again = await verifyAll(manifest.filter((m) => redoFiles.has(m.file)), { here: HERE, shots: SHOTS });
      results = results.map((r) => again.find((a) => a.file === r.file) || r);
    }
    const slides = [];
    if (!only.length || only.includes('slide')) for (const c of ALL.filter((x) => x.sizes.includes('slide'))) slides.push(await renderSlide(browser, c));
    await fs.writeFile(path.join(OUT, 'slides_verify.json'), JSON.stringify(slides, null, 2));
    if (slides.some((x) => !x.ok)) process.exitCode = 1;
    await fs.writeFile(path.join(OUT, 'qr_versions_final.json'), JSON.stringify(Object.fromEntries(QR_VERSION), null, 2));
    await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await fs.writeFile(path.join(OUT, 'verify.json'), JSON.stringify(results, null, 2));
    if (!only.length) await buildSpec(browser, manifest, results, { here: HERE, slides });
    await contactSheet(browser, manifest);
    if (!only.length) await buildPreview(browser, manifest, results, { here: HERE, slides });
    const bad = results.filter((r) => !r.ok);
    console.log(`\nverify: ${results.length - bad.length}/${results.length} files OK`);
    if (bad.length) { console.log(JSON.stringify(bad, null, 2)); process.exitCode = 1; }
  } finally {
    await browser.close();
  }
}

// Contact sheets: the 8 counters side by side, and the 2 fallbacks (for review and for the camera team).
async function contactSheet(browser, manifest) {
  const sheet = async (list, file, caption) => {
    if (list.length < 2) return;
    const imgs = list.map((m) => `<figure><img src="${pathToFileURL(path.join(SHOTS, `standee_${m.key}.png`)).href}"><figcaption>${caption(m)}</figcaption></figure>`).join('');
    const html = `<!doctype html><html><head><style>body{margin:0;background:#0B0A22;font:600 22px system-ui;color:#B8B5DA}
    .row{display:flex;gap:28px;padding:36px}figure{margin:0;text-align:center}img{height:1400px;display:block;border-radius:6px}figcaption{margin-top:12px}</style></head>
    <body><div class="row">${imgs}</div></body></html>`;
    const p = path.join(OUT, 'html', `_contact_${file}.html`);
    await fs.writeFile(p, html);
    const page = await browser.newPage();
    await page.setViewport({ width: 36 * 2 + list.length * (606 + 28), height: 1520 });
    await page.goto(pathToFileURL(p).href, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(SHOTS, `${file}.png`), fullPage: true });
    await page.close();
  };
  const st = manifest.filter((m) => m.size === 'standee');
  await sheet(st.filter((m) => !m.fallback), 'standees_all_8', (m) => `Counter ${pad(m.counter)}`);
  await sheet(st.filter((m) => m.fallback), 'standees_fallbacks', (m) => `FALLBACK counter ${pad(m.counter)}`);
}

// A full build starts from empty output folders so no stale file (older print version) is left behind.
async function cleanOutputs() {
  for (const [dir, ext] of [[path.join(OUT, 'pdf'), '.pdf'], [path.join(OUT, 'html'), '.html'], [SHOTS, '.png']]) {
    for (const f of await fs.readdir(dir).catch(() => [])) if (f.endsWith(ext)) await fs.rm(path.join(dir, f));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
