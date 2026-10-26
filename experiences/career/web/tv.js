// Career Studio TV hook (/tv/career?c=5). Round 1 (2026) shows as a big task panel, round 2 is the core Agent
// Orchestra mirror, the human calls show as a banner, and the result is a 2026 vs 2030 card with the work split.
// Only generated or fixed text arrives here: never a name, number or anything the visitor typed.
const COLORS = { by_ai: '#62BBF3', with_ai: '#8F6BFF', led_by_people: '#FFC15E' };
const LABELS = { by_ai: 'Done by AI', with_ai: 'Done with AI', led_by_people: 'Led by people' };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
let r1 = null;
let call = null;
const clear = () => { r1?.remove(); r1 = null; call?.remove(); call = null; };

export default {
  mount() {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/career/tv.css';
    document.head.appendChild(l);
  },
  event(ev, ctx) {
    if (ev.t === 'init' || ev.t === 'reset') { clear(); return; }
    if (ev.t !== 'custom') return;
    const d = ev.data || {};
    if (ev.name === 'r1' || ev.name === 'r1_done') {
      if (!r1) { r1 = el('section', 'cst-r1'); ctx.stage.appendChild(r1); }
      const card = el('div', 'cst-r1-card');
      card.append(el('div', 'cst-kicker', 'Job Time Machine · Round 1'), el('div', 'cst-year', '2026'), el('div', 'cst-job', d.job || ''));
      if (ev.name === 'r1') {
        card.append(el('div', 'cst-step', `Kaam ${d.step} of ${d.of}: aaj ka tareeka, sab haath se`), el('div', 'cst-prompt', d.prompt || ''));
        const dots = el('div', 'cst-dots');
        for (let i = 1; i <= (d.of || 3); i++) dots.appendChild(el('i', i <= d.step ? 'on' : ''));
        card.appendChild(dots);
      } else {
        card.append(el('div', 'cst-prompt', `3 kaam, ${d.seconds}s, sab haath se. Ab wahi din, 2030 mein, AI agent team ke saath.`));
      }
      r1.replaceChildren(card);
    } else if (ev.name === 'call') {
      call?.remove();
      call = el('div', 'cst-call');
      call.append(el('b', '', `Human call ${d.step} · ${d.tagLabel || ''}`), el('span', '', d.q || ''));
      ctx.stage.appendChild(call);
    }
  },
  result(p, ctx) {
    if (!p.noun) return false; // forecast preview: default card
    clear();
    const card = el('div', 'cst-res');
    card.append(el('div', 'cst-kicker', p.kicker || ''), el('h2', 'pz-display', `2026 ka ${p.noun} vs 2030 ka ${p.noun}`));
    const vs = el('div', 'cst-vs');
    const a = el('div'); a.append(el('div', 'y', '2026'), el('small', '', `3 kaam, ${p.r1}s, sab haath se`));
    const b = el('div'); b.append(el('div', 'y', '2030'), el('small', '', `AI agents: 4 kaam ${p.r2}s mein. Insaan: 2 calls`));
    vs.append(a, b);
    card.appendChild(vs);
    if (p.split) {
      const bar = el('div', 'cst-bar');
      const key = el('div', 'cst-key');
      for (const k of Object.keys(COLORS)) {
        const i = el('i'); i.style.cssText = `width:${p.split[k]}%;background:${COLORS[k]}`; bar.appendChild(i);
        const s = el('span', '', `${LABELS[k]} ${p.split[k]}%`); s.style.setProperty('--c', COLORS[k]); key.appendChild(s);
      }
      card.append(bar, key);
    }
    const sk = el('div', 'cst-skills');
    for (const l of (p.lines || []).slice(0, 3)) sk.appendChild(el('div', '', l));
    card.appendChild(sk);
    const f = el('div', 'cst-foot');
    if (p.forFun) f.appendChild(el('span', 'pz-forfun', 'For fun only'));
    f.appendChild(el('span', '', p.split ? 'Work split: Zenith School of AI research, 2026' : 'AI assists, doctors decide'));
    card.appendChild(f);
    ctx.spotlight.replaceChildren(card);
    return true;
  },
  reset() { clear(); },
};
