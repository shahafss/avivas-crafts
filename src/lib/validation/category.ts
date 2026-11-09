import { z } from 'zod';

const optionalName = z
  .string()
  .max(80)
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  });

export const categoryInputSchema = z.object({
  nameHe: z.string().trim().min(1).max(80),
  nameEn: optionalName.optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;
