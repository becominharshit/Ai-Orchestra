// npm run stats            -> table of today + totals from DATA_DIR/analytics.json
// npm run stats -- --csv   -> CSV per experience per day (same as /admin/export.csv)
// npm run stats -- --url https://play.zenithschool.ai --key <ADMIN_KEY>   -> read from a running server
import { makeConfig } from './config.js';
import { createAnalytics, EVENTS } from './analytics.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const csvMode = args.includes('--csv');
const url = opt('--url');
const key = opt('--key') || process.env.ADMIN_KEY;

async function main() {
  if (url) {
    if (!key) throw new Error('--url needs --key or ADMIN_KEY');
    const base = url.replace(/\/$/, '');
    const r = await fetch(`${base}/admin/${csvMode ? 'export.csv' : 'stats.json'}?key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error(`server said ${r.status}`);
    if (csvMode) return process.stdout.write(await r.text());
    return print(await r.json());
  }
  const a = createAnalytics({ config: makeConfig() });
  if (csvMode) return process.stdout.write(a.csv());
  print(a.snapshot());
}

function print(snap) {
  for (const [title, counts] of [[`Today ${snap.today}`, snap.todayCounts], ['All days', snap.totals]]) {
    console.log(`\n${title}`);
    const rows = Object.entries(counts).map(([exp, ev]) => ({ exp, ...Object.fromEntries(EVENTS.map((k) => [k, ev[k] || 0])) }));
    if (rows.length) console.table(rows); else console.log('  (no events yet)');
  }
  if (snap.claude) console.log(`\nClaude: $${snap.claude.spentUsd} of $${snap.claude.capUsd}, ${snap.claude.calls} calls, mode ${snap.claude.mode}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
