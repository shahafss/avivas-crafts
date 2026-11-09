import { MAX_PRICE_MINOR } from '@/lib/validation/product';

/** Minor units as the owner types them: `45`, `45.5`, `45.05`. */
export function minorToMajorText(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '';
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = String(Math.trunc(abs / 100));
  const cents = abs % 100;
  return cents === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(cents).padStart(2, '0')}`;
}

/**
 * An option price adjustment typed in shekels or dollars (`20`, `-10`, `+15.5`) -> minor units.
 * Empty means no adjustment (0); `null` for anything that is not a number.
 */
export function deltaMajorToMinor(text: string): number | null {
  const trimmed = text.trim().replace('−', '-');
  if (trimmed === '') return 0;
  const match = /^([+-]?)(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(trimmed);
  if (!match) return null;
  const minor = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  if (minor > MAX_PRICE_MINOR) return null;
  return match[1] === '-' && minor > 0 ? -minor : minor;
}
