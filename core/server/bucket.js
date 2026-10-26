// Small JSON store in the Lightsail bucket (the container disk does not survive a redeploy). Credentials come only from
// BUCKET_KEY_ID / BUCKET_KEY_SECRET (set by deploy). No bucket configured, or offline: every call is a no-op.
export function createBucketStore(config, key, { log = () => {} } = {}) {
  let s3 = null;
  async function client() {
    if (!config.bucketName || config.offline) return null;
    if (!s3) {
      const { S3Client } = await import('@aws-sdk/client-s3');
      const credentials = config.bucketKeyId && config.bucketKeySecret ? { accessKeyId: config.bucketKeyId, secretAccessKey: config.bucketKeySecret } : undefined;
      s3 = new S3Client({ region: config.bucketRegion, ...(credentials ? { credentials } : {}) });
    }
    return s3;
  }
  return {
    enabled: () => !!config.bucketName && !config.offline,
    async get() {
      const c = await client();
      if (!c) return null;
      try {
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        const r = await c.send(new GetObjectCommand({ Bucket: config.bucketName, Key: key }));
        return JSON.parse(await r.Body.transformToString());
      } catch (e) {
        // nothing there yet (first deploy): null. Any other error (network, auth): throw, so the caller does not mistake it for "empty"
        if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) { log({ kind: 'bucket', key, msg: 'nothing to restore yet' }); return null; }
        throw e;
      }
    },
    async put(obj) {
      const c = await client();
      if (!c) return false;
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      await c.send(new PutObjectCommand({ Bucket: config.bucketName, Key: key, Body: JSON.stringify(obj), ContentType: 'application/json' }));
      return true;
    },
  };
}
