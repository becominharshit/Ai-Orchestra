// One WhatsApp PDF send, the same steps for the live queue and for ops/whatsapp-batch.mjs:
//   build the PDF -> upload pdfs/<date>/<random>.pdf -> signed media URL (24 h) for Meta + /p/<token> link (30 days)
//   -> AiSensy request (campaign, values in the settings' order, Document header) -> mark sent.
// The caller has already RESERVED one send in the ledger. On a certain failure the reservation is given back;
// on a timeout it is kept (AiSensy may still deliver, so it may have cost a message).
import { buildPdf, pdfFileName } from './pdf.js';
import { makeToken } from './links.js';
import { templateRequest, SendError } from './aisensy.js';
import { istDay, randomId } from './store.js';

const pdfCache = new Map(); // area -> { day, buf }   (the PDF has no personal data; same area + day = same file)

export async function pdfFor(areaId, settings, now = new Date()) {
  const day = istDay(now);
  const hit = pdfCache.get(areaId);
  if (hit && hit.day === day) return hit.buf;
  const buf = await buildPdf({ areaId, stopText: settings.stopText, date: now });
  pdfCache.set(areaId, { day, buf });
  return buf;
}

/** The template values in the order the settings give (default name, link). */
export function templateValues(order, { firstName, link }) {
  const v = { name: firstName || 'there', link };
  return order.map((k) => v[k]);
}

/**
 * @returns {Promise<{ ok: true, msgId: string, pdfKey: string } | { ok: false, kind: string }>}
 */
export async function sendForecast({ settings, store, ledger, send, phone, firstName, areaId, hash, reservedDay, now = () => new Date() }) {
  let pdfKey;
  try {
    const buf = await pdfFor(areaId, settings, now());
    pdfKey = `pdfs/${istDay(now())}/${randomId(16)}.pdf`;
    await store.put(pdfKey, buf, 'application/pdf');
  } catch {
    await ledger.release(reservedDay);
    return { ok: false, kind: 'pdf' };
  }
  const link = settings.linkBase + makeToken(pdfKey, settings.linkSecret, { days: settings.linkDays, now: now().getTime() });
  let media = null;
  if (settings.document) {
    // Meta fetches a direct signed bucket URL, never the /p/ redirect. A local store has none: the /p/ link stands in
    // (fake messenger only; production always runs with the bucket).
    const url = store.presign(pdfKey, settings.mediaHours * 3600) || (store.kind === 'local' ? link : null);
    if (!url) { await ledger.release(reservedDay); return { ok: false, kind: 'config' }; }
    media = { url, filename: pdfFileName(firstName) };
  }
  const body = templateRequest({
    apiKey: settings.aisensyKey,
    campaign: settings.campaign,
    userName: settings.userName === 'first_name' ? (firstName || 'Visitor') : settings.userName,
    source: settings.source,
    phone,
    params: templateValues(settings.paramOrder, { firstName, link }),
    media,
  });
  try {
    const r = await send(body);
    await ledger.markSent(hash);
    return { ok: true, msgId: r.msgId, pdfKey };
  } catch (e) {
    const kind = e instanceof SendError ? e.kind : 'network';
    if (kind !== 'timeout') await ledger.release(reservedDay);
    return { ok: false, kind };
  }
}
