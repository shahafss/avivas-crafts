// US3 (tasks.md T045): the social link rules of contracts/social-links.md "Normalisation and validation".
import { describe, expect, it } from 'vitest';
import { settingsInputSchema } from '@/lib/validation/settings';

type Platform = 'facebook' | 'instagram' | 'tiktok';
const FIELD = {
  facebook: 'socialFacebookUrl',
  instagram: 'socialInstagramUrl',
  tiktok: 'socialTiktokUrl',
} as const;
const KEY = 'admin.settings.errors.social.';

function run(platform: Platform, value: string | null) {
  const field = FIELD[platform];
  const result = settingsInputSchema.safeParse({ [field]: value });
  if (result.success)
    return { ok: true as const, value: (result.data as Record<string, unknown>)[field] };
  const issue = result.error.issues.find((i) => i.path[0] === field);
  return { ok: false as const, message: issue?.message ?? '' };
}

describe('accepted and normalised', () => {
  it.each([
    ['instagram', 'instagram.com/aviva', 'https://instagram.com/aviva'],
    ['instagram', 'https://www.instagram.com/aviva', 'https://www.instagram.com/aviva'],
    ['facebook', 'https://m.facebook.com/aviva', 'https://m.facebook.com/aviva'],
    ['tiktok', 'https://www.tiktok.com/@aviva', 'https://www.tiktok.com/@aviva'],
    ['instagram', '  instagram.com/aviva  ', 'https://instagram.com/aviva'],
  ] as const)('%s: %s', (platform, input, stored) => {
    expect(run(platform, input)).toEqual({ ok: true, value: stored });
  });
});

describe('empty means removed', () => {
  it.each([[''], ['   '], [null]])('%j -> null', (input) => {
    expect(run('instagram', input)).toEqual({ ok: true, value: null });
  });
});

describe('rejected', () => {
  it.each([
    ['instagram', 'http://instagram.com/x', 'notHttps'],
    ['instagram', 'https://user:pw@instagram.com/x', 'invalid'],
    ['instagram', 'https://instagram.com:444/x', 'invalid'],
    ['facebook', 'https://facebook.com.example.net/x', 'wrongSite.facebook'],
    ['instagram', 'https://notinstagram.com/x', 'wrongSite.instagram'],
    ['facebook', 'https://www.instagram.com/aviva', 'wrongSite.facebook'],
    ['instagram', 'https://instagram.com/', 'noPage.instagram'],
    ['instagram', 'https://instagram.com', 'noPage.instagram'],
    ['tiktok', 'https://tiktok.com', 'noPage.tiktok'],
    [
      'instagram',
      `https://instagram.com/${'a'.repeat(300 - 'https://instagram.com/'.length + 1)}`,
      'tooLong',
    ],
  ] as const)('%s: %s -> %s', (platform, input, key) => {
    expect(run(platform, input)).toEqual({ ok: false, message: KEY + key });
  });

  it('never accepts javascript:', () => {
    const result = run('instagram', 'javascript:alert(1)');
    expect(result.ok).toBe(false);
    expect([KEY + 'invalid', KEY + 'notHttps']).toContain((result as { message: string }).message);
  });

  it('accepts exactly 300 characters', () => {
    const base = 'https://instagram.com/';
    const input = base + 'a'.repeat(300 - base.length);
    expect(run('instagram', input)).toEqual({ ok: true, value: input });
  });
});
