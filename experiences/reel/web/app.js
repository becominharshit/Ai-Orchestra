// Squad Reel Studio, phone app.
//   squad size -> template -> 3 recorded shots (upload with progress, preview, retake)
//   -> Agent Orchestra: Director plans the beat cut, Captions + Hook (Claude) write the text, Editor renders with
//      ffmpeg on the reel worker, Thumbnail picks the cover. Live progress comes from the worker job and is
//      mirrored to the counter TV.  -> follow gate -> preview, save, post caption, repost consent, Doston ko bhejo.
// Opening /reel/?get=<id> (the TV QR) shows a finished reel (also behind the gate).
import { api, track, tvMirror, tvToggle, hero, isHero, h, config, retryScreen, sleep } from '/core/kit.js';
import { Orchestra, iconSvg } from '/core/orchestra.js';
import { gate } from '/core/gate.js';
import { makeShareCard, sendToFriends } from '/core/sharecard.js';

const $ = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll('.rl-screen')];
const show = (id) => { for (const s of screens) s.hidden = s.id !== id; window.scrollTo(0, 0); };
const params = new URLSearchParams(location.search);

const AGENTS = {
  orchestrator: { id: 'director', name: 'Director', role: 'Beat cut plan', icon: 'film' },
  agents: [
    { id: 'captions', name: 'Captions', role: 'Claude captions', icon: 'chat' },
    { id: 'hook', name: 'Hook', role: 'Claude opener', icon: 'bolt' },
    { id: 'editor', name: 'Editor', role: 'ffmpeg 9:16 cut', icon: 'wand' },
    { id: 'thumbnail', name: 'Thumbnail', role: 'Cover pick', icon: 'camera' },
  ],
};

const st = { squad: 3, tpl: null, templates: [], limits: { maxMb: 80, maxS: 30, minS: 2 }, shots: [], job: null, mirror: null, card: null, cfg: null };

// ---------- squad size (optional chips on the shots screen; only fills the {n} slot of some bank lines) ----------
function radio(groupId, onPick) {
  const g = $(groupId);
  g.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const x of g.querySelectorAll('button')) x.setAttribute('aria-checked', String(x === b));
    onPick(b.dataset);
  });
}
radio('squad', (d) => { st.squad = Number(d.n); });
$('tv-toggle').replaceWith(tvToggle((on) => st.mirror?.setEnabled(on)));
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => show(b.dataset.back));

// ---------- step 1: template (first screen, no form before the fun part) ----------
function renderTemplates() {
  $('templates').replaceChildren(...st.templates.map((t) => {
    const total = t.shots.reduce((a, s) => a + s.seconds, 0);
    const ico = h('span', { class: 'rl-tpl-ico' });
    ico.appendChild(iconSvg(t.icon));
    return h('button', { class: 'rl-tpl', type: 'button', style: `--acc:${t.accent}`, 'data-tpl': t.id, onclick: () => pickTemplate(t) },
      h('div', { class: 'rl-tpl-top' }, ico, h('div', {}, h('b', {}, t.name), h('small', {}, t.vibe)),
        h('div', { class: 'rl-tpl-meta' }, `${t.bpm} BPM`, h('br'), `~${total + 2}s`)),
      h('ol', {}, ...t.shots.map((s) => h('li', {}, s.prompt))));
  }));
}

function pickTemplate(t) {
  st.tpl = t;
  track('start', undefined, { once: true });
  track('reel_template', { tpl: t.id });
  st.shots = t.shots.map((s, i) => ({ n: i + 1, ...s, state: 'empty', clipId: null, duration: 0, url: null, msg: '' }));
  $('shots-tpl').textContent = t.name;
  renderShots();
  show('s-shots');
}

// ---------- step 2: shots ----------
function renderShots() {
  $('shots').replaceChildren(...st.shots.map(shotCard));
  $('make').disabled = !st.shots.every((s) => s.state === 'ready');
}

