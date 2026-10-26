// Verifies every PDF listed in out/manifest.json:
//  - page count 1, MediaBox / TrimBox / BleedBox match the physical size (poppler `pdfinfo -box`)
//  - every QR decodes to the exact expected URL from the PDF raster (poppler `pdftoppm`), with two
//    independent decoders (jsQR and ZXing), plus a low-resolution "phone at distance" simulation
//  - QR physical size (standee needs >= 120 mm), fonts embedded, no em-dash / en-dash, required copy present
// Run alone: node verify.mjs (after node make.mjs). Writes out/verify.json and preview PNGs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library';
import { HANDLE, PROGRAMME, HERO_LINE, HERO_LINE_SHORT, ALL, BANNED, BANNED_OUTSIDE_HERO, PHOTO_CUE, pad } from './counters.mjs';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PT = 72 / 25.4;

// Phone scanners decode from the camera preview (about 1920 px across, about 70 degree field of view).
// Pixels per mm on the print at distance d (mm): 1920 / (2 * d * tan 35deg). Converted to dpi for pdftoppm.
const simDpi = (dMm) => (25.4 * 1920) / (2 * dMm * Math.tan((35 * Math.PI) / 180));
const PLAN = {
  // follow = the second, smaller follow QR on counter standees and tents (scanned from closer)
  standee:  { dpi: 40, preview: 24, distances: [1, 1.5, 2, 2.5, 3], nominal: 2, follow: { distances: [0.5, 0.75, 1], nominal: 1 } },
  poster:   { dpi: 150, preview: 60, distances: [0.5, 1, 1.5], nominal: 1 },
  posterA2: { dpi: 110, preview: 45, distances: [0.7, 1.4, 2.1], nominal: 1.4 },
  tent:     { dpi: 150, preview: 60, distances: [0.3, 0.6, 1], nominal: 0.6, follow: { distances: [0.15, 0.25, 0.35], nominal: 0.25 } },
};

async function raster(pdf, dpi, prefix) {
  await run('pdftoppm', ['-r', String(dpi), '-png', '-singlefile', pdf, prefix], { maxBuffer: 1 << 26 });
  return PNG.sync.read(await fs.readFile(prefix + '.png'));
}

function crop(png, x, y, w, h) {
  x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
  w = Math.min(png.width - x, Math.ceil(w)); h = Math.min(png.height - y, Math.ceil(h));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) {
    const s = ((y + r) * png.width + x) * 4;
    out.set(png.data.subarray(s, s + w * 4), r * w * 4);
  }
  return { data: out, width: w, height: h };
}

export function decodeJsqr(img) {
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return r ? r.data : null;
}

export function decodeZxing(img) {
  const lum = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0; i < lum.length; i++) {
    const p = i * 4;
    lum[i] = (img.data[p] * 299 + img.data[p + 1] * 587 + img.data[p + 2] * 114) / 1000;
  }
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]], [DecodeHintType.TRY_HARDER, true]]);
  const reader = new MultiFormatReader();
  reader.setHints(hints);
  try {
    return reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, img.width, img.height)))).getText();
  } catch { return null; }
}

function parseBoxes(txt) {
  const get = (k) => {
    const m = txt.match(new RegExp(`${k}:\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`));
    if (!m) return null;
    const [x0, y0, x1, y1] = m.slice(1).map(Number);
    return { w: (x1 - x0) / PT, h: (y1 - y0) / PT };
  };
  return { pages: +(txt.match(/Pages:\s+(\d+)/) || [])[1], media: get('MediaBox'), trim: get('TrimBox'), bleed: get('BleedBox') };
}

const near = (a, b, tol = 0.3) => a && Math.abs(a - b) <= tol;
const norm = (s) => s.replace(/\s+/g, ' ').replace(/- (?=\w)/g, '-').trim().toLowerCase(); // also joins "first-\nyears" line breaks

