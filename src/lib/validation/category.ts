import { z } from 'zod';

/** Longest category name (007 FR-040): the public header has room for 12 characters. */
export const CATEGORY_NAME_MAX = 12;

// The length is checked after trimming.
const optionalName = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  })
  .pipe(z.string().max(CATEGORY_NAME_MAX).nullable());

export const categoryInputSchema = z.object({
  nameHe: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
  nameEn: optionalName.optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;
