// Object store for Career Studio: the play-zenith-data bucket in production, a local folder in dev and tests.
// Same keys in both:  leads/<date>/<random>.bin   pdfs/<date>/<random>.pdf   whatsapp/counter.json  sent.bin  stop.bin
// Local root = <DATA_DIR> (so leads land in data/leads/ in dev). The bucket keys come from BUCKET_KEY_ID /
// BUCKET_KEY_SECRET (the same container settings core uses for analytics), never from a profile.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KEY_RE = /^[a-z]+\/[A-Za-z0-9._\/-]{1,200}$/;
function checkKey(key) {
  if (!KEY_RE.test(key) || key.includes('..')) throw new Error('bad store key');
  return key;
}

/* ---------------- SigV4 presigned GET (no extra dependency) ---------------- */
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Presigned S3 GET URL (AWS Signature Version 4, query auth). Tested against the example in the AWS docs.
 * @param {{bucket, region, key, accessKeyId, secretAccessKey, sessionToken?, expires, now?: Date, host?: string}} o
 */
export function presignGet(o) {
  const now = o.now || new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20130524T000000Z
  const day = amzDate.slice(0, 8);
  const host = o.host || `${o.bucket}.s3.${o.region}.amazonaws.com`;
  const scope = `${day}/${o.region}/s3/aws4_request`;
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${o.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(o.expires),
    'X-Amz-SignedHeaders': 'host',
    ...(o.sessionToken ? { 'X-Amz-Security-Token': o.sessionToken } : {}),
  };
  const qs = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const uri = '/' + o.key.split('/').map(enc).join('/');
  const canonical = ['GET', uri, qs, `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const kDate = hmac(`AWS4${o.secretAccessKey}`, day);
  const kSigning = hmac(hmac(hmac(kDate, o.region), 's3'), 'aws4_request');
  const sig = crypto.createHmac('sha256', kSigning).update(toSign).digest('hex');
  return `https://${host}${uri}?${qs}&X-Amz-Signature=${sig}`;
}

/* ---------------- local folder ---------------- */
function localStore(root) {
  const file = (key) => path.join(root, ...checkKey(key).split('/'));
  return {
    kind: 'local',
    async put(key, body) {
      const f = file(key);
      fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
      const tmp = `${f}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, body, { mode: 0o600 });
      fs.renameSync(tmp, f);
    },
    async get(key) { try { return fs.readFileSync(file(key)); } catch { return null; } },
    async del(key) { try { fs.unlinkSync(file(key)); return true; } catch { return false; } },
    async list(prefix) {
      const base = path.join(root, ...prefix.split('/').filter(Boolean));
      const out = [];
      const walk = (d, rel) => {
        let ents = [];
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(path.join(d, e.name), r);
          else if (!e.name.endsWith('.tmp')) out.push(r);
        }
      };
      walk(base, prefix.replace(/\/$/, ''));
      return out.sort();
    },
    presign() { return null; }, // no signed URLs locally: the /p/ link stands in (fake messenger only)
  };
}

/* ---------------- bucket ---------------- */
function bucketStore({ bucket, region, accessKeyId, secretAccessKey }) {
  let client = null;
  let cmds = null;
  async function c() {
    if (!client) {
      cmds = await import('@aws-sdk/client-s3');
      const credentials = accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
      client = new cmds.S3Client({ region, ...(credentials ? { credentials } : {}) });
    }
    return client;
  }
  return {
    kind: 'bucket',
    async put(key, body, contentType = 'application/octet-stream') {
      await (await c()).send(new cmds.PutObjectCommand({ Bucket: bucket, Key: checkKey(key), Body: body, ContentType: contentType }));
    },
    async get(key) {
      try {
        const r = await (await c()).send(new cmds.GetObjectCommand({ Bucket: bucket, Key: checkKey(key) }));
        return Buffer.from(await r.Body.transformToByteArray());
      } catch (e) {
        if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
    async del(key) { await (await c()).send(new cmds.DeleteObjectCommand({ Bucket: bucket, Key: checkKey(key) })); return true; },
    async list(prefix) {
      const out = [];
      let token;
      do {
        const r = await (await c()).send(new cmds.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of r.Contents || []) out.push(o.Key);
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return out.sort();
    },
    presign(key, seconds) {
      if (!accessKeyId || !secretAccessKey) return null;
      return presignGet({ bucket, region, key: checkKey(key), accessKeyId, secretAccessKey, expires: Math.min(seconds, 7 * 24 * 3600) });
    },
  };
}

/** Bucket when BUCKET_NAME is set (and not offline), else <dataDir>. */
export function createStore({ bucketName, bucketRegion = 'ap-south-1', bucketKeyId, bucketKeySecret, dataDir }) {
  if (bucketName) return bucketStore({ bucket: bucketName, region: bucketRegion, accessKeyId: bucketKeyId, secretAccessKey: bucketKeySecret });
  return localStore(dataDir);
}

/** India date (the fest runs on IST): 2026-10-27. */
export function istDay(d = new Date()) {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export const randomId = (n = 16) => crypto.randomBytes(n).toString('base64url');