function shotCard(s) {
  const thumb = h('div', { class: 'rl-thumb' });
  if (s.url) thumb.appendChild(h('video', { src: s.url, muted: true, playsinline: true, autoplay: true, loop: true }));
  else thumb.appendChild(h('span', { class: 'rl-n' }, String(s.n)));
  if (s.state === 'ready') thumb.appendChild(h('span', { class: 'rl-ok' }, 'OK'));
  const input = h('input', { type: 'file', accept: 'video/*', capture: 'environment', 'data-shot': s.n });
  input.addEventListener('change', () => { const f = input.files?.[0]; input.value = ''; if (f) onFile(s, f); });
  const busy = s.state === 'uploading' || s.state === 'checking';
  const rec = h('label', { class: `rl-rec${s.state === 'empty' ? '' : ' retake'}`, 'aria-disabled': busy ? 'true' : null }, s.state === 'empty' ? `Shot ${s.n} record karo` : 'Retake', busy ? null : input);
  const statusText = { empty: `Target ${s.seconds}s, thoda zyada record karo`, checking: 'Clip check ho rahi hai...', uploading: `Upload ${Math.round((s.pct || 0) * 100)}%`, ready: `Ready: ${s.duration.toFixed(1)}s${s.sample ? ' (sample footage)' : ''}`, error: s.msg }[s.state];
  const body = h('div', { class: 'rl-shot-body' },
    h('span', { class: 'rl-sec' }, `SHOT ${s.n} · ${s.seconds}s`),
    h('b', {}, s.prompt), h('small', {}, s.tip),
    s.sample ? null : rec,
    s.state === 'uploading' ? h('div', { class: 'rl-bar' }, h('i', { style: `width:${Math.round((s.pct || 0) * 100)}%` })) : null,
    h('div', { class: `rl-status${s.state === 'error' ? ' err' : s.state === 'ready' ? ' ok' : ''}`, 'data-status': s.n }, statusText));
  return h('li', { class: `rl-shot is-${s.state}`, 'data-shot': s.n }, thumb, body);
}

function videoDuration(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (d) => { v.removeAttribute('src'); resolve(d); };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 4000);
    v.src = url;
  });
}

async function onFile(s, file) {
  if (s.state !== 'empty') track('reel_retake');
  if (s.url) URL.revokeObjectURL(s.url);
  Object.assign(s, { state: 'checking', clipId: null, url: URL.createObjectURL(file), msg: '', pct: 0 });
  renderShots();
  const L = st.limits;
  const fail = (msg) => { Object.assign(s, { state: 'error', msg }); renderShots(); };
  if (file.type && !file.type.startsWith('video/')) return fail('Yeh video nahi hai. Camera se shot record karo.');
  if (file.size > L.maxMb * 1048576) return fail(`Clip bahut badi hai (max ${L.maxMb} MB). Chhota shot lo.`);
  const d = await videoDuration(s.url); // null when the browser cannot read it: the worker checks again
  if (d !== null && d > L.maxS + 0.5) return fail(`Shot ${Math.round(d)}s ka hai, max ${L.maxS}s. Chhota shot lo.`);
  if (d !== null && d < L.minS) return fail(`Shot bahut chhota hai. Kam se kam ${Math.round(L.minS)} second record karo.`);
  s.state = 'uploading';
  renderShots();
  try {
    const r = await upload(file, s.n, (p) => { s.pct = p; const bar = document.querySelector(`[data-shot="${s.n}"] .rl-bar i`); const t = document.querySelector(`[data-status="${s.n}"]`); if (bar) bar.style.width = `${Math.round(p * 100)}%`; if (t) t.textContent = `Upload ${Math.round(p * 100)}%`; });
    Object.assign(s, { state: 'ready', clipId: r.clipId, duration: r.duration });
  } catch (e) {
    return fail(e.message);
  }
  renderShots();
}

/** XHR upload (fetch has no upload progress). Retries busy/5xx twice, then shows a friendly message. */
function upload(file, n, onProgress) {
  const once = () => new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `/api/reel/upload?shot=${n}`);
    x.setRequestHeader('content-type', file.type && file.type.startsWith('video/') ? file.type : 'video/mp4');
    if (isHero()) x.setRequestHeader('x-pz-demo', 'hero');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => {
      let data = {};
      try { data = JSON.parse(x.responseText || '{}'); } catch { /* not json */ }
      if (x.status >= 200 && x.status < 300) return resolve(data);
      const err = new Error(data.message || 'Upload nahi hua. Ek baar phir try karo.');
      err.retry = x.status >= 500 || x.status === 429;
      err.wait = data.retryMs || 3000;
      reject(err);
    };
    x.onerror = () => reject(Object.assign(new Error('Network slow hai. Shot dobara bhejo (Retake).'), { retry: true, wait: 2000 }));
    x.send(file);
  });
  return (async () => {
    for (let i = 0; ; i++) {
      try { return await once(); } catch (e) {
        if (!e.retry || i >= 2) throw e;
        await sleep(Math.min(8000, e.wait));
      }
    }
  })();
}

