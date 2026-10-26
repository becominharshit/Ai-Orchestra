// Agent Orchestra: the signature visual. An orchestrator visibly assigns work to named agents, with
// animated handoff beams, live status chips, a mission log and a progress meter.
//
//   import { Orchestra } from '/core/orchestra.js';
//   const orx = new Orchestra(el, { title: 'AI Jyotish', orchestrator: { id: 'guru', name: 'Jyotish Guru', icon: 'spark' },
//                                   agents: [{ id: 'rashi', name: 'Rashi Agent', role: 'Sun sign', icon: 'star' }], mode: 'phone' });
//   orx.assign('rashi', 'Sun sign nikalo');  orx.status('rashi', 'working');  orx.log('rashi', 'DOB -> Leo');
//   orx.handoff('rashi', 'kaal', 'sign = Leo');  orx.status('rashi', 'done');  orx.done('Reading ready');
//   await orx.step('rashi', 'Sun sign nikalo', async () => compute());   // assign + working + done/retry
//
// RULE: every agent shown maps to real work (a call, a computation or a section of the structured answer),
// and log lines come from real data. Do not invent fake activity.
//
// Every call emits a small JSON event. serialize() returns them all; apply(event) replays one, so the same
// show runs on the counter TV through the bus (kit.tvMirror). replay(events, { speed }) re-runs a whole session.
// States: idle | thinking | working | done | retry.

const CSS_HREF = new URL('./orchestra.css', import.meta.url).href;
const live = new Set(); // instances, re-laid out when the stylesheet or fonts finish loading
function relayoutAll() { for (const o of live) o._layout(); }
function ensureCss() {
  const has = [...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href === CSS_HREF || l.dataset.orxCss);
  if (has) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = CSS_HREF; l.dataset.orxCss = '1';
  l.addEventListener('load', relayoutAll);
  document.head.appendChild(l);
}
document.fonts?.ready.then(relayoutAll);

