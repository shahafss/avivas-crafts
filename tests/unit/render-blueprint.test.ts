import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/server/env';

// Drift test for render.yaml (006 research D3, contracts/operations.md). The file is read as text:
// a YAML library for one test is not worth a dependency (constitution V).

const text = readFileSync(fileURLToPath(new URL('../../render.yaml', import.meta.url)), 'utf8');
const lines = text.split('\n');

function blockStarting(startPattern: RegExp): string {
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start === -1) return '';
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^\s*- type:/.test(line) || /^databases:/.test(line)) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

const webBlock = blockStarting(/^\s*- type: web\b/);
const cronBlock = blockStarting(/^\s*- type: cron\b/);
const databaseStart = lines.findIndex((line) => /^databases:/.test(line));
const databaseBlock = databaseStart === -1 ? '' : lines.slice(databaseStart).join('\n');

interface EnvEntry {
  key: string;
  value?: string;
  hasValue: boolean;
  syncFalse: boolean;
  generateValue: boolean;
  fromDatabaseName?: string;
}

function unquote(raw: string): string {
  return raw.trim().replace(/^(["'])(.*)\1$/, '$2');
}

/** Env entries of a block, in file order (every key, including duplicates). */
function envEntries(block: string): EnvEntry[] {
  const section = block.split(/^\s*envVars:\s*$/m)[1] ?? '';
  const chunks = section.split(/^\s*- key:\s*/m).slice(1);
  return chunks.map((chunk) => {
    const chunkLines = chunk.split('\n');
    const key = (chunkLines[0] ?? '').trim();
    const rest = chunkLines.slice(1).join('\n');
    const value = /^\s*value:\s*(.*)$/m.exec(rest)?.[1];
    const fromDatabaseName = /^\s*fromDatabase:\s*\n\s*name:\s*(.*)$/m.exec(rest)?.[1];
    return {
      key,
      ...(value === undefined ? {} : { value: unquote(value) }),
      hasValue: value !== undefined,
      syncFalse: /^\s*sync:\s*false\s*$/m.test(rest),
      generateValue: /^\s*generateValue:\s*true\s*$/m.test(rest),
      ...(fromDatabaseName === undefined ? {} : { fromDatabaseName: unquote(fromDatabaseName) }),
    };
  });
}

const webEnv = envEntries(webBlock);
const cronEnv = envEntries(cronBlock);

function entry(entries: EnvEntry[], key: string): EnvEntry | undefined {
  return entries.find((candidate) => candidate.key === key);
}

const WEB_FIXED: Record<string, string> = {
  APP_ENV: 'production',
  STORAGE_DRIVER: 'r2',
  EMAIL_DRIVER: 'resend',
  PAYMENT_PROVIDER: 'none',
  R2_JURISDICTION: 'eu',
  TRUSTED_PROXY_HOPS: '1',
  OIDC_ISSUER: 'https://accounts.google.com',
};

const WEB_SYNC_FALSE = [
  'APP_ORIGIN',
  'IMAGE_PUBLIC_ORIGIN',
  'EMAIL_FROM',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_PRIVATE',
  'R2_BUCKET_PUBLIC',
  'RESEND_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
];

const CRON_SYNC_FALSE = [
  'BACKUP_AGE_RECIPIENT',
  'R2_ACCOUNT_ID',
  'BACKUP_BUCKET',
  'BACKUP_R2_ACCESS_KEY_ID',
  'BACKUP_R2_SECRET_ACCESS_KEY',
  'IMAGES_BUCKET_PRIVATE',
  'IMAGES_BUCKET_PUBLIC',
  'IMAGES_R2_ACCESS_KEY_ID',
  'IMAGES_R2_SECRET_ACCESS_KEY',
];

describe('render.yaml resources', () => {
  it('has exactly one web service, one cron job and one database (no staging)', () => {
    expect(lines.filter((line) => /^\s*- type:/.test(line))).toHaveLength(2);
    expect(webBlock).not.toBe('');
    expect(cronBlock).not.toBe('');
    expect(databaseBlock.match(/^\s*- name:/gm)).toHaveLength(1);
  });

  it('names them avivas-crafts, avivas-crafts-backup and avivas-crafts-db', () => {
    expect(webBlock).toMatch(/^\s*name: avivas-crafts\s*$/m);
    expect(cronBlock).toMatch(/^\s*name: avivas-crafts-backup\s*$/m);
    expect(databaseBlock).toMatch(/^\s*- name: avivas-crafts-db\s*$/m);
  });

  it('points every fromDatabase at avivas-crafts-db', () => {
    const references = text.match(/fromDatabase:\s*\n\s*name:\s*\S+/g) ?? [];
    expect(references.length).toBeGreaterThanOrEqual(2);
    for (const reference of references) expect(reference).toMatch(/name:\s*avivas-crafts-db\s*$/);
  });
});

describe('render.yaml web service', () => {
  it.each([
    /^\s*runtime: node\s*$/m,
    /^\s*region: frankfurt\s*$/m,
    /^\s*plan: starter\s*$/m,
    /^\s*branch: main\s*$/m,
    /^\s*autoDeployTrigger: commit\s*$/m,
    /^\s*healthCheckPath: \/api\/health\s*$/m,
    /^\s*buildCommand: corepack enable pnpm && pnpm install --frozen-lockfile --prod=false && pnpm build\s*$/m,
    /^\s*preDeployCommand: pnpm db:migrate && pnpm db:seed\s*$/m,
    /^\s*startCommand: pnpm start\s*$/m,
  ])('contains %s', (pattern) => {
    expect(webBlock).toMatch(pattern);
  });

  it('lists every contract key exactly once', () => {
    const expected = [
      ...Object.keys(WEB_FIXED),
      'DATABASE_URL',
      'SECRET_HMAC_KEY',
      ...WEB_SYNC_FALSE,
    ];
    for (const key of expected) {
      expect(webEnv.filter((candidate) => candidate.key === key), key).toHaveLength(1);
    }
    const keys = webEnv.map((candidate) => candidate.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('writes the fixed values out', () => {
    for (const [key, value] of Object.entries(WEB_FIXED)) {
      expect(entry(webEnv, key)?.value, key).toBe(value);
    }
  });

  it('takes DATABASE_URL from the database and generates SECRET_HMAC_KEY', () => {
    expect(entry(webEnv, 'DATABASE_URL')).toMatchObject({
      fromDatabaseName: 'avivas-crafts-db',
      hasValue: false,
    });
    expect(webBlock).toMatch(/key: DATABASE_URL\s*\n\s*fromDatabase:\s*\n\s*name: avivas-crafts-db\s*\n\s*property: connectionString/);
    expect(entry(webEnv, 'SECRET_HMAC_KEY')).toMatchObject({
      generateValue: true,
      hasValue: false,
    });
  });

  it('marks every other key sync: false with no value', () => {
    for (const key of WEB_SYNC_FALSE) {
      expect(entry(webEnv, key), key).toMatchObject({ syncFalse: true, hasValue: false });
    }
    for (const candidate of webEnv.filter((item) => item.syncFalse)) {
      expect(candidate.hasValue, candidate.key).toBe(false);
    }
  });

  it('sets nothing the contract excludes', () => {
    for (const key of ['CONSENT_TEST_CATEGORY', 'LOCAL_DATA_DIR', 'NODE_ENV']) {
      expect(entry(webEnv, key), key).toBeUndefined();
    }
    expect(webEnv.some((candidate) => candidate.key.startsWith('PAYPLUS_'))).toBe(false);
  });

  it('is accepted by parseEnv() (a variable env.ts requires that the blueprint lacks fails here)', () => {
    const dummies: Record<string, string> = {
      APP_ORIGIN: 'https://shop.example.test',
      IMAGE_PUBLIC_ORIGIN: 'https://img.shop.example.test',
      SECRET_HMAC_KEY: Buffer.alloc(32, 7).toString('base64'),
      DATABASE_URL: 'postgres://u:p@h/db',
    };
    const record: Record<string, string> = {};
    for (const candidate of webEnv) {
      record[candidate.key] = candidate.hasValue
        ? (candidate.value ?? '')
        : (dummies[candidate.key] ?? 'x');
    }
    expect(() => parseEnv(record)).not.toThrow();
  });
});

describe('render.yaml cron job', () => {
  it.each([
    /^\s*runtime: docker\s*$/m,
    /^\s*region: frankfurt\s*$/m,
    /^\s*plan: starter\s*$/m,
    /^\s*dockerfilePath: \.\/ops\/backup\/Dockerfile\s*$/m,
    /^\s*dockerContext: \.\/ops\/backup\s*$/m,
    /^\s*schedule: "30 0 \* \* \*"\s*$/m,
    /^\s*branch: main\s*$/m,
    /^\s*autoDeployTrigger: commit\s*$/m,
  ])('contains %s', (pattern) => {
    expect(cronBlock).toMatch(pattern);
  });

  it('lists every contract key exactly once', () => {
    for (const key of ['DATABASE_URL', ...CRON_SYNC_FALSE]) {
      expect(cronEnv.filter((candidate) => candidate.key === key), key).toHaveLength(1);
    }
    const keys = cronEnv.map((candidate) => candidate.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('takes DATABASE_URL from the database and marks the rest sync: false with no value', () => {
    expect(entry(cronEnv, 'DATABASE_URL')).toMatchObject({
      fromDatabaseName: 'avivas-crafts-db',
      hasValue: false,
    });
    for (const key of CRON_SYNC_FALSE) {
      expect(entry(cronEnv, key), key).toMatchObject({ syncFalse: true, hasValue: false });
    }
  });
});

describe('render.yaml database', () => {
  it.each([
    /^\s*region: frankfurt\s*$/m,
    /^\s*plan: basic-256mb\s*$/m,
    /^\s*postgresMajorVersion: "17"\s*$/m,
    /^\s*ipAllowList: \[\]\s*$/m,
  ])('contains %s', (pattern) => {
    expect(databaseBlock).toMatch(pattern);
  });
});

describe('render.yaml hygiene', () => {
  it('has no <shop domain> value', () => {
    for (const line of lines.filter((item) => /^\s*(- )?value:/.test(item))) {
      expect(line).not.toContain('<shop domain>');
    }
  });

  it('has nothing that looks like a secret', () => {
    expect(text).not.toMatch(/[A-Za-z0-9+/]{32,}/);
  });
});
