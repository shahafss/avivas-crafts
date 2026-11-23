import { describe, expect, it } from 'vitest';
import { cardPills } from '@/lib/card-pills';

const home = { id: 'home', slug: 'featured', nameHe: 'מומלצות', nameEn: 'Featured' };
const other = { id: 'other', slug: 'candles', nameHe: 'נרות', nameEn: 'Candles' };

function kinds(card: Parameters<typeof cardPills>[0], inHomeRow = false): string[] {
  return cardPills(card, { inHomeRow }).map((pill) => pill.kind);
}

describe('cardPills (spec 011 FR-013, the pill rule)', () => {
  it('allows each of the six sets', () => {
    expect(kinds({ showAsNew: false, mainCategory: home, featuredCategory: home })).toEqual([
      'featured',
    ]);
    expect(kinds({ showAsNew: true, mainCategory: null, featuredCategory: null })).toEqual(['new']);
    expect(kinds({ showAsNew: false, mainCategory: other, featuredCategory: null })).toEqual([
      'category',
    ]);
    expect(kinds({ showAsNew: true, mainCategory: home, featuredCategory: home })).toEqual([
      'new',
      'featured',
    ]);
    expect(kinds({ showAsNew: true, mainCategory: other, featuredCategory: null })).toEqual([
      'new',
      'category',
    ]);
    expect(kinds({ showAsNew: false, mainCategory: other, featuredCategory: home })).toEqual([
      'featured',
      'category',
    ]);
  });

  it('shows New and the other category when all three apply', () => {
    expect(kinds({ showAsNew: true, mainCategory: other, featuredCategory: home })).toEqual([
      'new',
      'category',
    ]);
  });

  it('carries the category for the two category kinds', () => {
    const pills = cardPills(
      { showAsNew: false, mainCategory: other, featuredCategory: home },
      { inHomeRow: false },
    );
    expect(pills).toEqual([
      { kind: 'featured', category: home },
      { kind: 'category', category: other },
    ]);
  });

  it('shows no pill for a piece in no category and not new', () => {
    expect(kinds({ showAsNew: false, mainCategory: null, featuredCategory: null })).toEqual([]);
  });

  it('never shows the featured pill on the home row, but the other category still shows', () => {
    expect(kinds({ showAsNew: false, mainCategory: home, featuredCategory: home }, true)).toEqual(
      [],
    );
    expect(kinds({ showAsNew: true, mainCategory: home, featuredCategory: home }, true)).toEqual([
      'new',
    ]);
    expect(kinds({ showAsNew: false, mainCategory: other, featuredCategory: home }, true)).toEqual([
      'category',
    ]);
    expect(kinds({ showAsNew: true, mainCategory: other, featuredCategory: home }, true)).toEqual([
      'new',
      'category',
    ]);
  });

  it('never returns more than two pills', () => {
    for (const showAsNew of [true, false]) {
      for (const mainCategory of [null, home, other]) {
        for (const featuredCategory of [null, home]) {
          for (const inHomeRow of [true, false]) {
            expect(
              cardPills({ showAsNew, mainCategory, featuredCategory }, { inHomeRow }).length,
            ).toBeLessThanOrEqual(2);
          }
        }
      }
    }
  });
});
