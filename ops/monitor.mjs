#!/usr/bin/env node
// Stall uptime monitor for play.zenithschool.ai (27-28 Oct). Runs on a stall laptop in its own Terminal tab.
// Every 60 s: GET /status.json, one light GET per experience page, and the reel worker if /status.json reports it.
// Appends one line per check to data/uptime-YYYY-MM-DD.csv (IST date): time, check, ok, ms, http, demo.
// Nothing else is stored: no request bodies, no cookies, no names, no keys.
// After 2 failures in a row of the same check it prints a red line and beeps; a green line when it is back.
//
//   node ops/monitor.mjs                              watch https://play.zenithschool.ai every 60 s
//   node ops/monitor.mjs --url http://172.20.10.2:8790   watch the offline counter laptop instead
//   node ops/monitor.mjs summary                      uptime % and minutes down per experience per day, as rows
//                                                     for the "Daily summary" table in INCIDENT_LOG.md
//   node ops/monitor.mjs summary --day 2026-10-27
// Options: --interval <seconds> (60)  --exps jyotish,career,... (all 5)  --out-dir <dir> (data)  --runs <n> (forever)
//          --quiet (no sound)
// TODO(student): add a "page Nalin" option that sends one WhatsApp or email after 5 failed minutes in a row.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
export const EXPERIENCES = ['jyotish', 'career', 'shark', 'reel', 'asli'];
const NAMES = { site: 'Site (status.json)', jyotish: 'AI Jyotish', career: 'Career Studio', shark: 'AI Sharks', reel: 'Squad Reel Studio', asli: 'AI ya Asli?', 'reel-worker': 'Squad Reel worker' };
export const HEADER = 'time_ist,check,ok,ms,http,demo';
const RED = '\x1b[31;1m'; const GREEN = '\x1b[32;1m'; const RESET = '\x1b[0m';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "2026-10-27T09:15:00+05:30" and "2026-10-27" for a moment, in IST. */
export function ist(d = new Date()) {
  const s = new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 19);
  return { time: `${s}+05:30`, day: s.slice(0, 10) };
}

async function timed(url, { json = false } = {}) {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { cache: 'no-store', redirect: 'follow', headers: { 'user-agent': 'play-zenith-monitor' }, signal: AbortSignal.timeout(15000) });
    const body = json ? await r.json().catch(() => null) : (await r.arrayBuffer(), null);
    return { http: r.status, ms: Math.round(performance.now() - t0), body };
  } catch {
    return { http: 0, ms: Math.round(performance.now() - t0), body: null };
  }
}

/** Reel worker health, if core reports it in /status.json (any of these shapes). Otherwise null (not checked). */
export function reelFrom(s) {
  const r = s?.reelWorker ?? s?.reel_worker ?? s?.reel ?? s?.workers?.reel;
  if (r === undefined || r === null) return null;
  if (typeof r === 'boolean') return { ok: r };
  if (typeof r === 'object' && 'ok' in r) return { ok: !!r.ok, ms: Number.isFinite(r.ms) ? Math.round(r.ms) : '' };
  return null;
}

/** One round of checks. Returns rows { time, day, check, ok, ms, http, demo }. */
export async function checkOnce(base, exps = EXPERIENCES, now = new Date()) {
  const { time, day } = ist(now);
  const rows = [];
  const st = await timed(new URL('/status.json', base), { json: true });
  const s = st.body || {};
  const demo = st.body ? (s.demo || s.offline || s.claude === 'demo' ? 1 : 0) : '';
  rows.push({ time, day, check: 'site', ok: st.http === 200 && s.ok === true ? 1 : 0, ms: st.ms, http: st.http, demo });
  const pages = await Promise.all(exps.map((e) => timed(new URL(`/${e}/`, base))));
  exps.forEach((e, i) => rows.push({ time, day, check: e, ok: pages[i].http === 200 ? 1 : 0, ms: pages[i].ms, http: pages[i].http, demo }));
  const reel = st.body ? reelFrom(s) : null;
  if (reel) rows.push({ time, day, check: 'reel-worker', ok: reel.ok ? 1 : 0, ms: reel.ms ?? '', http: st.http, demo });
  return rows;
}

export function appendRows(dir, rows) {
  fs.mkdirSync(dir, { recursive: true });
  for (const r of rows) {
    const f = path.join(dir, `uptime-${r.day}.csv`);
    if (!fs.existsSync(f)) fs.writeFileSync(f, `${HEADER}\n`);
    fs.appendFileSync(f, `${r.time},${r.check},${r.ok},${r.ms},${r.http},${r.demo}\n`);
  }
}

export function readRows(dir, day) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => /^uptime-\d{4}-\d{2}-\d{2}\.csv$/.test(f) && (!day || f === `uptime-${day}.csv`)).sort();
  const rows = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n').slice(1)) {
      const [time, check, ok, ms, http, demo] = line.split(',');
      if (!time || !check) continue;
      rows.push({ time, day: time.slice(0, 10), check, ok: ok === '1', ms: Number(ms), http: Number(http), demo: demo === '1' });
    }
  }
  return rows;
}

