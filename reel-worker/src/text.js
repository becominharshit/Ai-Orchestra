// Text helpers for burned-in captions. ffmpeg drawtext reads each line from a small text file
// (textfile=, expansion=none), so nothing typed by Claude is ever parsed as a filter or a %{} expansion.

const DASHES = /[\u2012\u2013\u2014\u2015\u2212]/g; // en/em dashes and friends: never on screen (copy rule)

/** Keep printable ASCII only (the vendored fonts are Latin), no dashes, single spaces. */
export function cleanText(s, max = 60) {
  return String(s ?? '')
    .replace(DASHES, ', ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

/** Greedy word wrap by characters. Returns at most maxLines lines; the last one ends with ... if cut. */
export function wrapLines(text, maxChars, maxLines = 2) {
  const words = cleanText(text, 200).split(' ').filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const word = w.length > maxChars ? w.slice(0, maxChars) : w;
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= maxChars) cur = next;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length + 3 > maxChars && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '));
    kept[maxLines - 1] = `${last}...`;
    return kept;
  }
  return lines;
}

/** Approximate characters per line for a font size on a 1080 px wide frame (with side margins). */
export function charsPerLine(fontSize, mono = false) {
  const avg = mono ? 0.6 : 0.54; // average glyph width as a share of the font size
  return Math.max(10, Math.floor(920 / (fontSize * avg)));
}
