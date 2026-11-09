import 'server-only';
import { listPublishedProducts, type PublicProductCard } from './public-queries';

export const MAX_QUERY_LENGTH = 80;

export type SearchQuery = { kind: 'empty' } | { kind: 'too_long' } | { kind: 'query'; q: string };

/** Trims the visitor's text: 1 to 80 characters make a query. */
export function parseSearchQuery(raw: string | string[] | undefined): SearchQuery {
  const text = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  if (text === '') return { kind: 'empty' };
  return text.length > MAX_QUERY_LENGTH ? { kind: 'too_long' } : { kind: 'query', q: text };
}

/** `%`, `_` and `\` would act as wildcards or escapes inside ILIKE: match them literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Published products whose Hebrew or English name or description contains `q`
 * (`product.search_text` is the lower-cased concatenation of those four fields).
 */
export function searchProducts(q: string): Promise<PublicProductCard[]> {
  return listPublishedProducts({ searchPattern: `%${escapeLike(q)}%` });
}
