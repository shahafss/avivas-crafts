import { describe, expect, it, vi } from 'vitest';
import he from '@/i18n/messages/he.json';

vi.mock('next-intl/server', () => ({
  getTranslations: (namespace: string) => {
    const scope = namespace
      .split('.')
      .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], he);
    return Promise.resolve((key: string) => (scope as Record<string, string>)[key]);
  },
}));

const { OrderStatusBadge, PaymentStateBadge, STATUS_LOOK, PAYMENT_LOOK, BADGE_BASE } =
  await import('@/components/admin/OrderStatusBadge');

type Rendered = { props: { children: string; className: string } };

/** Colour utilities only: `text-[13px]` is a size, not a colour. */
const textColours = (classes: string): string[] =>
  classes
    .split(/\s+/)
    .filter((c) => /^text-(ink|ink-2|alert|sun|rose|rose-ink|field|panel)$/.test(c));

describe('badge looks', () => {
  it('give every status and payment look exactly one text colour, and none from the base', () => {
    expect(textColours(BADGE_BASE)).toEqual([]);
    for (const look of [...Object.values(STATUS_LOOK), ...Object.values(PAYMENT_LOOK)]) {
      expect(textColours(look)).toHaveLength(1);
    }
  });

  it('uses the design text colours', () => {
    expect(textColours(STATUS_LOOK.completed)).toEqual(['text-ink-2']);
    expect(textColours(STATUS_LOOK.cancelled)).toEqual(['text-alert']);
    expect(textColours(STATUS_LOOK.new)).toEqual(['text-ink']);
  });
});

describe('badge components', () => {
  it('render the Hebrew label with one text colour for every status', async () => {
    for (const status of Object.keys(STATUS_LOOK) as (keyof typeof STATUS_LOOK)[]) {
      const el = (await OrderStatusBadge({ status })) as Rendered;
      expect(el.props.children).toBe(he.admin.orders.status[status]);
      expect(textColours(el.props.className)).toHaveLength(1);
    }
  });

  it('render the Hebrew label with one text colour for every payment state', async () => {
    for (const state of Object.keys(PAYMENT_LOOK) as (keyof typeof PAYMENT_LOOK)[]) {
      const el = (await PaymentStateBadge({ state })) as Rendered;
      expect(el.props.children).toBe(he.admin.orders.payment[state]);
      expect(textColours(el.props.className)).toHaveLength(1);
    }
  });
});
