#!/usr/bin/env node
// Deletes lead records. Dry run by default (counts only); add --run to delete.
//   node experiences/career/ops/leads-purge.mjs --date 2026-10-27 [--run]     every record of that IST day
//   node experiences/career/ops/leads-purge.mjs --u18 [--run]                 every u18 record (re-consent / DPDP Rules)
//   node experiences/career/ops/leads-purge.mjs --all [--run]                 everything under leads/
// Store: bucket from .env or --local <data dir>. --u18 needs the private key (it decrypts to read the tag).
import { pathToFileURL } from 'node:url';
import { loadEnv, arg, storeFrom, privateKey, readLeads } from './common.mjs';

export async function purge(argv, out = console.log) {
  loadEnv();
  const store = storeFrom(argv);
  const run = argv.includes('--run');
  const date = arg(argv, '--date');
  let keys = [];
  if (argv.includes('--u18')) {
    const { leads } = await readLeads(store, privateKey(argv), { date });
    keys = leads.filter((l) => l.rec.u18).map((l) => l.key);
  } else if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date needs YYYY-MM-DD');
    keys = (await store.list(`leads/${date}/`)).filter((k) => k.endsWith('.bin'));
  } else if (argv.includes('--all')) {
    keys = (await store.list('leads/')).filter((k) => k.endsWith('.bin'));
  } else throw new Error('Say what to purge: --date YYYY-MM-DD, --u18 or --all (add --run to really delete).');
  if (!run) { out(`Dry run: ${keys.length} record(s) would be deleted. Add --run to delete them.`); return { would: keys.length, deleted: 0 }; }
  let n = 0;
  for (const k of keys) if (await store.del(k)) n += 1;
  out(`Deleted ${n} of ${keys.length} record(s).`);
  return { would: keys.length, deleted: n };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) purge(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
