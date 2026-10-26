// AI ya Asli? TV hook (loaded by core/web/tv.js for /tv/asli?c=7).
//   - live leaderboard panel (today's top 10 nicknames), always on screen, updates over SSE within milliseconds
//   - the current player's round mirrored under the agent graph (content, their pick, the reveal, the Detector's guess)
//   - attract loop between players: a sample "AI ya Asli?" teaser the crowd can guess along with
//   - result spotlight: big score + nickname
// Filming: /tv/asli?c=7&capture=1&board=demo shows the fictional demo board (hero runs land there).
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; };
const params = new URLSearchParams(location.search);
const BOARD = params.get('board') === 'demo' ? 'demo' : 'live';
const TYPE = { text: 'TEXT', code: 'CODE', audio: 'VOICE', image: 'PHOTO' };

let ui = null;
let lastBoard = null;
let stageEl = null;

/** Put the round card over the orchestra's mission panel (measured, so capture / portrait / scale all work). */
function placeCard() {
  const card = ui?.round.box;
  const mission = stageEl?.querySelector('.tv-live .orx-mission');
  if (!card || !mission) return;
  const st = stageEl.getBoundingClientRect();
  const m = mission.getBoundingClientRect();
  Object.assign(card.style, { left: `${m.left - st.left}px`, top: `${m.top - st.top}px`, width: `${m.width}px`, height: `${m.height}px`, right: 'auto', bottom: 'auto' });
}
function roundsMode(on) {
  if (!stageEl) return;
  stageEl.classList.toggle('asli-rounds', on);
  // the graph re-lays out on resize; measure after it settled
  requestAnimationFrame(() => requestAnimationFrame(placeCard));
  setTimeout(placeCard, 450);
}

function mountBoard(stage) {
  const panel = el('aside', 'asli-board');
  const head = el('div', 'asli-board-head');
  head.append(el('span', 'asli-live-dot'), el('b', '', 'AAJ KE TOP 10'), el('span', 'asli-players', ''));
  const list = el('ol', 'asli-board-list');
  const empty = el('p', 'asli-board-empty', 'Pehla naam tumhara ho sakta hai! Scan karo, khelo.');
  const foot = el('div', 'asli-board-foot', BOARD === 'demo' ? 'Demo board (fictional names)' : 'Naam auto-generated hote hain. Raat 12 baje reset.');
  panel.append(head, list, empty, foot);
  stage.appendChild(panel);
  return { panel, list, empty, players: head.querySelector('.asli-players') };
}

function renderBoard(b) {
  if (!ui) return;
  lastBoard = b;
  ui.board.players.textContent = b.players ? `${b.players} ${b.players === 1 ? 'player' : 'players'}` : '';
  ui.board.empty.hidden = b.top.length > 0;
  const rows = b.top.map((e) => {
    const li = el('li', 'asli-row');
    li.append(el('span', 'asli-rank', String(e.rank)), el('span', 'asli-nick', e.label), el('span', 'asli-right', `${e.score}/10`), el('span', 'asli-points', e.time === null || e.time === undefined ? '' : `${e.time}s`));
    if (b.last && b.last.inTop && b.last.label === e.label && b.last.score === e.score && b.last.time === e.time) li.classList.add('is-new');
    return li;
  });
  ui.board.list.replaceChildren(...rows);
}

function connectBoard() {
  const es = new EventSource(`/api/asli/board/stream${BOARD === 'demo' ? '?board=demo' : ''}`);
  es.onmessage = (m) => {
    let msg; try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.type === 'board') renderBoard(msg);
  };
}

// ---------- round mirror ----------
function mountRound(stage) {
  const box = el('section', 'asli-round');
  const head = el('div', 'asli-round-head');
  const body = el('div', 'asli-round-body');
  const picks = el('div', 'asli-round-picks');
  picks.append(el('span', 'asli-tag ai', 'AI ?'), el('span', 'asli-tag real', 'ASLI ?'));
  const timer = el('div', 'asli-round-timer');
  timer.appendChild(el('i'));
  const rv = el('div', 'asli-round-reveal');
  const duel = el('div', 'asli-duel');
  box.append(duel, head, body, picks, timer, rv);
  stage.appendChild(box);
  return { box, head, body, picks, timer, rv, duel };
}

