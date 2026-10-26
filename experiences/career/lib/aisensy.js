// AiSensy API campaign sender, same request and rules as the Career Forecast build
// (Lead Magnet/07_Build/career-forecast shared/src/messaging.ts aiSensyTemplateRequest + shared/src/node.ts):
//   POST https://backend.aisensy.com/campaign/t1/api/v2
//   { apiKey, campaignName, destination "+91<10 digits>", userName, source, templateParams [..in order..],
//     media { url, filename } }      (media = the PDF as the template's Document header)
//   8 s for the whole send; a second try ONLY when the request got no answer (network error), never after a
//   timeout (AiSensy may still deliver). Success = HTTP 2xx and success true / "true". AiSensy Basic has no
//   delivery webhooks, so success means "accepted for sending", never "delivered".
// Errors never carry the number, the key, the name or the link.

export class SendError extends Error {
  constructor(kind, message, status) { super(message); this.name = 'SendError'; this.kind = kind; this.status = status; }
}

const NETWORK = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ETIMEDOUT', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'ENETUNREACH', 'EHOSTUNREACH']);
function classify(e) {
  if (e instanceof SendError) return e;
  const code = e?.cause?.code || e?.code;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || e?.cause?.name === 'TimeoutError') return new SendError('timeout', 'no answer from AiSensy in time');
  if (NETWORK.has(code) || (e?.name === 'TypeError' && /fetch failed/i.test(e.message))) return new SendError('network', `no answer (${code || 'network'})`);
  return new SendError('network', 'request failed');
}

/** The exact request body. params are already in the template's order (settings decide the order). */
export function templateRequest({ apiKey, campaign, userName, source, phone, params, media }) {
  return {
    apiKey,
    campaignName: campaign,
    destination: `+91${phone}`,
    userName,
    source,
    templateParams: params,
    ...(media ? { media: { url: media.url, filename: media.filename } } : {}),
  };
}

/**
 * @returns {(body:object) => Promise<{ msgId: string }>} throws SendError(kind: network|timeout|http|rejected)
 */
export function aisensySender({ url, timeoutMs = 8000, fetchImpl = fetch, now = Date.now }) {
  async function post(body, left) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(left),
    });
    const text = await res.text().catch(() => '');
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) throw new SendError('http', `AiSensy answered ${res.status}`, res.status);
    if (!(json && (json.success === true || json.success === 'true'))) throw new SendError('rejected', 'AiSensy did not accept the message', res.status);
    const id = typeof json.submitted_message_id === 'string' ? json.submitted_message_id.slice(0, 120) : '';
    return { msgId: id };
  }
  return async function send(body) {
    const deadline = now() + timeoutMs;
    let last = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const left = deadline - now();
      if (left < 250) break;
      try { return await post(body, left); } catch (e) {
        last = classify(e);
        if (last.kind !== 'network') throw last;
      }
    }
    throw last || new SendError('timeout', 'no time left for a send');
  };
}
