#!/usr/bin/env node
// Fills docs/DNS_RECORDS_FOR_NALIN_PLAY.html with the real records and prints the PDF with headless Chrome.
//   node ops/aws/make-dns-pdf.mjs            live: reads play-cert (get-certificates) and the play-web URL (read-only)
//   node ops/aws/make-dns-pdf.mjs --sample   sample records, clearly marked SAMPLE (for checking the layout)
// "node ops/aws/lightsail.mjs cert" calls this by itself once the certificate is requested.
// Writes docs/DNS_RECORDS_FOR_NALIN_PLAY{,.sample}.{pdf,filled.html,txt}.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const DOCS = path.join(ROOT, 'docs');
const TEMPLATE = path.join(DOCS, 'DNS_RECORDS_FOR_NALIN_PLAY.html');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ZONE = 'zenithschool.ai';

export const SAMPLE = {
  validation: [{ domain: 'play.zenithschool.ai', type: 'CNAME', name: '_0123456789abcdef0123456789abcdef.play.zenithschool.ai', value: '_fedcba9876543210fedcba9876543210.xlfgrmvvlj.acm-validations.aws' }],
  serviceUrl: 'https://play-web.864gs2gb85a24.ap-south-1.cs.amazonlightsail.com/',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Cloudflare wants the Name without the zone: "_abc.play.zenithschool.ai" -> "_abc.play". */
export const cfName = (fqdn) => String(fqdn).replace(/\.$/, '').replace(new RegExp(`\\.?${ZONE.replace(/\./g, '\\.')}$`), '') || '@';
const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };

/** The records Nalin adds, in order: certificate check(s) first, then the play address. */
export function recordsFor({ validation, serviceUrl }) {
  const rows = validation.map((v) => ({ what: `Certificate check for ${v.domain}`, type: v.type || 'CNAME', name: cfName(v.name), full: v.name.replace(/\.$/, ''), target: v.value.replace(/\.$/, '') }));
  const host = hostOf(serviceUrl);
  rows.push({ what: 'Address of the stall app (play-web)', type: 'CNAME', name: 'play', full: `play.${ZONE}`, target: host || null });
  return rows;
}

function today() {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()) + ' IST';
}

export function fillHtml({ validation, serviceUrl, sample }) {
  const rows = recordsFor({ validation, serviceUrl });
  const tr = rows.map((r, i) => `<tr><td class="n">${i + 1}</td><td class="t">${esc(r.type)}</td><td><span class="what">${esc(r.what)}</span><span class="lbl">Name</span><code class="rec">${esc(r.name)}</code><span class="lbl">Target</span>${r.target ? `<code class="rec">${esc(r.target)}</code>` : '<span class="pending">not known yet: play-web must exist first (run create, then make-dns-pdf again)</span>'}</td><td class="p"><span class="grey">DNS only</span><br>(grey cloud)</td></tr>`).join('\n      ');
  const checklist = rows.map((r, i) => `<li>Record ${i + 1} saved (${esc(r.name)})</li>`).join('\n        ');
  const banner = sample ? '<div class="sample">SAMPLE ONLY: made-up records to check the layout. Do not add them.</div>' : '';
  let html = fs.readFileSync(TEMPLATE, 'utf8')
    .replaceAll('{{DATE}}', esc(today()))
    .replaceAll('{{CERT_NAME}}', 'play-cert')
    .replaceAll('{{SAMPLE_BANNER}}', banner)
    .replaceAll('{{RECORD_COUNT}}', String(rows.length))
    .replaceAll('{{ROWS}}', tr)
    .replaceAll('{{CHECKLIST}}', checklist);
  html = html.replace(/<!-- Template\.[\s\S]*?-->\n/, '');
  return { html, rows };
}

export function textVersion(rows, sample) {
  const out = [
    ...(sample ? ['SAMPLE ONLY: made-up records to check the layout. Do not add them.', ''] : []),
    'Add new records only. Do not change or delete any existing record.',
    '',
    `DNS RECORDS FOR play.zenithschool.ai (zenithschool.ai, in Cloudflare). From Avi, ${today()}.`,
    `${rows.length} new CNAME records. For each: Cloudflare > zenithschool.ai > DNS > Records > "Add record",`,
    'fill Type, Name and Target exactly as below, TTL Auto, then Save.',
    'Proxy status: DNS only (grey cloud), not Proxied, for every record.',
    '',
  ];
  rows.forEach((r, i) => out.push(`${i + 1}. ${r.what}`, `   Type:    ${r.type}`, `   Name:    ${r.name}`, `   Target:  ${r.target || '(not known yet: play-web must exist first)'}`, '   Proxy status: DNS only (grey cloud), not Proxied.', ''));
  out.push('Cloudflare adds ".zenithschool.ai" to each Name by itself. Copy names and targets exactly (no spaces, no dot at the end).', 'Please reply to Avi "play records saved" when done.', '');
  return out.join('\n');
}

export async function makeDnsPdf({ validation, serviceUrl, sample = false }) {
  if (!validation?.length) throw new Error('No certificate validation record to write.');
  const base = path.join(DOCS, `DNS_RECORDS_FOR_NALIN_PLAY${sample ? '.sample' : ''}`);
  const { html, rows } = fillHtml({ validation, serviceUrl, sample });
  const htmlFile = `${base}.filled.html`;
  fs.writeFileSync(htmlFile, html);
  fs.writeFileSync(`${base}.txt`, textVersion(rows, sample));
  const pdf = `${base}.pdf`;
  const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--allow-file-access-from-files', `--print-to-pdf=${pdf}`, `file://${htmlFile}`], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(pdf)) throw new Error(`Chrome could not print the PDF (${CHROME}).`);
  return { pdf, html: htmlFile, txt: `${base}.txt`, rows };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  (async () => {
    if (process.argv.includes('--sample')) {
      const out = await makeDnsPdf({ ...SAMPLE, sample: true });
      console.log(`Sample written: ${out.pdf}`);
      return;
    }
    const { getCert, getService, target, dnsRecordsFrom } = await import('./lightsail.mjs');
    const c = getCert();
    if (!c) throw new Error('play-cert has not been requested yet: run "node ops/aws/lightsail.mjs cert" (after Avi\'s yes).');
    const validation = dnsRecordsFrom(c);
    if (!validation.length) throw new Error('AWS has not published the validation record yet. Try again in a minute.');
    const out = await makeDnsPdf({ validation, serviceUrl: getService(target('web'))?.url, sample: false });
    console.log(`Written: ${out.pdf}\n         ${out.txt}`);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
