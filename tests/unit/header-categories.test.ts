// 007 FR-039, research D20, data-model.md §6: the public header's category list.
import { describe, expect, it } from 'vitest';
import { pickHeaderCategories } from '@/server/catalog/header-categories';

const cat = (id: string) => ({ id, slug: `s-${id}`, nameHe: `ש-${id}`, nameEn: null });
const A = cat('a');
const B = cat('b');
const C = cat('c');
const D = cat('d');
const published = [A, B, C, D];

const settings = (
  over: Partial<
    Record<'headerCategory1Id' | 'headerCategory2Id' | 'homeCategoryId', string | null>
  > = {},
) => ({
  headerCategory1Id: null,
  headerCategory2Id: null,
  homeCategoryId: null,
  ...over,
});
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('pickHeaderCategories', () => {
  it('orders [header 1, header 2, home row]', () => {
    const result = pickHeaderCategories(
      settings({ headerCategory1Id: 'c', headerCategory2Id: 'a', homeCategoryId: 'd' }),
      published,
    );
    expect(ids(result)).toEqual(['c', 'a', 'd']);
    expect(result[0]).toBe(C);
  });

  it('drops nulls', () => {
    expect(ids(pickHeaderCategories(settings({ headerCategory2Id: 'b' }), published))).toEqual([
      'b',
    ]);
    expect(ids(pickHeaderCategories(settings(), published))).toEqual([]);
  });

  it('drops ids that are not in the published list', () => {
    const result = pickHeaderCategories(
      settings({ headerCategory1Id: 'gone', headerCategory2Id: 'b', homeCategoryId: 'also-gone' }),
      published,
    );
    expect(ids(result)).toEqual(['b']);
  });

  it('drops repeats, the first one wins', () => {
    expect(
      ids(
        pickHeaderCategories(
          settings({ headerCategory1Id: 'a', headerCategory2Id: 'a', homeCategoryId: 'b' }),
          published,
        ),
      ),
    ).toEqual(['a', 'b']);
    expect(
      ids(
        pickHeaderCategories(
          settings({ headerCategory1Id: 'a', headerCategory2Id: 'b', homeCategoryId: 'a' }),
          published,
        ),
      ),
    ).toEqual(['a', 'b']);
  });

  it('omits the home category when homeCategoryId is null', () => {
    expect(
      ids(
        pickHeaderCategories(
          settings({ headerCategory1Id: 'a', headerCategory2Id: 'b' }),
          published,
        ),
      ),
    ).toEqual(['a', 'b']);
  });

  it('returns at most three, even when every id is set and the list is longer', () => {
    const result = pickHeaderCategories(
      settings({ headerCategory1Id: 'a', headerCategory2Id: 'b', homeCategoryId: 'c' }),
      [A, B, C, D, cat('e')],
    );
    expect(ids(result)).toEqual(['a', 'b', 'c']);
  });
});
