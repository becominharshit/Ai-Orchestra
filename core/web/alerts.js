// All-counters safety panel (/admin/alerts): one "safety lead" phone watches care and filter alerts from every
// counter. Time, counter, experience and kind only. Optional soft sound + vibration on a new alert.
const $ = (s) => document.querySelector(s);
const key = new URLSearchParams(location.search).get('key');
if (key) history.replaceState(null, '', location.pathname); // the key never stays in the address bar
const headers = key ? { 'x-admin-key': key } : {};
const list = $('[data-pz=alerts-list]');
const empty = $('[data-pz=alerts-empty]');
const modeEl = $('[data-pz=alerts-mode]');
const soundBtn = $('[data-pz=alerts-sound]');
let sound = false;
try { sound = localStorage.getItem('pz-alerts-sound') === '1'; } catch { /* private mode */ }
let audio = null;
const seen = new Set();
let first = true;

function setSound(on) {
  sound = on;
  soundBtn.textContent = `Sound + vibration: ${on ? 'on' : 'off'}`;
  soundBtn.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('pz-alerts-sound', on ? '1' : '0'); } catch { /* private mode */ }
  if (on && !audio) { try { audio = new AudioContext(); } catch { audio = null; } }
}
soundBtn.addEventListener('click', () => setSound(!sound));
setSound(sound);

function chime() {
  if (!sound) return;
  try { navigator.vibrate?.([120, 80, 120]); } catch { /* not supported */ }
  if (!audio) return;
  const t = audio.currentTime;
  for (const [f, d] of [[660, 0], [880, 0.18]]) { // two soft tones
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.08, t + d + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.35);
    o.connect(g).connect(audio.destination);
    o.start(t + d);
    o.stop(t + d + 0.4);
  }
}

const time = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

async function poll() {
  let r;
  try { r = await fetch('/api/core/ops/alerts', { headers, cache: 'no-store' }); } catch { modeEl.textContent = 'Network nahi mila, phir try kar rahe hain...'; return; }
  if (!r.ok) { modeEl.textContent = 'Staff access nahi: /staff pe pairing code daalo.'; return; }
  const { alerts = [], safetyMode } = await r.json();
  modeEl.textContent = safetyMode === 'live' ? 'Safety: live AI check on.' : 'Safety: degraded (rules only). Filter alerts bhi yahan aayenge.';
  modeEl.dataset.mode = safetyMode;
  const fresh = alerts.filter((a) => !seen.has(a.id));
  alerts.forEach((a) => seen.add(a.id));
  if (!first && fresh.length) chime();
  first = false;
  list.replaceChildren(...alerts.map((a) => {
    const li = el('li', `pz-alert is-${a.kind === 'language' ? 'lang' : a.kind === 'report' ? 'report' : 'care'}`);
    li.dataset.pz = 'alert';
    li.append(el('i', 'pz-alert-dot'));
    const txt = el('div', 'pz-alert-text');
    txt.append(el('b', '', a.kind === 'language' ? 'Filter ne ek gaali roki' : a.kind === 'report' ? `Page report hua: ${a.ref}` : a.kind === 'spend' ? 'Spend meter bucket se nahi mila: AI cap abhi aadha (team ko batao)' : 'Support card dikha'), el('span', '', `Counter ${a.c} · ${a.name} · ${time(a.at)}`));
    li.append(txt);
    if (a.kind === 'report' && /^\/[a-z]\/[A-Z0-9]{6}$/.test(a.ref || '')) {
      const open = el('a', 'pz-btn ghost pz-alert-x', 'Dekho');
      open.href = a.ref;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      const rm = el('button', 'pz-btn pz-alert-x', 'Hata do');
      rm.type = 'button';
      rm.dataset.pz = 'page-remove';
      rm.addEventListener('click', async () => { const [, pre, code] = a.ref.split('/'); await fetch(`/api/core/ops/pages/${pre}/${code}/remove`, { method: 'POST', headers }); rm.textContent = 'Hata diya'; rm.disabled = true; });
      li.append(open, rm);
    }
    const x = el('button', 'pz-btn ghost pz-alert-x', 'Theek hai');
    x.type = 'button';
    x.dataset.pz = 'alert-dismiss';
    x.addEventListener('click', async () => { await fetch(`/api/core/ops/${encodeURIComponent(a.exp)}/${a.c}/alerts/${a.id}/dismiss`, { method: 'POST', headers }); poll(); });
    li.append(x);
    return li;
  }));
  empty.hidden = alerts.length > 0;
}
poll();
setInterval(poll, 4000);
