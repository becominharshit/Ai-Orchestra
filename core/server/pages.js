// Public pages (CONTRACT 14, TASK-20): /s/:code and similar one-letter route families, server-rendered by core.
// An experience registers a static HTML template (its own file, vetted at boot) with {{slot}} placeholders and typed
// slots. A page is created from server code with validated values only; core stores it (DATA_DIR/pages.json),
// serves it with noindex and self-only CSP, expires it, adds the "Made at Zenith" footer and a Report button, and
// checks the rendered page once more: every text node must be template text or a validated slot value.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const PAGE_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const PREFIX_RE = /^[a-z]$/;
const RESERVED_PREFIXES = new Set(['p']); // /p/:token belongs to publicRoute
const SLOT_RE = /\{\{([a-zA-Z]\w{0,31})\}\}/g;
// 5 or more digits in a run, with or without spaces, dots or dashes between them (a phone number, a pin, a roll number)
export const LONG_DIGITS = /\p{Nd}(?:[\s.\-_/\\,\u00b7:'"()+\u00a0\u2010-\u2015\u2212]*\p{Nd}){4,}/u; // any separators (N15), any script
const MAX_PAGES = 20000;
const MAX_TTL_DAYS = 30;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const unesc = (s) => String(s).replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e]);

/** Text nodes of an HTML fragment (tags, comments, <style>/<script>/<svg> bodies and attributes dropped), unescaped. */
export function textNodes(html) {
  const s = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(style|script|svg|template)\b[\s\S]*?<\/\1>/gi, ' ');
  return s.split(/<[^>]*>/).map((t) => unesc(t).replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Where position idx of an HTML template is: 'text', 'tag' (between attributes) or 'quoted' (inside a quoted value). */
export function contextAt(html, idx) {
  let state = 'text';
  let q = '';
  for (let i = 0; i < idx; i++) {
    const ch = html[i];
    if (state === 'text') { if (ch === '<' && /[A-Za-z/!]/.test(html[i + 1] || '')) state = 'tag'; }
    else if (state === 'tag') { if (ch === '"' || ch === "'") { state = 'quoted'; q = ch; } else if (ch === '>') state = 'text'; }
    else if (state === 'quoted' && ch === q) state = 'tag';
  }
  return state;
}

export function createPages({ config, safety, log = () => {}, now = () => Date.now() }) {
  const file = path.join(config.dataDir, 'pages.json');
  const families = new Map(); // prefix -> { exp, spec }
  let pages = {}; // `${prefix}:${code}` -> { exp, prefix, code, values, c, createdAt, expiresAt, removed }
  try { if (fs.existsSync(file)) pages = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { log({ kind: 'pages', err: 'bad pages.json' }); }
  let dirty = false;
  const stats = { served: 0, created: 0, refusedRender: 0, reports: 0, expired: 0 };

  // ---- registration (boot) ----
  function register(exp, dir, spec) {
    const prefix = String(spec?.prefix || '');
    if (!PREFIX_RE.test(prefix) || RESERVED_PREFIXES.has(prefix)) throw new Error(`publicPage: prefix must be one lowercase letter, not ${prefix || '(none)'} or a reserved one`);
    if (families.has(prefix)) throw new Error(`publicPage: /${prefix}/:code is already taken by ${families.get(prefix).exp}`);
    const tplPath = path.resolve(dir, String(spec.template || ''));
    if (!tplPath.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(tplPath)) throw new Error(`publicPage: template ${spec.template} not found in the experience folder`);
    const template = fs.readFileSync(tplPath, 'utf8');
    const decoded = unesc(template.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))));
    if (/<script\b|\bon[a-z]+\s*=|javascript:|vbscript:|data:text\/html/i.test(decoded)) throw new Error('publicPage: no scripts or inline handlers in a page template (CSP is self-only)');
    if (/<(?:meta|base|iframe|frame|object|embed|form|link|input|textarea|select|button)\b|\bsrcdoc\s*=/i.test(decoded)) throw new Error('publicPage: no meta, base, iframe, object, embed, form, link or form fields in a page template (core adds the head and the Report form)');
    const slots = { ...(spec.slots || {}) };
    for (const [name, type] of Object.entries(slots)) {
      if (!/^[a-zA-Z]\w{0,31}$/.test(name)) throw new Error(`publicPage: bad slot name ${name}`);
      if (!slotType(exp, type, spec)) throw new Error(`publicPage: slot ${name} has an unknown type ${type}`);
    }
    // every placeholder needs a slot; attribute placeholders only for short typed values (never text)
    const used = new Set();
    for (const m of template.matchAll(SLOT_RE)) {
      if (!(m[1] in slots)) throw new Error(`publicPage: {{${m[1]}}} has no slot type`);
      used.add(m[1]);
      const before = template.slice(0, m.index);
      const where = contextAt(template, m.index); // 'text' | 'tag' | 'quoted' (inside a quoted attribute value)
      const inTag = where !== 'text';
      const t = baseType(slots[m[1]]);
      if (inTag && ['text', 'svg'].includes(t)) throw new Error(`publicPage: {{${m[1]}}} (${slots[m[1]]}) cannot sit inside a tag; only enum, color, int, list and date slots can`);
      if (where === 'tag') throw new Error(`publicPage: {{${m[1]}}} inside a tag must be inside a quoted attribute value`);
      if (!inTag && /<(style|textarea|title|noscript)\b[^>]*>(?![\s\S]*<\/\1>)/i.test(before)) throw new Error(`publicPage: {{${m[1]}}} cannot sit inside <style>, <textarea>, <title> or <noscript>`);
    }
    // the template's own text must pass the copy rules (dashes, profanity, care words, who-coded-what)
    // static text: words must pass the copy rules; pure numbers and symbols ("2026", "01", "·") are allowed as they are
    const statics = textNodes(template.replace(SLOT_RE, '\u0000')).flatMap((t) => t.split('\u0000')).map((t) => t.trim()).filter((t) => /[\p{L}\p{N}]/u.test(t));
    for (const t of statics) if (/\p{L}/u.test(t) && !safety.copyOk(t)) throw new Error(`publicPage: template text fails the copy rules: ${t.slice(0, 60)}`);
    const svgs = new Map(Object.entries(spec.svgs || {}));
    for (const [k, v] of svgs) {
      if (!/^<svg[\s>][\s\S]*<\/svg>$/.test(String(v).trim()) || /<script\b|\bon[a-z]+\s*=|javascript:|href\s*=\s*["']?(?!#)/i.test(v)) throw new Error(`publicPage: svg ${k} must be a plain inline <svg> (no scripts, handlers or external links)`);
      for (const t of textNodes(String(v).replace(/<\/?svg[^>]*>/g, ''))) if (/\p{L}/u.test(t) && !safety.copyOk(t)) throw new Error(`publicPage: svg ${k} text fails the copy rules`);
    }
    const ttlDays = Math.min(MAX_TTL_DAYS, Math.max(1, Number(spec.ttlDays) || 7));
    const css = spec.css ? String(spec.css).replace(/^\/+/, '') : null;
    if (css && !/^[a-z0-9_\-/]+\.css$/i.test(css)) throw new Error('publicPage: css must be a path to a .css file under the experience web folder');
    families.set(prefix, { exp, spec: { ...spec, prefix, template, slots, svgs, ttlDays, css, statics: new Set(statics), title: spec.title || null, description: spec.description || null } });
    return handle(exp, prefix);
  }
  const baseType = (t) => String(t).split(':')[0];
  function slotType(exp, type, spec) {
    const [b, rest] = [baseType(type), String(type).slice(baseType(type).length + 1)];
    if (b === 'text' || b === 'color' || b === 'date') return !rest;
    if (b === 'int') { const m = /^(-?\d+)\.\.(-?\d+)$/.exec(rest); return !!m && Math.abs(Number(m[1])) <= 9999 && Math.abs(Number(m[2])) <= 9999; } // at most 4 digits: adjacent slots can never spell a phone number
    if (b === 'enum') return rest.split('|').every((x) => /^[A-Za-z0-9 _#.-]{1,40}$/.test(x));
    if (b === 'list') return !!safety.listValues(exp, rest);
    if (b === 'svg') return !rest || rest === 'any';
    return false;
  }
  // value validation: text must be public text for this experience (bank line, filled template, generated nickname)
  function valueOk(exp, spec, type, v) {
    const b = baseType(type);
    const rest = String(type).slice(b.length + 1);
    if (b !== 'text' && typeof v !== 'string' && typeof v !== 'number') return null; // no arrays or objects coerced into a value
    if (b === 'text') {
      const s = v && typeof v === 'object' ? v.text : v;
      if (typeof s !== 'string' || s.length > 300 || !/\p{L}/u.test(s)) return null; // words only: numbers go in int slots
      if (LONG_DIGITS.test(s.normalize('NFKC').replace(/[\p{Cf}\u00ad]/gu, ''))) return null; // never a phone number, roll number or pin, even inside a line
      return safety.isPublic(exp, s) && safety.copyOk(s) ? s : null;
    }
    if (b === 'int') { const [lo, hi] = rest.split('..').map(Number); const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? String(n) : null; }
    if (b === 'enum') return rest.split('|').includes(String(v)) ? String(v) : null;
    if (b === 'list') return safety.listValues(exp, rest)?.includes(String(v)) ? String(v) : null;
    if (b === 'color') return /^#[0-9a-fA-F]{6}$/.test(String(v)) ? String(v).toLowerCase() : null;
    if (b === 'date') { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v)); if (!m) return null; const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === String(v) ? String(v) : null; } // YYYY-MM-DD only, shown as given
    if (b === 'svg') return spec.svgs.has(String(v)) ? String(v) : null;
    return null;
  }

  // ---- create / read / remove (server code of the experience) ----
  function handle(exp, prefix) {
    return {
      prefix,
      /** values: { slot: value } (all slots required). Returns { ok, code, url, expiresAt } or { ok: false, reason, slot }. */
      create(req, values = {}, { expiresAt } = {}) {
        const { spec } = families.get(prefix);
        const clean = {};
        for (const [name, type] of Object.entries(spec.slots)) {
          const v = valueOk(exp, spec, type, values[name]);
          if (v === null) return { ok: false, reason: 'bad_slot', slot: name };
          clean[name] = v;
        }
        sweep();
        if (Object.keys(pages).length >= MAX_PAGES) return { ok: false, reason: 'full' };
        let code;
        do { code = ''; for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]; } while (pages[`${prefix}:${code}`]);
        const maxExp = now() + spec.ttlDays * 86400000;
        const exp2 = expiresAt ? Math.min(maxExp, new Date(expiresAt).getTime() || maxExp) : maxExp;
        // the page's counter (for report alerts): the creator's counter only if it is one of this experience's counters
        const own = (config.experiences || []).find((e) => e.id === exp)?.counters || [];
        const asked = Number(req?.headers?.['x-pz-counter'] ?? req?.body?.c);
        const c = Number.isInteger(asked) && own.includes(asked) ? asked : (own[0] ?? 0);
        pages[`${prefix}:${code}`] = { exp, prefix, code, values: clean, c, createdAt: now(), expiresAt: exp2 };
        dirty = true;
        stats.created++;
        return { ok: true, code, path: `/${prefix}/${code}`, url: `${config.publicUrl}/${prefix}/${code}`, expiresAt: new Date(exp2).toISOString() };
      },
      get(code) { const p = pages[`${prefix}:${String(code).toUpperCase()}`]; return p && !p.removed && p.expiresAt > now() ? { code: p.code, values: { ...p.values }, expiresAt: new Date(p.expiresAt).toISOString() } : null; },
      remove(code) { const p = pages[`${prefix}:${String(code).toUpperCase()}`]; if (!p) return false; p.removed = true; dirty = true; return true; },
    };
  }

  // ---- stored entries are untrusted (F1): every field is checked before a page is served or reported ----
  /** 'ok' | 'expired' | 'bad' for the entry stored under prefix:code. */
  function check(prefix, code, p) {
    const fam = families.get(prefix);
    if (!fam || !p || typeof p !== 'object' || p.removed) return 'bad';
    if (p.prefix !== prefix || p.code !== code || !PAGE_CODE_RE.test(String(p.code)) || p.exp !== fam.exp) return 'bad';
    if (!p.values || typeof p.values !== 'object' || Array.isArray(p.values)) return 'bad';
    const created = Number(p.createdAt);
    const expires = Number(p.expiresAt);
    if (!Number.isFinite(created) || !Number.isFinite(expires) || typeof p.expiresAt !== 'number' || typeof p.createdAt !== 'number') return 'bad';
    if (created > now() + 60000 || expires > created + fam.spec.ttlDays * 86400000 + 1000) return 'bad'; // never later than created + ttl
    if (!Number.isInteger(p.c) || p.c < 0 || p.c > 99) return 'bad';
    return expires <= now() ? 'expired' : 'ok';
  }
  /** The entry and its state for a URL's prefix and code (code upper-cased; the stored fields must match). */
  function lookup(prefix, code) {
    const k = String(code || '').toUpperCase();
    if (!PAGE_CODE_RE.test(k)) return { state: 'bad', p: null };
    const p = pages[`${prefix}:${k}`];
    return { state: p ? check(prefix, k, p) : 'missing', p: p || null };
  }

  // ---- rendering ----
  function render(p) {
    const { spec } = families.get(p.prefix) || {};
    if (!spec) return null;
    if (check(p.prefix, p.code, p) !== 'ok') { stats.refusedRender++; log({ kind: 'pages', warn: 'bad_entry', exp: families.get(p.prefix)?.exp }); return null; }
    // every stored value is validated again at render time (a tampered or stale store is never served)
    for (const [n, type] of Object.entries(spec.slots)) if (valueOk(p.exp, spec, type, p.values[n]) === null) { stats.refusedRender++; log({ kind: 'pages', warn: 'bad_value', exp: p.exp }); return null; }
    const allowed = new Set(spec.statics);
    const body = spec.template.replace(SLOT_RE, (_, n) => {
      const type = baseType(spec.slots[n]);
      const v = p.values[n];
      if (type === 'svg') return spec.svgs.get(v) || '';
      allowed.add(String(v));
      return esc(v);
    });
    const title = spec.title && p.values[spec.title] ? p.values[spec.title] : 'Ideas 4.0';
    const desc = spec.description && p.values[spec.description] ? p.values[spec.description] : null;
    const foot = 'Made at Zenith School of AI · Ideas 4.0';
    const expires = new Date(p.expiresAt).toISOString().slice(0, 10);
    const footer = `<footer class="pz-page-foot"><p>${esc(foot)}</p><p class="pz-page-exp">Yeh page ${esc(expires)} tak live hai.</p><form method="post" action="/${esc(p.prefix)}/${esc(p.code)}/report"><button type="submit" data-pz="page-report">Report</button></form></footer>`;
    for (const t of [foot, 'Report', `Yeh page ${expires} tak live hai.`]) allowed.add(t);
    // strict public-text check on the rendered page: every text node is template text, a validated value, or a
    // combination of both (a static segment around a value). Anything else: the page is not served.
    for (const node of textNodes(body + footer)) {
      // N18: no run of 5+ digits in the rendered text, whatever slots produced it (three adjacent int slots, say);
      // ISO dates (date slots, the footer) and year ranges aside
      if (LONG_DIGITS.test(node.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').replace(/\b(?:1[0-9]|20)\d{2}\s?[-\u2010-\u2015]\s?(?:1[0-9]|20)\d{2}\b/g, ' '))) { stats.refusedRender++; log({ kind: 'pages', warn: 'long_number', exp: p.exp }); return null; }
      let rest = node;
      for (const a of [...allowed].sort((x, y) => y.length - x.length)) if (a && rest.includes(a)) rest = rest.split(a).join(' ');
      if (/[\p{L}\p{N}]/u.test(rest)) { stats.refusedRender++; log({ kind: 'pages', warn: 'untemplated_text', exp: p.exp }); return null; }
    }
    const css = spec.css ? `<link rel="stylesheet" href="/${esc(p.exp)}/${esc(spec.css)}">` : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><meta property="og:title" content="${esc(title)}">${desc ? `<meta property="og:description" content="${esc(desc)}">` : ''}<link rel="stylesheet" href="/core/tokens.css"><link rel="stylesheet" href="/core/page.css">${css}</head><body class="pz-page">${body}${footer}</body></html>`;
  }
  function sweep() {
    const t = now();
    for (const [k, p] of Object.entries(pages)) if (p.expiresAt + 86400000 < t) { delete pages[k]; dirty = true; stats.expired++; } // kept 1 day after expiry for a clear "expired" page
  }
  function find(prefix, code) { return pages[`${prefix}:${String(code || '').toUpperCase()}`] || null; }
  function save() {
    if (!dirty) return;
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(pages));
    fs.renameSync(`${file}.tmp`, file);
    dirty = false;
  }
  const timer = setInterval(() => { try { sweep(); save(); } catch (e) { log({ kind: 'pages', err: e?.name }); } }, config.snapshotMs || 30000);
  timer.unref?.();
  const stop = () => { clearInterval(timer); try { save(); } catch { /* best effort */ } };

  function removePage(prefix, code) { const p = find(prefix, code); if (!p) return false; p.removed = true; dirty = true; save(); return true; }
  return { register, render, find, lookup, check, removePage, families, sweep, save, stop, stats: () => ({ ...stats, pages: Object.keys(pages).length }), now };
}
