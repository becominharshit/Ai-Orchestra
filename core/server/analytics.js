// Anonymous counters. Counts only: { day: { exp: { event: n } } }. No ids, names, IPs or free text, ever.
// Snapshot to DATA_DIR/analytics.json every SNAPSHOT_MS and on exit; optional Lightsail bucket copy.
import fs from 'node:fs';
import path from 'node:path';

// ref_visit = a page opened from a friend's share link (?ref=share). Counted once, nothing about the friend is stored.
// care_shown = the self-harm support card was shown (count only, CONTRACT 13.3)
export const EVENTS = ['start', 'complete', 'gate_view', 'gate_open_ig', 'gate_unlock', 'share', 'ref_visit', 'fallback', 'error', 'care_shown', 'reward_given'];
// Events a phone may send through POST /api/core/track. fallback, care_shown and reward_given are counted by core
// itself (demo fallback, the care route, the operator's "Reward given"), so a phone can never inflate them.
export const CLIENT_EVENTS = ['start', 'complete', 'gate_view', 'gate_open_ig', 'gate_unlock', 'share', 'ref_visit', 'error'];
// extra events with these prefixes are always server-side (leads, WhatsApp sends)
const SERVER_ONLY_EXTRA = /^(?:lead|wa)_/;
// reward_given = staff tapped "Reward given" for a big-screen token (CONTRACT 12.6)
const EXTRA_NAME = /^[a-z][a-z0-9_]{1,31}$/;
const DIM_KEY = /^[a-z][a-z_]{0,15}$/;
const DIM_ENUM = /^[a-z0-9_]{1,16}$/;

