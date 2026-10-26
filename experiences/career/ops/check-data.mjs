#!/usr/bin/env node
// Proves the copied data equals the Lead Magnet source byte for byte (SHA-256 of every copied file).
//   node experiences/career/ops/check-data.mjs [--source <path to cf_data_v60>]
// Exit 0 = identical, 1 = a difference or a missing file.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DATA_FILES, DATA_VERSION } from '../lib/data.js';
import { arg, REPO } from './common.mjs';

const src = path.resolve(arg(process.argv.slice(2), '--source', path.join(REPO, '..', '..', 'Lead Magnet', '04_Data', 'app_json', DATA_VERSION)));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
let ok = true;
for (const f of DATA_FILES) {
  const a = path.join(DATA_DIR, f);
  const b = path.join(src, f);
  if (!fs.existsSync(a) || !fs.existsSync(b)) { console.log(`MISSING ${f}`); ok = false; continue; }
  const same = Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0;
  console.log(`${same ? 'SAME   ' : 'DIFFERS'} ${f} ${sha(a).slice(0, 16)}`);
  if (!same) ok = false;
}
console.log(ok ? `OK: ${DATA_FILES.length} files equal to ${src}` : 'FAIL: the copy differs from the source');
process.exit(ok ? 0 : 1);
