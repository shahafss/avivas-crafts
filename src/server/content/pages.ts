import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { pick, type ContentLocale, type Picked } from '@/lib/i18n-fallback';
import { logActivity } from '@/server/activity/log';
import { formFailure, ok, type ActionResult, type Actor } from '@/server/catalog/result';
import { db } from '@/server/db/client';
import { contentPage, contentPageVersion } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { CONTENT_SLUGS, isContentSlug, isVersionedSlug, type ContentSlug } from './slugs';
import { recordVersion } from './versions';

const ERRORS = 'admin.content.errors';

export const TITLE_MAX = 120;
export const BODY_MAX = 50_000;

export type ContentPageRow = typeof contentPage.$inferSelect;
export type ContentPageVersionRow = typeof contentPageVersion.$inferSelect;

/** A page for a visitor: title and body picked for the language, each with its own `lang`. */
export interface PageView {
  slug: ContentSlug;
  version: number;
  updatedAt: Date;
  title: Picked;
  body: Picked;
}

/** The page in the visitor's language (English falls back to Hebrew); null for an unknown slug. */
export async function getPage(
  slug: string,
  locale: ContentLocale,
  database: DbLike = db,
): Promise<PageView | null> {
  if (!isContentSlug(slug)) return null;
  const [row] = await database.select().from(contentPage).where(eq(contentPage.slug, slug));
  if (!row) return null;
  return {
    slug,
    version: row.version,
    updatedAt: row.updatedAt,
    title: pick(locale, row.titleHe, row.titleEn),
    body: pick(locale, row.bodyHe, row.bodyEn),
  };
}

/** Every page with both languages, in the fixed `CONTENT_SLUGS` order (admin list and editor). */
export async function listPages(database: DbLike = db): Promise<ContentPageRow[]> {
  const rows = await database.select().from(contentPage);
  return CONTENT_SLUGS.flatMap((slug) => rows.filter((row) => row.slug === slug));
}

export interface UpdateContentInput {
  slug: ContentSlug;
  /** The version the editor loaded. */
  expectedVersion: number;
  titleHe: string;
  bodyHe: string;
  /** Empty (or blank) is stored as NULL. */
  titleEn: string;
  bodyEn: string;
}

function validate(input: UpdateContentInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const titleHe = input.titleHe.trim();
  if (titleHe === '') errors.titleHe = `${ERRORS}.title_required`;
  else if (titleHe.length > TITLE_MAX) errors.titleHe = `${ERRORS}.title_long`;
  if (input.bodyHe.trim() === '') errors.bodyHe = `${ERRORS}.body_required`;
  else if (input.bodyHe.length > BODY_MAX) errors.bodyHe = `${ERRORS}.body_long`;
  if (input.titleEn.trim().length > TITLE_MAX) errors.titleEn = `${ERRORS}.title_long`;
  if (input.bodyEn.length > BODY_MAX) errors.bodyEn = `${ERRORS}.body_long`;
  return errors;
}

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value);

/**
 * Saves a page (research R3): validate, lock the row, refuse a stale `expectedVersion`, and
 * identical text changes nothing. Otherwise the version goes up by one, the page counts as edited
 * and, for the Terms and the Privacy Policy, the new version is copied into
 * `content_page_version`, all in one transaction with the `content.updated` activity row.
 */
export async function updateContentPage(
  actor: Actor,
  input: UpdateContentInput,
  database: DbLike = db,
): Promise<ActionResult<{ version: number; unchanged: boolean }>> {
  if (!isContentSlug(input.slug)) return formFailure(`${ERRORS}.not_found`);
  const fieldErrors = validate(input);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const next = {
    titleHe: input.titleHe.trim(),
    titleEn: blankToNull(input.titleEn)?.trim() ?? null,
    bodyHe: input.bodyHe,
    bodyEn: blankToNull(input.bodyEn),
  };

  return database.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(contentPage)
      .where(eq(contentPage.slug, input.slug))
      .for('update');
    if (!current) return formFailure(`${ERRORS}.not_found`);
    if (current.version !== input.expectedVersion) return formFailure(`${ERRORS}.stale`);
    if (
      current.titleHe === next.titleHe &&
      current.titleEn === next.titleEn &&
      current.bodyHe === next.bodyHe &&
      current.bodyEn === next.bodyEn
    ) {
      return ok({ version: current.version, unchanged: true });
    }
    const version = current.version + 1;
    await tx
      .update(contentPage)
      .set({ ...next, version, ownerEdited: true, updatedAt: new Date() })
      .where(eq(contentPage.slug, input.slug));
    if (isVersionedSlug(input.slug))
      await recordVersion(tx, { slug: input.slug, version, ...next });
    await logActivity(tx, {
      adminId: actor.adminId,
      actorKind: 'admin',
      actorLabel: actor.label,
      action: 'content.updated',
      targetType: 'content_page',
      targetId: input.slug,
      details: { slug: input.slug, to: version },
    });
    return ok({ version, unchanged: false });
  });
}

export type VersionSummary = Pick<
  ContentPageVersionRow,
  'slug' | 'version' | 'titleHe' | 'titleEn' | 'createdAt'
>;

/** Recorded versions of the Terms or the Privacy Policy, newest first; null for other pages. */
export async function listVersions(
  slug: string,
  database: DbLike = db,
): Promise<VersionSummary[] | null> {
  if (!isVersionedSlug(slug)) return null;
  return database
    .select({
      slug: contentPageVersion.slug,
      version: contentPageVersion.version,
      titleHe: contentPageVersion.titleHe,
      titleEn: contentPageVersion.titleEn,
      createdAt: contentPageVersion.createdAt,
    })
    .from(contentPageVersion)
    .where(eq(contentPageVersion.slug, slug))
    .orderBy(desc(contentPageVersion.version));
}

/** One recorded copy; null for other pages or an unknown version. */
export async function getVersion(
  slug: string,
  version: number,
  database: DbLike = db,
): Promise<ContentPageVersionRow | null> {
  if (!isVersionedSlug(slug) || !Number.isInteger(version) || version < 1) return null;
  const [row] = await database
    .select()
    .from(contentPageVersion)
    .where(and(eq(contentPageVersion.slug, slug), eq(contentPageVersion.version, version)));
  return row ?? null;
}
