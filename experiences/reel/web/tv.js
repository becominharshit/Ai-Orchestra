// Squad Reel Studio TV hook (counter 6): the result spotlight (sent only after the phone's follow gate) shows the
// hook, the captions and a QR so a friend can scan and download it (QR hidden in capture mode). The reel itself
// plays in the phone frame only when the squad turned on "Big screen pe reel chalao" (payload.url present).
// Only TV-safe data arrives here: template, generated text, links with a random id. Never visitor details.
import { qrSvg } from '/core/qr.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const safePath = (p) => (typeof p === 'string' && /^\/api\/reel\/(file|cover)\/[a-z]{20}$/.test(p) ? p : '');

export default {
  mount() {
    if (document.querySelector('link[data-rltv]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = '/reel/tv.css'; l.dataset.rltv = '1';
    document.head.appendChild(l);
  },
  result(p, ctx) {
    const wrap = el('div', 'rltv');
    const phone = el('div', 'rltv-phone');
    const video = safePath(p.url);
    const cover = video ? video.replace('/api/reel/file/', '/api/reel/cover/') : '';
    if (video) {
      const v = document.createElement('video');
      Object.assign(v, { muted: true, loop: true, autoplay: true, playsInline: true });
      if (cover) v.poster = cover;
      v.src = video;
      v.play?.().catch(() => {});
      phone.appendChild(v);
    } else {
      // the squad did not turn on "Big screen pe reel chalao": no footage on the TV, just a ready card
      const ph = el('div', 'rltv-ph');
      ph.append(el('div', 'rltv-ph-ico', '\u25B6'), el('div', 'rltv-ph-t', 'Reel phone pe ready'));
      phone.appendChild(ph);
    }
    phone.appendChild(el('div', 'rltv-notch'));
    const info = el('div', 'rltv-info');
    info.append(el('div', 'rltv-kicker', p.kicker || 'Squad Reel ready'), el('h2', 'pz-display rltv-title', p.title || 'Squad Reel'));
    if (p.hook) info.appendChild(el('p', 'rltv-hook', `"${p.hook}"`));
    const ol = el('ol', 'rltv-caps');
    (Array.isArray(p.captions) ? p.captions : []).slice(0, 3).forEach((c, i) => { const li = el('li', '', c); li.style.animationDelay = `${0.35 + i * 0.25}s`; ol.appendChild(li); });
    info.appendChild(ol);
    const stats = el('div', 'rltv-stats');
    for (const [k, v] of [[`${p.seconds || 22}s`, 'reel'], ['1080x1920', '9:16'], [`${p.bpm || ''}`, 'BPM']]) { const s = el('div', 'rltv-stat'); s.append(el('b', '', k), el('span', '', v)); stats.appendChild(s); }
    info.appendChild(stats);
    if (typeof p.qr === 'string' && p.qr.startsWith('http')) {
      const q = el('div', 'rltv-qr');
      const code = el('div', 'rltv-qr-code');
      code.innerHTML = qrSvg(p.qr, { ecc: 'M', margin: 2, label: 'QR code to download this reel' });
      const t = el('div', 'rltv-qr-t');
      t.append(el('b', '', 'Scan karo, reel lo'), el('span', '', 'Squad ka koi bhi phone. 48 ghante baad auto-delete.'));
      q.append(code, t);
      info.appendChild(q);
    }
    wrap.append(phone, info);
    ctx.spotlight.replaceChildren(wrap);
    return true;
  },
  reset(ctx) { ctx.spotlight.querySelector('video')?.pause(); },
};
