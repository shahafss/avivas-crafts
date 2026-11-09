import 'server-only';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { assertSafeKey, type Bucket, type Storage, type StoredObject } from './storage';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  jurisdiction: 'eu' | 'default';
  buckets: { private: string; public: string; backups?: string | undefined };
  imagePublicOrigin: string;
}

/** Cloudflare R2. EU-jurisdiction buckets are not found through the default endpoint. */
export function r2Endpoint(accountId: string, jurisdiction: 'eu' | 'default'): string {
  return jurisdiction === 'eu'
    ? `https://${accountId}.eu.r2.cloudflarestorage.com`
    : `https://${accountId}.r2.cloudflarestorage.com`;
}

export function createR2Storage(config: R2Config): Storage {
  const client = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint(config.accountId, config.jurisdiction),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  function bucketName(bucket: Bucket): string {
    const name = config.buckets[bucket];
    if (name === undefined) throw new Error(`No R2 bucket configured for "${bucket}"`);
    return name;
  }

  return {
    async put(bucket, key, body, contentType, cacheControl) {
      assertSafeKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName(bucket),
          Key: key,
          Body: body,
          ContentType: contentType,
          ...(cacheControl === undefined ? {} : { CacheControl: cacheControl }),
        }),
      );
    },
    async get(bucket, key): Promise<StoredObject | null> {
      assertSafeKey(key);
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }),
        );
        if (result.Body === undefined) return null;
        return {
          body: Readable.toWeb(result.Body as Readable) as ReadableStream<Uint8Array>,
          contentType: result.ContentType ?? 'application/octet-stream',
        };
      } catch (error) {
        if ((error as { name?: string }).name === 'NoSuchKey') return null;
        throw error;
      }
    },
    async copy(fromBucket, key, toBucket, toKey = key) {
      assertSafeKey(key);
      assertSafeKey(toKey);
      await client.send(
        new CopyObjectCommand({
          Bucket: bucketName(toBucket),
          Key: toKey,
          CopySource: `${bucketName(fromBucket)}/${encodeURIComponent(key).replaceAll('%2F', '/')}`,
        }),
      );
    },
    async delete(bucket, key) {
      assertSafeKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: bucketName(bucket), Key: key }));
    },
    async deletePrefix(bucket, prefix) {
      if (prefix === '') throw new Error('deletePrefix needs a prefix');
      const Bucket = bucketName(bucket);
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }),
        );
        const keys = (page.Contents ?? []).flatMap((object) =>
          object.Key === undefined ? [] : [{ Key: object.Key }],
        );
        if (keys.length > 0) {
          await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys } }));
        }
        token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
      } while (token !== undefined);
    },
    publicUrl(key) {
      assertSafeKey(key);
      return `${config.imagePublicOrigin}/${key}`;
    },
  };
}
