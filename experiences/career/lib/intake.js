// One /lead after validation and the play-token check: decide, save the encrypted record, queue the send.
// Kept here (not in server.js) so tests can run the exact pipeline against a slow, bucket-like store.
// The visitor only ever sees "live" (with a job id) or "batch": a new number and a number that was already sent
// or stopped get the same answer, the same store work and the same job states (see whatsapp.js decide()).
import { buildRecord, saveLead } from './leads.js';

export async function submitLead({ wa, store, publicKey, lead, sid, ip, counter = null }) {
  let d = { path: 'batch', reason: 'off' };
  try { d = await wa.decide({ phone: lead.phone, sid, ip }); } catch { d = { path: 'batch', reason: 'error' }; }
  try {
    await saveLead(store, buildRecord(lead, { counter, waPath: d.known ? `${d.path}_${d.known}` : d.path, waReason: d.reason }), publicKey);
  } catch (e) {
    await wa.cancel(d, { sid, ip });
    const err = new Error('lead save failed');
    err.cause = e;
    throw err;
  }
  let job = null;
  if (d.path === 'live') job = wa.enqueue({ phone: lead.phone, firstName: lead.first, areaId: lead.area, hash: d.hash, day: d.day });
  else if (d.path === 'decoy') job = wa.decoy();
  return { d, shown: d.path === 'batch' ? 'batch' : 'live', job };
}