export async function verifyAll(manifest, { here = HERE, shots } = {}) {
  // config guard: the hero line must never be a forbidden phrase
  const clash = BANNED.filter((b) => norm(HERO_LINE).includes(norm(b)) || norm(HERO_LINE_SHORT).includes(norm(b)));
  if (clash.length) throw new Error(`HERO_LINE contains a BANNED phrase: ${clash.join(', ')}`);
  const tmp = path.join(here, 'out', 'tmp');
  await fs.mkdir(tmp, { recursive: true });
  if (shots) await fs.mkdir(shots, { recursive: true });
  const results = [];
  for (const m of manifest) {
    const pdf = path.join(here, m.file);
    const plan = PLAN[m.size];
    const res = { file: m.file, counter: m.counter, key: m.key, fallback: !!m.fallback, size: m.size, ok: true, problems: [] };
    const fail = (p) => { res.ok = false; res.problems.push(p); };

    // 1. page boxes
    const info = parseBoxes((await run('pdfinfo', ['-box', pdf])).stdout);
    res.boxes = info;
    if (info.pages !== 1) fail(`pages=${info.pages}`);
    if (!near(info.media?.w, m.sheet.w) || !near(info.media?.h, m.sheet.h)) fail('MediaBox size');
    if (!near(info.trim?.w, m.trim.w) || !near(info.trim?.h, m.trim.h)) fail('TrimBox size');
    if (!near(info.bleed?.w, m.trim.w + 2 * m.bleed) || !near(info.bleed?.h, m.trim.h + 2 * m.bleed)) fail('BleedBox size');

    // 1b. roll-up cassette: nothing printed in the bottom 220 mm of a standee
    if (m.size === 'standee') {
      res.clearBottomMm = m.clearBottomMm;
      if (!(m.clearBottomMm >= 220)) fail(`standee content only ${m.clearBottomMm} mm above bottom trim (< 220)`);
    }

    // 2. QR decode from the PDF raster.
    //    a) "print": rendered so one module is about 7 px (a sharp, close-up photo of the print), jsQR + ZXing.
    //       (ZXing-js has a detection quirk with very large modules, so we do not go far above 7 px.)
    //    b) "hires": jsQR again at the high preview resolution.
    //    c) "phone": the resolution a phone camera preview sees from several distances, jsQR + ZXing.
    //       Must pass at the nominal distance (standee 2 m); other distances are reported.
    //    d) the whole page at phone resolution (no cropping), jsQR.
    const base = path.join(tmp, path.basename(m.file, '.pdf'));
    const cache = new Map();
    const rasterAt = async (dpi) => {
      const k = dpi.toFixed(1);
      if (!cache.has(k)) cache.set(k, await raster(pdf, dpi, `${base}_${k}`));
      return cache.get(k);
    };
    const hi = await rasterAt(plan.dpi);
    res.qrs = [];
    for (const q of m.qrs) {
      const expect = q.expect; // main QR: counter-map URL; follow QR: instagram URL
      const qp = q.role === 'follow' ? plan.follow : plan;
      const pick = (png, dpi) => {
        const k = dpi / 25.4, mar = 4;
        return crop(png, (q.x - mar) * k, (q.y - mar) * k, (q.w + 2 * mar) * k, (q.h + 2 * mar) * k);
      };
      const printDpi = (7 / (q.w / q.total)) * 25.4;
      const a = pick(await rasterAt(printDpi), printDpi);
      const phone = [];
      for (const d of qp.distances) {
        const dpi = simDpi(d * 1000);
        const b = pick(await rasterAt(dpi), dpi);
        phone.push({ distanceM: d, dpi: +dpi.toFixed(1), pxPerModule: +((q.w / q.total) * dpi / 25.4).toFixed(1), jsqr: decodeJsqr(b), zxing: decodeZxing(b) });
      }
      const r = {
        role: q.role, expect, encoded: q.url,
        print: { dpi: +printDpi.toFixed(1), pxPerModule: 7, jsqr: decodeJsqr(a), zxing: decodeZxing(a) },
        hires: { dpi: plan.dpi, jsqr: decodeJsqr(pick(hi, plan.dpi)) },
        phone, nominalM: qp.nominal,
        sizeMm: +q.w.toFixed(1), codeMm: +((q.w * q.modules) / q.total).toFixed(1), modules: q.modules, moduleMm: +(q.w / q.total).toFixed(2),
      };
      // hires is informative for the small follow QR (few px per module at preview dpi); required for the main QR
      const nominal = r.phone.find((p) => p.distanceM === qp.nominal);
      const must = [['print.jsqr', r.print.jsqr], ['print.zxing', r.print.zxing],
        [`phone@${qp.nominal}m.jsqr`, nominal.jsqr], [`phone@${qp.nominal}m.zxing`, nominal.zxing]];
      if (q.role !== 'follow') must.push(['hires.jsqr', r.hires.jsqr]);
      for (const [k, v] of must) if (v !== expect) fail(`QR(${q.role}) ${k} decoded ${JSON.stringify(v)} != ${expect}`);
      r.phonePass = r.phone.reduce((n, p) => n + (p.jsqr === expect) + (p.zxing === expect), 0) + '/' + r.phone.length * 2;
      if (q.url !== expect) fail(`QR(${q.role}) encoded URL differs from the counter map`);
      if (m.size === 'standee' && q.role === 'main' && r.codeMm < 120) fail(`standee QR ${r.codeMm} mm < 120 mm`);
      res.qrs.push(r);
    }
    // whole page at the main QR's nominal phone distance (tent: each folded face separately); any of its QRs counts
    const nd = simDpi(plan.nominal * 1000);
    const nomPng = await rasterAt(nd);
    const k = nd / 25.4;
    const regions = m.size === 'tent'
      ? [[0, 0, nomPng.width, (m.slug + m.trim.h / 2) * k], [0, (m.slug + m.trim.h / 2) * k, nomPng.width, nomPng.height]]
      : [[0, 0, nomPng.width, nomPng.height]];
    const valid = new Set(m.qrs.map((q) => q.expect));
    res.pageDecode = regions.map(([x, y, w, h]) => decodeJsqr(crop(nomPng, x, y, w, h - y)));
    // jsQR returns at most one code per image: required where a region holds one QR, informative where it holds two
    const perRegion = m.size === 'tent' ? m.qrs.length / 2 : m.qrs.length;
    if (perRegion === 1 && res.pageDecode.some((v) => !valid.has(v))) fail(`whole-page decode ${JSON.stringify(res.pageDecode)}`);
    res.pageDecodeRequired = perRegion === 1;

    // 3. copy checks on the extracted text
    const text = (await run('pdftotext', ['-layout', pdf, '-'])).stdout;
    const raw = (await run('pdftotext', [pdf, '-'])).stdout; // reading order; -layout interleaves columns
    res.emDash = (text.match(/\u2014/g) || []).length;
    res.enDash = (text.match(/\u2013/g) || []).length;
    if (res.emDash || res.enDash) fail(`dashes em=${res.emDash} en=${res.enDash}`);
    const c = ALL.find((x) => x.key === m.key);
    const need = [HANDLE, PROGRAMME, c.heroIsHook ? HERO_LINE : HERO_LINE_SHORT, c.hook, ...c.labels, ...c.steps];
    if (c.follow && (m.size === 'standee' || m.size === 'tent')) {
      need.push(PHOTO_CUE);
      if (!m.qrs.some((q) => q.role === 'follow')) fail('follow QR missing');
    }
    const flat = norm(text), flatRaw = norm(raw);
    res.missingCopy = need.filter((s) => !flat.includes(norm(s)) && !flatRaw.includes(norm(s)));
    if (res.missingCopy.length) fail(`missing copy: ${res.missingCopy.join(' | ')}`);
    res.banned = BANNED.filter((b) => flatRaw.includes(norm(b)) || flat.includes(norm(b)));
    // phrases allowed only inside the hero strings: remove every hero occurrence (reading-order text), then search
    let rest = flatRaw;
    for (const h of [HERO_LINE, HERO_LINE_SHORT].sort((a, b) => b.length - a.length)) rest = rest.split(norm(h)).join(' ');
    res.banned.push(...BANNED_OUTSIDE_HERO.filter((b) => rest.includes(norm(b))).map((b) => `${b} (outside the hero line)`));
    if (res.banned.length) fail(`banned phrase printed: ${res.banned.join(', ')}`);

    // 4. fonts embedded, raster images (only the logo PNGs are expected)
    const fonts = (await run('pdffonts', [pdf])).stdout.split('\n').slice(2).filter(Boolean);
    res.fonts = fonts.map((l) => l.split(/\s+/)[0]);
    if (fonts.some((l) => / no\s+(yes|no)\s+(yes|no)\s+\d+/.test(l) && !/ yes\s+(yes|no)\s+(yes|no)\s+\d+/.test(l))) fail('font not embedded');
    if (!res.fonts.some((f) => /Jakarta/i.test(f)) || !res.fonts.some((f) => /Newsreader/i.test(f))) fail('brand fonts missing');
    const imgs = (await run('pdfimages', ['-list', pdf])).stdout.split('\n').slice(2).filter(Boolean);
    res.rasterImages = imgs.length;

    // 5. preview PNG for review
    if (shots) {
      const name = `${m.size}_${m.key}`;
      await run('pdftoppm', ['-r', String(plan.preview), '-png', '-singlefile', pdf, path.join(shots, name)]);
      res.preview = `docs/shots/TASK-08/${name}.png`;
    }
    results.push(res);
    console.log(res.ok ? 'OK  ' : 'FAIL', m.file, res.qrs.map((r) => `${r.role} ${r.print.jsqr === r.expect ? 'jsqr+' : 'jsqr-'}${r.print.zxing === r.expect ? 'zxing+' : 'zxing-'} phone ${r.phonePass}`).join(' '), res.problems.join('; '));
  }
  return results;
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(await fs.readFile(path.join(HERE, 'out', 'manifest.json'), 'utf8'));
  const results = await verifyAll(manifest, { here: HERE, shots: path.join(HERE, '..', 'docs', 'shots', 'TASK-08') });
  await fs.writeFile(path.join(HERE, 'out', 'verify.json'), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => !r.ok);
  console.log(`verify: ${results.length - bad.length}/${results.length} files OK`);
  if (bad.length) process.exitCode = 1;
}
