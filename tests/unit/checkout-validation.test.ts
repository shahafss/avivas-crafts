import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkoutFieldErrors, checkoutFormSchema } from '@/lib/validation/checkout';
import { checkoutServerSchema } from '@/server/checkout/validate';

const valid = {
  fullName: 'דנה כהן',
  phone: '052-234-5678',
  email: 'dana@example.com',
  deliveryMethod: 'shipping' as const,
  address: { country: 'IL', city: 'חיפה', line1: 'הרצל 5' },
  paymentMethod: 'online' as const,
  acceptTerms: true as const,
};

function errorsOf(input: unknown, schema: typeof checkoutFormSchema = checkoutFormSchema) {
  const result = schema.safeParse(input);
  return result.success ? {} : checkoutFieldErrors(result.error);
}

describe('light shared schema (src/lib/validation/checkout.ts)', () => {
  it('does not import libphonenumber-js', () => {
    const source = readFileSync(resolve(__dirname, '../../src/lib/validation/checkout.ts'), 'utf8');
    expect(source).not.toMatch(/(?:from|import|require)\s*\(?\s*['"][^'"]*libphonenumber/);
  });

  it('accepts a complete shipping order and defaults marketingOptIn to false', () => {
    const result = checkoutFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.marketingOptIn).toBe(false);
  });

  it('accepts pickup without an address', () => {
    expect(
      checkoutFormSchema.safeParse({ ...valid, deliveryMethod: 'pickup', address: undefined })
        .success,
    ).toBe(true);
  });

  it('requires a full name of 2 to 100 characters', () => {
    expect(errorsOf({ ...valid, fullName: 'ד' }).fullName).toBe('checkout.errors.fullName');
    expect(errorsOf({ ...valid, fullName: ' ד ' }).fullName).toBe('checkout.errors.fullName');
    expect(errorsOf({ ...valid, fullName: 'א'.repeat(101) }).fullName).toBe(
      'checkout.errors.fullName',
    );
    expect(errorsOf({ ...valid, fullName: 'א'.repeat(100) }).fullName).toBeUndefined();
    expect(errorsOf({ ...valid, fullName: undefined }).fullName).toBe('checkout.errors.fullName');
  });

  it('requires a phone number but leaves its validity to the server', () => {
    expect(errorsOf({ ...valid, phone: '' }).phone).toBe('checkout.errors.phone');
    expect(errorsOf({ ...valid, phone: '12' }).phone).toBeUndefined();
  });

  it('requires a syntactically valid email of at most 254 characters', () => {
    for (const email of ['', 'dana', 'dana@', '@example.com', 'a b@example.com', 'dana@example']) {
      expect(errorsOf({ ...valid, email }).email).toBe('checkout.errors.email');
    }
    const long = `${'a'.repeat(250)}@x.co`;
    expect(errorsOf({ ...valid, email: long }).email).toBe('checkout.errors.email');
    expect(errorsOf({ ...valid, email: 'a.b+c@sub.example.co.il' }).email).toBeUndefined();
  });

  it('requires country, city and street for shipping', () => {
    const errors = errorsOf({ ...valid, address: { country: '', city: '', line1: '' } });
    expect(errors['address.country']).toBe('checkout.errors.country');
    expect(errors['address.city']).toBe('checkout.errors.city');
    expect(errors['address.line1']).toBe('checkout.errors.line1');
    const missing = errorsOf({ ...valid, address: undefined });
    expect(Object.keys(missing).sort()).toEqual([
      'address.city',
      'address.country',
      'address.line1',
    ]);
  });

  it('refuses the UI-only "other" country with checkout.ships_israel_only', () => {
    expect(
      errorsOf({ ...valid, address: { ...valid.address, country: 'other' } })['address.country'],
    ).toBe('checkout.ships_israel_only');
  });

  it('treats the postal code as optional: IL needs exactly 7 digits, others at most 12 characters', () => {
    const at = (country: string, postalCode: string) =>
      errorsOf({ ...valid, address: { ...valid.address, country, postalCode } })[
        'address.postalCode'
      ];
    expect(at('IL', '')).toBeUndefined();
    expect(at('IL', '1234567')).toBeUndefined();
    expect(at('IL', '123456')).toBe('checkout.errors.postalCodeIl');
    expect(at('IL', '12345678')).toBe('checkout.errors.postalCodeIl');
    expect(at('IL', '12345ab')).toBe('checkout.errors.postalCodeIl');
    expect(at('US', 'SW1A 1AA')).toBeUndefined();
    expect(at('US', '1234567890123')).toBe('checkout.errors.postalCode');
  });

  it('limits the note to 1,000 characters', () => {
    expect(errorsOf({ ...valid, note: 'x'.repeat(1000) }).note).toBeUndefined();
    expect(errorsOf({ ...valid, note: 'x'.repeat(1001) }).note).toBe('checkout.errors.note');
  });

  it('requires the terms to be accepted', () => {
    expect(errorsOf({ ...valid, acceptTerms: false }).acceptTerms).toBe(
      'checkout.errors.acceptTerms',
    );
    expect(errorsOf({ ...valid, acceptTerms: undefined }).acceptTerms).toBe(
      'checkout.errors.acceptTerms',
    );
  });

  it('reports every error as a translation key in checkout.*', () => {
    const errors = errorsOf({
      fullName: '',
      phone: '',
      email: 'x',
      deliveryMethod: 'shipping',
      paymentMethod: 'online',
      acceptTerms: false,
    });
    expect(Object.keys(errors).length).toBeGreaterThan(5);
    for (const message of Object.values(errors))
      expect(message).toMatch(/^checkout\.[a-zA-Z0-9_.]+$/);
  });
});

describe('server schema (src/server/checkout/validate.ts)', () => {
  const parse = (input: unknown) => checkoutServerSchema.safeParse(input);
  const phoneError = (input: unknown) => {
    const result = parse(input);
    return result.success ? undefined : checkoutFieldErrors(result.error).phone;
  };

  it('normalises an Israeli phone number to E.164', () => {
    for (const phone of ['052-234-5678', '0522345678', '+972 52 234 5678']) {
      expect(parse({ ...valid, phone }).data?.phone).toBe('+972522345678');
    }
  });

  it('defaults to Israel for pickup', () => {
    const result = parse({ ...valid, deliveryMethod: 'pickup', address: undefined });
    expect(result.data?.phone).toBe('+972522345678');
    expect(result.data?.address).toBeNull();
  });

  it('rejects numbers that are not valid for the address country', () => {
    expect(phoneError({ ...valid, phone: '123' })).toBe('checkout.errors.phone');
    expect(phoneError({ ...valid, phone: 'abc' })).toBe('checkout.errors.phone');
    expect(phoneError({ ...valid, phone: '052-123' })).toBe('checkout.errors.phone');
  });

  it('validates the phone for the country of the address', () => {
    const us = { ...valid, address: { ...valid.address, country: 'US' } };
    expect(parse({ ...us, phone: '(650) 253-0000' }).data?.phone).toBe('+16502530000');
    expect(phoneError({ ...us, phone: '052-234-5678' })).toBe('checkout.errors.phone');
  });

  it('keeps the other rules of the shared schema', () => {
    const result = parse({ ...valid, fullName: 'ד', email: 'nope' });
    expect(result.success).toBe(false);
    const errors = result.error ? checkoutFieldErrors(result.error) : {};
    expect(errors.fullName).toBe('checkout.errors.fullName');
    expect(errors.email).toBe('checkout.errors.email');
  });

  it('returns the address and note cleaned up, with an empty postal code stored as null', () => {
    const result = parse({
      ...valid,
      email: 'Dana@EXAMPLE.com',
      note: '  ',
      address: { ...valid.address, country: 'il', postalCode: '' },
    });
    expect(result.data).toMatchObject({
      email: 'Dana@example.com',
      note: null,
      address: { country: 'IL', city: 'חיפה', line1: 'הרצל 5', line2: null, postalCode: null },
      marketingOptIn: false,
    });
  });
});
