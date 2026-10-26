// /career/stop/: adds a number to the encrypted stop list (peppered hash only). Sends, batch and export skip it.
const form = document.getElementById('stop-form');
const msg = document.getElementById('stop-msg');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button');
  btn.disabled = true;
  try {
    const r = await fetch('/api/career/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: form.phone.value }) });
    const d = await r.json().catch(() => ({}));
    msg.textContent = d.message || (r.ok ? 'Ho gaya.' : 'Kuch gadbad hui. Counter pe bolo.');
    msg.hidden = false;
    if (r.ok) form.reset();
  } catch { msg.textContent = 'Network nahi mila. Thodi der mein try karo, ya counter pe bolo.'; msg.hidden = false; }
  btn.disabled = false;
});
