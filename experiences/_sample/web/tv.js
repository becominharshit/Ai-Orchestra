// Optional TV renderer hook for _sample (experiences/<id>/web/tv.js). Every method is optional.
// result() returns true when it rendered the spotlight itself; return false to use the default card.
export default {
  mount(ctx) { /* called once; ctx = { exp, counter, stage, live, spotlight, orchestra, meta, layout, capture, speed } */ },
  event(ev, ctx) { /* every orchestra/custom event, after the orchestra applied it */ },
  result(payload, ctx) {
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const card = el('div', 'tv-spot-card');
    const n = el('div', 'tv-spot-qr', String(payload.number ?? ''));
    n.style.cssText = 'display:grid;place-items:center;background:linear-gradient(135deg,#62BBF3,#8F6BFF);color:#fff;font-family:var(--font-display);font-size:5em;width:1.6em;height:1.6em;padding:0;border-radius:50%;right:0.6em;top:0.6em';
    card.append(el('div', 'tv-spot-kicker', payload.kicker || 'Result'), el('h2', 'pz-display tv-spot-title', payload.title || ''), n);
    const ol = el('ol', 'tv-spot-lines');
    for (const l of (payload.lines || []).slice(0, 4)) { const li = el('li', 'on', l); ol.appendChild(li); }
    card.appendChild(ol);
    if (payload.forFun) { const f = el('div', 'tv-spot-foot'); f.appendChild(el('span', 'pz-forfun', 'For fun only')); card.appendChild(f); }
    ctx.spotlight.replaceChildren(card);
    return true;
  },
  reset(ctx) { /* back to idle */ },
};
