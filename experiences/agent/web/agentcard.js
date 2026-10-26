// The downloadable "Agent card" (1080x1350 PNG): name, job, personality, voice, tools, first task.
// Public surface: every word drawn here comes from the server as publicText ({ pt, text }), plus Zenith's own
// handle and site. Never visitor-typed text (there is none) and never a first name.
import { iconSvg } from '/core/orchestra.js';

const W = 1080;
const H = 1350;
const HANDLE = '@zenith_school_of_ai';
const SITE = 'play.zenithschool.ai';
const txt = (v) => (v && typeof v === 'object' && v.pt && typeof v.text === 'string' ? v.text : '');

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fit(ctx, text, maxW, sizes, weight, family) {
  for (const s of sizes) { ctx.font = `${weight} ${s}px ${family}`; if (ctx.measureText(text).width <= maxW) return s; }
  return sizes[sizes.length - 1];
}
async function fonts() {
  if (!document.fonts) return;
  await Promise.all(['600 96px Newsreader', '800 40px "Plus Jakarta Sans"', '600 34px "Plus Jakarta Sans"', '700 26px "JetBrains Mono"'].map((f) => document.fonts.load(f))).catch(() => {});
}

export async function drawAgentCard(c, heroLine = '', owner = '') {
  await fonts();
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#15104a'); bg.addColorStop(0.6, '#0a0826'); bg.addColorStop(1, '#06051a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const orb = (x, y, r, col) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); };
  orb(880, 120, 520, 'rgba(98,187,243,0.30)');
  orb(120, 1200, 620, 'rgba(143,107,255,0.32)');
  ctx.strokeStyle = 'rgba(150,165,255,0.06)'; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 54) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
  // outer frame (trading-card feel)
  rr(ctx, 36, 36, W - 72, H - 72, 48); ctx.strokeStyle = 'rgba(186,196,255,0.22)'; ctx.lineWidth = 3; ctx.stroke();
  const grad = ctx.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#7CCBFF'); grad.addColorStop(1, '#A88BFF');

  // brand + kicker
  ctx.fillStyle = '#9fd8ff'; ctx.beginPath(); ctx.arc(104, 112, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F1F2FF'; ctx.font = '600 40px Newsreader'; ctx.fillText('Zenith School of AI', 130, 126);
  const k = txt(c.kicker).toUpperCase();
  ctx.font = '700 24px "JetBrains Mono"';
  const kw = ctx.measureText(k).width + 44;
  rr(ctx, W - 84 - kw, 84, kw, 52, 26); ctx.fillStyle = 'rgba(124,203,255,0.14)'; ctx.fill(); ctx.strokeStyle = 'rgba(124,203,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#bfe6ff'; ctx.fillText(k, W - 84 - kw + 22, 119);

  // avatar: orbit rings + the job icon
  const ax = 220; const ay = 360;
  orb(ax, ay, 230, 'rgba(143,107,255,0.55)');
  ctx.save(); ctx.setLineDash([6, 12]); ctx.strokeStyle = 'rgba(159,216,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(ax, ay, 150, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.4; ctx.fillStyle = i % 2 ? '#A88BFF' : '#7CCBFF'; ctx.beginPath(); ctx.arc(ax + Math.cos(a) * 150, ay + Math.sin(a) * 150, 9, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#1a1452'; ctx.beginPath(); ctx.arc(ax, ay, 104, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = grad; ctx.lineWidth = 9; ctx.stroke();
  const svg = iconSvg(c.icon, 24);
  ctx.save(); ctx.translate(ax - 60, ay - 60); ctx.scale(5, 5);
  ctx.strokeStyle = '#EAF6FF'; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const p of svg.querySelectorAll('path')) ctx.stroke(new Path2D(p.getAttribute('d')));
  ctx.restore();

  // name + role (+ the visitor's first name, only when the server's checks passed; this PNG is theirs)
  const name = txt(c.title);
  const tx = 420;
  if (owner) { ctx.fillStyle = '#FFE08A'; ctx.font = '700 30px "Plus Jakarta Sans"'; ctx.fillText(`${owner} ka AI agent`, tx, 262); }
  const ns = fit(ctx, name, W - tx - 90, [104, 92, 80, 70], 600, 'Newsreader');
  const tg = ctx.createLinearGradient(tx, 0, W - 90, 0); tg.addColorStop(0, '#FFFFFF'); tg.addColorStop(1, '#C9B6FF');
  ctx.fillStyle = tg; ctx.font = `600 ${ns}px Newsreader`; ctx.fillText(name, tx, 350);
  const role = txt(c.role);
  ctx.fillStyle = 'rgba(222,226,255,0.82)';
  fit(ctx, role, W - tx - 90, [38, 34, 30, 26], 700, '"Plus Jakarta Sans"');
  ctx.fillText(role, tx, 412);
  const voice = txt(c.voice);
  ctx.font = '700 28px "Plus Jakarta Sans"';
  const vw = ctx.measureText(voice).width + 44;
  rr(ctx, tx, 448, vw, 54, 27); ctx.fillStyle = 'rgba(255,193,94,0.16)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,193,94,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#FFE08A'; ctx.fillText(voice, tx + 22, 485);

  // personality bars
  let y = 640;
  ctx.fillStyle = '#9fd8ff'; ctx.font = '700 26px "JetBrains Mono"'; ctx.fillText('PERSONALITY', 96, y - 34);
  (c.sliders || []).forEach((v, i) => {
    const [l, r] = (c.ends?.[i] || []).map(txt);
    ctx.font = '700 32px "Plus Jakarta Sans"'; ctx.fillStyle = '#F1F2FF';
    ctx.fillText(l, 96, y + 20);
    const rw = ctx.measureText(r).width; ctx.fillText(r, W - 96 - rw, y + 20);
    const bx = 300; const bw = W - 96 - 220 - bx;
    rr(ctx, bx, y - 4, bw, 16, 8); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
    const kx = bx + (bw * v) / 4;
    rr(ctx, bx, y - 4, Math.max(16, kx - bx), 16, 8); ctx.fillStyle = grad; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(kx, y + 4, 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8F6BFF'; ctx.lineWidth = 5; ctx.stroke();
    y += 92;
  });

  // tools + task in glass rows
  const row = (label, value, yy) => {
    rr(ctx, 80, yy, W - 160, 120, 30); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.strokeStyle = 'rgba(186,196,255,0.18)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#9fd8ff'; ctx.font = '700 22px "JetBrains Mono"'; ctx.fillText(label, 116, yy + 44);
    ctx.fillStyle = '#F1F2FF';
    fit(ctx, value, W - 232, [34, 30, 27, 24], 600, '"Plus Jakarta Sans"');
    ctx.fillText(value, 116, yy + 92);
  };
  row('TEMPLATE', txt(c.template).replace(/^Template: /, ''), 900);
  row('TOOLS', txt(c.tools).replace(/^Tools: /, ''), 1040);

  // footer: Zenith handle + site, the configured hero line, card footer
  ctx.fillStyle = '#FFFFFF'; ctx.font = '800 34px "Plus Jakarta Sans"'; ctx.fillText(HANDLE, 96, 1232);
  ctx.fillStyle = '#9fd8ff'; ctx.font = '700 24px "JetBrains Mono"'; ctx.fillText(SITE, 96, 1272);
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(222,226,255,0.78)';
  fit(ctx, heroLine, 470, [24, 22, 20, 18], 700, '"Plus Jakarta Sans"');
  ctx.fillText(heroLine, W - 96, 1232);
  ctx.font = '600 22px "Plus Jakarta Sans"'; ctx.fillText(txt(c.footer), W - 96, 1272);
  ctx.textAlign = 'left';

  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  return { canvas: cv, blob, url: URL.createObjectURL(blob), width: W, height: H };
}
