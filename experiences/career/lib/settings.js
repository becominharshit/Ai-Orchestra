// Career Studio settings. Core strips secrets from ctx.config, so the WhatsApp settings are read from the
// environment here (core's config.js already loaded .env into process.env). Campaign, template, value order and
// the Document switch are SETTINGS, not code. Secrets (AISENSY_API_KEY, LEADS_PUBLIC_KEY, LINK_HMAC_SECRET,
// PHONE_PEPPER, WHATSAPP_ALLOWLIST) are set with `node ops/set-secret.mjs <NAME>` (hidden prompt, never printed).
// TODO(core): expose these through ctx (see DONE-03 "Requests for core").

import { normalizePhone } from './phone.js';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const on = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'on', 'true', 'yes'].includes(String(v).toLowerCase()));

export const PARAM_NAMES = ['name', 'link'];

/**
 * WHATSAPP_ALLOWLIST: comma/space separated numbers; +91, 0, spaces and dashes are fine ("+91 98765-43210").
 * Empty or "off" = no allow-list (everyone). If ANY entry is not an Indian mobile number the list FAILS CLOSED:
 * nobody gets a live send (deny: true) and the server logs a count-only warning.
 */
export function parseAllowlist(raw) {
  const v = String(raw ?? '').trim();
  if (!v || v.toLowerCase() === 'off') return { list: [], deny: false, invalid: 0 };
  const parts = v.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  const ok = parts.map(normalizePhone);
  const invalid = ok.filter((x) => !x).length;
  const list = [...new Set(ok.filter(Boolean))];
  return { list, deny: invalid > 0 || list.length === 0, invalid };
}

export function readSettings(env = process.env, { publicUrl = 'https://play.zenithschool.ai' } = {}) {
  const order = String(env.AISENSY_PDF_STUDENT_PARAMS || 'name,link').split(',').map((s) => s.trim()).filter(Boolean);
  if (!order.length || order.some((p) => !PARAM_NAMES.includes(p))) throw new Error('AISENSY_PDF_STUDENT_PARAMS may only list name and link');
  const base = publicUrl.replace(/\/$/, '');
  return {
    production: env.NODE_ENV === 'production',
    // live switch default (runtime override: POST /api/career/admin/whatsapp, persisted in the store)
    pdfOn: on(env.WHATSAPP_PDF_ON, false),
    dailyCap: num(env.WHATSAPP_DAILY_CAP, 700),
    totalCap: num(env.WHATSAPP_TOTAL_CAP, 2000),
    sessionCap: num(env.WHATSAPP_SESSION_CAP, 2),
    allowlist: parseAllowlist(env.WHATSAPP_ALLOWLIST).list,
    allowlistDeny: parseAllowlist(env.WHATSAPP_ALLOWLIST).deny,
    allowlistInvalid: parseAllowlist(env.WHATSAPP_ALLOWLIST).invalid,
    ipLiveCap: num(env.WHATSAPP_IP_LIVE_CAP, 30), // live sends per client IP per hour (CGNAT-friendly); more go to the batch
    leadIpLimit: num(env.LEAD_IP_LIMIT, 30), // /lead posts per IP per 10 minutes
    stopIpLimit: num(env.STOP_IP_LIMIT, 10), // /stop posts per IP per hour
    playMinMsFc: num(env.PLAY_MIN_MS_FC, 5000), // a forecast token is usable 5 s after the preview opened
    playMinMsJtm: num(env.PLAY_MIN_MS_JTM, 15000), // a Job Time Machine token 15 s after round 1 started
    concurrency: num(env.WHATSAPP_CONCURRENCY, 4),
    aisensyKey: env.AISENSY_API_KEY || '',
    aisensyUrl: env.AISENSY_API_URL || 'https://backend.aisensy.com/campaign/t1/api/v2',
    campaign: env.AISENSY_PDF_STUDENT_CAMPAIGN ?? 'Pdf student',
    template: env.AISENSY_PDF_STUDENT_TEMPLATE || 'cf_pdf_student_v4', // for logs; AiSensy picks it from the campaign
    paramOrder: order,
    document: on(env.AISENSY_PDF_DOCUMENT, true),
    // AiSensy creates a contact with userName. Default: a fixed label (like the Career Forecast build), so the
    // visitor's name goes ONLY into template value 1. "first_name" sends the first name instead.
    userName: env.AISENSY_USER_NAME === 'first_name' ? 'first_name' : (env.AISENSY_USER_NAME || 'Career Studio'),
    source: 'Career Studio Ideas 4.0',
    timeoutMs: num(env.AISENSY_TIMEOUT_MS, 8000),
    mediaHours: Math.min(168, Math.max(1, num(env.PDF_MEDIA_URL_HOURS, 24))),
    linkDays: num(env.PDF_LINK_DAYS, 30),
    pdfKeepDays: num(env.PDF_KEEP_DAYS, 30),
    // The link in the message: https://play.zenithschool.ai/p/<token>
    linkBase: env.PDF_LINK_BASE || `${base}/p/`, // core public route (CONTRACT Clarification 7)
    stopText: env.STOP_URL_TEXT || 'play.zenithschool.ai/stop',
    leadsPublicKey: env.LEADS_PUBLIC_KEY || '',
    linkSecret: env.LINK_HMAC_SECRET || '',
    pepper: env.PHONE_PEPPER || '',
    adminKey: env.ADMIN_KEY || '',
    merittoOn: on(env.MERITTO_ON, false),
  };
}

/** What is missing for real sends (names only, never values). */
export function missingForSend(s) {
  const miss = [];
  if (!s.aisensyKey) miss.push('AISENSY_API_KEY');
  if (!s.campaign) miss.push('AISENSY_PDF_STUDENT_CAMPAIGN');
  if (!s.linkSecret) miss.push('LINK_HMAC_SECRET');
  if (!s.pepper) miss.push('PHONE_PEPPER');
  return miss;
}
