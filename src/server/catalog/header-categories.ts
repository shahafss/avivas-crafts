import type { PublicCategory } from './public-queries';

/**
 * The categories the public header lists after "All pieces" (007 FR-039, data-model.md §6):
 * [header category 1, header category 2, home-row category]. Unset ids, ids not among the
 * categories that have a published piece, and repeats (first wins) are dropped. Pure: the layout
 * already holds both inputs.
 */
export function pickHeaderCategories<C extends Pick<PublicCategory, 'id'>>(
  settings: {
    headerCategory1Id: string | null;
    headerCategory2Id: string | null;
    homeCategoryId: string | null;
  },
  categories: readonly C[],
): C[] {
  const picked: C[] = [];
  for (const id of [
    settings.headerCategory1Id,
    settings.headerCategory2Id,
    settings.homeCategoryId,
  ]) {
    if (id === null) continue;
    const found = categories.find((c) => c.id === id);
    if (found && !picked.includes(found)) picked.push(found);
  }
  return picked;
}
