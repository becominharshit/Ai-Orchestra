#!/usr/bin/env node
// Proves experiences/shark/data/zenith.json equals the Lead Magnet source byte for byte, and that it still
// has the SHA-256 recorded in data/COPIED_FROM.md.
//   node experiences/shark/ops/check-data.mjs [--source <path to zenith.json>]
// Exit 0 = identical, 1 = a difference or a missing file. This ops tool is the only shark code that looks outside the repo.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COPY = path.join(HERE, '..', 'data', 'zenith.json');
const REPO = path.resolve(HERE, '..', '..', '..');
const argv = process.argv.slice(2);
const src = path.resolve(argv.includes('--source') ? argv[argv.indexOf('--source') + 1] : path.join(REPO, '..', '..', 'Lead Magnet', '04_Data', 'app_json', 'cf_data_v60', 'zenith.json'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

let ok = true;
const recorded = fs.readFileSync(path.join(HERE, '..', 'data', 'COPIED_FROM.md'), 'utf8').match(/zenith\.json ([0-9a-f]{64})/)?.[1];
if (sha(COPY) !== recorded) { console.log(`DIFFERS copy vs COPIED_FROM.md hash (${sha(COPY).slice(0, 16)} vs ${String(recorded).slice(0, 16)})`); ok = false; }
if (!fs.existsSync(src)) { console.log(`MISSING source ${src}`); ok = false; }
else {
  const same = Buffer.compare(fs.readFileSync(COPY), fs.readFileSync(src)) === 0;
  console.log(`${same ? 'SAME   ' : 'DIFFERS'} zenith.json ${sha(COPY).slice(0, 16)}`);
  if (!same) ok = false;
}
console.log(ok ? `OK: data/zenith.json equals ${src}` : 'FAIL: the copy differs from the source');
process.exit(ok ? 0 : 1);
