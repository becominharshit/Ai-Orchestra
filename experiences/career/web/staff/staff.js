// Career Studio staff panel (/career/staff/): WhatsApp status (counts only), the live switch and the per-IP caps.
// Talks to /api/career/admin/whatsapp with the x-admin-key header. The key is kept in memory only.
const $ = (id) => document.getElementById(id);
let key = '';
const call = async (body) => {
  const r = await fetch('/api/career/admin/whatsapp', { method: body ? 'POST' : 'GET', headers: { 'x-admin-key': key, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
};
const say = (t) => { $('msg').textContent = t; $('msg').hidden = !t; };
function render(s) {
  $('panel').hidden = false;
  const rows = [
    ['Live send', s.switchOn ? 'ON' : 'OFF'], ['Ready to send', s.live ? 'yes' : `no (missing: ${s.missing.join(', ') || 'switch'})`],
    ['Today', `${s.today} of ${s.dailyCap}`], ['Total', `${s.total} of ${s.totalCap}`], ['Queue', `${s.queued} waiting, ${s.running} sending`],
    ['Allow-list', s.allowlistMode ? `${s.allowlistSize} numbers${s.allowlistInvalid ? `, ${s.allowlistInvalid} invalid: nobody gets a live send` : ''}` : 'off (everyone)'],
    ['Stop list', String(s.stopListSize)], ['Per-IP limits', `forms ${s.ipCaps.lead}/10 min, live ${s.ipCaps.live}/h, stop ${s.ipCaps.stop}/h`],
  ];
  $('stats').replaceChildren(...rows.map(([a, b]) => { const li = document.createElement('li'); const x = document.createElement('span'); x.textContent = a; const y = document.createElement('b'); y.textContent = b; li.append(x, y); return li; }));
  $('switch-line').textContent = s.switchOn ? 'Abhi ON hai: naye forms 1 minute wale path pe jaate hain.' : 'Abhi OFF hai: sab forms 48 ghante wale batch mein.';
  const f = $('caps-form');
  f.lead.value = s.ipCaps.lead; f.live.value = s.ipCaps.live; f.stop.value = s.ipCaps.stop;
}
$('key-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  key = e.target.key.value;
  try { render(await call()); say(''); } catch (err) { say(`Nahi khula: ${err.message}`); }
});
$('sw-on').addEventListener('click', async () => { try { render(await call({ on: true })); say('Switch ON.'); } catch (err) { say(err.message); } });
$('sw-off').addEventListener('click', async () => { try { render(await call({ on: false })); say('Switch OFF.'); } catch (err) { say(err.message); } });
$('caps-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try { render(await call({ ipCaps: { lead: Number(f.lead.value), live: Number(f.live.value), stop: Number(f.stop.value) } })); say('Limits saved.'); } catch (err) { say(err.message); }
});