/** Duel: both players' live scores (generated nicknames only), above the round. */
function showDuel(d) {
  const items = (d.items || []).slice(0, 2);
  if (items.length < 2) return;
  const side = (p, cls) => { const s = el('div', `asli-duel-side ${cls}${p.done ? ' done' : ''}`); s.append(el('b', '', p.label), el('span', 'asli-duel-score', String(p.score))); const bar = el('i'); bar.style.width = `${Math.min(10, p.n || 0) * 10}%`; s.append(bar); return s; };
  ui.round.duel.replaceChildren(side(items[0], 'a'), el('span', 'asli-duel-vs', 'VS'), side(items[1], 'b'));
  ui.round.box.classList.add('is-duel');
  ui.duelOn = true;
}

function showAsk(d) {
  const r = ui.round;
  r.box.className = `asli-round on t-${d.type}${ui.duelOn ? ' is-duel' : ''}`;
  roundsMode(true);
  r.head.textContent = `ROUND ${d.round}/10 · ${TYPE[d.type] || ''}`;
  r.rv.replaceChildren();
  if (d.type === 'code') {
    const pre = el('pre', 'asli-code');
    // lines arrive as { x: indent, text } (the bus collapses spaces inside a line)
    pre.textContent = (d.lines || []).map((l) => (typeof l === 'string' ? l : `${' '.repeat(l.x || 0)}${l.text || ''}`)).join('\n');
    r.body.replaceChildren(pre);
  } else if (d.type === 'image' && d.image) {
    const img = el('img', 'asli-img'); img.src = d.image; img.alt = 'Round photo';
    r.body.replaceChildren(img);
  } else if (d.type === 'audio') {
    const w = el('div', 'asli-wave');
    for (let k = 0; k < 22; k++) { const i = el('i'); i.style.setProperty('--k', k); w.appendChild(i); }
    r.body.replaceChildren(w, el('p', 'asli-quote small', d.text ? `"${d.text}"` : ''));
  } else {
    const len = (d.text || '').length;
    r.body.replaceChildren(el('blockquote', `asli-quote ${len > 100 ? 'small' : ''}`, d.text || ''));
  }
  const bar = r.timer.firstChild;
  bar.style.transition = 'none';
  bar.style.transform = 'scaleX(1)';
  void bar.offsetWidth;
  bar.style.transition = `transform ${(d.limit || 6000) / 1000}s linear`;
  bar.style.transform = 'scaleX(0)';
}

function showReveal(d) {
  const r = ui.round;
  r.box.classList.add('revealed', d.right ? 'is-right' : 'is-wrong', `ans-${d.answer}`);
  const bar = r.timer.firstChild;
  bar.style.transition = 'none';
  const stamp = el('div', 'asli-stamp', d.answer === 'ai' ? 'AI THA' : 'ASLI THA');
  const verdict = el('div', 'asli-verdict', d.right ? `Sahi pakda! +${d.points}` : d.pick === 'none' ? 'Time up!' : 'AI ne chakma diya!');
  const tip = el('p', 'asli-tip', d.tip || '');
  const credit = el('p', 'asli-credit', d.credit || '');
  const pct = Number(d.confidence) || 0;
  const detRight = d.guess === d.answer;
  const det = el('p', `asli-det ${detRight && pct >= 62 ? '' : 'confused'}`, d.guess === 'none' ? 'Detector Agent: koi pakka clue nahi' : `Detector Agent: ${pct}% ${d.guess === 'ai' ? 'AI' : 'Asli'}${detRight ? '' : '. AI bhi confuse ho gaya!'}`);
  const top = el('div', 'asli-rv-top');
  top.append(stamp, verdict);
  r.rv.replaceChildren(top, tip, credit, det);
}

