// Hub page: lists the stall experiences from config (flags add Startup Studio and Agent Builder; links may say "Coming soon").
import { h, track, config } from './kit.js';
import { iconSvg } from './orchestra.js';

const list = document.getElementById('list');
const exps = await fetch('/api/core/experiences').then((r) => r.json()).catch(() => []);
for (const e of exps) {
  list.appendChild(h('li', {},
    h('a', { class: 'hub-card', href: `/${e.id}/`, 'data-exp': e.id },
      h('span', { class: 'hub-icon' }, iconSvg(e.icon)),
      h('span', { class: 'hub-body' },
        h('span', { class: 'hub-row' }, h('b', {}, e.name), e.forFun ? h('span', { class: 'pz-forfun' }, 'For fun only') : null),
        h('span', { class: 'hub-hook' }, e.hook),
        h('span', { class: 'hub-meta' }, `Counter ${e.counters.join(' + ')}`, e.ready ? null : h('span', { class: 'hub-soon' }, 'Coming soon'))),
      h('span', { class: 'hub-go', 'aria-hidden': 'true' }, iconSvg('rocket')))));
}
if (exps.length) document.getElementById('hub-count').textContent = String(exps.length);
track('start', undefined, { once: true, exp: 'hub' });

// the public hero line comes from config (PUBLIC_HERO_LINE), so it can change without a code change
config().then((c) => { const el = document.getElementById('hero-line'); if (el && c.heroLine) el.textContent = c.heroLine; });
