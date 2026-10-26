// CHECK_build item 12: everything that reaches the reel, the TV or the share card is a vetted bank line or a
// registered template. Checks the banks (size, copy rules), the local publicText engine, and that every
// orchestra event of a real render (worker lines) plus the phone's own lines are registered public text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BANKS, LINES, ORX_BANK, STYLE_LABELS, createPublic, variants } from '../../experiences/reel/public.js';
import { TEMPLATES } from '../../experiences/reel/templates.js';
import { startWorker, sampleClips, uploadFile, waitJob } from './helpers.js';

const pub = createPublic();
const DASH = /[\u2012-\u2015\u2212]/;
const BAD = /@|#|https?:|www\.|\b(job|placement|salary|guarantee|marks|fail|ugly|fat|stupid|loser)\b/i;

test('banks: 40+ captions and 40+ hooks per template, 12 posts, unique ids', () => {
  const ids = new Set();
  for (const t of TEMPLATES) {
    const b = BANKS[t.id];
    const caps = [1, 2, 3].flatMap((n) => b.captions[n]);
    assert.ok(caps.length >= 40, `${t.id} captions ${caps.length}`);
    assert.ok([1, 2, 3].every((n) => b.captions[n].length >= 12), `${t.id} enough per shot`);
    assert.ok(b.hooks.length >= 40, `${t.id} hooks ${b.hooks.length}`);
    assert.ok(b.posts.length >= 12);
    for (const l of [...caps, ...b.hooks, ...b.posts]) { assert.ok(!ids.has(l.id), `dup ${l.id}`); ids.add(l.id); }
    for (const h of b.hooks) assert.ok(STYLE_LABELS[h.style], `${h.id} style`);
  }
});

test('bank copy rules: ASCII, no dashes, no handles/links/hashtags, no guarantees or put-downs, fits on screen', () => {
  for (const [id, l] of LINES) {
    for (const v of variants(l.text)) {
      assert.ok(/^[\x20-\x7E]+$/.test(v), `${id} ASCII only (vendored Latin fonts)`);
      assert.ok(!DASH.test(v), `${id} dash`);
      assert.ok(!BAD.test(v), `${id} copy rule: ${v}`);
      const max = l.kind === 'hook' ? 26 : l.kind === 'caption' ? (l.tpl === 'trailer' ? 30 : 34) : 60;
      assert.ok(v.length <= max, `${id} too long (${v.length}): ${v}`);
    }
    assert.ok(!/\{(?!n\})/.test(l.text), `${id} only the {n} slot`);
  }
});

test('publicText: bank lines, {n} slot lines, templates with typed slots; unknown or bad slots throw', () => {
  assert.equal(pub.line('in-c1-01').text, 'Squad aa gayi, frame full!');
  assert.equal(pub.line('in-c1-02', 4).text, '4 dost, ek frame');
  assert.throws(() => pub.line('in-c1-02', 9), /bad slot/);
  assert.throws(() => pub.line('nope'), /unknown/);
  assert.equal(pub.publicText('o_queue', { n: 3 }).text, 'Queue update: 3 aage');
  assert.throws(() => pub.publicText('o_title', { tpl: 'Shark Tank' }), /bad slot/);
  assert.ok(pub.isPublic('Squad Reel: Zenith Heist'));
  assert.ok(pub.isPublic('Shot 2: "Crew in position"'));
  assert.ok(pub.isPublic('5 dost, ek frame'));
  assert.ok(!pub.isPublic('Shot 2: "anything Claude made up"'));
  assert.ok(!pub.isPublic('Squad Reel: Riya ki squad'));
  for (const v of Object.values(ORX_BANK)) assert.ok(pub.isPublic(v));
});

test('every orchestra text of a real render (worker) and the phone lines are registered public text', async () => {
  const w = await startWorker();
  try {
    await w.assets.ready;
    const ids = [];
    for (const f of await sampleClips()) ids.push((await uploadFile(`${w.base}/clips`, f, w.H)).data.clipId);
    const cap = ['he-c1-08', 'he-c2-03', 'he-c3-01'].map((id) => pub.line(id, 4).text);
    const r = await fetch(`${w.base}/jobs`, { method: 'POST', headers: { ...w.H, 'content-type': 'application/json' }, body: JSON.stringify({ template: 'heist', clips: ids, captions: cap, hook: pub.line('he-h-01').text }) });
    const { id } = await r.json();
    const v = await waitJob(w.base, id, w.H);
    assert.equal(v.state, 'done');
    const texts = v.events.flatMap((e) => [e.text, e.task, e.label].filter((x) => typeof x === 'string'));
    assert.ok(texts.length > 10);
    for (const t of texts) assert.ok(pub.isPublic(t), `not registered: ${t}`);
    // phone-side lines, formatted exactly like web/app.js does
    const phone = ['Squad Reel: Zenith Heist', 'Zenith Heist: 3 clips mile (8.0s, 9.0s, 7.5s), squad of 4', 'Shot 1: 12 beats = 7.2s from 0.3s @ 100 BPM',
      '7.2s / 6.0s / 7.2s', 'Mock: 3 captions from the Zenith Heist bank', `Shot 1: "${cap[0]}"`, 'Demo: "Operation Zenith shuru"', `Style: ${STYLE_LABELS.title}`,
      'Queue update: 2 aage', 'Reel ready: 22.4s, 1080x1920, 4.1 MB, 31s total', 'Har shot ke liye Hinglish caption', 'Opening text, 0-2s', '0-2s opener', '3 captions', 'hook text', 'Squad Reel ready', 'Zenith Heist'];
    for (const t of phone) assert.ok(pub.isPublic(t), `phone line not registered: ${t}`);
  } finally { await w.close(); }
});
