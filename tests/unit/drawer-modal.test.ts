import { describe, expect, it } from 'vitest';
import { ModalTracker, type InertTarget } from '@/lib/drawer/modal';

const el = (tagName: string, inert = false): InertTarget => ({ tagName, inert });

function page() {
  const skip = el('A');
  const header = el('HEADER');
  const menu = el('NAV');
  const cart = el('DIV');
  const banner = el('DIV', true); // inert for another reason
  const script = el('SCRIPT');
  const all = [skip, header, menu, cart, banner, script];
  return { skip, header, menu, cart, banner, script, tracker: new ModalTracker(() => all) };
}

describe('ModalTracker', () => {
  it('makes every other top-level child inert, except scripts, and releases on close', () => {
    const p = page();
    p.tracker.opened('cart', p.cart);
    expect([p.skip, p.header, p.menu].every((e) => e.inert)).toBe(true);
    expect(p.cart.inert).toBe(false);
    expect(p.script.inert).toBe(false);
    p.tracker.closed('cart');
    expect([p.skip, p.header, p.menu, p.cart].some((e) => e.inert)).toBe(false);
    expect(p.banner.inert).toBe(true); // not ours: left as it was
  });

  it('keeps the page inert when one drawer replaces another (open fires before close)', () => {
    const p = page();
    p.tracker.opened('menu', p.menu);
    p.tracker.opened('cart', p.cart); // the new drawer first
    expect(p.menu.inert).toBe(true); // the old drawer is a closed popover now
    expect(p.cart.inert).toBe(false);
    p.tracker.closed('menu'); // then the old one's close event
    expect(p.header.inert).toBe(true);
    expect(p.skip.inert).toBe(true);
    expect(p.cart.inert).toBe(false);
    p.tracker.closed('cart');
    expect([p.skip, p.header, p.menu, p.cart].some((e) => e.inert)).toBe(false);
  });

  it('reconcile releases the page when no drawer is open any more', () => {
    const p = page();
    p.tracker.opened('cart', p.cart);
    p.tracker.reconcile(['cart']);
    expect(p.header.inert).toBe(true);
    p.tracker.reconcile([]);
    expect(p.header.inert).toBe(false);
    expect(p.tracker.openIds).toEqual([]);
  });
});
