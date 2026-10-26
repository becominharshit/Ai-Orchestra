// Generated nicknames in core's shape (CONTRACT 12.2): CamelCase Hinglish adjective + noun + 0-2 digits, at most
// 12 characters, letters and digits only ("ChillMomo42"). Visitors pick 1 of 3; nobody types a name, so the TV,
// the leaderboard and the share card only ever show these (CHECK_build item 13).
// TODO(core): when core's stage module lands, nicknames come from /api/core/stage/nicknames (lib/stage.js switches).
import crypto from 'node:crypto';

export const ADJ = ['Chill', 'Turbo', 'Pixel', 'Neon', 'Desi', 'Filmy', 'Lucky', 'Sunny', 'Zippy', 'Witty', 'Jolly', 'Swift',
  'Cosmo', 'Sonic', 'Hyper', 'Magic', 'Royal', 'Smart', 'Bouncy', 'Groovy', 'Cyber', 'Laser', 'Masti', 'Rocket'];
export const NOUN = ['Momo', 'Chai', 'Ladoo', 'Kulfi', 'Lassi', 'Dosa', 'Idli', 'Vada', 'Mango', 'Panda', 'Tiger', 'Kite',
  'Tabla', 'Poha', 'Barfi', 'Owl', 'Robot', 'Comet', 'Jugnu', 'Pakoda', 'Samosa', 'Jalebi', 'Tota', 'Mor'];

const NICK = /^([A-Z][a-z]+)([A-Z][a-z]+)(\d{0,2})$/;
const pick = (arr) => arr[crypto.randomInt(arr.length)];

export function makeNick() {
  for (;;) {
    const s = `${pick(ADJ)}${pick(NOUN)}${crypto.randomInt(10, 100)}`;
    if (s.length <= 12) return s;
    const short = s.replace(/\d+$/, '');
    if (short.length <= 12) return short;
  }
}

/** 3 different options for the picker. */
export function nickOptions(n = 3) {
  const out = new Set();
  while (out.size < n) out.add(makeNick());
  return [...out];
}

export function isNick(s) {
  const m = typeof s === 'string' && s.length <= 12 && s.match(NICK);
  return !!m && ADJ.includes(m[1]) && NOUN.includes(m[2]);
}
