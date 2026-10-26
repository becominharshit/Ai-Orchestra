// The deploy script must never touch anything that is not play-*, and must never change anything in read-only mode.
// Runs without AWS: only the guard functions are called. node --test ops/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertOurs, guardArgs, allowWrites, writesAreAllowed, dnsRecordsFrom, CONF } from '../aws/lightsail.mjs';
import { cfName, recordsFor, fillHtml, SAMPLE } from '../aws/make-dns-pdf.mjs';

test('play-* names pass', () => {
  for (const n of ['play-web', 'play-reel', 'play-data', 'play-cert', 'play-zenith-data']) assert.equal(assertOurs(n), n);
});

test('any non play-* name throws', () => {
  for (const n of ['field-prod', 'field-staging', 'zenith-prod', 'zenith-staging', 'cf-staging', 'cf-staging-pdfs', 'field-prod-media',
    'xplay-web', 'play_web', 'PLAY-web', 'play-', 'play', '', ' play-web', 'play-web ', undefined, null, 42]) {
    assert.throws(() => assertOurs(n), /Refusing to touch/, `should refuse ${String(n)}`);
  }
});

test('every name in environments.json is play-*', () => {
  for (const n of [CONF.web.service, CONF.reel.service, CONF.bucket.name, CONF.bucket.fallbackName, CONF.certificate.name]) assert.doesNotThrow(() => assertOurs(n));
  assert.equal(CONF.web.scale, 1, 'play-web stays at scale 1 (in-memory bus)');
  assert.equal(CONF.region, 'ap-south-1');
});

test('read-only by default: any write is refused before allowWrites()', () => {
  assert.equal(writesAreAllowed(), false);
  for (const sub of ['create-container-service', 'create-bucket', 'create-certificate', 'create-container-service-deployment', 'delete-container-service', 'delete-bucket', 'update-container-service', 'push-container-image', 'create-bucket-access-key']) {
    assert.throws(() => guardArgs(['lightsail', sub, '--service-name', 'play-web']), /Read-only command/, sub);
  }
  assert.doesNotThrow(() => guardArgs(['lightsail', 'get-container-service-powers']));
  assert.doesNotThrow(() => guardArgs(['lightsail', 'get-container-services']));
  assert.doesNotThrow(() => guardArgs(['lightsail', 'get-bucket-bundles']));
  assert.doesNotThrow(() => guardArgs(['sts', 'get-caller-identity']));
});

test('reads of other projects are refused too', () => {
  assert.throws(() => guardArgs(['lightsail', 'get-container-services', '--service-name', 'field-prod']), /Refusing to touch "field-prod"/);
  assert.throws(() => guardArgs(['lightsail', 'get-container-log', '--service-name', 'zenith-prod', '--container-name', 'app']), /Refusing/);
  assert.throws(() => guardArgs(['lightsail', 'get-buckets', '--bucket-name', 'cf-staging-pdfs']), /Refusing/);
});

test('only Lightsail (and sts identity) calls are allowed', () => {
  assert.throws(() => guardArgs(['s3', 'rm', 's3://play-data', '--recursive']), /only Lightsail/);
  assert.throws(() => guardArgs(['iam', 'create-user']), /only Lightsail/);
});

test('after allowWrites(): play-* writes pass, others throw, unnamed writes throw', () => {
  allowWrites();
  assert.doesNotThrow(() => guardArgs(['lightsail', 'create-container-service', '--service-name', 'play-web', '--power', 'medium']));
  assert.doesNotThrow(() => guardArgs(['lightsail', 'delete-bucket', '--bucket-name', 'play-data', '--force-delete']));
  assert.throws(() => guardArgs(['lightsail', 'delete-container-service', '--service-name', 'field-prod']), /Refusing to touch "field-prod"/);
  assert.throws(() => guardArgs(['lightsail', 'create-container-service-deployment', '--service-name', 'zenith-prod']), /Refusing/);
  assert.throws(() => guardArgs(['lightsail', 'delete-certificate', '--certificate-name', 'cf-staging-cert']), /Refusing/);
  assert.throws(() => guardArgs(['lightsail', 'delete-container-service']), /without a play-\* name/);
});

test('DNS records: validation CNAME + play CNAME, Cloudflare names without the zone', () => {
  const c = { certificateDetail: { domainValidationRecords: [
    { domainName: 'play.zenithschool.ai', resourceRecord: { name: '_abc.play.zenithschool.ai.', type: 'CNAME', value: '_def.acm-validations.aws.' } },
    { domainName: 'play.zenithschool.ai', resourceRecord: { name: '_abc.play.zenithschool.ai.', type: 'CNAME', value: '_def.acm-validations.aws.' } },
  ] } };
  const v = dnsRecordsFrom(c);
  assert.equal(v.length, 1, 'duplicates collapse');
  assert.equal(cfName('_abc.play.zenithschool.ai'), '_abc.play');
  assert.equal(cfName('play.zenithschool.ai.'), 'play');
  const rows = recordsFor({ validation: v, serviceUrl: 'https://play-web.x.ap-south-1.cs.amazonlightsail.com/' });
  assert.deepEqual(rows.map((r) => [r.name, r.target]), [['_abc.play', '_def.acm-validations.aws'], ['play', 'play-web.x.ap-south-1.cs.amazonlightsail.com']]);
  const { html } = fillHtml({ ...SAMPLE, sample: true });
  assert.ok(html.includes('SAMPLE ONLY'));
  assert.ok(html.includes(`<code class="rec">${SAMPLE.validation[0].value}</code>`), 'target in a one-line (nowrap) code block');
  assert.match(html, /code\.rec \{[^}]*white-space: nowrap/);
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(html), 'every placeholder filled');
  assert.ok(!/[\u2014\u2013]/.test(html), 'no em or en dashes');
});
