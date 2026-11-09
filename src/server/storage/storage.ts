import 'server-only';

export type Bucket = 'private' | 'public' | 'backups';

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  contentType: string;
}

/**
 * Object storage. There are no presigned URLs: private images reach the browser only through
 * the authenticated admin media route (T053).
 */
export interface Storage {
  put(
    bucket: Bucket,
    key: string,
    body: Buffer,
    contentType: string,
    cacheControl?: string,
  ): Promise<void>;
  get(bucket: Bucket, key: string): Promise<StoredObject | null>;
  /** Copies an object; `toKey` defaults to `key`. */
  copy(fromBucket: Bucket, key: string, toBucket: Bucket, toKey?: string): Promise<void>;
  delete(bucket: Bucket, key: string): Promise<void>;
  deletePrefix(bucket: Bucket, prefix: string): Promise<void>;
  /** URL of an object in the public bucket. */
  publicUrl(key: string): string;
}

/** Rejects keys that could escape their bucket or are otherwise odd. */
export function assertSafeKey(key: string): void {
  if (
    key === '' ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.includes('\0') ||
    key.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error('Invalid storage key');
  }
}