// Day in India time, so the 27 Oct numbers are 27 Oct for the team.
export function istDay(d = new Date()) {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function createAnalytics({ config, log = () => {}, now = () => new Date() }) {
  const file = path.join(config.dataDir, 'analytics.json');
  let data = { days: {} };
  const knownExps = new Set(['hub', 'core', ...config.experiences.map((e) => e.id)]);
  let dirty = false;
  let s3 = null;
  const BUCKET_KEY = 'analytics/analytics.json';

  if (fs.existsSync(file)) {
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); if (!data.days) data = { days: {} }; } catch { log({ kind: 'analytics', err: 'corrupt snapshot, starting fresh' }); }
  }

  function allowExp(id) { knownExps.add(id); }

  // Extra count-only events per experience (e.g. shark: verdict_deal). Declared names only, never free text.
  const declared = new Map(); // exp -> Set(event)
  const MAX_EXTRA_KEYS = 200; // per exp per day, so a bug cannot explode the file
  const serverOnly = new Map(); // exp -> Set(event) that phones may not send through /api/core/track
  function declare(exp, names, { serverOnly: so = false } = {}) {
    const s = declared.get(exp) || new Set();
    for (const n of names) {
      if (!EXTRA_NAME.test(n) || EVENTS.includes(n)) throw new Error(`analytics: bad extra event name ${n}`);
      s.add(n);
      if (so) { const x = serverOnly.get(exp) || new Set(); x.add(n); serverOnly.set(exp, x); }
    }
    declared.set(exp, s);
  }
  /** true when a phone may count this event via /api/core/track (CHECK-12 F2). */
  function clientTrackable(exp, event) {
    if (EVENTS.includes(event)) return CLIENT_EVENTS.includes(event);
    if (SERVER_ONLY_EXTRA.test(event)) return false;
    return !serverOnly.get(exp)?.has(event);
  }

  /** Count one standard event. Unknown exps or events are ignored (returns false). */
  function inc(exp, event, n = 1) {
    if (!knownExps.has(exp) || !EVENTS.includes(event)) return false;
    return bump(exp, event, n);
  }

  /**
   * Count an extra event, optionally with ONE small dimension: { round: 3 } (integer 0..99) or { kind: 'image' }
   * (short enum, a-z 0-9 _ up to 16 chars). Stored as "round_right[round=3]". Returns false if invalid.
   */
  function count(exp, event, dim) {
    if (EVENTS.includes(event)) return inc(exp, event);
    if (!knownExps.has(exp) || !declared.get(exp)?.has(event)) return false;
    let key = event;
    if (dim !== undefined && dim !== null) {
      const ent = typeof dim === 'object' ? Object.entries(dim) : [];
      if (ent.length !== 1) return false;
      const [k, v] = ent[0];
      if (!DIM_KEY.test(k)) return false;
      const okVal = (Number.isInteger(v) && v >= 0 && v <= 99) || (typeof v === 'string' && DIM_ENUM.test(v));
      if (!okVal) return false;
      key = `${event}[${k}=${v}]`;
    }
    const d = data.days[istDay(now())]?.[exp] || {};
    if (!(key in d) && Object.keys(d).length >= MAX_EXTRA_KEYS) return false;
    return bump(exp, key, 1);
  }

  function bump(exp, key, n) {
    const day = istDay(now());
    const d = (data.days[day] ||= {});
    const e = (d[exp] ||= {});
    e[key] = (e[key] || 0) + n;
    dirty = true;
    return true;
  }

  function totals() {
    const out = {};
    for (const d of Object.values(data.days)) for (const [exp, ev] of Object.entries(d)) {
      out[exp] ||= {};
      for (const [k, v] of Object.entries(ev)) out[exp][k] = (out[exp][k] || 0) + v;
    }
    return out;
  }

  function snapshot() {
    return { today: istDay(now()), todayCounts: data.days[istDay(now())] || {}, totals: totals(), days: data.days };
  }

  /** CSV: one row per day per experience; a column per standard event, then one per extra event key. */
  function csv() {
    const extra = new Set();
    for (const d of Object.values(data.days)) for (const ev of Object.values(d)) for (const k of Object.keys(ev)) if (!EVENTS.includes(k)) extra.add(k);
    const extraCols = [...extra].sort();
    const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const rows = [['day', 'experience', ...EVENTS, ...extraCols].map(q).join(',')];
    for (const day of Object.keys(data.days).sort()) {
      for (const exp of Object.keys(data.days[day]).sort()) {
        const ev = data.days[day][exp];
        rows.push([day, exp, ...EVENTS.map((k) => ev[k] || 0), ...extraCols.map((k) => ev[k] || 0)].join(','));
      }
    }
    return rows.join('\n') + '\n';
  }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
    dirty = false;
  }

  async function getS3() {
    if (!config.bucketName || config.offline) return null;
    if (!s3) {
      const { S3Client } = await import('@aws-sdk/client-s3');
      // Credentials come explicitly from BUCKET_KEY_ID / BUCKET_KEY_SECRET (set by deploy), never from a profile.
      const credentials = config.bucketKeyId && config.bucketKeySecret ? { accessKeyId: config.bucketKeyId, secretAccessKey: config.bucketKeySecret } : undefined;
      s3 = new S3Client({ region: config.bucketRegion, ...(credentials ? { credentials } : {}) });
    }
    return s3;
  }

  async function pushBucket() {
    const c = await getS3();
    if (!c) return;
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await c.send(new PutObjectCommand({ Bucket: config.bucketName, Key: BUCKET_KEY, Body: JSON.stringify(data), ContentType: 'application/json' }));
  }

  // On a fresh container (no local file) pull the last snapshot from the bucket, then merge-by-max.
  async function pullBucket() {
    const c = await getS3();
    if (!c) return;
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const r = await c.send(new GetObjectCommand({ Bucket: config.bucketName, Key: BUCKET_KEY }));
      const remote = JSON.parse(await r.Body.transformToString());
      for (const [day, exps] of Object.entries(remote.days || {})) for (const [exp, ev] of Object.entries(exps)) for (const [k, v] of Object.entries(ev)) {
        const cur = ((data.days[day] ||= {})[exp] ||= {});
        cur[k] = Math.max(cur[k] || 0, v);
      }
      log({ kind: 'analytics', msg: 'restored from bucket' });
    } catch (e) {
      log({ kind: 'analytics', msg: 'no bucket snapshot yet', err: e?.name });
    }
  }

  let timer = null;
  function start() {
    timer = setInterval(async () => {
      if (!dirty) return;
      try { save(); await pushBucket(); } catch (e) { log({ kind: 'analytics', err: e?.name || 'save failed' }); }
    }, config.snapshotMs);
    timer.unref?.();
  }
  async function stop() {
    clearInterval(timer);
    try { save(); await pushBucket(); } catch { /* best effort on exit */ }
  }

  return { inc, count, declare, clientTrackable, declared: (exp) => [...(declared.get(exp) || [])], snapshot, totals, csv, save, start, stop, pullBucket, allowExp, EVENTS };
}
