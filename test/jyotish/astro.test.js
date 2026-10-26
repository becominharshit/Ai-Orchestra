// Rashi Agent + Ank Agent maths: sun sign boundaries, life-path numbers incl. master numbers 11/22/33.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunSign, lifePath, reduce, parseDob, validDob, ageBand, timeBucket, chart, SIGNS, CONSTELLATIONS } from '../../experiences/jyotish/web/lib/astro.js';

const sign = (m, d) => sunSign(m, d).id;

test('sun sign: every boundary day on both sides', () => {
  const cases = [
    [3, 20, 'pisces'], [3, 21, 'aries'], [4, 19, 'aries'], [4, 20, 'taurus'], [5, 20, 'taurus'], [5, 21, 'gemini'],
    [6, 20, 'gemini'], [6, 21, 'cancer'], [7, 22, 'cancer'], [7, 23, 'leo'], [8, 22, 'leo'], [8, 23, 'virgo'],
    [9, 22, 'virgo'], [9, 23, 'libra'], [10, 22, 'libra'], [10, 23, 'scorpio'], [11, 21, 'scorpio'], [11, 22, 'sagittarius'],
    [12, 21, 'sagittarius'], [12, 22, 'capricorn'], [12, 31, 'capricorn'], [1, 1, 'capricorn'], [1, 19, 'capricorn'],
    [1, 20, 'aquarius'], [2, 18, 'aquarius'], [2, 19, 'pisces'], [2, 29, 'pisces'],
  ];
  for (const [m, d, want] of cases) assert.equal(sign(m, d), want, `${m}/${d}`);
});

test('sun sign: every day of a leap year maps to exactly one sign, 12 signs used', () => {
  const seen = new Set();
  for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2025, 0, 1); t += 86400000) {
    const d = new Date(t);
    seen.add(sign(d.getUTCMonth() + 1, d.getUTCDate()));
  }
  assert.equal(seen.size, 12);
  for (const s of SIGNS) assert.ok(CONSTELLATIONS[s.id], `constellation for ${s.id}`);
});

test('reduce keeps master numbers', () => {
  assert.equal(reduce(11), 11);
  assert.equal(reduce(22), 22);
  assert.equal(reduce(33), 33);
  assert.equal(reduce(29), 11); // 2+9
  assert.equal(reduce(38), 11); // 3+8
  assert.equal(reduce(44), 8);
  assert.equal(reduce(99), 9); // 18 -> 9
  assert.equal(reduce(10), 1);
  assert.equal(reduce(7), 7);
});

test('life path: ordinary numbers', () => {
  assert.equal(lifePath(1985, 7, 4).number, 7); // 7 + 4 + (1985 -> 23 -> 5) = 16 -> 7
  assert.equal(lifePath(1992, 2, 27).number, 5); // 2 + (27 -> 9) + (1992 -> 21 -> 3) = 14 -> 5
  assert.equal(lifePath(2007, 7, 30).number, 1); // 7 + 3 + 9 = 19 -> 10 -> 1
  assert.equal(lifePath(2006, 8, 8).number, 6); // hero profile: 8 + 8 + 8 = 24 -> 6
  const p = lifePath(1985, 7, 4);
  assert.deepEqual(p.parts, { m: 7, d: 4, y: 5 });
  assert.equal(p.sum, 16);
});

test('life path: master numbers 11, 22, 33', () => {
  assert.equal(lifePath(2008, 5, 5).number, 11); // 5 + 5 + (2008 -> 10 -> 1) = 11
  assert.equal(lifePath(2000, 11, 9).number, 22); // 11 (kept) + 9 + 2 = 22
  assert.equal(lifePath(2009, 11, 11).number, 33); // 11 + 11 + (2009 -> 11) = 33
  assert.equal(lifePath(2009, 11, 29).number, 33); // day 29 -> 11 (kept)
  assert.deepEqual(lifePath(2009, 11, 11).parts, { m: 11, d: 11, y: 11 });
});

test('DOB parsing and validation', () => {
  assert.deepEqual(parseDob('2004-02-29'), { y: 2004, m: 2, d: 29 });
  assert.equal(parseDob('2005-02-29'), null); // not a leap year
  assert.equal(parseDob('2005-13-01'), null);
  assert.equal(parseDob('2005-04-31'), null);
  assert.equal(parseDob('29/02/2004'), null);
  const today = new Date(2026, 9, 27);
  assert.equal(validDob('2008-05-05', today), true);
  assert.equal(validDob('2026-10-28', today), false); // future
  assert.equal(validDob('1920-01-01', today), false);
});

test('age band and time bucket', () => {
  const today = new Date(2026, 9, 27);
  assert.equal(ageBand('2015-01-01', today), 'kid');
  assert.equal(ageBand('2010-10-28', today), 'teen'); // turns 16 tomorrow -> 15
  assert.equal(ageBand('2008-10-27', today), 'young'); // 18 today
  assert.equal(ageBand('1990-01-01', today), 'adult');
  assert.equal(timeBucket(''), '');
  assert.equal(timeBucket('06:30'), 'subah');
  assert.equal(timeBucket('13:00'), 'dopahar');
  assert.equal(timeBucket('18:45'), 'shaam');
  assert.equal(timeBucket('23:10'), 'raat');
  assert.equal(timeBucket('02:00'), 'raat');
  const c = chart('2009-11-11', '07:00', today);
  assert.equal(c.sign.id, 'scorpio');
  assert.equal(c.lifePath.number, 33);
  assert.equal(c.time, 'subah');
});
