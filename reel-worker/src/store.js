// Files on the worker's own disk, with random ids. Nothing personal is stored next to them.
//   storage/in/<clipId>.bin (+ .json probe)     uploaded clips: deleted right after their render,
//                                               or after REEL_INPUT_TTL_MIN (10) if never rendered
//   storage/jobs/<jobId>/reel.mp4, cover.jpg    finished reels: deleted after REEL_TTL_HOURS (48)
//   storage/jobs/<jobId>/meta.json              createdAt, template, duration, repost consent flag
// The sweeper takes an injectable clock (now) so the 48 h rule is unit-tested with a fake clock.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Letters only: an id never looks like a phone number, date or handle to the TV-safety scan.
export function newId(n = 20) {
  const b = crypto.randomBytes(n);
  let s = '';
  for (const x of b) s += String.fromCharCode(97 + (x % 26));
  return s;
}
export const ID_RE = /^[a-z]{20}$/;

export function createStore({ dir }) {
  const inDir = path.join(dir, 'in');
  const jobsDir = path.join(dir, 'jobs');
  fs.mkdirSync(inDir, { recursive: true });
  fs.mkdirSync(jobsDir, { recursive: true });
  return {
    dir,
    inDir,
    jobsDir,
    clipFile: (id) => path.join(inDir, `${id}.bin`),
    clipMeta(id) {
      if (!ID_RE.test(id)) return null;
      try { return JSON.parse(fs.readFileSync(path.join(inDir, `${id}.json`), 'utf8')); } catch { return null; }
    },
    saveClipMeta(id, meta) { fs.writeFileSync(path.join(inDir, `${id}.json`), JSON.stringify(meta)); },
    deleteClip(id) {
      if (!ID_RE.test(id)) return;
      fs.rmSync(path.join(inDir, `${id}.bin`), { force: true });
      fs.rmSync(path.join(inDir, `${id}.json`), { force: true });
    },
    jobDir: (id) => path.join(jobsDir, id),
    jobMeta(id) {
      if (!ID_RE.test(id)) return null;
      try { return JSON.parse(fs.readFileSync(path.join(jobsDir, id, 'meta.json'), 'utf8')); } catch { return null; }
    },
    saveJobMeta(id, meta) {
      const f = path.join(jobsDir, id, 'meta.json');
      fs.writeFileSync(`${f}.tmp`, JSON.stringify(meta));
      fs.renameSync(`${f}.tmp`, f);
    },
  };
}

/**
 * Sweeper: deletes finished reels older than ttlHours, and uploaded clips older than inputTtlMin that no
 * active job uses. sweep() returns what it removed (counts and ids only).
 */
export function createSweeper({ store, ttlHours = 48, inputTtlMin = 10, now = () => Date.now(), inUse = () => new Set(), log = () => {} }) {
  function sweep() {
    const t = now();
    const removed = { reels: [], clips: [] };
    for (const id of fs.readdirSync(store.jobsDir)) {
      const d = store.jobDir(id);
      let created = 0;
      const meta = store.jobMeta(id);
      if (meta?.createdAt) created = meta.createdAt;
      else { try { created = fs.statSync(d).mtimeMs; } catch { continue; } }
      if (inUse().has(id)) continue;
      if (t - created >= ttlHours * 3600_000) { fs.rmSync(d, { recursive: true, force: true }); removed.reels.push(id); }
    }
    const used = inUse();
    for (const f of fs.readdirSync(store.inDir)) {
      const id = f.replace(/\.(bin|json|part)$/, '');
      if (used.has(id)) continue;
      const p = path.join(store.inDir, f);
      let m = 0;
      try { m = fs.statSync(p).mtimeMs; } catch { continue; }
      const meta = f.endsWith('.json') ? null : store.clipMeta(id);
      const created = meta?.createdAt || m;
      if (t - created >= inputTtlMin * 60_000) { fs.rmSync(p, { force: true }); if (!removed.clips.includes(id)) removed.clips.push(id); }
    }
    if (removed.reels.length || removed.clips.length) log({ kind: 'sweep', reels: removed.reels.length, clips: removed.clips.length });
    return removed;
  }
  let timer = null;
  return {
    sweep,
    start(everyMs = 5 * 60_000) { sweep(); timer = setInterval(sweep, everyMs); timer.unref?.(); },
    stop() { clearInterval(timer); },
  };
}
