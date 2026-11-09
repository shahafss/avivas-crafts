import 'server-only';
import { getEnv } from '@/server/env';
import { createFsStorage } from './fs';
import { createR2Storage } from './r2';
import type { Storage } from './storage';

export type { Bucket, Storage, StoredObject } from './storage';

let instance: Storage | undefined;

/** The storage driver chosen by `STORAGE_DRIVER`. */
export function getStorage(): Storage {
  if (instance) return instance;
  const env = getEnv();
  if (env.STORAGE_DRIVER === 'r2') {
    // env.ts guarantees these are set with the r2 driver.
    instance = createR2Storage({
      accountId: env.R2_ACCOUNT_ID ?? '',
      accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
      jurisdiction: env.R2_JURISDICTION,
      buckets: { private: env.R2_BUCKET_PRIVATE ?? '', public: env.R2_BUCKET_PUBLIC ?? '' },
      imagePublicOrigin: env.IMAGE_PUBLIC_ORIGIN,
    });
  } else {
    instance = createFsStorage(env.LOCAL_DATA_DIR);
  }
  return instance;
}
