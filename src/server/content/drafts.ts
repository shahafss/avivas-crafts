import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { contentPage } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { CONTENT_SLUGS, isVersionedSlug, type ContentSlug } from './slugs';
import { recordVersion } from './versions';

interface Draft {
  titleHe: string;
  bodyHe: string;
  titleEn: string;
  bodyEn: string;
}

/** First line `# Title`, then the body (003 research R7). Throws with the file name when malformed. */
export function parseDraft(file: string, source: string): { title: string; body: string } {
  const text = source.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const match = /^# +(.+)\n/.exec(text.endsWith('\n') ? text : `${text}\n`);
  const title = match?.[1]?.trim();
  if (title === undefined || title === '') {
    throw new Error(`Draft ${file} must start with a "# Title" line`);
  }
  const body = text.slice(text.indexOf('\n') + 1).trim();
  if (body === '') throw new Error(`Draft ${file} has no text after its title`);
  return { title, body };
}

async function readDraftFile(contentDir: string, slug: ContentSlug, lang: 'he' | 'en') {
  const file = `${slug}.${lang}.md`;
  let source: string;
  try {
    source = await readFile(join(contentDir, file), 'utf8');
  } catch (error) {
    // A missing or unreadable draft stops the seed (and the deploy) instead of shipping a placeholder.
    throw new Error(
      `Cannot read legal draft ${file} in ${contentDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseDraft(file, source);
}

async function readDraft(contentDir: string, slug: ContentSlug): Promise<Draft> {
  const he = await readDraftFile(contentDir, slug, 'he');
  const en = await readDraftFile(contentDir, slug, 'en');
  return { titleHe: he.title, bodyHe: he.body, titleEn: en.title, bodyEn: en.body };
}

/**
 * Loads the supplied drafts from `contentDir` (`<slug>.<he|en>.md`, 14 files) in the seed's
 * transaction (003 FR-008, research R7): a missing page is inserted at version 1; a page Aviva
 * has not edited is replaced when its draft changed, and the version goes up by one; an edited
 * page is never touched. For the Terms and the Privacy Policy every inserted or replaced version
 * also gets its `content_page_version` copy.
 */
export async function loadDrafts(tx: DbLike, contentDir: string): Promise<void> {
  // Read everything first, so a missing file fails before the first write.
  const drafts = new Map<ContentSlug, Draft>();
  for (const slug of CONTENT_SLUGS) drafts.set(slug, await readDraft(contentDir, slug));

  for (const slug of CONTENT_SLUGS) {
    const draft = drafts.get(slug);
    if (draft === undefined) continue;
    const [current] = await tx
      .select()
      .from(contentPage)
      .where(eq(contentPage.slug, slug))
      .for('update');
    if (current === undefined) {
      await tx.insert(contentPage).values({ slug, ...draft, version: 1 });
      if (isVersionedSlug(slug)) await recordVersion(tx, { slug, version: 1, ...draft });
      continue;
    }
    if (current.ownerEdited) continue;
    if (
      current.titleHe === draft.titleHe &&
      current.titleEn === draft.titleEn &&
      current.bodyHe === draft.bodyHe &&
      current.bodyEn === draft.bodyEn
    ) {
      continue;
    }
    const version = current.version + 1;
    await tx
      .update(contentPage)
      .set({ ...draft, version, updatedAt: new Date() })
      .where(eq(contentPage.slug, slug));
    if (isVersionedSlug(slug)) await recordVersion(tx, { slug, version, ...draft });
  }
}
