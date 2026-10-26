// Career Studio (counter 5, plus 4 while Agent Builder is off; read them from ctx.counters.of()): (A) Career Forecast preview from a read-only copy of cf_data_v60 + WhatsApp capture
// and WhatsApp PDF send, (B) Job Time Machine 2026 vs 2030 with an agent team. See README.md.
// Privacy: no request body, name, number, token or AI text is ever logged. Analytics are counts only.
import { phoneBundle, areaById } from './lib/data.js';
import { jobsBundle, jobById, AGENTS_SCHEMA, agentsPrompt, cleanAgents, DOCTOR_SCHEMA, doctorPrompt, doctorFromPicks } from './lib/jobs.js';
import { readSettings } from './lib/settings.js';
import { createStore } from './lib/store.js';
import { publicKeyFromEnv } from './lib/envelope.js';
import { validateLead, AGE_BANDS, PURPOSE_LINE, OPT_OUT_LINE, CONSENT_TEXT_VERSION } from './lib/leads.js';
import { normalizePhone } from './lib/phone.js';
import { createWhatsApp } from './lib/whatsapp.js';
import { aisensySender } from './lib/aisensy.js';
import { readToken } from './lib/links.js';
import { pdfFor } from './lib/sendpdf.js';
import { createPlayTokens, createWindow } from './lib/play.js';
import { submitLead } from './lib/intake.js';
import { registerPublic, localSafety, publicDefs } from './lib/public.js';
import { screenAgents } from './lib/screen.js';
import { clientIp } from '../../core/server/limits.js';

// /lead answers only "live" or "batch" (same shape for every number), so nobody can probe whether a number is new,
// already sent (24 h) or on the stop list. Recent and stopped numbers get a decoy job that looks like a send.
export const COPY = {
  done: 'Ho gaya!',
  live: 'Tumhara forecast PDF 1 minute mein WhatsApp pe aa raha hai',
  batch: 'Tumhara forecast PDF 48 ghante mein WhatsApp pe aayega',
  demo: 'Demo mode: kuch save ya send nahi hua.',
  playNeeded: 'Pehle ek career area dekho ya Job Time Machine ka ek round khelo, phir form bharo.',
  slow: 'Is network se abhi kaafi forms aa gaye. Thodi der baad try karo, ya counter pe bolo.',
};

const EXTRA = ['judge_flag', 'lead_submit', 'lead_u18', 'wa_live', 'wa_batch', 'wa_sent', 'wa_failed', 'wa_stop', 'area_pick', 'job_pick', 'r1_done', 'r2_done', 'pdf_preview'];

function linkPage(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/core/tokens.css"><body class="stage pz-center"><main class="pz-card"><div class="pz-kicker">Career Studio</div><h1 class="pz-display">${title}</h1><p>${body}</p><a class="pz-btn" href="/career/">Career Studio kholo</a></main></body>`;
}