$('make').addEventListener('click', () => {
  if (!st.shots.every((s) => s.state === 'ready')) return;
  run().catch(async (err) => {
    console.warn('[reel]', err.message);
    if (err.status === 410) { for (const s of st.shots) Object.assign(s, { state: 'empty', clipId: null }); renderShots(); }
    await retryScreen({ title: 'Reel abhi nahi bani', body: err.message || 'Ek baar phir try karte hain.', btn: 'Theek hai' });
    show('s-shots');
  });
});

// ---------- step 4: the orchestra ----------
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const t = st.tpl;
  show('s-run');
  st.mirror?.end();
  const orx = new Orchestra($('orx'), { title: `Squad Reel: ${t.name}`, mode: 'phone', ...AGENTS });
  st.mirror = tvMirror(orx);
  const t0 = performance.now();
  const clips = st.shots.map((s) => s.clipId);

  // Director: real beat plan from the clip lengths (computed on the worker)
  // every TV-visible string below matches a registered template in experiences/reel/public.js (CHECK_build 12)
  orx.log('director', `${t.name}: 3 clips mile (${st.shots.map((s) => `${Math.min(99.9, s.duration).toFixed(1)}s`).join(', ')}), squad of ${st.squad}`);
  orx.progress(0.04);
  const plan = await api('plan', { template: t.id, clips });
  for (const s of plan.shots) orx.log('director', `Shot ${s.n}: ${s.beats} beats = ${s.dur.toFixed(1)}s from ${s.in.toFixed(1)}s @ ${plan.bpm} BPM`);
  orx.progress(0.1);

  // Captions + Hook in parallel (Claude through the core proxy; mock/offline answer from fixtures)
  const durations = plan.shots.map((s) => s.dur);
  orx.handoff('director', 'captions', durations.map((d) => `${d.toFixed(1)}s`).join(' / '));
  orx.handoff('director', 'hook', '0-2s opener');
  const [cap, hk] = await Promise.all([
    orx.step('captions', 'Har shot ke liye Hinglish caption', async () => {
      const r = await api('captions', { template: t.id, squad: st.squad, durations });
      orx.log('captions', `${r.source}: 3 captions from the ${t.name} bank`);
      r.captions.forEach((c, i) => orx.log('captions', `Shot ${i + 1}: "${c.text}"`));
      return r;
    }),
    orx.step('hook', 'Opening text, 0-2s', async () => {
      const r = await api('hook', { template: t.id, squad: st.squad });
      orx.log('hook', `${r.source}: "${r.hook.text}"`);
      orx.log('hook', `Style: ${r.style.text}`);
      return r;
    }),
  ]);
  orx.handoff('captions', 'editor', '3 captions');
  orx.handoff('hook', 'editor', 'hook text');
  orx.progress(0.28);

  // Editor + Thumbnail: the render job on the worker; its events drive the orchestra
  // ids only: play-web resolves the bank text that gets burned into the reel
  const job = await api('render', { template: t.id, clips, captionIds: cap.captions.map((c) => c.id), hookId: hk.hook.id, squad: st.squad });
  const result = await follow(job.id, orx);
  for (const s of st.shots) { if (s.url) URL.revokeObjectURL(s.url); s.url = null; }

  const secs = (performance.now() - t0) / 1000;
  orx.done(`Reel ready: ${Number(result.duration).toFixed(1)}s, 1080x1920, ${(result.bytes / 1048576).toFixed(1)} MB, ${Math.round(secs)}s total`);
  // keep the { pt, text } objects: the share card only takes publicText lines (CONTRACT 13.2)
  st.job = { id: job.id, result, tpl: t, hookPt: hk.hook, capPts: cap.captions, hook: hk.hook.text, captions: cap.captions.map((c) => c.text), post: cap.post.text, source: cap.source };
  st.reelOnTv = false;
  // The TV gets NOTHING of the result before the follow gate (CHECK-04 F1): see tvResult(), called after unlock.
  track('complete');
  await sleepMs(1400);
  renderResult();
}

