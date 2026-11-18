// 003 US6 (tasks.md T039; contracts/consent.md > `ac_consent` cookie): the cookie format
// `<recordId>.<policyVersion>.<base64url JSON choices>`; anything malformed reads as "no choice".
import { describe, expect, it } from 'vitest';
import { parseConsentCookie, serializeConsentCookie } from '@/server/consent/consent';

const ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64url');

describe('serializeConsentCookie / parseConsentCookie', () => {
  it('serialises as <recordId>.<policyVersion>.<base64url JSON>', () => {
    const value = serializeConsentCookie({
      recordId: ID,
      policyVersion: 3,
      choices: { analytics: true },
    });
    expect(value).toBe(`${ID}.3.${b64('{"analytics":true}')}`);
    expect(value).toMatch(/^[0-9a-f-]{36}\.\d+\.[A-Za-z0-9_-]+$/);
  });

  it('round-trips the record and its choices', () => {
    const record = {
      recordId: ID,
      policyVersion: 12,
      choices: { analytics: false, marketing: true },
    };
    expect(parseConsentCookie(serializeConsentCookie(record))).toEqual(record);
  });

  it('round-trips an empty choices object', () => {
    const record = { recordId: ID, policyVersion: 1, choices: {} };
    expect(parseConsentCookie(serializeConsentCookie(record))).toEqual(record);
  });

  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['one part', ID],
    ['two parts', `${ID}.1`],
    ['four parts', `${ID}.1.${b64('{}')}.x`],
    ['a malformed record id', `not-a-uuid.1.${b64('{}')}`],
    ['an id that is too short', `3f2b8c1e.1.${b64('{}')}`],
    ['a non-numeric version', `${ID}.x.${b64('{}')}`],
    ['version 0', `${ID}.0.${b64('{}')}`],
    ['a negative version', `${ID}.-1.${b64('{}')}`],
    ['a fractional version', `${ID}.1.5.${b64('{}')}`],
    ['a version with a leading plus', `${ID}.+1.${b64('{}')}`],
    ['a version beyond the integer range', `${ID}.99999999999999999999.${b64('{}')}`],
    ['base64 with illegal characters', `${ID}.1.@@@`],
    ['an empty payload', `${ID}.1.`],
    ['JSON that does not parse', `${ID}.1.${b64('{"analytics":')}`],
    ['JSON that is an array', `${ID}.1.${b64('[true]')}`],
    ['JSON that is null', `${ID}.1.${b64('null')}`],
    ['JSON that is a string', `${ID}.1.${b64('"yes"')}`],
    ['a choice that is not a boolean', `${ID}.1.${b64('{"analytics":"yes"}')}`],
  ])('returns null for %s', (_label, value) => {
    expect(parseConsentCookie(value)).toBeNull();
  });
});
