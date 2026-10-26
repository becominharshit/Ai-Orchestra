// Server-rendered admin page: big readable numbers for the stall team. No scripts; refreshes every 15 s.
const LABEL = {
  start: 'Starts', complete: 'Completes', gate_view: 'Gate seen', gate_open_ig: 'IG opened', gate_unlock: 'Unlocked',
  share: 'Shares', ref_visit: 'Friend visits', care_shown: 'Support card', reward_given: 'Rewards', fallback: 'Fallbacks', error: 'Errors',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Row label: experience name + its counters (map v4), e.g. "AI Sharks · counter 3", "AI Jyotish · counter 1 + 2 + 8".
let LABELS = {};
const rowLabel = (id) => (LABELS[id] ? `${esc(LABELS[id].name)} <small class="ctr">${LABELS[id].counters.length ? `counter ${LABELS[id].counters.join(' + ')}` : ''}</small>` : esc(id));

function table(title, counts, exps, events) {
  const rows = exps.map((id) => {
    const ev = counts[id] || {};
    return `<tr><th>${rowLabel(id)}</th>${events.map((k) => `<td class="${ev[k] ? '' : 'z'}">${ev[k] || 0}</td>`).join('')}</tr>`;
  });
  const sum = events.map((k) => exps.reduce((a, id) => a + ((counts[id] || {})[k] || 0), 0));
  return `<section><h2>${esc(title)}</h2><div class="scroll"><table>
    <thead><tr><th></th>${events.map((k) => `<th>${LABEL[k]}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
    <tfoot><tr><th>All</th>${sum.map((n) => `<td>${n}</td>`).join('')}</tr></tfoot></table></div></section>`;
}

function extraTable(totals, events) {
  const rows = [];
  for (const [exp, ev] of Object.entries(totals)) for (const [k, v] of Object.entries(ev)) if (!events.includes(k)) rows.push([exp, k, v]);
  if (!rows.length) return '';
  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return `<section><h2>Extra counts (all days)</h2><div class="scroll"><table><thead><tr><th>Experience</th><th>Event</th><th>Count</th></tr></thead>
  <tbody>${rows.map(([e, k, v]) => `<tr><th>${rowLabel(e)}</th><td style="text-align:left" class="pz-mono">${esc(k)}</td><td>${v}</td></tr>`).join('')}</tbody></table></div></section>`;
}

export function adminPage({ snap, claude, limits, config, events, key, bus, staff = false, cleared = '' }) {
  // flagged experiences that are off today still have yesterday's counts: label them by name, marked off (CHECK-20 N6)
  LABELS = { startup: { name: 'AI Startup Studio (off)', counters: [] }, agent: { name: 'Build Your Own AI Agent (off)', counters: [] }, ...Object.fromEntries(config.experiences.map((e) => [e.id, e])) };
  const ids = [...new Set([...config.experiences.map((e) => e.id), ...Object.keys(snap.totals)])].filter((x) => x !== 'core');
  const pct = Math.min(100, (claude.spentUsd / Math.max(1, claude.capUsd)) * 100);
  const totals = ids.reduce((a, id) => { const t = snap.totals[id] || {}; a.start += t.start || 0; a.unlock += t.gate_unlock || 0; a.share += t.share || 0; a.ref += t.ref_visit || 0; return a; }, { start: 0, unlock: 0, share: 0, ref: 0 });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="15"><title>play-zenith admin</title><link rel="stylesheet" href="/core/tokens.css">
<style>
body{margin:0;padding:28px clamp(16px,4vw,48px);background:var(--stage-bg);color:var(--stage-ink);font-family:var(--font-ui)}
h1{font-family:var(--font-display);font-weight:600;font-size:clamp(28px,4vw,44px);margin:0 0 4px}
.sub{color:var(--stage-dim);margin-bottom:24px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:28px}
.kpi{background:var(--stage-panel);border:1px solid var(--stage-line);border-radius:18px;padding:18px 20px}
.kpi b{display:block;font-size:clamp(34px,5vw,56px);line-height:1.05;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.kpi span{color:var(--stage-dim);font-size:15px}
.bar{height:10px;border-radius:9px;background:rgba(255,255,255,.08);margin-top:10px;overflow:hidden}.bar i{display:block;height:100%;background:var(--grad)}
h2{font-size:20px;margin:26px 0 10px;letter-spacing:.02em}
.scroll{overflow-x:auto;border-radius:16px;border:1px solid var(--stage-line)}
table{border-collapse:collapse;width:100%;font-size:clamp(16px,1.6vw,22px);font-variant-numeric:tabular-nums}
th,td{padding:12px 16px;text-align:right;border-bottom:1px solid var(--stage-line);white-space:nowrap}
thead th{font-size:14px;color:var(--stage-dim);text-transform:uppercase;letter-spacing:.06em}
tbody th,tfoot th{text-align:left;font-family:var(--font-mono);font-weight:500}
td.z{color:rgba(255,255,255,.28)} tfoot td,tfoot th{font-weight:800;border-bottom:0;background:rgba(98,187,243,.07)}
p.ok{color:#7ff3c7;font-weight:700}
.tvs{display:flex;flex-wrap:wrap;gap:12px}
.tvs button{font:inherit;font-weight:800;font-size:18px;padding:14px 20px;border-radius:14px;border:1px solid var(--stage-line);background:var(--stage-panel-2);color:var(--stage-ink);cursor:pointer;text-align:left}
.tvs button small{display:block;font-weight:600;font-size:13px;color:var(--stage-dim)}
small.ctr{display:block;font-family:var(--font-mono);font-size:12px;color:var(--stage-dim);letter-spacing:.06em}
a{color:var(--a1)} .foot{margin-top:28px;color:var(--stage-dim);font-size:14px}
</style></head><body>
<h1>play-zenith live counts</h1>
<div class="sub">Today (IST) ${esc(snap.today)} · counts only, no personal data · auto refresh 15 s · mode ${esc(claude.mode)}${config.offline ? ' · OFFLINE' : ''}</div>
<div class="kpis">
  <div class="kpi"><b>${totals.start}</b><span>logon ne try kiya (total starts)</span></div>
  <div class="kpi"><b>${totals.unlock}</b><span>follow-unlocks (total)</span></div>
  <div class="kpi"><b>${totals.share}</b><span>shares (total)</span></div>
  <div class="kpi"><b>${totals.ref}</b><span>friend visits from share links</span></div>
  <div class="kpi"><b>$${claude.spentUsd.toFixed(2)}</b><span>Claude spend of $${claude.capUsd} cap · ${claude.calls} calls</span><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div></div>
  <div class="kpi"><b>${limits.inFlight}/${limits.max}</b><span>calls in flight · ${limits.waiting} waiting · peak ${limits.peakInFlight}</span></div>
</div>
${table('Today', snap.todayCounts, ids, events)}
${table('All days', snap.totals, ids, events)}
${extraTable(snap.totals, events)}
<section><h2>Counter TVs</h2>${cleared ? `<p class="ok">Cleared ${esc(cleared)}: that TV is back on its QR screen.</p>` : ''}
<div class="tvs">${config.experiences.flatMap((e) => e.counters.map((c) => [c, e])).sort((a, b) => a[0] - b[0]).map(([c, e]) => `<form method="post" action="/admin/clear?key=${encodeURIComponent(key)}"><input type="hidden" name="exp" value="${esc(e.id)}"><input type="hidden" name="c" value="${c}"><button type="submit">Clear counter ${c}<small>${esc(e.name)}</small></button></form>`).join('')}</div></section>
<div class="foot">TVs connected: ${bus.reduce((a, b) => a + b.tvs, 0)} · <a href="/admin/export.csv?key=${encodeURIComponent(key)}">Download CSV (per experience per day)</a> · <a href="/admin/alerts" data-pz="alerts-link">Safety alerts, every counter</a> (staff phone) · <form method="post" action="/admin/pair?key=${encodeURIComponent(key)}" style="display:inline"><button type="submit" data-pz="pair">Pair a staff device</button></form> (TV or phone: open /staff, type the code) · ${staff ? `This browser is a staff browser <a href="/staff/off">turn off</a>` : `<a href="/admin/staff?key=${encodeURIComponent(key)}">Make this browser staff</a>`} · <a href="/status.json">status.json</a> · v${esc(config.version)} ${esc(config.commit)}</div>
</body></html>`;
}
