import { SEED_PLACEHOLDERS } from './seed-placeholders';

/**
 * The business number to show customers (order emails), or `null` when there is none: unset,
 * blank, or still the seed placeholder (008 FR-005, FR-007).
 */
export function customerRegNumber(settings: { businessRegNumber: string | null }): string | null {
  const trimmed = settings.businessRegNumber?.trim() ?? '';
  if (trimmed === '' || trimmed === SEED_PLACEHOLDERS.businessRegNumber) return null;
  return trimmed;
}
