// Text normalisation shared by the browser (care check) and the server (profanity filter, care check).
// Pure ES module, no Node or DOM APIs.

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '+': 't' };

// Cyrillic, Greek and small-capital look-alikes that people use to dodge word lists, mapped to Latin.
const CONFUSABLE = {
  'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'ь': 'b',
  'і': 'i', 'ї': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w', 'һ': 'h', 'ӏ': 'l', 'ɡ': 'g', 'ս': 'u', 'օ': 'o',
  'А': 'a', 'В': 'b', 'Е': 'e', 'К': 'k', 'М': 'm', 'Н': 'h', 'О': 'o', 'Р': 'p', 'С': 'c', 'Т': 't', 'У': 'y', 'Х': 'x', 'І': 'i', 'Ј': 'j', 'Ѕ': 's',
  'α': 'a', 'β': 'b', 'ε': 'e', 'η': 'n', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ω': 'w', 'μ': 'u',
  'Α': 'a', 'Β': 'b', 'Ε': 'e', 'Η': 'h', 'Ι': 'i', 'Κ': 'k', 'Μ': 'm', 'Ν': 'n', 'Ο': 'o', 'Ρ': 'p', 'Τ': 't', 'Υ': 'y', 'Χ': 'x', 'Ζ': 'z',
  'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o',
  'ᴘ': 'p', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ß': 'ss',
  // more small capitals and Latin/Greek look-alikes (CHECK-16)
  'ꜰ': 'f', 'ꞯ': 'q', 'ᴆ': 'd', 'ᴌ': 'l', 'ᴎ': 'n', 'ᴓ': 'o', 'ᴙ': 'r', 'ᴚ': 'r', 'ᴣ': 'z', 'ᴦ': 'r', 'ᴧ': 'l', 'ᴨ': 'p', 'ᴩ': 'p', 'ᴪ': 'y',
  'ς': 's', 'ϲ': 'c', 'Ϲ': 'c', 'ϳ': 'j', 'ϻ': 'm', 'ƒ': 'f', 'ɑ': 'a', 'ɩ': 'i', 'ʋ': 'v', 'ɸ': 'f', 'ꮪ': 's', 'ꭰ': 'd', 'ꮃ': 'w', 'ꮋ': 'h',
  'ɓ': 'b', 'ƈ': 'c', 'ɗ': 'd', 'ɠ': 'g', 'ɦ': 'h', 'ƙ': 'k', 'ɱ': 'm', 'ɲ': 'n', 'ƥ': 'p', 'ʠ': 'q', 'ɽ': 'r', 'ʂ': 's', 'ƭ': 't', 'ʋ': 'v', 'ƴ': 'y', 'ȥ': 'z',
  // Latin capitals with hooks and bars (combined re-check): Ƒuck, Ɓitch
  'Ƒ': 'f', 'Ɓ': 'b', 'Ƈ': 'c', 'Ɗ': 'd', 'Ɠ': 'g', 'Ƙ': 'k', 'Ɱ': 'm', 'Ɲ': 'n', 'Ƥ': 'p', 'Ɽ': 'r', 'Ƭ': 't', 'Ʋ': 'v', 'Ƴ': 'y', 'Ȥ': 'z',
  'Ħ': 'h', 'ħ': 'h', 'Ŧ': 't', 'ŧ': 't', 'Ɨ': 'i', 'ɨ': 'i', 'Ƶ': 'z', 'ƶ': 'z', 'Ƀ': 'b', 'ƀ': 'b', 'Ɇ': 'e', 'ɇ': 'e', 'Ɍ': 'r', 'ɍ': 'r', 'Ɏ': 'y', 'ɏ': 'y',
};
// Enclosed letters NFKC leaves alone (combined re-check): negative circled 🅕, negative squared 🅵, regional indicators 🇫
const ENCLOSED = [[0x1f150, 0x1f169], [0x1f170, 0x1f189], [0x1f1e6, 0x1f1ff]];
const ENCLOSED_RE = /[\u{1f150}-\u{1f169}\u{1f170}-\u{1f189}\u{1f1e6}-\u{1f1ff}]/gu;
const foldEnclosed = (c) => { const p = c.codePointAt(0); for (const [a] of ENCLOSED) if (p >= a && p <= a + 25) return String.fromCharCode(65 + p - a); return c; };
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLE).join('')}]`, 'gu');

/**
 * Undo Unicode disguises before any lookup: format and zero-width characters out (ZWSP, ZWJ, ZWNJ, word joiner,
 * BOM, soft hyphen and every other \p{Cf}), NFKC (fullwidth, ligatures), accents on Latin letters dropped
 * (NFKD, combining marks after a Latin letter removed; Devanagari matras are kept), look-alike letters mapped.
 */
// Letters whose NFKC form is not what they look like (lunate sigma looks like c, NFKC makes it a sigma).
const PRE_NFKC = { 'ϲ': 'c', 'Ϲ': 'C', 'ϳ': 'j' };
export function unconfuse(w) {
  return String(w)
    .replace(/[\p{Cf}\u00ad\u034f\u115f\u1160\u3164\uffa0]/gu, '')
    .replace(/[ϲϹϳ]/g, (c) => PRE_NFKC[c])
    .replace(ENCLOSED_RE, foldEnclosed)
    .normalize('NFKC')
    .replace(/^(?:\(\p{L}\))+$/u, (m) => m.replace(/[()]/g, '')) // parenthesised letters (f)(u)(c)(k)
    .normalize('NFKD')
    .replace(/([A-Za-z\u0250-\u02af])\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(CONFUSABLE_RE, (c) => CONFUSABLE[c]);
}

/** Roman script: disguises undone, lowercase, leetspeak read as letters, repeated letters collapsed (except h). */
export function romanBase(w) {
  return unconfuse(w).toLowerCase().replace(/[013457@$!+]/g, (c) => LEET[c]).replace(/([^h])\1+/g, '$1');
}

/**
 * Devanagari: NFC, nukta dropped (also the precomposed nukta letters), chandrabindu -> anusvara, ZWJ/ZWNJ out,
 * long and short i / u vowel signs and independent vowels merged.
 */
export function devaNorm(w) {
  return String(w).normalize('NFC')
    .replace(/[क़-य़]/g, (c) => ({ 'क़': 'क', 'ख़': 'ख', 'ग़': 'ग', 'ज़': 'ज', 'ड़': 'ड', 'ढ़': 'ढ', 'फ़': 'फ', 'य़': 'य' })[c])
    .replace(/[‌‍़]/g, '')
    .replace(/ँ/g, 'ं')
    .replace(/ी/g, 'ि').replace(/ू/g, 'ु')
    .replace(/ई/g, 'इ').replace(/ऊ/g, 'उ');
}

/**
 * One searchable form of any text: Roman words normalised, Devanagari normalised, punctuation to spaces,
 * letters spelled apart joined ("k i l l" -> "kill", "s.u.i.c.i.d.e" -> "suicide").
 */
export function searchable(text) {
  let s = devaNorm(unconfuse(String(text || '')));
  // a vowel sign (\p{M}) belongs to its letter: "मौत आ जाए" is not spelled apart
  s = s.replace(/(?<![\p{L}\p{M}\p{N}])(?:[\p{L}0-9@$!+][\s._\-*]){2,}[\p{L}0-9@$!+](?![\p{L}\p{M}\p{N}])/gu, (m) => m.replace(/[\s._\-*]/g, ''));
  s = s.replace(/[A-Za-z0-9@$!+]+/g, (w) => romanBase(w));
  s = s.replace(/['’]/g, '').replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return ` ${s} `;
}
