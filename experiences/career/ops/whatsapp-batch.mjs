#!/usr/bin/env node
// The 29 Oct batch: sends the Forecast PDF to every consenting lead that did not get it live.
// Runs on Avi's Mac (it decrypts the leads with the private key). DRY RUN BY DEFAULT: it prints what it would do.
//   node experiences/career/ops/whatsapp-batch.mjs [--local <data dir>] [--date 2026-10-27] [--limit 100]   dry run
//   node experiences/career/ops/whatsapp-batch.mjs --send                                                    real sends
// Skips: no consent, numbers already sent (sent list), numbers on the stop list, duplicates (one per number).
// Same campaign, template values, Document header and caps as the live server: WHATSAPP_DAILY_CAP for today's IST
// day and WHATSAPP_TOTAL_CAP across live + batch, read from and written to the SAME counter in the bucket.
// 1 message per second. Before --send: switch the live server off (POST /api/career/admin/whatsapp {"on":false}).
// Prints counts and masked numbers only.
import { pathToFileURL } from 'node:url';
import { loadEnv, arg, storeFrom, privateKey, readLeads, maskPhone } from './common.mjs';
import { readSettings, missingForSend } from '../lib/settings.js';
import { createLedger } from '../lib/ledger.js';
import { phoneHash } from '../lib/phone.js';
import { sendForecast } from '../lib/sendpdf.js';
import { aisensySender } from '../lib/aisensy.js';
import { istDay } from '../lib/store.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function batch(argv, { out = console.log, gapMs = 1000, sender = null } = {}) {
  loadEnv();
  const settings = readSettings(process.env, { publicUrl: process.env.PUBLIC_URL || 'https://play.zenithschool.ai' });
  const real = argv.includes('--send');
  const miss = missingForSend(settings);
  if (real && miss.length) throw new Error(`Cannot send, missing: ${miss.join(', ')}. Nothing was sent.`);
  if (!settings.pepper) throw new Error('PHONE_PEPPER is not in .env. Nothing was sent.');
  if (settings.allowlistDeny) throw new Error(`WHATSAPP_ALLOWLIST has ${settings.allowlistInvalid} entr(y/ies) that are not mobile numbers. Fix it or set it to off. Nothing was sent.`);
  const store = storeFrom(argv);
  const ledger = createLedger({ store, pepper: settings.pepper });
  const { leads, bad } = await readLeads(store, privateKey(argv), { date: arg(argv, '--date') });
  const [sent, stops] = await Promise.all([ledger.sent(), ledger.stops()]);
  const limit = Number(arg(argv, '--limit', '0')) || Infinity;

  const todo = new Map();
  const s = { records: leads.length, unreadable: bad, noConsent: 0, alreadySent: 0, stopped: 0, duplicates: 0, allowlistSkip: 0 };
  for (const { rec } of leads.sort((a, b) => (a.rec.created_at < b.rec.created_at ? -1 : 1))) {
    if (!rec.consent) { s.noConsent += 1; continue; }
    const h = phoneHash(rec.whatsapp, settings.pepper);
    if (stops[h]) { s.stopped += 1; continue; }
    if (sent[h]) { s.alreadySent += 1; continue; }
    if (settings.allowlist.length && !settings.allowlist.includes(rec.whatsapp)) { s.allowlistSkip += 1; continue; }
    if (todo.has(h)) { s.duplicates += 1; }
    todo.set(h, rec); // latest record per number wins (name, area)
  }
  const c = await ledger.counter();
  out(`Leads: ${s.records} records (${s.unreadable} unreadable). Skip: ${s.alreadySent} already sent, ${s.stopped} stop list, ${s.noConsent} no consent, ${s.duplicates} duplicates${settings.allowlist.length ? `, ${s.allowlistSkip} not on allow-list` : ''}.`);
  out(`To send: ${Math.min(todo.size, limit)}. Counter: ${c.total} of ${settings.totalCap} total, ${c.days[istDay()] || 0} of ${settings.dailyCap} today.`);
  if (!real) { out('Dry run: nothing was sent. Add --send to send.'); return { ...s, toSend: todo.size, sent: 0, failed: 0, capped: 0, dry: true }; }

  const send = sender || aisensySender({ url: settings.aisensyUrl, timeoutMs: settings.timeoutMs });
  let ok = 0; let failed = 0; let capped = 0; let n = 0;
  for (const [hash, rec] of todo) {
    if (n >= limit) break;
    n += 1;
    const fresh = await ledger.stops(); // a STOP can arrive while the batch runs
    if (fresh[hash]) { s.stopped += 1; continue; }
    const day = istDay();
    const capHit = await ledger.reserve({ dailyCap: settings.dailyCap, totalCap: settings.totalCap });
    if (capHit) { capped = todo.size - ok - failed; out(`Stopped at the ${capHit === 'total_cap' ? 'total' : 'daily'} cap. ${capped} not sent.`); break; }
    const r = await sendForecast({ settings, store, ledger, send, phone: rec.whatsapp, firstName: rec.first_name, areaId: rec.interest_area, hash, reservedDay: day });
    if (r.ok) ok += 1; else { failed += 1; out(`Failed ${maskPhone(rec.whatsapp)}: ${r.kind}`); }
    if (gapMs) await sleep(gapMs);
  }
  const c2 = await ledger.counter();
  out(`Done: ${ok} sent, ${failed} failed, ${capped} over the cap. Counter now ${c2.total} of ${settings.totalCap}.`);
  return { ...s, toSend: todo.size, sent: ok, failed, capped, dry: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) batch(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