const dayLabel = (d) => { const [, m, dd] = d.split('-'); return `${Number(dd)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}`; };

/**
 * Per day and check: samples, uptime %, minutes down (one sample per minute), incidents (runs of 2+ failed
 * minutes in a row, the same rule as the red alert) and demo minutes.
 */
export function summarize(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.day}|${r.check}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const [k, list] of groups) {
    const [day, check] = k.split('|');
    list.sort((a, b) => a.time.localeCompare(b.time));
    let down = 0; let incidents = 0; let run = 0; let demo = 0;
    for (const r of list) {
      if (r.demo) demo++;
      if (r.ok) { run = 0; continue; }
      down++; run++;
      if (run === 2) incidents++;
    }
    out.push({ day, check, samples: list.length, uptimePct: list.length ? (100 * (list.length - down)) / list.length : 0, minutesDown: down, incidents, demoMinutes: demo });
  }
  const order = ['site', ...EXPERIENCES, 'reel-worker'];
  return out.sort((a, b) => a.day.localeCompare(b.day) || order.indexOf(a.check) - order.indexOf(b.check));
}

/** Rows for INCIDENT_LOG.md: | Day | Experience | Uptime % (monitor) | Incidents | Total minutes down | */
export function summaryMarkdown(sum) {
  const lines = ['| Day | Experience | Uptime % (monitor) | Incidents | Total minutes down |', '|---|---|---|---|---|'];
  for (const s of sum) lines.push(`| ${dayLabel(s.day)} | ${NAMES[s.check] || s.check} | ${s.uptimePct.toFixed(1)} | ${s.incidents} | ${s.minutesDown} |`);
  const notes = [...new Set(sum.map((s) => s.day))].map((d) => {
    const site = sum.find((s) => s.day === d && s.check === 'site');
    return `- ${dayLabel(d)}: ${site ? site.samples : 0} minutes sampled; demo or offline mode on for ${site ? site.demoMinutes : 0} of them (degraded, not down).`;
  });
  return [...lines, '', 'Source: ops/monitor.mjs, one sample per minute per check. Incidents = 2 or more failed minutes in a row.', ...notes].join('\n');
}

function beep(quiet) {
  process.stdout.write('\x07');
  if (!quiet && process.platform === 'darwin') { try { spawn('afplay', ['/System/Library/Sounds/Sosumi.aiff'], { stdio: 'ignore' }).on('error', () => {}).unref(); } catch { /* no sound */ } }
}

export async function watch({ base, exps, dir, intervalMs, runs = Infinity, quiet = false, log = console.log }) {
  const fails = new Map();
  log(`Watching ${base} every ${intervalMs / 1000} s (${['status.json', ...exps.map((e) => `/${e}`)].join(', ')}). Writing ${path.join(dir, 'uptime-<day>.csv')}. Ctrl+C to stop.`);
  for (let n = 0; n < runs; n++) {
    const t0 = Date.now();
    const rows = await checkOnce(base, exps);
    appendRows(dir, rows);
    const bad = rows.filter((r) => !r.ok);
    log(`${rows[0].time.slice(11, 16)} ${bad.length ? `${bad.length} not ok: ${bad.map((r) => `${r.check} (${r.http || 'no answer'})`).join(', ')}` : `all ${rows.length} ok`}${rows[0].demo === 1 ? ' [demo mode]' : ''}`);
    for (const r of rows) {
      const before = fails.get(r.check) || 0;
      const now = r.ok ? 0 : before + 1;
      fails.set(r.check, now);
      if (now === 2) { log(`${RED}DOWN: ${NAMES[r.check] || r.check} failed 2 minutes in a row (HTTP ${r.http || 'no answer'}). Check the counter, then log it in INCIDENT_LOG.md.${RESET}`); beep(quiet); }
      else if (now > 2 && now % 5 === 0) { log(`${RED}STILL DOWN: ${NAMES[r.check] || r.check}, ${now} minutes.${RESET}`); beep(quiet); }
      if (r.ok && before >= 2) log(`${GREEN}BACK UP: ${NAMES[r.check] || r.check} after ${before} failed checks.${RESET}`);
    }
    if (n + 1 < runs) await sleep(Math.max(0, intervalMs - (Date.now() - t0)));
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
  const dir = path.resolve(ROOT, opt('out-dir', 'data'));
  if (argv[0] === 'summary') {
    const sum = summarize(readRows(dir, opt('day')));
    console.log(sum.length ? summaryMarkdown(sum) : `No uptime files in ${dir} yet.`);
  } else {
    const base = opt('url', 'https://play.zenithschool.ai');
    const exps = (opt('exps', '') || EXPERIENCES.join(',')).split(',').filter(Boolean);
    for (const e of exps) if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(e)) { console.error(`Not an experience id: ${e}`); process.exit(1); }
    watch({ base, exps, dir, intervalMs: Number(opt('interval', 60)) * 1000, runs: Number(opt('runs', Infinity)), quiet: argv.includes('--quiet') })
      .catch((e) => { console.error(e.message); process.exit(1); });
  }
}
