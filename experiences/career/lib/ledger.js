// The WhatsApp ledger, shared by the live server and ops/whatsapp-batch.mjs (same store, same keys):
//   whatsapp/counter.json  { total, days: { "2026-10-27": n } }   real sends, counts only. Survives restarts and
//                          deploys; the batch reads and updates the same file. Every change is a fresh
//                          read-modify-write, so a running server and the batch do not overwrite each other's counts.
//   whatsapp/sent.bin      peppered phone hash -> time of the last accepted send (AES-GCM, key from PHONE_PEPPER)
//   whatsapp/stop.bin      peppered phone hash -> time it was stopped (same box). Sends, batch and export skip these.
//   whatsapp/switch.json   { on: true|false } runtime override of WHATSAPP_PDF_ON (admin endpoint)
//   whatsapp/limits.json   { lead, live, stop } runtime per-IP caps set by staff (admin endpoint / staff page)
// No phone number is ever stored in clear here.
import { boxOpen, boxSeal, listKey } from './envelope.js';
import { istDay } from './store.js';

export const KEYS = { counter: 'whatsapp/counter.json', sent: 'whatsapp/sent.bin', stop: 'whatsapp/stop.bin', switch: 'whatsapp/switch.json', limits: 'whatsapp/limits.json' };

export function createLedger({ store, pepper, now = () => new Date() }) {
  let chain = Promise.resolve();
  /** one change at a time inside this process */
  const locked = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  const key = (purpose) => listKey(pepper, purpose);

  async function readJson(k, dflt) {
    const b = await store.get(k);
    if (!b) return dflt;
    try { return JSON.parse(b.toString('utf8')); } catch { return dflt; }
  }
  async function readBox(k, purpose) {
    if (!pepper) return {};
    const b = await store.get(k);
    if (!b) return {};
    return boxOpen(b, key(purpose)); // throws if the pepper changed: better loud than a silently empty stop list
  }
  const writeBox = (k, purpose, obj) => store.put(k, boxSeal(obj, key(purpose)), 'application/octet-stream');

  async function counter() {
    const c = await readJson(KEYS.counter, null);
    return { total: c?.total || 0, days: c?.days || {} };
  }

  /** Reserve one send under both caps. Returns null when reserved, else 'total_cap' | 'daily_cap'. */
  function reserve({ dailyCap, totalCap }) {
    return locked(async () => {
      const c = await counter();
      const day = istDay(now());
      if (c.total >= totalCap) return 'total_cap';
      if ((c.days[day] || 0) >= dailyCap) return 'daily_cap';
      c.total += 1;
      c.days[day] = (c.days[day] || 0) + 1;
      await store.put(KEYS.counter, Buffer.from(JSON.stringify({ ...c, updated: now().toISOString() })), 'application/json');
      return null;
    });
  }
  /**
   * Same store reads and writes as reserve(), but it never changes the counts. Used for numbers that will not be
   * sent (already sent in 24 h, or on the stop list), so their /lead answer takes the same path and the same time
   * as a new number's. Returns null | 'total_cap' | 'daily_cap', exactly like reserve().
   */
  function probe({ dailyCap, totalCap }) {
    return locked(async () => {
      const c = await counter();
      const day = istDay(now());
      if (c.total >= totalCap) return 'total_cap';
      if ((c.days[day] || 0) >= dailyCap) return 'daily_cap';
      await store.put(KEYS.counter, Buffer.from(JSON.stringify({ ...c, updated: now().toISOString() })), 'application/json');
      return null;
    });
  }
  /** Give back a reservation whose send certainly did not go out (AiSensy refused it, or it never left). */
  function release(dayOfReserve = istDay(now())) {
    return locked(async () => {
      const c = await counter();
      c.total = Math.max(0, c.total - 1);
      c.days[dayOfReserve] = Math.max(0, (c.days[dayOfReserve] || 0) - 1);
      await store.put(KEYS.counter, Buffer.from(JSON.stringify({ ...c, updated: now().toISOString() })), 'application/json');
    });
  }

  const sent = () => readBox(KEYS.sent, 'sent-list');
  const stops = () => readBox(KEYS.stop, 'stop-list');
  function markSent(hash) {
    return locked(async () => { const s = await sent(); s[hash] = now().getTime(); await writeBox(KEYS.sent, 'sent-list', s); return s; });
  }
  function addStop(hash) {
    return locked(async () => { const s = await stops(); s[hash] ||= now().getTime(); await writeBox(KEYS.stop, 'stop-list', s); return s; });
  }
  const getSwitch = async () => (await readJson(KEYS.switch, null))?.on ?? null;
  const setSwitch = (on) => locked(() => store.put(KEYS.switch, Buffer.from(JSON.stringify({ on: !!on, at: now().toISOString() })), 'application/json'));

  const getLimits = async () => (await readJson(KEYS.limits, null)) || null;
  const setLimits = (o) => locked(() => store.put(KEYS.limits, Buffer.from(JSON.stringify({ ...o, at: now().toISOString() })), 'application/json'));

  return { counter, reserve, probe, getLimits, setLimits, release, sent, stops, markSent, addStop, getSwitch, setSwitch };
}
