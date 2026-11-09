export type Currency = 'ILS' | 'USD';
export type MoneyLocale = 'he' | 'en';

function assertInt(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Money amounts must be integers in minor units');
  }
}

function assertSafe(value: number): number {
  assertInt(value);
  return value;
}

export function addMoney(a: number, b: number): number {
  assertInt(a);
  assertInt(b);
  return assertSafe(a + b);
}

export function mulMoney(minor: number, quantity: number): number {
  assertInt(minor);
  assertInt(quantity);
  return assertSafe(minor * quantity);
}

const INTL_LOCALE: Record<MoneyLocale, string> = { he: 'he-IL', en: 'en-US' };

/** Formats integer minor units (agorot/cents). No rounding: two decimals are always exact. */
export function formatMoney(minor: number, currency: Currency, locale: MoneyLocale): string {
  assertInt(minor);
  const abs = Math.abs(minor);
  // Exact decimal string: Intl.NumberFormat formats strings without going through a float.
  const major = `${minor < 0 ? '-' : ''}${String(Math.trunc(abs / 100))}.${String(abs % 100).padStart(2, '0')}`;
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major as Intl.StringNumericLiteral);
}
