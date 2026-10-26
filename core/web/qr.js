// QR codes drawn locally (vendored qrcode-generator, MIT). No network, no third-party service.
//   qrSvg('https://instagram.com/zenith_school_of_ai', { ecc: 'M', margin: 4 }) -> '<svg ...>'
//   qrCanvas(ctx, text, x, y, size, opts) draws onto a canvas (used by the share card)
import qrcode from './vendor/qrcode-generator.mjs';

export function qrMatrix(text, ecc = 'M') {
  const q = qrcode(0, ecc);
  q.addData(String(text));
  q.make();
  const n = q.getModuleCount();
  const rows = [];
  for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(q.isDark(r, c)); rows.push(row); }
  return rows;
}

export function qrSvg(text, { ecc = 'M', margin = 4, fg = '#19173D', bg = '#FFFFFF', label = 'QR code' } = {}) {
  const m = qrMatrix(text, ecc);
  const n = m.length + margin * 2;
  let d = '';
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + margin},${r + margin}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${label.replace(/"/g, '')}"><rect width="${n}" height="${n}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}

export function qrElement(text, opts) {
  const wrap = document.createElement('div');
  wrap.className = 'pz-qr';
  wrap.innerHTML = qrSvg(text, opts);
  return wrap;
}

export function qrCanvas(ctx, text, x, y, size, { ecc = 'M', margin = 2, fg = '#19173D', bg = '#FFFFFF' } = {}) {
  const m = qrMatrix(text, ecc);
  const n = m.length + margin * 2;
  const cell = size / n;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = fg;
  m.forEach((row, r) => row.forEach((on, c) => {
    if (on) ctx.fillRect(Math.floor(x + (c + margin) * cell), Math.floor(y + (r + margin) * cell), Math.ceil(cell), Math.ceil(cell));
  }));
}