/** Poll the worker job and play its events into the orchestra. Resolves with the result. */
async function follow(id, orx) {
  let since = 0;
  let lastAhead = -1;
  const q = $('queue');
  for (;;) {
    const v = await api(`job/${id}?since=${since}`);
    for (const ev of v.events || []) {
      since = Math.max(since, ev.seq);
      if (ev.t === 'assign') orx.assign(ev.id, ev.task);
      else if (ev.t === 'status') orx.status(ev.id, ev.state);
      else if (ev.t === 'log') orx.log(ev.id, ev.text);
      else if (ev.t === 'handoff') orx.handoff(ev.from, ev.to, ev.label);
      else if (ev.t === 'progress') orx.progress(0.3 + 0.62 * ev.value);
    }
    if (v.state === 'queued') {
      q.hidden = false;
      $('queue-n').textContent = String(v.ahead);
      $('queue-t').textContent = v.ahead === 1 ? 'reel aage hai, tumhari baari aa rahi hai' : 'reels aage hain, tumhari baari aa rahi hai';
      if (v.ahead !== lastAhead && lastAhead !== -1) orx.log('director', `Queue update: ${v.ahead} aage`);
      lastAhead = v.ahead;
    } else q.hidden = true;
    if (v.state === 'done') { orx.progress(0.97); return v.result; }
    if (v.state === 'failed') throw Object.assign(new Error('Render atak gaya. Shots wahi rahenge, ek baar phir try karo.'), { status: 500 });
    await sleepMs(document.hidden ? 2000 : 650);
  }
}

// ---------- step 5: result (behind the follow gate) ----------
function renderResult() {
  const j = st.job;
  $('r-title').replaceChildren(document.createTextNode(`${j.tpl.name} `), h('span', { class: 'pz-grad-text' }, 'ready hai'));
  $('r-hook').textContent = j.hook ? `"${j.hook}"` : '';
  $('r-stats').textContent = `${j.result.duration}s · 1080x1920 · ${j.tpl.name}`;
  const art = $('locked-art');
  art.querySelector('img')?.remove();
  art.prepend(h('img', { src: `/api/reel/cover/${j.id}`, alt: '' }));
  $('locked').hidden = false;
  $('unlocked').hidden = true;
  $('player').removeAttribute('src');
  $('download').removeAttribute('href');
  $('minor-note').hidden = true;
  $('repost').checked = false;
  $('post-text').textContent = postCaption();
  $('r-src').textContent = { Claude: 'Captions picked live by Claude from our line bank', Mock: 'Mock mode (no API key)', Offline: 'Offline mode: lines from our bank', Demo: 'Demo mode: fictional, abstract footage' }[j.source] || '';
  show('s-result');
}

function postCaption() {
  const j = st.job;
  return `${j.post || 'Squad reel ready!'}\nAI agents ne edit kiya, Zenith stall @ KRMU Ideas 4.0.\nApni squad ko tag karo (tag your squad) aur @zenith_school_of_ai ko bhi!`;
}

/**
 * Result on the counter TV, only after the follow gate. Template name, bank lines and the download QR (it opens the
 * gated friend page). The reel itself (squad faces, maybe under 18) plays on the TV only when the squad turns on
 * "Big screen pe reel chalao" for this reel (separate toggle, default off). Strings are registered public text;
 * url and qr keep their own rules.
 */
async function tvResult() {
  const j = st.job;
  if (!st.mirror || !j?.unlocked || !j.tpl) return;
  const cfg = await config();
  const payload = {
    kicker: 'Squad Reel ready', title: j.tpl.name, hook: j.hook, captions: j.captions, bpm: j.tpl.bpm, seconds: j.result.duration,
    qr: `${cfg.publicUrl}/reel/?get=${j.id}`,
  };
  if (st.reelOnTv) payload.url = `/api/reel/file/${j.id}`;
  st.mirror.result(payload);
}

$('tv-reel').addEventListener('change', (e) => { st.reelOnTv = e.target.checked; tvResult(); });

$('unlock').addEventListener('click', async () => {
  await gate('reel', { reward: 'Tumhari reel: preview, save aur share' });
  st.job.unlocked = true;
  $('tv-reel-box').hidden = !(st.mirror && st.mirror.enabled);
  $('tv-reel').checked = !!st.reelOnTv;
  tvResult();
  const id = st.job.id;
  $('locked').hidden = true;
  $('unlocked').hidden = false;
  $('player').poster = `/api/reel/cover/${id}`;
  $('player').src = `/api/reel/file/${id}`;
  $('download').href = `/api/reel/file/${id}?dl=1`;
  $('player').play().catch(() => {});
});