export default function register(ctx) {
  const { app, claude, demo, limits, analytics, bus, config, log, publicRoute } = ctx;
  analytics.declare(EXTRA);
  bus.allowKeys(['by_ai', 'with_ai', 'led_by_people', 'job', 'mode', 'r1', 'r2', 'seconds', 'calls', 'q', 'step', 'of', 'prompt', 'area', 'careers', 'holds', 'noun', 'tagLabel']);

  const settings = readSettings(process.env, { publicUrl: config.publicUrl });
  // BRAIN rule (core CONTRACT 13): TV, share card and PDF text only from registered banks and templates.
  // Core's ctx.safety when it is there; the same API locally until then.
  const safety = ctx.safety || localSafety();
  registerPublic(safety, { stopText: settings.stopText });
  const pt = (id, arg) => safety.publicText(id, arg);
  // bank line by its text (the ids are generated in lib/public.js)
  const bankIds = Object.fromEntries(Object.entries(publicDefs().banks).map(([b, lines]) => [b, new Map(Object.entries(lines).map(([k, v]) => [v, k]))]));
  const bankLine = (bank, text) => { const k = bankIds[bank]?.get(text); if (!k) throw new Error(`not a ${bank} line`); return pt(bank, k); };
  const store = createStore({ bucketName: config.bucketName, bucketRegion: config.bucketRegion, bucketKeyId: process.env.BUCKET_KEY_ID, bucketKeySecret: process.env.BUCKET_KEY_SECRET, dataDir: config.dataDir });
  let publicKey = null;
  try { publicKey = publicKeyFromEnv(settings.leadsPublicKey); } catch { log({ kind: 'career', err: 'LEADS_PUBLIC_KEY does not parse' }); }
  if (config.offline) { settings.aisensyKey = ''; } // offline: nothing may leave this machine, every lead goes to the batch
  if (settings.allowlistDeny) log({ kind: 'career', warn: 'WHATSAPP_ALLOWLIST has entries that are not mobile numbers: live sends go to nobody until it is fixed', invalid: settings.allowlistInvalid });
  const plays = createPlayTokens({ secret: settings.linkSecret });
  // per-IP windows (no cookies needed; generous for mobile CGNAT). They ignore the hero header on purpose.
  const previewWindow = createWindow({ max: 200, windowMs: 10 * 60000 });
  const send = aisensySender({ url: settings.aisensyUrl, timeoutMs: settings.timeoutMs });
  const wa = createWhatsApp({ settings, store, send, log, count: (e, d) => analytics.count(e, d) });
  wa.refresh(true);
  const sweep = setInterval(() => wa.sweep().then((n) => n && log({ kind: 'career', msg: 'pdf sweep', deleted: n })).catch(() => {}), 3600 * 1000);
  sweep.unref?.();

  const bundle = { data: phoneBundle(), jobs: jobsBundle(), bands: AGE_BANDS.map(({ id, label }) => ({ id, label })), purpose: PURPOSE_LINE, optOut: OPT_OUT_LINE, consentVersion: CONSENT_TEXT_VERSION, stopText: settings.stopText };
  app.get('/bundle', (req, res) => res.json({ ...bundle, wa: { live: wa.live() } }));

  // ---------- B. Job Time Machine: the 2030 round (one Claude call, one section per agent) ----------
  app.post('/agents', limits.guard(), async (req, res) => {
    const j = jobById(req.body?.job);
    if (!j) return res.status(400).json({ error: 'bad_job', message: 'Job chuno.' });
    const t0 = Date.now();
    // Doctor is bank-only: the model only picks ids of reviewed lines (medical text is never free-written).
    const bankOnly = j.id === 'doctor';
    const p = bankOnly ? doctorPrompt() : agentsPrompt(j);
    const r = await demo.wrap(`agents_${j.id}`, { seed: `${j.id}:${Math.floor(Date.now() / 60000) % 2}`, req }, () => claude.run({
      task: 'agents', ...p, schema: bankOnly ? DOCTOR_SCHEMA : AGENTS_SCHEMA, maxTokens: 900, effort: 'low',
      mock: () => demo.pick(`agents_${j.id}`, j.id),
    }));
    if (!demo.isHero(req)) analytics.count('job_pick', { job: j.id });
    let agents = cleanAgents(bankOnly ? doctorFromPicks(r.data) : r.data);
    // Model drafts are phone-only and pass the judge and the career rules first (fixtures and hero are reviewed copy).
    if (!r.demo && !bankOnly) agents = await judgeAgents(agents);
    res.json({ playToken: plays.issue('jtm', { minMs: settings.playMinMsJtm }), agents, source: r.demo ? (r.reason === 'hero' ? 'hero' : 'fixture') : claude.mode() === 'mock' ? 'mock' : 'claude', ms: Date.now() - t0 });
  });

  const judgeAgents = async (agents) => {
    const { agents: out, flagged } = await screenAgents(agents, (items) => safety.judge(items));
    if (flagged.length) analytics.count('judge_flag', { n: Math.min(99, flagged.length) });
    return out;
  };

  // The Job Time Machine typed answer: checked by core's live crisis gate, then forgotten (never stored, logged or
  // mirrored; it stays on the phone). Answers { ok: true } or the care response.
  app.post('/check', limits.rate(), async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 200) : null;
    if (text === null) return res.status(400).json({ error: 'bad_input', message: 'Kuch likho.' });
    const hit = await safety.inputLive(req, text);
    if (safety.isUnchecked?.(hit)) return safety.uncheckedResponse(res); // live check undecided: the text is not used
    if (safety.isCrisis ? safety.isCrisis(hit) : hit === true) return safety.careResponse(res);
    res.json({ ok: true });
  });

  // Share card lines as public text (the phone draws only what the server returned).
  app.post('/card', limits.rate(), (req, res) => {
    const j = jobById(req.body?.job);
    const n = (x) => (Number.isInteger(x) && x >= 0 && x <= 3600 ? x : null);
    if (!j || n(req.body?.r1) === null || n(req.body?.r2) === null) return res.status(400).json({ error: 'bad_input', message: 'Card nahi bana.' });
    res.json({
      kicker: bankLine('fixed', 'Job Time Machine'),
      title: pt('card_title', { noun: j.noun, noun2: j.noun }),
      lines: [pt('card_r1', { n: req.body.r1 }), pt('card_r2', { n: req.body.r2 })],
      footer: bankLine('fixed', 'For fun only'),
    });
  });
  const forecastCard = (areaId) => {
    const pv = phoneBundle().areas.find((a) => a.area.id === areaId);
    return { kicker: bankLine('fixed', 'Career Forecast preview'), title: bankLine('areas', pv.area.label), lines: pv.careers.map((c) => pt('fc_line', { career: c.title, badge: c.badge })), footer: bankLine('fixed', 'Forecast, guarantee nahi') };
  };

  // ---------- A. WhatsApp capture + PDF send ----------
  const leadsPerSession = new Map();
  setInterval(() => leadsPerSession.clear(), 6 * 3600 * 1000).unref?.();

  // A forecast preview was opened: hand out one play token (usable after PLAY_MIN_MS_FC, for 30 minutes).
  app.post('/preview', limits.rate(), (req, res) => {
    if (!previewWindow.take(clientIp(req))) return res.status(429).set('Retry-After', '60').json({ error: 'slow_down', retryMs: 60000, message: COPY.slow });
    if (!areaById(String(req.body?.area || ''))) return res.status(400).json({ error: 'bad_input', message: 'Area chuno.' });
    res.json({ playToken: plays.issue('fc', { minMs: settings.playMinMsFc }), card: forecastCard(req.body.area) });
  });

  app.post('/lead', limits.rate(), async (req, res) => {
    const ip = clientIp(req);
    if (!wa.windows.lead.take(ip)) return res.status(429).set('Retry-After', '120').json({ error: 'slow_down', retryMs: 120000, message: COPY.slow });
    const v = validateLead(req.body || {});
    if (!v.ok) return res.status(400).json({ error: 'bad_input', field: v.field, message: v.message });
    // live crisis gate (core 13: waits for the live check, rules as the fallback) before anything is stored or answered
    const hitName = await safety.inputLive(req, req.body.firstName);
    if (safety.isUnchecked?.(hitName)) return safety.uncheckedResponse(res);
    if (safety.isCrisis ? safety.isCrisis(hitName) : hitName === true) return safety.careResponse(res);
    if (demo.isHero(req)) return res.json({ ok: true, path: 'demo', copy: COPY.demo });
    if (!publicKey) return res.status(503).json({ error: 'not_ready', message: 'Abhi yeh form band hai. Counter pe team ko bolo, woh PDF bhej denge.' });
    const why = plays.consume(req.body?.playToken);
    if (why) return res.status(403).json({ error: 'play_needed', reason: why, message: COPY.playNeeded });

    const c = Number.isInteger(Number(req.body?.counter)) && Number(req.body.counter) >= 0 && Number(req.body.counter) < 100 ? Number(req.body.counter) : null;
    let out;
    try {
      out = await submitLead({ wa, store, publicKey, lead: v.lead, sid: req.sid, ip, counter: c });
    } catch (e) {
      log({ kind: 'career', err: 'lead save failed', name: e?.cause?.name });
      return res.status(503).json({ error: 'not_saved', message: 'Save nahi ho paya. Ek baar phir try karo, ya counter pe bolo.' });
    }
    const { d, shown, job } = out;
    analytics.count('lead_submit');
    if (v.lead.band.u18) analytics.count('lead_u18');
    if (d.path === 'live') analytics.count('wa_live');
    else if (d.path === 'batch') analytics.count('wa_batch');
    res.json({ ok: true, path: shown, job, copy: `${COPY.done} ${COPY[shown]}` });
  });

  app.get('/wa/status', (req, res) => {
    const s = wa.status(String(req.query.j || ''));
    res.set('Cache-Control', 'no-store').json(s ? { state: s.state, copy: s.state === 'batch' ? COPY.batch : undefined } : { state: 'unknown' });
  });

  async function stopHandler(req, res) {
    // hard per-IP cap; the hero header is NOT an exemption here
    if (!wa.windows.stop.take(clientIp(req))) return res.status(429).set('Retry-After', '600').json({ error: 'slow_down', retryMs: 600000, message: 'Is network se kaafi STOP aa gaye. Counter pe bolo, team kar degi.' });
    const phone = typeof req.body?.phone === 'string' ? normalizePhone(req.body.phone) : null;
    if (!phone) return res.status(400).json({ error: 'bad_input', message: 'WhatsApp number 10 digit ka Indian mobile number hona chahiye.' });
    try { await wa.stop(phone); } catch { return res.status(503).json({ error: 'not_ready', message: 'Abhi save nahi hua. Counter pe bolo, team kar degi.' }); }
    analytics.count('wa_stop');
    res.json({ ok: true, message: 'Ho gaya. Is number pe ab hum WhatsApp nahi bhejenge.' });
  }
  app.post('/stop', stopHandler);

  // The PDF link in the WhatsApp text (token in the query, so no access log ever holds it). Re-signs every time.
  async function pdfLink(req, res, token) {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const t = readToken(String(token || ''), settings.linkSecret);
    if (!t) return res.status(404).type('html').send(linkPage('Link purana ho gaya', 'Yeh PDF link 30 din ke liye tha. Career Studio pe apna forecast phir se dekh sakte ho.'));
    if (store.kind === 'bucket') {
      const url = store.presign(t.key, 600);
      if (url) return res.redirect(302, url);
    }
    const buf = await store.get(t.key).catch(() => null);
    if (!buf) return res.status(404).type('html').send(linkPage('PDF ab nahi hai', 'PDF 30 din baad hata diya jaata hai. Career Studio pe forecast phir se dekh sakte ho.'));
    res.type('application/pdf').set('Content-Disposition', 'inline; filename="Career_Forecast.pdf"').send(buf);
  }
  app.get('/p', (req, res) => pdfLink(req, res, req.query.t)); // older form, kept working
  // Public short links (core CONTRACT Clarification 7): play.zenithschool.ai/p/<token> and play.zenithschool.ai/stop
  if (publicRoute) {
    publicRoute('/p/:token', (req, res) => (req.method === 'GET' || req.method === 'HEAD' ? pdfLink(req, res, req.params.token) : res.status(405).end()));
    publicRoute('/stop', (req, res) => (req.method === 'POST' ? stopHandler(req, res) : res.redirect(302, '/career/stop/')));
  }

  // Phone preview / download right away (same PDF, no personal data in it).
  app.get('/preview.pdf', limits.rate(), async (req, res) => {
    const area = String(req.query.area || '');
    if (!areaById(area)) return res.status(400).json({ error: 'bad_area' });
    const buf = await pdfFor(area, settings);
    analytics.count('pdf_preview');
    res.type('application/pdf').set({ 'Content-Disposition': 'inline; filename="Career_Forecast_Ideas4.pdf"', 'Cache-Control': 'private, max-age=600' }).send(buf);
  });

  // Staff: WhatsApp status (counts only) and the live switch. Key in the x-admin-key header or ?key=.
  const keyOk = (req) => settings.adminKey && (req.get('x-admin-key') === settings.adminKey || req.query.key === settings.adminKey);
  app.get('/admin/whatsapp', async (req, res) => {
    if (!keyOk(req)) return res.status(403).json({ error: 'forbidden' });
    res.set('Cache-Control', 'no-store').json(await wa.adminStatus());
  });
  app.post('/admin/whatsapp', async (req, res) => {
    if (!keyOk(req)) return res.status(403).json({ error: 'forbidden' });
    const { on, ipCaps } = req.body || {};
    if (on === undefined && ipCaps === undefined) return res.status(400).json({ error: 'send {"on": true|false} and/or {"ipCaps": {"lead": n, "live": n, "stop": n}}' });
    if (on !== undefined && typeof on !== 'boolean') return res.status(400).json({ error: '"on" must be true or false' });
    if (ipCaps !== undefined) {
      try { await wa.setIpCaps(ipCaps); } catch (e) { return res.status(400).json({ error: e.message }); }
      log({ kind: 'career', msg: 'ip caps changed', ...wa.adminCaps() });
    }
    if (on !== undefined) { await wa.setSwitch(on); log({ kind: 'career', msg: 'whatsapp switch', on }); }
    res.json(await wa.adminStatus());
  });

  return { wa, store, settings };
}
