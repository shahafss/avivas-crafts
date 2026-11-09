import { useSyncExternalStore } from 'react';
import { lineKey } from './key';

/**
 * The shopping cart: `localStorage` key `ac_cart_v1` (data-model.md > Cart). It holds only
 * product and option ids and quantities; prices always come from the server (`priceCart`).
 * Items older than 90 days are dropped, other tabs stay in sync through the `storage` event, and
 * when storage is unavailable (private mode, blocked) the cart lives in memory for the session.
 */

export const CART_KEY = 'ac_cart_v1';
export const MAX_QUANTITY = 20;
export const MAX_LINES = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface CartItem {
  productId: string;
  optionValueIds: string[];
  quantity: number;
  /** ISO time the line was last added to; lines older than 90 days are dropped. */
  addedAt: string;
}

export interface CartState {
  /** Frozen: the same object until the cart changes. */
  readonly items: readonly CartItem[];
  /** Units in the cart (the sum of the quantities), what the header badge shows. */
  readonly count: number;
}

function stateOf(items: CartItem[]): CartState {
  return Object.freeze({
    items: Object.freeze(items),
    count: items.reduce((sum, item) => sum + item.quantity, 0),
  });
}

const EMPTY: CartState = stateOf([]);

function parseItems(raw: string | null, now: number): CartItem[] {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof data !== 'object' || data === null) return [];
  const record = data as Record<string, unknown>;
  if (record.v !== 1 || !Array.isArray(record.items)) return [];
  const updatedAt = typeof record.updatedAt === 'string' ? Date.parse(record.updatedAt) : NaN;
  const items: CartItem[] = [];
  const seen = new Set<string>();
  for (const entry of record.items as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const ids = item.optionValueIds;
    if (typeof item.productId !== 'string' || !UUID.test(item.productId)) continue;
    // One malformed id would make `priceCart` refuse the whole cart, so such a line is dropped.
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && UUID.test(id))) {
      continue;
    }
    const quantity = item.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) continue;
    // The shape in data-model.md has no per-line time: fall back to the cart's own.
    const added = typeof item.addedAt === 'string' ? Date.parse(item.addedAt) : updatedAt;
    const age = Number.isNaN(added) ? 0 : now - added;
    if (age > MAX_AGE_MS) continue;
    const parsed: CartItem = {
      productId: item.productId,
      optionValueIds: (ids as string[]).slice(),
      quantity: Math.min(quantity, MAX_QUANTITY),
      addedAt: new Date(Number.isNaN(added) ? now : added).toISOString(),
    };
    const key = lineKey(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(parsed);
    if (items.length >= MAX_LINES) break;
  }
  return items;
}

// ---------------------------------------------------------------- external store

let current: CartState | undefined;
/** Used for the whole session when storage cannot be read or written. */
let memoryOnly = false;
let addSignal = 0;
const listeners = new Set<() => void>();
let listening = false;

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(CART_KEY);
  } catch {
    memoryOnly = true;
    return null;
  }
}

function load(): CartState {
  if (current === undefined) {
    const items = parseItems(readStorage(), Date.now());
    current = items.length === 0 ? EMPTY : stateOf(items);
  }
  return current;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function save(items: CartItem[]): void {
  current = items.length === 0 ? EMPTY : stateOf(items);
  if (!memoryOnly) {
    try {
      if (items.length === 0) window.localStorage.removeItem(CART_KEY);
      else {
        window.localStorage.setItem(
          CART_KEY,
          JSON.stringify({ v: 1, updatedAt: new Date().toISOString(), items }),
        );
      }
    } catch {
      memoryOnly = true;
    }
  }
  notify();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== CART_KEY && event.key !== null) return;
  current = undefined;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!listening) {
    window.addEventListener('storage', onStorage);
    listening = true;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && listening) {
      window.removeEventListener('storage', onStorage);
      listening = false;
    }
  };
}

// ---------------------------------------------------------------- actions

export type AddResult = { ok: true; count: number } | { ok: false; reason: 'full' };

/** Adds a product with the chosen option values; the same line again adds to its quantity. */
export function addToCart(input: {
  productId: string;
  optionValueIds: readonly string[];
  quantity: number;
}): AddResult {
  const quantity = Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(input.quantity)));
  const items = [...load().items];
  const key = lineKey(input);
  const index = items.findIndex((item) => lineKey(item) === key);
  const now = new Date().toISOString();
  if (index >= 0) {
    const existing = items[index] as CartItem;
    items[index] = {
      ...existing,
      quantity: Math.min(MAX_QUANTITY, existing.quantity + quantity),
      addedAt: now,
    };
  } else {
    if (items.length >= MAX_LINES) return { ok: false, reason: 'full' };
    items.push({
      productId: input.productId,
      optionValueIds: [...input.optionValueIds],
      quantity,
      addedAt: now,
    });
  }
  save(items);
  addSignal += 1;
  notify();
  return { ok: true, count: load().count };
}

export function setQuantity(key: string, quantity: number): void {
  const clamped = Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(quantity)));
  save(load().items.map((item) => (lineKey(item) === key ? { ...item, quantity: clamped } : item)));
}

export function removeFromCart(key: string): void {
  save(load().items.filter((item) => lineKey(item) !== key));
}

export function clearCart(): void {
  save([]);
}

// ---------------------------------------------------------------- hooks

/** The cart. Empty on the server and while hydrating, then read from the device. */
export function useCart(): CartState {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

/** Number of times something was added to the cart in this page session (drives the badge pop). */
export function useAddSignal(): number {
  return useSyncExternalStore(
    subscribe,
    () => addSignal,
    () => 0,
  );
}

const noopSubscribe = (): (() => void) => () => undefined;

/** False on the server and during hydration, true afterwards. */
export function useCartReady(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