$('save').addEventListener('click', async () => {
  const id = st.job.id;
  track('reel_download');
  try {
    const blob = await fetch(`/api/reel/file/${id}`).then((r) => { if (!r.ok) throw new Error('gone'); return r.blob(); });
    const file = new File([blob], 'zenith-squad-reel.mp4', { type: 'video/mp4' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: postCaption() }); return; }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  $('download').click();
});
$('download').addEventListener('click', () => track('reel_download'));

$('copy-post').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(postCaption()); $('copy-post').textContent = 'Copied!'; } catch { $('copy-post').textContent = 'Text select karke copy karo'; }
  setTimeout(() => { $('copy-post').textContent = 'Copy'; }, 2000);
});

$('repost').addEventListener('change', async (e) => {
  $('minor-note').hidden = !e.target.checked; // under-18 squads: a teacher's or parent's OK first
  try { await api(`repost/${st.job.id}`, { repost: e.target.checked }); } catch { e.target.checked = false; }
});

$('friends').addEventListener('click', async () => {
  const j = st.job;
  // share card = publicText objects from the server only (bank lines + the template name)
  const c = await api(`card?template=${encodeURIComponent(j.tpl.id || 'intro')}`);
  st.card ||= await makeShareCard({ kicker: c.kicker, title: c.title, lines: [j.hookPt, ...(j.capPts || []).slice(0, 2), c.line].filter(Boolean).slice(0, 4), footer: '' });
  await sendToFriends(st.card, { text: 'Humne Zenith ke AI agents se squad reel banayi. Tum bhi apni squad ke saath try karo!', filename: 'zenith-squad-reel.png' });
});

$('again').addEventListener('click', () => {
  st.mirror?.end();
  st.mirror = null;
  st.reelOnTv = false;
  st.card = null;
  st.job = null;
  history.replaceState(null, '', location.pathname + (params.get('c') ? `?c=${params.get('c')}` : ''));
  show('s-intro');
});

// ---------- boot ----------
async function boot() {
  const r = await api('templates');
  st.templates = r.templates;
  st.limits = r.limits;
  renderTemplates();
  const get = params.get('get');
  if (get && /^[a-z]{20}$/.test(get)) return openShared(get);
  if (isHero()) return runHero();
  show('s-intro');
}

// TV QR: a friend opens the finished reel (same gate)
async function openShared(id) {
  try {
    const v = await api(`job/${id}`);
    if (v.state !== 'done') throw new Error('not ready');
    const tpl = st.templates.find((t) => t.id === v.result?.template) || st.templates[0];
    st.job = { id, result: v.result, tpl, hookPt: null, capPts: [], hook: '', captions: [], post: '', source: '' };
    renderResult();
  } catch {
    await retryScreen({ title: 'Reel nahi mili', body: 'Yeh reel ab available nahi hai (48 ghante baad delete ho jaati hai). Apni squad ke saath nayi banao!', btn: 'Nayi reel banao' });
    show('s-intro');
  }
}

// ?demo=hero: fictional squad + abstract sample clips, the whole flow runs by itself (for filming)
async function runHero() {
  const hp = await hero();
  show('s-intro');
  if (!hp) return;
  $('hero-note').hidden = false;
  $('hero-note').textContent = hp.label;
  st.squad = hp.profile.squad || 4;
  for (const b of $('squad').querySelectorAll('button')) b.setAttribute('aria-checked', String(Number(b.dataset.n) === st.squad));
  await sleepMs(1400);
  const t = st.templates.find((x) => x.id === hp.profile.template) || st.templates[0];
  pickTemplate(t);
  const r = await api('hero-clips', {});
  r.clips.forEach((c, i) => Object.assign(st.shots[i], { state: 'ready', clipId: c.clipId, duration: c.duration, url: `/api/reel/sample/${i + 1}`, sample: true }));
  renderShots();
  await sleepMs(1600);
  $('make').click();
  // filming: abstract footage, no people, so the demo unlocks itself and plays the reel on the TV
  await new Promise((r) => { const t = setInterval(() => { if (!$('s-result').hidden) { clearInterval(t); r(); } }, 300); });
  await sleepMs(1800);
  st.reelOnTv = true;
  $('unlock').click();
  await sleepMs(1400);
  document.querySelector('[data-pz=gate-unlock]')?.click();
}

boot().catch((e) => console.warn('[reel] boot', e.message));
