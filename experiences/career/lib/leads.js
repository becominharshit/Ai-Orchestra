// WhatsApp capture ("WhatsApp pe chahiye?"). Minimum fields only: first name, WhatsApp number, class/age band,
// interest area. No school, no free text, NO parent fields of any kind (Avi 24 Oct).
// Each record is sealed with the leads PUBLIC key and written as one object: leads/<IST date>/<random>.bin.
// The server cannot read it back. Never logged, never in analytics (counts only), never on the bus or the TV.
import { seal } from './envelope.js';
import { normalizePhone, firstName as cleanFirst } from './phone.js';
import { istDay, randomId } from './store.js';
import { areaById } from './data.js';

export const CONSENT_TEXT_VERSION = 'ideas4-wa-v1';
/** Shown next to the (unticked) consent box, word for word. */
export const PURPOSE_LINE = 'Haan, Zenith School of AI ki team mujhe WhatsApp pe mera Career Forecast PDF aur Zenith ke updates bheje. Fest ke baad bhi updates aa sakte hain (hamare CRM, Meritto, ke through).';
export const OPT_OUT_LINE = 'Kabhi bhi STOP likho, ya counter pe bolo';

export const AGE_BANDS = [
  { id: 'class_9_10', label: 'Class 9-10', u18: true },
  { id: 'class_11_12', label: 'Class 11-12', u18: true },
  // Droppers are usually 17-19: tagged u18 to be safe (re-consent / purge once the DPDP Rules apply).
  { id: 'dropper', label: 'Dropper', u18: true },
  { id: 'college', label: 'College', u18: false },
];

/** Checks the form. Returns { ok:true, lead } or { ok:false, field, message } (Hinglish, never echoes a value). */
export function validateLead(body = {}) {
  if (body.consent !== true) return { ok: false, field: 'consent', message: 'Pehle consent wala box tick karo.' };
  if (typeof body.firstName !== 'string' || body.firstName.length > 80) return { ok: false, field: 'firstName', message: 'Apna first name likho.' };
  if (typeof body.phone !== 'string' || body.phone.length > 20) return { ok: false, field: 'phone', message: 'WhatsApp number 10 digit ka Indian mobile number hona chahiye.' };
  if (typeof body.band !== 'string' || typeof body.area !== 'string') return { ok: false, field: 'band', message: 'Class ya age band chuno.' };
  const first = cleanFirst(body.firstName);
  if (!first) return { ok: false, field: 'firstName', message: 'Apna first name likho.' };
  const phone = normalizePhone(body.phone);
  if (!phone) return { ok: false, field: 'phone', message: 'WhatsApp number 10 digit ka Indian mobile number hona chahiye.' };
  const band = AGE_BANDS.find((b) => b.id === body.band);
  if (!band) return { ok: false, field: 'band', message: 'Class ya age band chuno.' };
  if (!areaById(body.area)) return { ok: false, field: 'area', message: 'Interest area chuno.' };
  if (body.consentVersion !== CONSENT_TEXT_VERSION) return { ok: false, field: 'consent', message: 'Page purana hai. Ek baar refresh karo.' };
  return { ok: true, lead: { first, phone, band, area: body.area } };
}

export function buildRecord({ first, phone, band, area }, { now = new Date(), counter = null, waPath, waReason } = {}) {
  return {
    v: 1,
    source: 'ideas4',
    first_name: first,
    whatsapp: phone,
    age_band: band.id,
    u18: band.u18,
    interest_area: area,
    consent: true,
    consent_ts: now.toISOString(),
    consent_text_version: CONSENT_TEXT_VERSION,
    consent_text: PURPOSE_LINE,
    opt_out_text: OPT_OUT_LINE,
    counter,
    wa_path: waPath, // live | batch | recent | stopped (decision at submit; the sent list says what really went out)
    wa_reason: waReason || null,
    created_at: now.toISOString(),
  };
}

export async function saveLead(store, record, publicKey, now = new Date()) {
  const key = `leads/${istDay(now)}/${randomId(16)}.bin`;
  await store.put(key, seal(record, publicKey), 'application/octet-stream');
  return key;
}