// ---------- crowd round: one panel in core's idle stage loop (CONTRACT 12.7 stagePanels) ----------
// Core rotates its panels (QR, scoreboard, about, ours) in the idle area, so ours can never overlap the QR block.
let teasers = [];
let teaserIdx = 0;
async function loadTeasers() { try { teasers = await (await fetch('/api/asli/teasers')).json(); } catch { teasers = []; } }
function renderCrowd(el) {
  const t = teasers[teaserIdx++ % teasers.length];
  const ask = el.ownerDocument.createElement('div');
  ask.className = 'asli-crowd-ask';
  ask.textContent = 'Tum batao: AI ya Asli?';
  const k = el.ownerDocument.createElement('div');
  k.className = 'tv-idle-kicker';
  k.append(el.ownerDocument.createElement('span'), 'CROWD ROUND');
  k.firstChild.className = 'tv-dot';
  const q = el.ownerDocument.createElement('blockquote');
  q.className = 'asli-crowd-q';
  q.textContent = t.text;
  el.classList.add('asli-crowd');
  el.append(k, q, ask);
  setTimeout(() => {
    ask.replaceChildren();
    const stamp = el.ownerDocument.createElement('span');
    stamp.className = `asli-stamp ans-${t.answer}`;
    stamp.textContent = t.answer === 'ai' ? 'AI THA' : 'ASLI THA';
    const tip = el.ownerDocument.createElement('span');
    tip.className = 'asli-crowd-tip';
    tip.textContent = t.tip;
    ask.append(stamp, tip);
    el.classList.add('revealed', `ans-${t.answer}`);
  }, 5200);
}

export default {
  mount(ctx) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/asli/tv.css';
    document.head.appendChild(link);
    ctx.stage.classList.add('asli-tv');
    stageEl = ctx.stage;
    new ResizeObserver(() => { if (stageEl.classList.contains('asli-rounds')) placeCard(); }).observe(ctx.stage);
    ui = { board: mountBoard(ctx.stage), round: mountRound(ctx.stage) };
    connectBoard();
    loadTeasers();
    window.__asliTv = { get board() { return lastBoard; } }; // test hook (read-only)
  },
  event(ev) {
    if (!ui) return;
    if (ev.t === 'init') { ui.round.box.className = 'asli-round'; ui.duelOn = false; ui.round.duel.replaceChildren(); roundsMode(false); return; }
    if (ev.t === 'custom' && ev.name === 'duel' && ev.data) { showDuel(ev.data); return; }
    if (ev.t !== 'custom' || ev.name !== 'round' || !ev.data) return;
    if (ev.data.state === 'ask') showAsk(ev.data);
    else if (ev.data.state === 'reveal') showReveal(ev.data);
  },
  result(p, ctx) {
    if (ui?.duelOn) {
      // duel: winner (or tie) line + both scores, all public text built on the server
      const card = el('div', 'tv-spot-card asli-spot asli-spot-duel');
      card.append(el('div', 'tv-spot-kicker', p.kicker || ''), el('h2', 'pz-display asli-spot-winner', p.title || ''));
      const ol = el('ul', 'asli-spot-lines');
      for (const l of (p.lines || []).slice(0, 2)) ol.appendChild(el('li', '', l));
      card.append(ol);
      ctx.spotlight.replaceChildren(card);
      ui.round.box.className = 'asli-round'; ui.duelOn = false; roundsMode(false);
      return true;
    }
    const card = el('div', 'tv-spot-card asli-spot');
    card.append(el('div', 'tv-spot-kicker', 'AI ya Asli? · result'));
    card.append(el('div', 'asli-spot-nick', p.label || ''));
    const sc = el('div', 'asli-spot-score');
    sc.append(el('b', '', String(p.score ?? '')), el('span', '', `/${p.of || 10}`));
    card.append(sc);
    const ol = el('ul', 'asli-spot-lines');
    for (const l of (p.lines || []).slice(0, 3)) ol.appendChild(el('li', '', l));
    card.append(ol);
    ctx.spotlight.replaceChildren(card);
    if (ui) { ui.round.box.className = 'asli-round'; roundsMode(false); }
    return true;
  },
  reset() { if (ui) { ui.round.box.className = 'asli-round'; roundsMode(false); } },
  stagePanels() { return teasers.length ? [{ id: 'crowd', render: renderCrowd }] : []; },
};
