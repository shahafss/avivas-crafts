import { describe, expect, it } from 'vitest';
import {
  OPEN_STATUSES,
  canCancel,
  canEditFulfilment,
  canMarkPaid,
  canMarkRefunded,
  canMoveForward,
  forwardTargets,
  isOpen,
  needsConfirmation,
  stepBackTarget,
  type DeliveryMethod,
  type OrderStatus,
} from '@/server/orders/status';

const ALL: OrderStatus[] = [
  'new',
  'in_preparation',
  'shipped',
  'ready_for_pickup',
  'completed',
  'cancelled',
];
const METHODS: DeliveryMethod[] = ['shipping', 'pickup'];

/** The allowed forward pairs, exactly as data-model.md lists them. */
function allowed(from: OrderStatus, to: OrderStatus, method: DeliveryMethod): boolean {
  if (from === 'new' && to === 'in_preparation') return true;
  if ((from === 'new' || from === 'in_preparation') && to === 'shipped')
    return method === 'shipping';
  if ((from === 'new' || from === 'in_preparation') && to === 'ready_for_pickup') {
    return method === 'pickup';
  }
  if ((from === 'shipped' || from === 'ready_for_pickup') && to === 'completed') return true;
  if (OPEN_STATUSES.includes(from) && to === 'cancelled') return true;
  return false;
}

describe('canMoveForward', () => {
  for (const method of METHODS) {
    for (const from of ALL) {
      for (const to of ALL) {
        it(`${from} -> ${to} (${method}) is ${allowed(from, to, method) ? 'allowed' : 'refused'}`, () => {
          expect(canMoveForward(from, to, method)).toBe(allowed(from, to, method));
        });
      }
    }
  }

  it('refuses specific bad moves', () => {
    expect(canMoveForward('new', 'completed', 'shipping')).toBe(false);
    expect(canMoveForward('shipped', 'in_preparation', 'shipping')).toBe(false);
    expect(canMoveForward('new', 'shipped', 'pickup')).toBe(false);
    expect(canMoveForward('completed', 'cancelled', 'shipping')).toBe(false);
    expect(canMoveForward('cancelled', 'new', 'pickup')).toBe(false);
  });
});

describe('forwardTargets', () => {
  it('lists the status steps in display order, never cancelled', () => {
    expect(forwardTargets('new', 'shipping')).toEqual(['in_preparation', 'shipped']);
    expect(forwardTargets('new', 'pickup')).toEqual(['in_preparation', 'ready_for_pickup']);
    expect(forwardTargets('in_preparation', 'shipping')).toEqual(['shipped']);
    expect(forwardTargets('in_preparation', 'pickup')).toEqual(['ready_for_pickup']);
    expect(forwardTargets('shipped', 'shipping')).toEqual(['completed']);
    expect(forwardTargets('ready_for_pickup', 'pickup')).toEqual(['completed']);
    expect(forwardTargets('completed', 'shipping')).toEqual([]);
    expect(forwardTargets('cancelled', 'pickup')).toEqual([]);
  });

  it('agrees with canMoveForward and never includes cancelled', () => {
    for (const method of METHODS) {
      for (const from of ALL) {
        const targets = forwardTargets(from, method);
        expect(targets).not.toContain('cancelled');
        for (const to of ALL) {
          if (to === 'cancelled') continue;
          expect(targets.includes(to)).toBe(canMoveForward(from, to, method));
        }
      }
    }
  });

  it('gives a shipped step on a pickup order to nobody', () => {
    expect(forwardTargets('new', 'pickup')).not.toContain('shipped');
    expect(forwardTargets('shipped', 'pickup')).toEqual(['completed']);
  });
});

describe('canCancel / isOpen', () => {
  it('is true for the four open statuses only', () => {
    for (const status of ALL) {
      const open = ['new', 'in_preparation', 'shipped', 'ready_for_pickup'].includes(status);
      expect(canCancel(status)).toBe(open);
      expect(isOpen(status)).toBe(open);
    }
    expect([...OPEN_STATUSES]).toEqual(['new', 'in_preparation', 'shipped', 'ready_for_pickup']);
  });
});

describe('stepBackTarget', () => {
  it('goes from in_preparation to new always', () => {
    expect(stepBackTarget('in_preparation', null)).toBe('new');
    expect(stepBackTarget('in_preparation', 'in_preparation')).toBe('new');
  });

  it('goes from shipped / ready_for_pickup to where it came from', () => {
    expect(stepBackTarget('shipped', 'new')).toBe('new');
    expect(stepBackTarget('shipped', 'in_preparation')).toBe('in_preparation');
    expect(stepBackTarget('ready_for_pickup', 'new')).toBe('new');
    expect(stepBackTarget('ready_for_pickup', 'in_preparation')).toBe('in_preparation');
  });

  it('falls back to new for a missing or unexpected history value', () => {
    expect(stepBackTarget('shipped', null)).toBe('new');
    expect(stepBackTarget('ready_for_pickup', null)).toBe('new');
    expect(stepBackTarget('shipped', 'completed')).toBe('new');
    expect(stepBackTarget('shipped', 'shipped')).toBe('new');
  });

  it('is null for new and the final statuses', () => {
    expect(stepBackTarget('new', 'in_preparation')).toBeNull();
    expect(stepBackTarget('completed', 'shipped')).toBeNull();
    expect(stepBackTarget('cancelled', 'new')).toBeNull();
  });
});

describe('needsConfirmation', () => {
  it('is true for completed and cancelled only', () => {
    for (const status of ALL) {
      expect(needsConfirmation(status)).toBe(status === 'completed' || status === 'cancelled');
    }
  });
});

describe('payment rules', () => {
  it('canMarkPaid only for offline + awaiting_payment', () => {
    expect(canMarkPaid('offline', 'awaiting_payment')).toBe(true);
    expect(canMarkPaid('offline', 'paid')).toBe(false);
    expect(canMarkPaid('offline', 'refunded')).toBe(false);
    expect(canMarkPaid('online', 'awaiting_payment')).toBe(false);
    expect(canMarkPaid('online', 'paid')).toBe(false);
    expect(canMarkPaid('online', 'refunded')).toBe(false);
  });

  it('canMarkRefunded only for paid', () => {
    expect(canMarkRefunded('paid')).toBe(true);
    expect(canMarkRefunded('awaiting_payment')).toBe(false);
    expect(canMarkRefunded('refunded')).toBe(false);
  });
});

describe('canEditFulfilment', () => {
  it('names the editable field per status', () => {
    expect(canEditFulfilment('shipped')).toBe('trackingNumber');
    expect(canEditFulfilment('ready_for_pickup')).toBe('pickupNote');
    for (const status of ['new', 'in_preparation', 'completed', 'cancelled'] as const) {
      expect(canEditFulfilment(status)).toBeNull();
    }
  });
});