// 24x24 stroke icons (drawn for this kit). Unknown names render the text itself (emoji or 1-2 letters).
const ICONS = {
  spark: 'M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3L3.5 11l6.3-2.2z',
  brain: 'M9 4a3 3 0 00-3 3v.3A3 3 0 004 10a3 3 0 001 2.2A3 3 0 006 17a3 3 0 003 3V4zm6 0a3 3 0 013 3v.3A3 3 0 0120 10a3 3 0 01-1 2.2A3 3 0 0118 17a3 3 0 01-3 3V4z M9 9h-1.5M15 9h1.5M9 14H7.5M15 14h1.5',
  star: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 110 6 3 3 0 010-6z',
  pen: 'M4 20l4.5-1 10-10a2.1 2.1 0 00-3-3l-10 10L4 20z M13.5 7.5l3 3',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  clock: 'M12 3a9 9 0 110 18 9 9 0 010-18z M12 7v5l3.5 2',
  palm: 'M7 21c-1.7-1.6-3-4-3-6.5V9a1.5 1.5 0 013 0v3 M7 12V5a1.5 1.5 0 013 0v6 M10 11V4a1.5 1.5 0 013 0v7 M13 11V5.5a1.5 1.5 0 013 0V12 M16 12V9a1.5 1.5 0 013 0v5c0 3.5-2.5 7-6.5 7H11',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4z M12 10a3.5 3.5 0 110 7 3.5 3.5 0 010-7z',
  film: 'M4 4h16v16H4z M8 4v16 M16 4v16 M4 8h4 M4 12h4 M4 16h4 M16 8h4 M16 12h4 M16 16h4',
  music: 'M9 18V5l11-2v13 M9 18a3 3 0 11-6 0 3 3 0 016 0z M20 16a3 3 0 11-6 0 3 3 0 016 0z',
  scale: 'M12 4v16 M7 20h10 M4 8h16 M4 8l-2.5 6a3 3 0 005 0z M20 8l-2.5 6a3 3 0 005 0z',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z M8.5 12l2.5 2.5 4.5-5',
  search: 'M10.5 4a6.5 6.5 0 110 13 6.5 6.5 0 010-13z M15.5 15.5L21 21',
  code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16',
  chat: 'M4 5h16v11H9l-5 4z M8 9.5h8 M8 12.5h5',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0112 7a4.5 4.5 0 017.5 3c0 5.4-7.5 10-7.5 10z',
  rocket: 'M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2 M9 15l-3-3c1.5-5 6-9 13-9 0 7-4 11.5-9 13z M15 9a1 1 0 100-.01',
  compass: 'M12 3a9 9 0 110 18 9 9 0 010-18z M15.5 8.5l-2 5-5 2 2-5z',
  card: 'M4 6h16v12H4z M4 10h16 M7 14.5h5',
  dice: 'M5 5h14v14H5z M9 9h.01 M15 9h.01 M12 12h.01 M9 15h.01 M15 15h.01',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  target: 'M12 3a9 9 0 110 18 9 9 0 010-18z M12 7.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9z M12 11.5a.5.5 0 110 1 .5.5 0 010-1z',
  wand: 'M4 20L16 8 M14 4v2 M18 8h2 M19 4.5l-1.5 1.5 M17 3l.5 1.5 M20.5 6.5l-1.5.5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};
export const ICON_NAMES = Object.keys(ICONS);

// No pure green here: green means DONE.
const PALETTE = ['#62BBF3', '#A88BFF', '#FF8FC0', '#FFC861', '#5EEAD4', '#C49BFF', '#8FD3FF', '#FFA07A', '#F5A3FF', '#7FB2FF'];
const LABEL = { idle: 'IDLE', thinking: 'THINKING', working: 'WORKING', done: 'DONE', retry: 'RETRY' };
const STATE_WEIGHT = { idle: 0, thinking: 0.25, working: 0.55, retry: 0.4, done: 1 };
const SVGNS = 'http://www.w3.org/2000/svg';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function svg(tag, attrs = {}) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
export function iconSvg(name, size = 24) {
  const d = ICONS[name];
  if (!d) {
    const s = el('span', 'orx-glyph', String(name || '?').slice(0, 2));
    return s;
  }
  const s = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  s.appendChild(svg('path', { d }));
  return s;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtTime = (ms) => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
// Short tag for the mission log and the roster: the agent's optional `label` (e.g. 'VC', 'MKTG', 'CFO'),
// else its role when that is short, else the first word of its name. The orchestrator is always LEAD.
const shortRole = (r) => (typeof r === 'string' && r.length <= 12 ? r : '');
const tagOf = (a) => (a.tag || (a.lead ? 'LEAD' : a.label || shortRole(a.role) || (a.name || 'AGENT').split(/\s+/)[0])).toUpperCase().slice(0, 12);

let uid = 0;

export class Orchestra {
  /**
   * @param {HTMLElement} root
   * @param {object} opts { title, orchestrator:{id,name,role,icon}, agents:[{id,name,role,icon,color}], mode:'phone'|'tv',
   *                        layout:'phone'|'landscape'|'portrait', scale:number, autoBeams:true, onEvent:fn }
   */
  constructor(root, opts = {}) {
    ensureCss();
    this.root = root;
    this.opts = { mode: 'phone', autoBeams: true, scale: 1, ...opts };
    this.mode = this.opts.mode;
    this.layout = this.opts.layout || (this.mode === 'tv' ? 'landscape' : 'phone');
    this.uid = `orx${++uid}`;
    this.listeners = new Set();
    if (opts.onEvent) this.listeners.add(opts.onEvent);
    this.history = [];
    this.speed = 1;
    this.t0 = null;
    this.anchorTs = 0;
    this.anchorAt = 0;
    this.finished = false;
    this.nodes = new Map();
    this.beams = [];
    this.typing = [];
    this.raf = 0;
    this.handoffs = 0;
    this.manualProgress = null;
    this._build();
    this._ro = new ResizeObserver(() => this._layout());
    this._ro.observe(this.root);
    this._ro.observe(this.$graph);
    live.add(this);
    this._layout();
    this._clock = setInterval(() => this._tickClock(), 100);
    if (opts.orchestrator) this._emit({ t: 'init', title: opts.title || '', orchestrator: opts.orchestrator, agents: opts.agents || [] });
  }

  // ---------- public API (each call = one event) ----------
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  now() { if (this.t0 === null) this.t0 = performance.now(); return Math.round(performance.now() - this.t0); }
  assign(id, task) { this._emit({ t: 'assign', id, task: String(task ?? '') }); return this; }
  status(id, state) { if (!LABEL[state]) throw new Error(`orchestra: unknown state ${state}`); this._emit({ t: 'status', id, state }); return this; }
  log(id, text) { this._emit({ t: 'log', id, text: String(text ?? '') }); return this; }
  handoff(from, to, label = '') { this._emit({ t: 'handoff', from, to, label: String(label) }); return this; }
  progress(value) { this._emit({ t: 'progress', value: Math.max(0, Math.min(1, Number(value) || 0)) }); return this; }
  done(summary = '') { this._emit({ t: 'done', summary: String(summary) }); return this; }
  reset() { this._emit({ t: 'reset' }); return this; }

  /** assign + working, run fn, then done (or retry and rethrow). */
  async step(id, task, fn) {
    this.assign(id, task);
    this.status(id, 'working');
    try {
      const out = await fn();
      this.status(id, 'done');
      return out;
    } catch (e) {
      this.status(id, 'retry');
      throw e;
    }
  }

  serialize() { return { v: 1, events: this.history.map((e) => ({ ...e })) }; }

  /** Apply one event from elsewhere (TV mirror). opts.instant skips animations (catching up). */
  apply(ev, opts = {}) {
    if (!ev || typeof ev.t !== 'string') return;
    const e = { ...ev };
    this._exec(e, opts);
    this.history.push(e);
    for (const fn of this.listeners) { try { fn(e, { remote: true }); } catch { /* listener bug: ignore */ } }
  }

  /** Re-run a recorded session. speed 0.5 = half speed (slow motion). Resolves true when finished. */
  async replay(events, { speed = 1, maxGapMs = 2500 } = {}) {
    const list = Array.isArray(events) ? events : events?.events || [];
    const token = (this._replayToken = {});
    this.speed = speed;
    this.history = [];
    this._exec({ t: 'reset' }, {});
    let prev = list[0]?.ts || 0;
    for (const ev of list) {
      const wait = Math.min(maxGapMs, Math.max(0, (ev.ts || 0) - prev)) / speed;
      prev = ev.ts || prev;
      if (wait > 4) await sleep(wait);
      if (token !== this._replayToken) return false;
      this.apply(ev);
    }
    return true;
  }
  stopReplay() { this._replayToken = {}; this.speed = 1; }

  destroy() {
    clearInterval(this._clock);
    cancelAnimationFrame(this.raf);
    this._ro.disconnect();
    live.delete(this);
    this._replayToken = {};
    this.root.replaceChildren();
    this.root.classList.remove('orx-host');
  }

  // ---------- internals ----------
  _emit(ev) {
    if (ev.ts === undefined) ev.ts = this.now();
    this._exec(ev, {});
    this.history.push(ev);
    for (const fn of this.listeners) { try { fn(ev, { remote: false }); } catch { /* ignore */ } }
  }

  _exec(ev, { instant = false } = {}) {
    if (typeof ev.ts === 'number') { this.anchorTs = ev.ts; this.anchorAt = performance.now(); }
    switch (ev.t) {
      case 'init': return this._init(ev);
      case 'assign': return this._assign(ev, instant);
      case 'status': return this._status(ev, instant);
      case 'log': return this._log(ev.id, ev.text, instant);
      case 'handoff': return this._handoff(ev, instant);
      case 'progress': this.manualProgress = ev.value; return this._progress();
      case 'done': return this._done(ev, instant);
      case 'reset': return this._reset();
      default: return undefined;
    }
  }

  _build() {
    const r = this.root;
    r.classList.add('orx-host');
    r.replaceChildren();
    const box = el('div', `orx orx--${this.layout}`);
    // ambient background
    box.appendChild(el('div', 'orx-bg'));

    // mission panel (TV) / header (phone)
    const mission = el('div', 'orx-mission');
    const top = el('div', 'orx-top');
    const live = el('span', 'orx-live'); live.append(el('i'), document.createTextNode('LIVE'));
    top.append(el('span', 'orx-kicker', 'AGENT ORCHESTRA'), live);
    this.$live = live;
    const title = el('div', 'orx-title');
    this.$title = title;
    const now = el('div', 'orx-now');
    now.append(el('span', 'orx-now-k', 'NOW'), (this.$now = el('span', 'orx-now-v', 'Agents taiyaar ho rahe hain')));
    // progress ring (TV) + bar (phone)
    const meter = el('div', 'orx-meter');
    const ring = svg('svg', { viewBox: '0 0 120 120', class: 'orx-ring-svg' });
    const gid = `${this.uid}-g`;
    const defs = svg('defs');
    const lg = svg('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' });
    lg.append(svg('stop', { offset: '0', 'stop-color': '#7CCBFF' }), svg('stop', { offset: '1', 'stop-color': '#8F6BFF' }));
    defs.appendChild(lg);
    ring.append(defs, svg('circle', { cx: 60, cy: 60, r: 52, class: 'orx-ring-bg' }));
    this.$ringFg = svg('circle', { cx: 60, cy: 60, r: 52, class: 'orx-ring-fg', stroke: `url(#${gid})`, 'stroke-dasharray': '326.7', 'stroke-dashoffset': '326.7' });
    ring.appendChild(this.$ringFg);
    const pct = el('div', 'orx-pct'); pct.append((this.$pct = el('b', '', '0')), el('small', '', '%'));
    const ringWrap = el('div', 'orx-ring'); ringWrap.append(ring, pct);
    const bar = el('div', 'orx-bar'); bar.appendChild((this.$bar = el('i')));
    meter.append(ringWrap, bar);
    const stats = el('div', 'orx-stats');
    const stat = (k) => { const s = el('div', 'orx-stat'); const v = el('b', '', '0'); s.append(v, el('span', '', k)); stats.appendChild(s); return v; };
    this.$sAgents = stat('agents done');
    this.$sHand = stat('handoffs');
    this.$sClock = stat('elapsed');
    this.$clockPhone = el('span', 'orx-clock', '00:00.0');
    top.appendChild(this.$clockPhone);
    this.$roster = el('ol', 'orx-roster');
    mission.append(top, title, now, meter, stats);

    // graph
    const graph = el('div', 'orx-graph');
    const wires = svg('svg', { class: 'orx-wires' });
    const wdefs = svg('defs');
    const bg = svg('linearGradient', { id: `${this.uid}-beam`, gradientUnits: 'userSpaceOnUse' });
    const glow = svg('radialGradient', { id: `${this.uid}-glow` });
    glow.append(svg('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.95' }), svg('stop', { offset: '0.35', 'stop-color': '#9fd8ff', 'stop-opacity': '0.55' }), svg('stop', { offset: '1', 'stop-color': '#8F6BFF', 'stop-opacity': '0' }));
    const eg = svg('linearGradient', { id: `${this.uid}-edge`, x1: '0', y1: '0', x2: '1', y2: '1' });
    eg.append(svg('stop', { offset: '0', 'stop-color': '#7CCBFF' }), svg('stop', { offset: '1', 'stop-color': '#A88BFF' }));
    wdefs.append(bg, glow, eg);
    this.$edges = svg('g', { class: 'orx-edges' });
    this.$beams = svg('g', { class: 'orx-beams' });
    wires.append(wdefs, this.$edges, this.$beams);
    this.$wires = wires;
    this.$nodes = el('div', 'orx-nodes');
    this.$labels = el('div', 'orx-beam-labels');
    this.$banner = el('div', 'orx-banner');
    graph.append(wires, this.$nodes, this.$labels, this.$banner);

    // log
    const logBox = el('div', 'orx-log');
    const lh = el('div', 'orx-log-head'); lh.append(el('span', '', 'MISSION LOG'), (this.$logCount = el('span', 'orx-log-count', '0 lines')));
    this.$log = el('ol', 'orx-lines');
    this.$log.setAttribute('aria-live', 'polite');
    logBox.append(this.$roster, lh, this.$log);

    box.append(mission, graph, logBox);
    this.$box = box;
    this.$graph = graph;
    r.appendChild(box);
  }

  _init(ev) {
    this._reset(true);
    this.title = ev.title || '';
    this.$title.textContent = this.title;
    if (this.t0 === null || ev.ts === 0) this.t0 = performance.now() - (ev.ts || 0);
    const lead = { ...ev.orchestrator, lead: true };
    const agents = (ev.agents || []).map((a, i) => ({ ...a, color: a.color || PALETTE[i % PALETTE.length] }));
    this.lead = lead;
    this.agentList = agents;
    this.$box.classList.toggle('orx--many', agents.length > 4);
    for (const a of [lead, ...agents]) this._makeNode(a);
    this._layout();
    this._progress();
  }

  _makeNode(a) {
    const n = el('div', `orx-node is-idle${a.lead ? ' orx-node--lead' : ''}`);
    n.style.setProperty('--c', a.lead ? '#8FD3FF' : a.color);
    const orb = el('div', 'orx-orb');
    const ringEl = el('div', 'orx-ring2');
    const halo = el('div', 'orx-halo');
    const core = el('div', 'orx-core');
    core.appendChild(iconSvg(a.icon || (a.lead ? 'spark' : 'bolt')));
    const badge = el('div', 'orx-badge'); badge.appendChild(iconSvg('check'));
    orb.append(halo, ringEl, core, badge);
    const label = el('div', 'orx-label');
    const name = el('b', 'orx-name', a.name || 'Agent');
    const role = el('span', 'orx-role', a.lead ? (a.role || 'Orchestrator') : a.role || '');
    const chip = el('span', 'orx-chip'); chip.append(el('i'), (chip.$t = el('span', '', a.lead ? 'LEAD' : 'IDLE')));
    const task = el('span', 'orx-task', '');
    label.append(name, role, chip, task);
    n.append(orb, label);
    this.$nodes.appendChild(n);
    const node = { a, el: n, chip, task, state: 'idle', x: 0, y: 0, edge: null };
    if (!a.lead) {
      const row = el('li', 'orx-roster-row is-idle');
      row.style.setProperty('--c', a.color);
      const rchip = el('span', 'orx-chip'); rchip.append(el('i'), (rchip.$t = el('span', '', 'IDLE')));
      row.append(el('i', 'orx-roster-dot'), el('b', '', a.label ? `${a.label} \u00b7 ${a.name || 'Agent'}` : a.name || 'Agent'), rchip);
      this.$roster.appendChild(row);
      node.row = row;
      node.rchip = rchip;
      const path = svg('path', { class: 'orx-edge' });
      const flow = svg('path', { class: 'orx-edge-flow', stroke: `url(#${this.uid}-edge)` });
      this.$edges.append(path, flow);
      node.edge = path;
      node.flow = flow;
    }
    this.nodes.set(a.id, node);
  }

  _layout() {
    // Scale type for TV layouts from the stage size (1920x1080 or 1080x1920 reference). Do this first:
    // the font size changes the panel widths and therefore the graph size.
    if (this.layout !== 'phone') {
      const b = this.$box.getBoundingClientRect();
      const ref = this.layout === 'portrait' ? Math.min(b.width / 1080, b.height / 1600) : Math.min(b.width / 1920, b.height / 900);
      if (ref > 0) this.$box.style.fontSize = `${(16 * ref * (this.opts.scale || 1)).toFixed(2)}px`;
    }
    if (!this.lead) return;
    const g = this.$graph.getBoundingClientRect();
    const W = g.width;
    const H = g.height;
    if (!W || (!H && this.layout !== 'phone')) return;
    const em = parseFloat(getComputedStyle(this.$graph).fontSize) || 16;
    this.$wires.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.$wires.setAttribute('width', W);
    this.$wires.setAttribute('height', H);
    const agents = this.agentList;
    const n = agents.length;
    const lead = this.nodes.get(this.lead.id);
    if (this.layout === 'phone') {
      const perRow = n <= 4 ? n : Math.ceil(n / 2);
      const rows = Math.ceil(n / Math.max(1, perRow));
      const leadY = 44;
      lead.x = W / 2; lead.y = leadY;
      const rowH = 112;
      const firstY = leadY + 128;
      agents.forEach((a, i) => {
        const r = Math.floor(i / perRow);
        const inRow = r === rows - 1 ? n - perRow * (rows - 1) : perRow;
        const col = i - r * perRow;
        const node = this.nodes.get(a.id);
        node.x = (W / inRow) * (col + 0.5);
        node.y = firstY + r * rowH;
      });
      this.$graph.style.height = `${firstY + (rows - 1) * rowH + 84}px`;
    } else {
      // TV layouts: a collision-checked solver. Every node box (orb + ring + caption + chip) is measured from
      // the DOM, then we try ellipses from large to small and keep the first where no two boxes overlap and
      // all fit inside the graph. If no ellipse fits, agents go into two columns flanking the conductor.
      // The whole arrangement is centred, so the graph stays centred for any crop.
      this._solveTv(W, H, em, lead, agents);
    }
    for (const node of this.nodes.values()) {
      const t = `translate(${node.x.toFixed(1)}px, ${node.y.toFixed(1)}px)`;
      if (!node.placed) {
        // first placement: no slide from the corner, just the entrance animation
        node.el.style.transition = 'none';
        node.el.style.transform = t;
        void node.el.offsetWidth;
        node.el.style.transition = '';
        node.el.classList.add('enter');
        node.placed = true;
      } else node.el.style.transform = t;
    }
    // beams in flight follow the new positions
    for (const bm of this.beams) {
      const a = this._agent(bm.from);
      const b = this._agent(bm.to);
      if (!a || !b) continue;
      const d = this._curve(a, b);
      bm.core.setAttribute('d', d);
      bm.glowPath.setAttribute('d', d);
      bm.L = bm.core.getTotalLength();
      bm.seg = this.layout === 'phone' ? Math.max(22, bm.L * 0.2) : Math.max(40, bm.L * 0.32);
      for (const p of [bm.glowPath, bm.core]) p.style.strokeDasharray = `${bm.seg} ${bm.L + bm.seg}`;
      bm.samples = [];
      for (let i = 0; i <= 48; i++) { const pt = bm.core.getPointAtLength((bm.L * i) / 48); bm.samples.push([pt.x, pt.y]); }
    }
    for (const a of agents) {
      const node = this.nodes.get(a.id);
      const d = this._curve(lead, node);
      node.edge.setAttribute('d', d);
      node.flow.setAttribute('d', d);
    }
  }

  /** Box of a node relative to its anchor (orb centre): { l, r, t, b }. Includes the spinning ring. */
  _nodeBox(node, em) {
    const orb = node.el.querySelector('.orx-orb');
    const label = node.el.querySelector('.orx-label');
    const d = orb.offsetWidth || em * 6;
    const half = d / 2 + (node.a.lead ? 0.75 : 0.55) * em;
    const anchor = node.el.getBoundingClientRect(); // the node element is 0x0 at the orb centre
    const lr = label.getBoundingClientRect();
    return {
      l: Math.min(-half, lr.left - anchor.left), r: Math.max(half, lr.right - anchor.left),
      t: Math.min(-half, lr.top - anchor.top), b: Math.max(half, lr.bottom - anchor.top),
    };
  }

  _solveTv(W, H, em, lead, agents) {
    const n = agents.length;
    const pad = em * 0.9; // minimum gap between any two boxes
    const margin = em * 0.6;
    const all = [lead, ...agents.map((a) => this.nodes.get(a.id))];
    for (const node of all) node.el.classList.remove('orx-node--side-l', 'orx-node--side-r');
    let boxes = new Map(all.map((node) => [node.a.id, this._nodeBox(node, em)]));
    const rect = (id, x, y) => { const b = boxes.get(id); return { l: x + b.l, r: x + b.r, t: y + b.t, b: y + b.b }; };
    const hitP = (p, q, g) => p.l < q.r + g && q.l < p.r + g && p.t < q.b + g && q.t < p.b + g;
    const fitM = (offs, m, g = pad) => {
      const rs = [rect(lead.a.id, 0, 0), ...agents.map((a, i) => rect(a.id, offs[i][0], offs[i][1]))];
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (hitP(rs[i], rs[j], g)) return null;
      const L = Math.min(...rs.map((r) => r.l)), R = Math.max(...rs.map((r) => r.r));
      const T = Math.min(...rs.map((r) => r.t)), B = Math.max(...rs.map((r) => r.b));
      if (R - L > W - 2 * m || B - T > H - 2 * m) return null;
      // keep the conductor horizontally centred (crop safety) when the extents allow it
      let cx = W / 2;
      if (cx + L < m || cx + R > W - m) cx = (W - (R - L)) / 2 - L;
      const cy = (H - (B - T)) / 2 - T;
      return { cx, cy, offs };
    };
    const fit = (offs) => fitM(offs, margin);
    // fallbacks may also use the outer margin and a smaller gap (never an overlap)
    const fitTight = (offs) => fitM(offs, margin) || fitM(offs, 0) || fitM(offs, 0, pad / 2) || fitM(offs, 0, em * 0.15);
    let best = null;
    const starts = n % 2 ? [-90, -90 + 180 / n] : [-90 + 180 / n, -90];
    outer: for (let rx = W / 2; rx >= em * 8; rx -= em * 0.5) {
      for (const k of this.layout === 'portrait' ? [1.25, 1.0, 0.8] : [0.72, 0.6, 0.85, 0.5]) {
        const ry = Math.min(H / 2, rx * k);
        for (const st of starts) {
          const offs = agents.map((_, i) => { const a = ((st + (360 / n) * i) * Math.PI) / 180; return [rx * Math.cos(a), ry * Math.sin(a)]; });
          const f = fit(offs);
          if (f) { best = f; break outer; }
        }
      }
    }
    if (!best) {
      // Org-chart columns: agents left and right of the conductor, captions on the outer side of each orb.
      const left = agents.slice(0, Math.ceil(n / 2));
      const right = agents.slice(Math.ceil(n / 2));
      for (const a of left) this.nodes.get(a.id).el.classList.add('orx-node--side-l');
      for (const a of right) this.nodes.get(a.id).el.classList.add('orx-node--side-r');
      boxes = new Map(all.map((node) => [node.a.id, this._nodeBox(node, em)]));
      const lb = boxes.get(lead.a.id);
      const place = (list, side) => {
        // the orb sits next to the conductor box; the caption extends outwards
        const x = side < 0
          ? lb.l - pad - Math.max(...list.map((a) => boxes.get(a.id).r))
          : lb.r + pad - Math.min(...list.map((a) => boxes.get(a.id).l));
        const hs = list.map((a) => boxes.get(a.id).b - boxes.get(a.id).t);
        const total = hs.reduce((sum, h) => sum + h, 0);
        const gap = list.length > 1 ? Math.max(pad * 1.05, Math.min(em * 4, (H - 2 * margin - total) / (list.length - 1))) : 0;
        let y = -(total + gap * (list.length - 1)) / 2;
        return list.map((a, i) => { const bx = boxes.get(a.id); const oy = y - bx.t; y += hs[i] + gap; return [x, oy]; });
      };
      const offs = [...place(left, -1), ...place(right, 1)];
      best = fitTight(offs);
      if (!best) {
        // Rows above and below the conductor (tall, narrow stages such as 9:16), captions under each orb.
        for (const node of all) node.el.classList.remove('orx-node--side-l', 'orx-node--side-r');
        boxes = new Map(all.map((node) => [node.a.id, this._nodeBox(node, em)]));
        const lb2 = boxes.get(lead.a.id);
        const wMax = Math.max(...agents.map((a) => boxes.get(a.id).r - boxes.get(a.id).l));
        const perRow = Math.max(1, Math.min(n, Math.floor((W - 2 * margin + pad) / (wMax + pad))));
        const rowsN = Math.ceil(n / perRow);
        const topRows = Math.ceil(rowsN / 2);
        const rowsOf = [];
        for (let r = 0; r < rowsN; r++) rowsOf.push(agents.slice(r * perRow, (r + 1) * perRow));
        const hRow = (row) => Math.max(...row.map((a) => boxes.get(a.id).b - boxes.get(a.id).t));
        const offs2 = [];
        // rows above: stack upwards from the lead's top edge
        let yTop = lb2.t - pad;
        for (let r = topRows - 1; r >= 0; r--) {
          const row = rowsOf[r];
          const h = hRow(row);
          row.forEach((a, i) => { const bx = boxes.get(a.id); offs2[agents.indexOf(a)] = [(i - (row.length - 1) / 2) * (wMax + pad), yTop - bx.b]; });
          yTop -= h + pad;
        }
        let yBot = lb2.b + pad;
        for (let r = topRows; r < rowsN; r++) {
          const row = rowsOf[r];
          const h = hRow(row);
          row.forEach((a, i) => { const bx = boxes.get(a.id); offs2[agents.indexOf(a)] = [(i - (row.length - 1) / 2) * (wMax + pad), yBot - bx.t]; });
          yBot += h + pad;
        }
        best = fitTight(offs2) || { cx: W / 2, cy: H / 2, offs: offs2 };
      }
    }
    lead.x = best.cx; lead.y = best.cy;
    agents.forEach((a, i) => { const node = this.nodes.get(a.id); node.x = best.cx + best.offs[i][0]; node.y = best.cy + best.offs[i][1]; });
    // obstacles for handoff labels, in graph coordinates
    this._obstacles = all.map((node) => rect(node.a.id, node.x, node.y));
  }

  _curve(p, q) {
    if (this.layout === 'phone') {
      const dy = q.y - p.y;
      return `M${p.x},${p.y} C${p.x},${p.y + dy * 0.55} ${q.x},${q.y - dy * 0.55} ${q.x},${q.y}`;
    }
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const k = 0.14;
    return `M${p.x},${p.y} Q${mx - dy * k},${my + dx * k} ${q.x},${q.y}`;
  }

  _agent(id) { return this.nodes.get(id) || null; }

  _assign(ev, instant) {
    const node = this._agent(ev.id);
    if (!node) return;
    this._typeInto(node.task, ev.task, instant);
    if (node.state === 'idle' || node.state === 'done') this._setState(node, 'thinking');
    this.$now.textContent = `${node.a.name}: ${ev.task}`;
    this._addLine(this.lead.id, `assign -> ${tagOf(node.a)}: ${ev.task}`, instant, 'sys');
    if (this.opts.autoBeams && !instant && !node.a.lead) this._beam(this.lead.id, ev.id, ev.task, 'out');
  }

  _status(ev, instant) {
    const node = this._agent(ev.id);
    if (!node) return;
    const prev = node.state;
    this._setState(node, ev.state);
    if (node.a.lead) return;
    if (ev.state === 'done' && prev !== 'done') {
      this._addLine(ev.id, 'done', instant, 'ok');
      if (this.opts.autoBeams && !instant) this._beam(ev.id, this.lead.id, '', 'back');
    }
    if (ev.state === 'retry') this._addLine(ev.id, 'retrying', instant, 'warn');
  }

  _setState(node, state) {
    node.state = state;
    node.el.classList.remove('is-idle', 'is-thinking', 'is-working', 'is-done', 'is-retry');
    node.el.classList.add(`is-${state}`);
    if (!node.a.lead) {
      node.chip.$t.textContent = LABEL[state];
      node.rchip.$t.textContent = LABEL[state];
      node.row.className = `orx-roster-row is-${state}`;
    }
    if (node.edge) {
      node.flow.classList.toggle('on', state === 'thinking' || state === 'working');
      node.edge.classList.toggle('done', state === 'done');
    }
    const lead = this.nodes.get(this.lead?.id);
    if (lead && !node.a.lead && !this.finished) {
      const busy = [...this.nodes.values()].some((x) => !x.a.lead && (x.state === 'thinking' || x.state === 'working'));
      lead.el.classList.toggle('is-working', busy);
      lead.el.classList.toggle('is-idle', !busy);
      lead.chip.$t.textContent = busy ? 'CONDUCTING' : 'LEAD';
    }
    this._progress();
  }

  _progress() {
    const ag = [...this.nodes.values()].filter((x) => !x.a.lead);
    const auto = ag.length ? ag.reduce((s, x) => s + STATE_WEIGHT[x.state], 0) / ag.length : 0;
    let v = this.finished ? 1 : Math.min(0.97, Math.max(auto * 0.97, this.manualProgress ?? 0));
    if (this.finished) v = 1;
    const p = Math.round(v * 100);
    this.$pct.textContent = String(p);
    this.$bar.style.transform = `scaleX(${v})`;
    this.$ringFg.setAttribute('stroke-dashoffset', String(326.7 * (1 - v)));
    this.$sAgents.textContent = `${ag.filter((x) => x.state === 'done').length}/${ag.length}`;
    this.$sHand.textContent = String(this.handoffs);
  }

  _handoff(ev, instant) {
    const a = this._agent(ev.from);
    const b = this._agent(ev.to);
    if (!a || !b) return;
    this.handoffs += 1;
    this._progress();
    this._addLine(ev.from, `handoff -> ${tagOf(b.a)}${ev.label ? `: ${ev.label}` : ''}`, instant, 'hand');
    if (!instant) this._beam(ev.from, ev.to, ev.label, 'hand');
  }

  _log(id, text, instant) {
    this._addLine(id, text, instant);
    if (id === this.lead?.id) this.$now.textContent = text;
  }

  _addLine(id, text, instant, kind = '') {
    const node = this._agent(id);
    const li = el('li', kind ? `k-${kind}` : '');
    const ts = el('time', '', fmtTime(this.anchorTs));
    const who = el('b', '', node ? tagOf(node.a) : 'SYS'); // never print a raw id
    if (node) who.style.color = node.a.lead ? '#8FD3FF' : node.a.color;
    const msg = el('span', 'orx-msg');
    li.append(ts, who, msg);
    this.$log.appendChild(li);
    while (this.$log.children.length > 60) this.$log.firstChild.remove();
    this.$logCount.textContent = `${this.$log.children.length} lines`;
    this._typeInto(msg, text, instant);
    // keep newest visible
    this.$log.scrollTop = this.$log.scrollHeight;
  }

  _typeInto(target, text, instant) {
    if (instant || this.root.offsetParent === null && this.mode !== 'tv') { target.textContent = text; return; }
    const dur = Math.min(650, 18 * text.length) / this.speed;
    this.typing = this.typing.filter((t) => t.el !== target);
    this.typing.push({ el: target, text, start: performance.now(), dur });
    target.textContent = '';
    target.classList.add('typing');
    this._loop();
  }

  _beam(fromId, toId, label, kind) {
    const a = this._agent(fromId);
    const b = this._agent(toId);
    if (!a || !b) return;
    const d = this._curve(a, b);
    const glowPath = svg('path', { d, class: `orx-beam-glow k-${kind}` });
    const core = svg('path', { d, class: `orx-beam k-${kind}` });
    const head = svg('circle', { r: this.layout === 'phone' ? 9 : 22, fill: `url(#${this.uid}-glow)`, class: 'orx-head' });
    const dot = svg('circle', { r: this.layout === 'phone' ? 2.6 : 5.5, class: 'orx-head-dot' });
    this.$beams.append(glowPath, core, head, dot);
    const L = core.getTotalLength();
    const seg = this.layout === 'phone' ? Math.max(22, L * 0.2) : Math.max(40, L * 0.32);
    for (const p of [glowPath, core]) { p.style.strokeDasharray = `${seg} ${L + seg}`; p.style.strokeDashoffset = `${seg}`; }
    const samples = [];
    for (let i = 0; i <= 48; i++) { const pt = core.getPointAtLength((L * i) / 48); samples.push([pt.x, pt.y]); }
    const dur = (this.layout === 'phone' ? 820 : 1100) / this.speed;
    this.beams.push({ from: fromId, to: toId, glowPath, core, head, dot, L, seg, samples, start: performance.now(), dur });
    if (label && kind === 'hand' && this.layout !== 'phone') {
      const lab = el('div', `orx-beam-label k-${kind}`, label.length > 34 ? `${label.slice(0, 33)}\u2026` : label);
      lab.style.visibility = 'hidden';
      this.$labels.appendChild(lab);
      const lw = lab.offsetWidth;
      const lh = lab.offsetHeight;
      const em = parseFloat(getComputedStyle(this.$graph).fontSize) || 16;
      const g = this.$graph.getBoundingClientRect();
      const taken = [...(this._obstacles || []), ...(this._labelRects || [])];
      const gap = em * 0.4;
      const free = (r) => r.l >= 0 && r.t >= 0 && r.r <= g.width && r.b <= g.height && !taken.some((q) => r.l < q.r + gap && q.l < r.r + gap && r.t < q.b + gap && q.t < r.b + gap);
      let spot = null;
      for (const ti of [24, 20, 28, 16, 32, 12, 36]) {
        const [mx, my] = samples[ti];
        const nx = -(samples[Math.min(48, ti + 2)][1] - samples[Math.max(0, ti - 2)][1]);
        const ny = samples[Math.min(48, ti + 2)][0] - samples[Math.max(0, ti - 2)][0];
        const nl = Math.hypot(nx, ny) || 1;
        for (const off of [0, 1.6, -1.6, 3, -3]) {
          const x = mx + (nx / nl) * off * em;
          const y = my + (ny / nl) * off * em;
          const r = { l: x - lw / 2, r: x + lw / 2, t: y - lh / 2, b: y + lh / 2 };
          if (free(r)) { spot = { x, y, r }; break; }
        }
        if (spot) break;
      }
      // no free spot: skip the label (the log line already says it); never draw it on top of a node
      if (!spot) { lab.remove(); } else {
        // left/top, not transform: the label's scale keyframe would also scale a transform translate and drift it onto a node
        lab.style.left = `${spot.x.toFixed(0)}px`;
        lab.style.top = `${spot.y.toFixed(0)}px`;
        lab.style.visibility = '';
        lab.style.animationDuration = `${2200 / this.speed}ms`;
        (this._labelRects ||= []).push(spot.r);
        setTimeout(() => { lab.remove(); this._labelRects = (this._labelRects || []).filter((q) => q !== spot.r); }, 2300 / this.speed);
      }
    }
    // arrival pulse on target
    setTimeout(() => { b.el.classList.remove('pulse'); void b.el.offsetWidth; b.el.classList.add('pulse'); }, dur * 0.85);
    this._loop();
  }

  _loop() {
    if (this.raf) return;
    const tick = (now) => {
      this.raf = 0;
      // beams
      this.beams = this.beams.filter((bm) => {
        const t = Math.min(1, (now - bm.start) / bm.dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
        const off = bm.seg - e * (bm.L + bm.seg);
        bm.core.style.strokeDashoffset = off;
        bm.glowPath.style.strokeDashoffset = off;
        const idx = Math.min(48, Math.round(e * 48));
        const [x, y] = bm.samples[idx];
        bm.head.setAttribute('cx', x); bm.head.setAttribute('cy', y);
        bm.dot.setAttribute('cx', x); bm.dot.setAttribute('cy', y);
        const fade = t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
        bm.head.style.opacity = fade; bm.dot.style.opacity = fade;
        if (t >= 1) { bm.glowPath.remove(); bm.core.remove(); bm.head.remove(); bm.dot.remove(); return false; }
        return true;
      });
      // typing
      this.typing = this.typing.filter((ty) => {
        const t = Math.min(1, (now - ty.start) / Math.max(1, ty.dur));
        ty.el.textContent = ty.text.slice(0, Math.ceil(ty.text.length * t));
        if (t >= 1) { ty.el.classList.remove('typing'); return false; }
        return true;
      });
      if (this.beams.length || this.typing.length) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  _tickClock() {
    if (!this.lead) return;
    const ms = this.finished ? this.anchorTs : this.anchorTs + (performance.now() - this.anchorAt) * this.speed;
    const s = fmtTime(ms);
    this.$sClock.textContent = s;
    this.$clockPhone.textContent = s;
  }

  _done(ev, instant) {
    this.finished = true;
    this.$box.classList.add('is-finished');
    this.$live.lastChild.textContent = 'DONE';
    const lead = this.nodes.get(this.lead?.id);
    if (lead) { lead.el.classList.remove('is-working', 'is-idle'); lead.el.classList.add('is-done'); lead.chip.$t.textContent = 'COMPLETE'; }
    this._progress();
    this._tickClock();
    this.$banner.replaceChildren();
    const icon = el('span', 'orx-banner-i'); icon.appendChild(iconSvg('check'));
    const txt = el('span', 'orx-banner-t');
    const ag = this.agentList?.length || 0;
    txt.append(el('b', '', ev.summary || 'Mission complete'), el('small', '', `${ag} agents · ${this.handoffs} handoffs · ${fmtTime(this.anchorTs)}`));
    this.$banner.append(icon, txt);
    this.$banner.classList.remove('show');
    void this.$banner.offsetWidth;
    this.$banner.classList.add('show');
    if (!instant) { this.$box.classList.remove('burst'); void this.$box.offsetWidth; this.$box.classList.add('burst'); }
    this._addLine(this.lead?.id, ev.summary ? `complete: ${ev.summary}` : 'complete', instant, 'ok');
    this.$now.textContent = ev.summary || 'Mission complete';
    this.$now.parentElement.classList.add('is-done');
  }

  _reset(keepHistory = false) {
    this.finished = false;
    this.handoffs = 0;
    this.manualProgress = null;
    this.beams.forEach((b) => { b.glowPath.remove(); b.core.remove(); b.head.remove(); b.dot.remove(); });
    this.beams = [];
    this.typing = [];
    this.nodes.clear();
    this.$nodes.replaceChildren();
    this.$roster.replaceChildren();
    this.$edges.replaceChildren();
    this.$labels.replaceChildren();
    this.$log.replaceChildren();
    this.$banner.classList.remove('show');
    this.$box.classList.remove('is-finished', 'burst');
    this.$live.lastChild.textContent = 'LIVE';
    this.$now.textContent = 'Agents taiyaar ho rahe hain';
    this.$now.parentElement.classList.remove('is-done');
    this.$logCount.textContent = '0 lines';
    if (!keepHistory) { this.lead = null; this.agentList = []; this.$title.textContent = ''; }
    this._progress();
  }
}
