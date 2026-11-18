'use server';

import { z } from 'zod';
import type { RenderedHtml } from '@/lib/rendered-html';
import { requireAdmin } from '@/server/auth/require-admin';
import { actorOf, formFailure, ok, type ActionResult } from '@/server/catalog/result';
import { renderMarkdown } from '@/server/content/markdown';
import { updateContentPage as updateRecord } from '@/server/content/pages';
import { CONTENT_SLUGS } from '@/server/content/slugs';

// Thin wrappers: the field rules and the write live in src/server/content/pages.ts. The limits
// here only stop absurd payloads; the data layer answers with the translated field errors.

const LIMIT = 200_000;

const updateSchema = z.object({
  slug: z.enum(CONTENT_SLUGS),
  expectedVersion: z.number().int().min(1),
  titleHe: z.string().max(LIMIT),
  bodyHe: z.string().max(LIMIT),
  titleEn: z.string().max(LIMIT),
  bodyEn: z.string().max(LIMIT),
});

export async function updateContentPage(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult<{ version: number; unchanged: boolean }>> {
  const context = await requireAdmin();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return formFailure('admin.failed');
  return updateRecord(actorOf(context), parsed.data);
}

export async function previewContent(input: {
  body: string;
}): Promise<ActionResult<{ html: RenderedHtml }>> {
  await requireAdmin();
  const parsed = z.object({ body: z.string().max(50_000) }).safeParse(input);
  if (!parsed.success) return formFailure('admin.content.errors.body_long');
  return ok({ html: renderMarkdown(parsed.data.body) });
}
