// Job queue (in memory, concurrency 1-2) and the render pipeline with live progress.
//
// Each job keeps a list of orchestra-shaped events ({ seq, t, ... } with t = assign | status | log | handoff |
// progress) that the phone polls (GET /jobs/:id?since=seq) and plays into its Agent Orchestra, which mirrors
// them to the counter TV. Every event comes from real work: the queue, ffmpeg progress, frame scores.
// Agents here: director (lead), editor, thumbnail. Captions + Hook run on play-web (Claude) before the job.
//
// Logs: ids, states and timings only. Never captions, hooks or file names.
// Every event text below must match a line in experiences/reel/public.js (ORX_BANK / ORX_TEMPLATES): the TV
// only shows registered public text (CHECK_build 12). test/reel/public.test.js checks a real render.
import fs from 'node:fs';
import path from 'node:path';
import { planCut } from './plan.js';
import { renderReel, pickCover, inspect } from './render.js';
import { TEMPLATES } from './templates.js';
import { newId } from './store.js';
import { cleanText } from './text.js';

export function createJobs({ store, assets, concurrency = 1, queueMax = 30, now = () => Date.now(), log = () => {} }) {
  const jobs = new Map(); // id -> job (in memory; finished jobs also have meta.json on disk)
  const queue = [];
  let running = 0;
  let doneCount = 0;
  const renderMs = []; // last 20 render times, for the queue ETA

  const avgMs = () => (renderMs.length ? renderMs.reduce((a, b) => a + b, 0) / renderMs.length : 20000);

  function emit(job, ev) {
    job.seq += 1;
    job.events.push({ seq: job.seq, ...ev });
    if (job.events.length > 400) job.events.splice(0, job.events.length - 400);
  }

  function position(job) {
    const i = queue.indexOf(job);
    return i < 0 ? 0 : i + 1;
  }

  function aheadOf(job) {
    const i = queue.indexOf(job);
    return i < 0 ? 0 : i + running; // reels before this one (queued ahead + rendering now)
  }

  /** Validate and queue. Throws { code } for friendly errors. */
  function submit({ template, clips, captions = [], hook = '', demo = false }) {
    if (!TEMPLATES[template]) throw Object.assign(new Error('bad template'), { code: 'bad_template', status: 400 });
    if (!Array.isArray(clips) || clips.length !== TEMPLATES[template].shots.length) throw Object.assign(new Error('bad clips'), { code: 'bad_clips', status: 400 });
    const metas = clips.map((id) => store.clipMeta(String(id)));
    if (metas.some((m) => !m)) throw Object.assign(new Error('clip missing'), { code: 'clip_missing', status: 410 });
    if (new Set(clips).size !== clips.length) throw Object.assign(new Error('same clip twice'), { code: 'bad_clips', status: 400 });
    // a squad waiting on the busy screen keeps its clips alive (the 10 min sweep is for abandoned uploads only)
    if (queue.length >= queueMax) { for (const [i, m] of metas.entries()) store.saveClipMeta(String(clips[i]), { ...m, createdAt: now() }); }
    if (queue.length >= queueMax) throw Object.assign(new Error('queue full'), { code: 'busy', status: 503, ahead: queue.length + running, retryMs: Math.round(avgMs() / 2) });
    const plan = planCut(template, metas.map((m) => m.duration));
    const job = {
      id: newId(), template, clips: clips.map(String), metas, plan, demo: !!demo,
      captions: plan.shots.map((_, i) => cleanText(captions[i] || '', 80)), hook: cleanText(hook, 48),
      state: 'queued', createdAt: now(), events: [], seq: 0, result: null, error: null,
    };
    jobs.set(job.id, job);
    queue.push(job);
    const ahead = aheadOf(job);
    emit(job, { t: 'log', id: 'director', text: ahead ? `Render queue: ${ahead} aage, ETA ~${Math.max(5, Math.round((ahead * avgMs()) / 1000))}s` : 'Render slot free, abhi shuru' });
    log({ kind: 'job', job: job.id, state: 'queued', ahead });
    setImmediate(pump);
    return job;
  }

  function pump() {
    while (running < concurrency && queue.length) {
      const job = queue.shift();
      running += 1;
      run(job).finally(() => { running -= 1; setImmediate(pump); });
    }
  }

  async function run(job) {
    const t0 = Date.now();
    job.state = 'running';
    job.startedAt = now();
    const dir = store.jobDir(job.id);
    fs.mkdirSync(dir, { recursive: true });
    const p = job.plan;
    const tpl = TEMPLATES[job.template];
    try {
      await assets.ready;
      // Director: the beat plan (real numbers from the clips)
      emit(job, { t: 'log', id: 'director', text: `${tpl.name} @ ${tpl.bpm} BPM: ${p.shots.map((s) => s.beats).join(' + ')} beats + 2s end card = ${p.total.toFixed(1)}s` });
      emit(job, { t: 'handoff', from: 'director', to: 'editor', label: '3 cuts on the beat' });
      emit(job, { t: 'assign', id: 'editor', task: 'Trim, 9:16 crop, captions burn, beat cuts' });
      emit(job, { t: 'status', id: 'editor', state: 'working' });
      p.shots.forEach((s, i) => {
        const m = job.metas[i];
        emit(job, { t: 'log', id: 'editor', text: `Shot ${s.n}: ${m.width}x${m.height} ${m.duration.toFixed(1)}s -> ${s.in.toFixed(1)}s to ${(s.in + s.dur).toFixed(1)}s, crop 1080x1920` });
      });
      const burned = job.captions.filter(Boolean).length;
      emit(job, { t: 'log', id: 'editor', text: `Burning hook (0-2s) + ${burned} captions, cuts at ${p.shots.slice(1).map((s) => `${s.start.toFixed(1)}s`).join(', ')}` });
      emit(job, { t: 'progress', value: 0 });

      const outFile = path.join(dir, 'reel.mp4');
      let lastShot = 0;
      let lastPct = -1;
      const r = await renderReel({
        template: job.template, plan: p, captions: job.captions, hook: job.hook, jobDir: dir,
        clips: job.clips.map((id, i) => ({ file: store.clipFile(id), hasAudio: job.metas[i].hasAudio })),
        fontsDir: assets.fontsDir, bedFile: assets.bed(job.template), endCardFile: assets.endCard, outFile,
      }, {
        onProgress: ({ value, speed, shot }) => {
          const pct = Math.floor(value * 100);
          if (shot !== lastShot && shot > lastShot) {
            lastShot = shot;
            emit(job, { t: 'log', id: 'editor', text: shot > p.shots.length ? `Zenith end card (2s) + bed fade-out` : `Encoding shot ${shot}/${p.shots.length}${speed ? `, ${speed.toFixed(1)}x realtime` : ''}` });
          }
          if (pct >= lastPct + 4 || (pct === 100 && lastPct !== 100)) { lastPct = pct; emit(job, { t: 'progress', value: Math.round(value * 1000) / 1000 }); }
        },
      });
      // inputs are deleted right after the render (privacy: visitor footage lives only as the finished reel)
      for (const id of job.clips) store.deleteClip(id);
      const info = await inspect(outFile);
      emit(job, { t: 'log', id: 'editor', text: `Rendered in ${(r.ms / 1000).toFixed(1)}s: ${info.width}x${info.height} h264 + AAC, ${info.duration.toFixed(1)}s, ${(info.bytes / 1048576).toFixed(1)} MB${info.faststart ? ', faststart' : ''}` });
      emit(job, { t: 'status', id: 'editor', state: 'done' });
      emit(job, { t: 'handoff', from: 'editor', to: 'thumbnail', label: 'final cut' });

      emit(job, { t: 'assign', id: 'thumbnail', task: 'Har shot se ek frame score karo, cover chuno' });
      emit(job, { t: 'status', id: 'thumbnail', state: 'working' });
      const cov = await pickCover({ outFile, plan: p, jobDir: dir });
      for (const s of cov.scores) emit(job, { t: 'log', id: 'thumbnail', text: `Shot ${s.shot} @ ${s.at.toFixed(1)}s: detail ${Math.round(s.kb)} KB, brightness ${Math.round(s.luma * 100)}%, score ${Math.round(s.score)}` });
      emit(job, { t: 'log', id: 'thumbnail', text: `Cover = shot ${cov.best.shot} frame (score ${Math.round(cov.best.score)})` });
      emit(job, { t: 'status', id: 'thumbnail', state: 'done' });
      emit(job, { t: 'handoff', from: 'thumbnail', to: 'director', label: 'cover ready' });

      for (const f of fs.readdirSync(dir)) if (!['reel.mp4', 'cover.jpg'].includes(f)) fs.rmSync(path.join(dir, f), { force: true });
      const ms = Date.now() - t0;
      renderMs.push(r.ms);
      if (renderMs.length > 20) renderMs.shift();
      job.result = { template: job.template, duration: Math.round(info.duration * 10) / 10, width: info.width, height: info.height, bytes: info.bytes, renderMs: r.ms, totalMs: ms, coverShot: cov.best.shot, faststart: info.faststart };
      store.saveJobMeta(job.id, { createdAt: job.createdAt, template: job.template, demo: job.demo, repost: false, ...job.result });
      emit(job, { t: 'progress', value: 1 });
      job.state = 'done';
      doneCount += 1;
      log({ kind: 'job', job: job.id, state: 'done', renderMs: r.ms, totalMs: ms, bytes: info.bytes });
    } catch (e) {
      // clips stay for one retry; the sweeper deletes unused clips after REEL_INPUT_TTL_MIN (10 min)
      fs.rmSync(dir, { recursive: true, force: true });
      job.state = 'failed';
      job.error = 'render_failed';
      emit(job, { t: 'status', id: 'editor', state: 'retry' });
      emit(job, { t: 'log', id: 'director', text: 'Render atak gaya. Ek baar phir try karte hain.' });
      log({ kind: 'job', job: job.id, state: 'failed', ms: Date.now() - t0, err: e.code === undefined ? e.name : `exit ${e.code}` });
    }
  }

  function view(id, since = 0) {
    const job = jobs.get(id);
    if (!job) {
      const meta = store.jobMeta(id);
      if (meta) return { id, state: 'done', ahead: 0, events: [], seq: 0, result: meta };
      return null;
    }
    return {
      id: job.id, state: job.state, ahead: job.state === 'queued' ? aheadOf(job) : 0, position: job.state === 'queued' ? position(job) : 0,
      plan: job.plan, seq: job.seq, events: job.events.filter((e) => e.seq > since), result: job.result, error: job.error,
    };
  }

  function setRepost(id, on) {
    const meta = store.jobMeta(id);
    if (!meta) return false;
    meta.repost = !!on;
    store.saveJobMeta(id, meta);
    return true;
  }

  // forget finished jobs from memory after an hour (the files stay until the sweeper's 48 h)
  const gc = setInterval(() => {
    const t = now();
    for (const [id, j] of jobs) if ((j.state === 'done' || j.state === 'failed') && t - j.createdAt > 3600_000) jobs.delete(id);
  }, 60_000);
  gc.unref?.();

  return {
    submit, view, setRepost,
    inUse: () => new Set([...jobs.values()].filter((j) => j.state === 'queued' || j.state === 'running').flatMap((j) => [j.id, ...j.clips])),
    status: () => ({ queued: queue.length, running, done: doneCount, concurrency, queueMax, avgRenderMs: Math.round(avgMs()) }),
    stop: () => clearInterval(gc),
  };
}
