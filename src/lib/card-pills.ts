import type { PublicProductCard } from '@/server/catalog/public-queries';

export type CardPill =
  | { kind: 'new' }
  | { kind: 'featured'; category: NonNullable<PublicProductCard['featuredCategory']> }
  | { kind: 'category'; category: NonNullable<PublicProductCard['mainCategory']> };

/**
 * The pill rule (spec 011 FR-013): at most two pills. Candidates in priority order: "New" (when
 * ticked), the other category (`mainCategory` when it is not the featured one), the featured
 * (home-row) category, which never shows on the home row's own cards. The chosen pills come back
 * in display order: New, featured, other category.
 */
export function cardPills(
  card: Pick<PublicProductCard, 'showAsNew' | 'mainCategory' | 'featuredCategory'>,
  { inHomeRow }: { inHomeRow: boolean },
): CardPill[] {
  const { showAsNew, mainCategory, featuredCategory } = card;
  const candidates: CardPill[] = [];
  if (showAsNew) candidates.push({ kind: 'new' });
  if (mainCategory !== null && mainCategory.id !== featuredCategory?.id) {
    candidates.push({ kind: 'category', category: mainCategory });
  }
  if (featuredCategory !== null && !inHomeRow) {
    candidates.push({ kind: 'featured', category: featuredCategory });
  }
  const chosen = candidates.slice(0, 2);
  const order: Record<CardPill['kind'], number> = { new: 0, featured: 1, category: 2 };
  return chosen.sort((a, b) => order[a.kind] - order[b.kind]);
}
