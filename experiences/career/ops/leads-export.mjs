#!/usr/bin/env node
// Decrypts the Ideas 4.0 leads ON THIS MAC and writes a Meritto-ready CSV (mode 0600).
//   node experiences/career/ops/leads-export.mjs [--local <data dir>] [--date 2026-10-27] [--out <file.csv>] [--key <private.pem>]
// Store: the bucket from .env (BUCKET_NAME, BUCKET_KEY_ID, BUCKET_KEY_SECRET) or --local. Needs PHONE_PEPPER (.env)
// to fill whatsapp_sent and to skip the stop list. One row per number (latest record wins). u18 column kept.
// Prints counts only, never a number or a name.
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnv, arg, storeFrom, privateKey, readLeads } from './common.mjs';
import { createLedger } from '../lib/ledger.js';
import { phoneHash } from '../lib/phone.js';

export const COLUMNS = ['first_name', 'mobile', 'country_code', 'source', 'age_band', 'u18', 'interest_area', 'consent_ts', 'consent_text_version', 'whatsapp_sent', 'created_at'];
const q = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s; };

export async function exportLeads(argv, out = console.log) {
  loadEnv();
  const pepper = process.env.PHONE_PEPPER;
  if (!pepper) throw new Error('PHONE_PEPPER is not in .env: it is needed to read the sent and stop lists.');
  const store = storeFrom(argv);
  const { leads, bad } = await readLeads(store, privateKey(argv), { date: arg(argv, '--date') });
  const ledger = createLedger({ store, pepper });
  const [sent, stops] = await Promise.all([ledger.sent(), ledger.stops()]);
  const byPhone = new Map();
  for (const { rec } of leads) {
    if (!rec.consent) continue;
    const prev = byPhone.get(rec.whatsapp);
    if (!prev || prev.created_at < rec.created_at) byPhone.set(rec.whatsapp, rec);
  }
  let stopped = 0;
  const rows = [COLUMNS.join(',')];
  for (const rec of byPhone.values()) {
    const h = phoneHash(rec.whatsapp, pepper);
    if (stops[h]) { stopped += 1; continue; }
    rows.push([rec.first_name, rec.whatsapp, '91', rec.source, rec.age_band, rec.u18 ? 'true' : 'false', rec.interest_area, rec.consent_ts, rec.consent_text_version, sent[h] ? 'yes' : 'no', rec.created_at].map(q).join(','));
  }
  const file = path.resolve(arg(argv, '--out', path.join(os.homedir(), '.zenith', `ideas4-leads-${new Date().toISOString().slice(0, 10)}.csv`)));
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, rows.join('\n') + '\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  const u18 = [...byPhone.values()].filter((r) => r.u18).length;
  out(`Exported ${rows.length - 1} leads to ${file} (mode 0600). Records read: ${leads.length}, unreadable: ${bad}, duplicates merged: ${leads.length - byPhone.size}, on stop list (left out): ${stopped}, u18: ${u18}.`);
  out('Import it into Meritto (source=ideas4), then delete the CSV from this Mac.');
  return { file, rows: rows.length - 1, stopped, bad };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) exportLeads(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
