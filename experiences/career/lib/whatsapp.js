// Live WhatsApp PDF send for the stall: guards, in-memory queue (concurrency 4), job status for the phone.
// Guards, in this order (decide()):
//   switch off / not configured        -> batch ("48 ghante")
//   WHATSAPP_ALLOWLIST set, not listed  -> batch (test mode: real sends only to listed numbers)
//   on the stop list                    -> stopped (never sent, never batched)
//   sent to this number in the last 24 h (or a send in flight) -> recent (no second message)
//   this session already had 2 sends    -> batch
//   daily cap (IST day) / total cap      -> batch (reserve() in the shared ledger; total survives restarts)
// The phone shows "Bhej rahe hain..." then "Bhej diya" on AiSensy success. Never "delivered" (Basic plan: no webhooks).
// A failed send is simply not marked sent, so the 29 Oct batch picks the lead up from the encrypted leads.
import { phoneHash } from './phone.js';
import { createLedger } from './ledger.js';
import { sendForecast } from './sendpdf.js';
import { missingForSend } from './settings.js';
import { istDay, randomId } from './store.js';
import { createWindow } from './play.js';

const DAY = 24 * 3600 * 1000;

export function createWhatsApp({ settings, store, send, log = () => {}, count = () => {}, now = () => new Date() }) {
  const ledger = createLedger({ store, pepper: settings.pepper, now });
  const sessions = new Map(); // sid -> sends this session (memory only)
  const inflight = new Set(); // hashes being sent now
  const jobs = new Map(); // id -> { state, at, ...private fields until done }
  const queue = [];
  let running = 0;
  let sent = {};
  let stops = {};
  let override = null;
  let lastRefresh = 0;

  async function refresh(force = false) {
    if (!force && Date.now() - lastRefresh < 30000) return;
    lastRefresh = Date.now();
    try {
      [sent, stops, override] = await Promise.all([ledger.sent(), ledger.stops(), ledger.getSwitch(), loadLimits()]);
    } catch (e) {
      log({ kind: 'whatsapp', err: 'ledger read failed', name: e?.name });
    }
  }

  const missing = () => missingForSend(settings);
  const switchOn = () => (override ?? settings.pdfOn);
  /** true when a new lead would be sent live right now (drives the "1 minute" vs "48 ghante" copy). */
  const live = () => switchOn() && missing().length === 0;

  // Per-IP windows (no cookies needed, generous for mobile CGNAT). Staff can raise them at the stall
  // (POST /api/career/admin/whatsapp { ipCaps: { lead, live, stop } }, or /career/staff/); kept in the store.
  const windows = {
    lead: createWindow({ max: settings.leadIpLimit, windowMs: 10 * 60000 }), // /lead posts per IP per 10 min
    live: createWindow({ max: settings.ipLiveCap, windowMs: 3600 * 1000 }), // live sends per IP per hour
    stop: createWindow({ max: settings.stopIpLimit, windowMs: 3600 * 1000 }), // /stop posts per IP per hour
  };
  async function loadLimits() {
    try { const l = await ledger.getLimits(); if (l) for (const k of Object.keys(windows)) if (Number.isInteger(l[k]) && l[k] > 0) windows[k].setMax(l[k]); } catch { /* keep the env values */ }
  }
  async function setIpCaps(caps) {
    const next = {};
    for (const k of Object.keys(windows)) {
      const v = caps?.[k] === undefined ? windows[k].max : caps[k];
      if (!Number.isInteger(v) || v < 1 || v > 100000) throw new Error(`ipCaps.${k} must be a whole number from 1 to 100000`);
      next[k] = v;
    }
    await ledger.setLimits(next);
    for (const k of Object.keys(next)) windows[k].setMax(next[k]);
    return next;
  }

  // Real send times (after the shared refresh), so a decoy job takes as long as a real one.
  const sendTimes = [];
  const noteSendTime = (ms) => { sendTimes.push(ms); if (sendTimes.length > 50) sendTimes.shift(); };
  const decoyTime = () => (sendTimes.length ? sendTimes[Math.floor(Math.random() * sendTimes.length)] : 700 + Math.random() * 400);

  /**
   * One decision per /lead. Privacy: the answer must not tell a new number from a number that was already sent in
   * the last 24 h ("recent") or is on the stop list ("stopped"). So every gate is decided for a NEW number first
   * (switch, allow-list, session cap, IP cap, daily and total cap); a known number gets exactly that path, the same
   * claims and the same store reads and writes (ledger.probe instead of reserve: same I/O, counts unchanged), and
   * on the live path a decoy job that runs through the same queue and ends "sent" like a real send. Nothing is sent
   * to a known number.
   * Every guard is checked AND claimed synchronously (no await between check and claim), so parallel requests for
   * one number, one session or one IP cannot all pass. If the cap check fails, the claims are given back.
   */
  async function decide({ phone, sid, ip = 'unknown' }) {
    await refresh();
    if (!switchOn()) return { path: 'batch', reason: 'off' };
    if (missing().length) return { path: 'batch', reason: 'not_configured' };
    if (settings.allowlistDeny) return { path: 'batch', reason: 'allowlist_invalid' };
    if (settings.allowlist.length && !settings.allowlist.includes(phone)) return { path: 'batch', reason: 'not_allowlisted' };
    const hash = phoneHash(phone, settings.pepper);
    // ---- synchronous block: check + claim ----
    const known = stops[hash] ? 'stopped' : (inflight.has(hash) || (sent[hash] && now().getTime() - sent[hash] < DAY)) ? 'recent' : null;
    if ((sessions.get(sid) || 0) >= settings.sessionCap) return { path: 'batch', reason: 'session_cap', known };
    if (!windows.live.take(ip)) return { path: 'batch', reason: 'ip_cap', known };
    sessions.set(sid, (sessions.get(sid) || 0) + 1);
    if (!known) inflight.add(hash);
    // ---- end of synchronous block ----
    const giveBack = () => { if (!known) inflight.delete(hash); sessions.set(sid, Math.max(0, (sessions.get(sid) || 1) - 1)); windows.live.giveBack(ip); };
    const day = istDay(now());
    const caps = { dailyCap: settings.dailyCap, totalCap: settings.totalCap };
    let capHit;
    try { capHit = await (known ? ledger.probe(caps) : ledger.reserve(caps)); } catch (e) { giveBack(); throw e; }
    if (capHit) { giveBack(); return { path: 'batch', reason: capHit, known }; }
    return known ? { path: 'decoy', reason: known, known } : { path: 'live', hash, day };
  }

  /** The lead could not be saved after a live (or decoy) decision: undo the claims and the reservation. */
  async function cancel(d, { sid, ip = 'unknown' }) {
    if (d.path !== 'live' && d.path !== 'decoy') return;
    if (d.path === 'live') inflight.delete(d.hash);
    sessions.set(sid, Math.max(0, (sessions.get(sid) || 1) - 1));
    windows.live.giveBack(ip);
    if (d.path === 'live') await ledger.release(d.day).catch(() => {});
  }

  /** Real send, or (decoy: true) a job that only looks like one. Both go through the same queue and states. */
  function enqueue({ phone, firstName, areaId, hash, day, decoy = false }) {
    const id = randomId(18);
    jobs.set(id, decoy ? { state: 'queued', at: Date.now(), decoy: true } : { state: 'queued', at: Date.now(), phone, firstName, areaId, hash, day });
    queue.push(id);
    pump();
    return id;
  }
  const decoy = () => enqueue({ decoy: true });

  function pump() {
    while (running < settings.concurrency && queue.length) {
      const id = queue.shift();
      running += 1;
      run(id).finally(() => { running -= 1; pump(); });
    }
  }

  async function run(id) {
    const j = jobs.get(id);
    j.state = 'sending';
    let r;
    try {
      await refresh(true);
      if (j.decoy) {
        await new Promise((res) => setTimeout(res, decoyTime()));
        jobs.set(id, { state: 'sent', at: Date.now() });
        return;
      }
      const t0 = Date.now();
      if (stops[j.hash]) r = { ok: false, kind: 'stopped' };
      else r = await sendForecast({ settings, store, ledger, send, phone: j.phone, firstName: j.firstName, areaId: j.areaId, hash: j.hash, reservedDay: j.day, now });
      if (r.ok) noteSendTime(Date.now() - t0);
    } catch {
      r = { ok: false, kind: 'error' };
    }
    if (r.kind === 'stopped') await ledger.release(j.day).catch(() => {});
    inflight.delete(j.hash);
    if (r.ok) sent[j.hash] = now().getTime();
    // nothing personal survives the job
    jobs.set(id, { state: r.ok ? 'sent' : 'batch', at: Date.now() });
    count(r.ok ? 'wa_sent' : 'wa_failed', r.ok ? undefined : { kind: r.kind });
    log({ kind: 'whatsapp', state: r.ok ? 'sent' : 'failed', why: r.ok ? undefined : r.kind, template: settings.template });
  }

  function status(id) {
    const j = jobs.get(id);
    return j ? { state: j.state } : null;
  }

  async function stop(phone) {
    if (!settings.pepper) throw new Error('PHONE_PEPPER missing');
    const hash = phoneHash(phone, settings.pepper);
    stops = await ledger.addStop(hash);
  }

  async function setSwitch(on) { await ledger.setSwitch(on); override = !!on; }

  async function adminStatus() {
    await refresh(true);
    const c = await ledger.counter();
    return {
      switchOn: switchOn(), envDefault: settings.pdfOn, override, live: live(), missing: missing(),
      allowlistMode: settings.allowlist.length > 0 || settings.allowlistDeny, allowlistSize: settings.allowlist.length, allowlistInvalid: settings.allowlistInvalid, ipCaps: { lead: windows.lead.max, live: windows.live.max, stop: windows.stop.max },
      today: c.days[istDay(now())] || 0, total: c.total, dailyCap: settings.dailyCap, totalCap: settings.totalCap,
      queued: queue.length, running, stopListSize: Object.keys(stops).length, sentListSize: Object.keys(sent).length,
      template: settings.template, campaignSet: !!settings.campaign, paramOrder: settings.paramOrder, document: settings.document,
    };
  }

  /** Deletes PDFs older than PDF_KEEP_DAYS (30). Runs hourly. */
  async function sweep() {
    const cutoff = istDay(new Date(now().getTime() - settings.pdfKeepDays * DAY));
    let n = 0;
    for (const k of await store.list('pdfs/')) {
      const d = k.split('/')[1];
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < cutoff) { await store.del(k); n += 1; }
    }
    return n;
  }

  // drop finished job records after 20 minutes
  const gc = setInterval(() => { const t = Date.now() - 20 * 60000; for (const [id, j] of jobs) if (j.at < t && (j.state === 'sent' || j.state === 'batch')) jobs.delete(id); }, 60000);
  gc.unref?.();

  return { decide, cancel, decoy, enqueue, windows, setIpCaps, adminCaps: () => ({ lead: windows.lead.max, live: windows.live.max, stop: windows.stop.max }), status, stop, live, switchOn, setSwitch, adminStatus, sweep, refresh, ledger, idle: () => running === 0 && queue.length === 0 };
}
