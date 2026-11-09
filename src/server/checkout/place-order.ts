import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { routing } from '@/i18n/routing';
import {
  CHECKOUT_ERRORS,
  checkoutFieldErrors,
  checkoutFormSchema,
} from '@/lib/validation/checkout';
import { formFailure, type Failure } from '@/server/catalog/result';
import { db } from '@/server/db/client';
import { contentPage, pendingCheckout, shippingZone, shopSettings } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { kickOutbox } from '@/server/email/sender';
import { emailT } from '@/server/email/t';
import { getEnv } from '@/server/env';
import { insertOrder, randomToken, sha256, TOKEN_PATTERN } from '@/server/orders/create-order';
import {
  copyOrderImages,
  lineSnapshotsSchema,
  snapshotLines,
  snapshotsAsCartItems,
  type LineSnapshot,
} from '@/server/orders/snapshots';
import { getProvider } from '@/server/payments';
import type { PaymentProvider } from '@/server/payments/provider';
import { log } from '@/server/security/logger';
import { checkRateLimit } from '@/server/security/rate-limit';
import {
  getSettings,
  placeholderFields,
  type Settings,
  type Zone,
} from '@/server/settings/settings';
import { verifyFormToken } from './form-token';
import { priceItems } from './pricing-data';
import { cartItemsSchema, quote, type Quote } from './pricing';
import { checkoutServerSchema, isValidPhone, type CheckoutDetails } from './validate';
import { resolveZone } from './zones';

/** An online checkout waits 48 hours for the payment result (data-model.md > pending_checkout). */
export const PENDING_TTL_MS = 48 * 60 * 60 * 1000;
const RATE_LIMIT = { limit: 10, windowSec: 600 } as const;

export interface PlaceOrderContext {
  /** Client IP (`null` when it is not known); only a daily-rotating hash of it is ever stored. */
  ip: string | null;
  /** Test hook. */
  now?: Date;
}

export interface TotalChangedData {
  newTotalMinor: number;
  currency: 'ILS' | 'USD';
}

export type CheckoutFailure = Failure & {
  data?: TotalChangedData;
  /** `checkout.lines_unavailable`: the keys of the lines that cannot be ordered. */
  lineKeys?: string[];
};
export type CheckoutResult = { ok: true; redirect: string } | CheckoutFailure;

export interface PendingActionOptions {
  /** The visitor confirmed the re-priced total. */
  acceptNewTotal?: boolean;
  /** Test hook (two connections in concurrency tests); defaults to the app's `db`. */
  database?: DbLike;
}

const envelopeSchema = z.object({
  items: cartItemsSchema.min(1),
  honeypot: z.string().max(500),
  formToken: z.string().max(200),
  locale: z.enum(routing.locales),
});

const fail = (formError: string): CheckoutFailure => formFailure(formError);

const linesUnavailable = (priced: Quote): CheckoutFailure => ({
  ...formFailure('checkout.lines_unavailable'),
  lineKeys: priced.flags.map((flagged) => flagged.key),
});

async function contentVersions(database: DbLike): Promise<{ terms: number; privacy: number }> {
  const rows = await database
    .select({ slug: contentPage.slug, version: contentPage.version })
    .from(contentPage)
    .where(inArray(contentPage.slug, ['terms', 'privacy']));
  const version = (slug: string): number => rows.find((row) => row.slug === slug)?.version ?? 1;
  return { terms: version('terms'), privacy: version('privacy') };
}

function shopName(settings: Settings, locale: 'he' | 'en'): string {
  return locale === 'en' && settings.shopNameEn !== null && settings.shopNameEn !== ''
    ? settings.shopNameEn
    : settings.shopNameHe;
}

function pageDescription(settings: Settings, locale: 'he' | 'en', quantity: number): string {
  return emailT(
    locale,
    quantity === 1 ? 'checkout.paymentDescriptionOne' : 'checkout.paymentDescriptionMany',
    { shopName: shopName(settings, locale), count: quantity },
  );
}

function returnUrls(
  locale: 'he' | 'en',
  token: string,
): { successUrl: string; failureUrl: string } {
  const origin = getEnv().APP_ORIGIN;
  const base = `${origin}/${locale}/checkout/return?c=${token}`;
  return { successUrl: `${base}&r=success`, failureUrl: `${base}&r=failure` };
}

// ---------------------------------------------------------------- placeOrder

/** A phone number that was sent but is not valid for the address country (raw form input). */
function phoneIsInvalid(input: unknown): boolean {
  const raw = input as {
    phone?: unknown;
    deliveryMethod?: unknown;
    address?: { country?: unknown } | null;
  } | null;
  if (typeof raw?.phone !== 'string' || raw.phone.trim() === '') return false;
  const country =
    raw.deliveryMethod === 'shipping' && typeof raw.address?.country === 'string'
      ? raw.address.country.trim()
      : undefined;
  return !isValidPhone(raw.phone.trim(), country);
}

/**
 * Places an order from the checkout form (contracts/server-actions.md). Offline payment creates
 * the order at once; online payment creates a pending checkout and a provider payment page, and
 * the order exists only after the payment is confirmed (`confirmOnlinePayment`).
 */
export async function placeOrder(input: unknown, ctx: PlaceOrderContext): Promise<CheckoutResult> {
  const now = ctx.now ?? new Date();
  const limit = await checkRateLimit('place-order', ctx.ip ?? 'unknown', { ...RATE_LIMIT, now });
  if (!limit.allowed) return fail('checkout.rate_limited');

  const envelope = envelopeSchema.safeParse(input);
  if (!envelope.success) return fail('checkout.form_expired');
  const { items, honeypot, formToken, locale } = envelope.data;
  if (honeypot !== '' || !verifyFormToken(formToken, now.getTime())) {
    return fail('checkout.form_expired');
  }

  const settings = await getSettings();
  if (getEnv().APP_ENV === 'production' && placeholderFields(settings).length > 0) {
    return fail('checkout.shop_not_ready');
  }

  // The light schema first: the country decides the zone, and the zone decides what is allowed.
  const light = checkoutFormSchema.safeParse(input);
  if (!light.success) {
    const errors = checkoutFieldErrors(light.error);
    if (errors['address.country'] === CHECKOUT_ERRORS.shipsIsraelOnly) {
      return fail(CHECKOUT_ERRORS.shipsIsraelOnly);
    }
    // The phone is checked too, so one answer names every problem.
    if (errors.phone === undefined && phoneIsInvalid(input)) errors.phone = CHECKOUT_ERRORS.phone;
    return { ok: false, fieldErrors: errors };
  }
  const shipping = light.data.deliveryMethod === 'shipping';
  const zoneResult = await resolveZone(shipping ? light.data.address?.country : undefined);
  if (!zoneResult.ok) return fail(zoneResult.formError);
  const zone = zoneResult.zone;

  const parsed = checkoutServerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: checkoutFieldErrors(parsed.error) };
  const details = parsed.data;

  if (
    details.paymentMethod === 'online'
      ? !settings.onlinePaymentEnabled
      : !settings.offlinePaymentEnabled
  ) {
    return fail('checkout.payment_unavailable_method');
  }
  const lines = await priceItems(items, zone);
  const priced = quote(lines, details.deliveryMethod, zone);
  if (details.deliveryMethod === 'shipping' ? !priced.shippingAllowed : !priced.pickupAllowed) {
    return fail('checkout.delivery_unavailable');
  }
  if (priced.flags.length > 0) return linesUnavailable(priced);

  const versions = await contentVersions(db);
  const snapshots = snapshotLines(lines);
  const consent = {
    termsAcceptedAt: now,
    termsVersion: versions.terms,
    privacyVersion: versions.privacy,
    marketingOptIn: details.marketingOptIn,
    marketingOptInAt: details.marketingOptIn ? now : null,
  };

  if (details.paymentMethod === 'offline') {
    const token = randomToken();
    const created = await db.transaction((tx) =>
      insertOrder(tx, {
        locale,
        zoneId: zone.id,
        currency: zone.currency,
        customer: { name: details.fullName, phone: details.phone, email: details.email },
        deliveryMethod: details.deliveryMethod,
        address: details.address,
        note: details.note,
        paymentMethod: 'offline',
        paid: null,
        subtotalMinor: priced.subtotalMinor,
        deliveryFeeMinor: priced.deliveryFeeMinor,
        totalMinor: priced.totalMinor,
        ...consent,
        lines: snapshots,
        token,
        now,
      }),
    );
    await copyOrderImages(created.orderId, created.photos);
    kickOutbox();
    return { ok: true, redirect: `/${locale}/order/${token}` };
  }

  return startOnlineCheckout({ details, locale, zone, settings, priced, snapshots, consent, now });
}

interface OnlineStart {
  details: CheckoutDetails;
  locale: 'he' | 'en';
  zone: Zone;
  settings: Settings;
  priced: Quote;
  snapshots: LineSnapshot[];
  consent: {
    termsAcceptedAt: Date;
    termsVersion: number;
    privacyVersion: number;
    marketingOptIn: boolean;
    marketingOptInAt: Date | null;
  };
  now: Date;
}

async function startOnlineCheckout(start: OnlineStart): Promise<CheckoutResult> {
  const { details, locale, zone, settings, priced, snapshots, consent, now } = start;
  const provider = getProvider();
  const resumeToken = randomToken();
  const pendingId = randomUUID();
  await db.insert(pendingCheckout).values({
    id: pendingId,
    resumeTokenHash: sha256(resumeToken),
    locale,
    zoneId: zone.id,
    currency: zone.currency,
    customerName: details.fullName,
    customerPhone: details.phone,
    customerEmail: details.email,
    deliveryMethod: details.deliveryMethod,
    addressCountry: details.address?.country ?? null,
    addressCity: details.address?.city ?? null,
    addressLine1: details.address?.line1 ?? null,
    addressLine2: details.address?.line2 ?? null,
    addressPostalCode: details.address?.postalCode ?? null,
    note: details.note,
    ...consent,
    lines: snapshots,
    subtotalMinor: priced.subtotalMinor,
    deliveryFeeMinor: priced.deliveryFeeMinor,
    totalMinor: priced.totalMinor,
    provider: provider.id,
    state: 'awaiting_provider',
    expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
  });

  let page: { pageId: string; redirectUrl: string };
  try {
    page = await createPage(provider, {
      pendingId,
      locale,
      amountMinor: priced.totalMinor,
      currency: zone.currency,
      customer: { name: details.fullName, email: details.email, phone: details.phone },
      description: pageDescription(
        settings,
        locale,
        snapshots.reduce((sum, line) => sum + line.quantity, 0),
      ),
      resumeToken,
    });
  } catch (error) {
    // No row with an empty page id outlives the request.
    await db.delete(pendingCheckout).where(eq(pendingCheckout.id, pendingId));
    log.error('payment.create_page_failed', {
      pendingId,
      errorCode: error instanceof Error ? error.name : 'unknown',
    });
    return fail('checkout.payment_unavailable');
  }
  await db
    .update(pendingCheckout)
    .set({ providerPageId: page.pageId })
    .where(eq(pendingCheckout.id, pendingId));
  return { ok: true, redirect: page.redirectUrl };
}

function createPage(
  provider: PaymentProvider,
  page: {
    pendingId: string;
    locale: 'he' | 'en';
    amountMinor: number;
    currency: 'ILS' | 'USD';
    customer: { name: string; email: string; phone: string };
    description: string;
    resumeToken: string;
  },
): Promise<{ pageId: string; redirectUrl: string }> {
  return provider.createPaymentPage({
    reference: page.pendingId,
    amountMinor: page.amountMinor,
    currency: page.currency,
    locale: page.locale,
    customer: page.customer,
    description: page.description,
    ...returnUrls(page.locale, page.resumeToken),
    callbackUrl: `${getEnv().APP_ORIGIN}/api/payments/${provider.id}/callback`,
  });
}

// ---------------------------------------------------------------- retry and switch

type PendingRow = typeof pendingCheckout.$inferSelect;

interface Locked {
  pending: PendingRow;
  zone: Zone;
  stored: LineSnapshot[];
}

/** The pending checkout of a resume token, locked, if it can still be retried or switched. */
async function lockPending(
  tx: DbLike,
  resumeToken: string,
  now: Date,
): Promise<Locked | CheckoutFailure> {
  if (!TOKEN_PATTERN.test(resumeToken)) return fail('checkout.link_expired');
  const [pending] = await tx
    .select()
    .from(pendingCheckout)
    .where(eq(pendingCheckout.resumeTokenHash, sha256(resumeToken)))
    .for('update');
  if (!pending) return fail('checkout.link_expired');
  if (pending.state !== 'awaiting_provider' && pending.state !== 'failed') {
    return fail('checkout.already_completed');
  }
  if (pending.expiresAt.getTime() <= now.getTime()) return fail('checkout.link_expired');
  const stored = lineSnapshotsSchema.safeParse(pending.lines);
  const [zone] = await tx.select().from(shippingZone).where(eq(shippingZone.id, pending.zoneId));
  if (!stored.success || !zone) return fail('checkout.link_expired');
  return { pending, zone, stored: stored.data };
}

interface Repriced {
  priced: Quote;
  snapshots: LineSnapshot[];
  changed: boolean;
}

/**
 * Prices the stored lines again and checks the stored details with the same schema as the form.
 * A changed total needs the visitor's acceptance: otherwise nothing is changed and the new total
 * is returned.
 */
async function repriceStored(
  tx: DbLike,
  { pending, zone, stored }: Locked,
  paymentMethod: 'online' | 'offline',
  acceptNewTotal: boolean,
): Promise<Repriced | CheckoutFailure> {
  const shipping = pending.deliveryMethod === 'shipping';
  const valid = checkoutServerSchema.safeParse({
    fullName: pending.customerName ?? '',
    phone: pending.customerPhone ?? '',
    email: pending.customerEmail ?? '',
    deliveryMethod: pending.deliveryMethod,
    address: shipping
      ? {
          country: pending.addressCountry ?? '',
          city: pending.addressCity ?? '',
          line1: pending.addressLine1 ?? '',
          line2: pending.addressLine2 ?? '',
          postalCode: pending.addressPostalCode ?? '',
        }
      : undefined,
    paymentMethod,
    acceptTerms: true,
    marketingOptIn: pending.marketingOptIn,
    note: pending.note ?? '',
  });
  if (!valid.success) return fail('checkout.form_expired');
  if (!zone.enabled) return fail(CHECKOUT_ERRORS.shipsIsraelOnly);

  const lines = await priceItems(snapshotsAsCartItems(stored), zone, tx);
  const priced = quote(lines, pending.deliveryMethod, zone);
  if (shipping ? !priced.shippingAllowed : !priced.pickupAllowed) {
    return fail('checkout.delivery_unavailable');
  }
  if (priced.flags.length > 0) return linesUnavailable(priced);
  if (priced.totalMinor !== pending.totalMinor && !acceptNewTotal) {
    return {
      ...formFailure('checkout.total_changed'),
      data: { newTotalMinor: priced.totalMinor, currency: priced.currency },
    };
  }
  const snapshots = snapshotLines(lines);
  const changed =
    priced.totalMinor !== pending.totalMinor ||
    snapshots.some((line, index) => line.unit_price_minor !== stored[index]?.unit_price_minor);
  return { priced, snapshots: changed ? snapshots : stored, changed };
}

async function disablePageBestEffort(
  provider: PaymentProvider,
  pending: PendingRow,
): Promise<void> {
  if (pending.providerPageId === null) return;
  try {
    await provider.disablePaymentPage(pending.providerPageId);
  } catch (error) {
    // A late payment of that page is caught by confirmOnlinePayment's outcomes.
    log.warn('payment.disable_failed', {
      pendingId: pending.id,
      errorCode: error instanceof Error ? error.name : 'unknown',
    });
  }
}

// The row lock is held while the provider is called (disable, create page): at this scale (one
// shop, a handful of orders a day, calls capped at 10 s) the wait is acceptable, and it is what
// keeps a double submit or a racing callback from seeing a half-done retry or switch.
/**
 * New payment page for the same stored details, after a failed or abandoned one. Locks the row,
 * refuses unless it is `awaiting_provider` or `failed`, prices the stored lines again (a changed
 * total needs `acceptNewTotal`), disables the old page (best effort) and creates the new one.
 */
export async function retryOnlinePayment(
  resumeToken: string,
  { acceptNewTotal = false, database = db }: PendingActionOptions = {},
): Promise<CheckoutResult> {
  const now = new Date();
  return database.transaction(async (tx): Promise<CheckoutResult> => {
    const locked = await lockPending(tx, resumeToken, now);
    if ('ok' in locked) return locked;
    const { pending } = locked;
    const [settings] = await tx.select().from(shopSettings);
    if (!settings?.onlinePaymentEnabled) return fail('checkout.payment_unavailable_method');
    const repriced = await repriceStored(tx, locked, 'online', acceptNewTotal);
    if ('ok' in repriced) return repriced;

    const provider = getProvider(pending.provider);
    await disablePageBestEffort(provider, pending);
    let page: { pageId: string; redirectUrl: string };
    try {
      page = await createPage(provider, {
        pendingId: pending.id,
        locale: pending.locale,
        amountMinor: repriced.priced.totalMinor,
        currency: pending.currency,
        customer: {
          name: pending.customerName ?? '',
          email: pending.customerEmail ?? '',
          phone: pending.customerPhone ?? '',
        },
        description: pageDescription(
          settings,
          pending.locale,
          repriced.snapshots.reduce((sum, line) => sum + line.quantity, 0),
        ),
        resumeToken,
      });
    } catch (error) {
      log.error('payment.create_page_failed', {
        pendingId: pending.id,
        errorCode: error instanceof Error ? error.name : 'unknown',
      });
      return fail('checkout.payment_unavailable');
    }
    await tx
      .update(pendingCheckout)
      .set({
        providerPageId: page.pageId,
        state: 'awaiting_provider',
        lastStatusCheckAt: null,
        ...(repriced.changed
          ? {
              lines: repriced.snapshots,
              subtotalMinor: repriced.priced.subtotalMinor,
              deliveryFeeMinor: repriced.priced.deliveryFeeMinor,
              totalMinor: repriced.priced.totalMinor,
            }
          : {}),
      })
      .where(eq(pendingCheckout.id, pending.id));
    return { ok: true, redirect: page.redirectUrl };
  });
}

// The row lock is held while the provider is called (disable, create page): at this scale (one
// shop, a handful of orders a day, calls capped at 10 s) the wait is acceptable, and it is what
// keeps a double submit or a racing callback from seeing a half-done retry or switch.
/**
 * Turns a failed or abandoned online checkout into an offline order from the stored details, at
 * the (accepted) current prices, through the same code path as an offline `placeOrder`. The
 * pending row becomes `switched_offline`, keeps the new order's id (so a late online payment can
 * be reported against that order) and loses its personal columns.
 */
export async function switchToOfflinePayment(
  resumeToken: string,
  { acceptNewTotal = false, database = db }: PendingActionOptions = {},
): Promise<CheckoutResult> {
  const now = new Date();
  const outcome = await database.transaction(async (tx) => {
    const locked = await lockPending(tx, resumeToken, now);
    if ('ok' in locked) return locked;
    const { pending, zone } = locked;
    const [settings] = await tx.select().from(shopSettings);
    if (!settings?.offlinePaymentEnabled) return fail('checkout.offline_unavailable');
    const repriced = await repriceStored(tx, locked, 'offline', acceptNewTotal);
    if ('ok' in repriced) return repriced;

    await disablePageBestEffort(getProvider(pending.provider), pending);
    const token = randomToken();
    const created = await insertOrder(tx, {
      locale: pending.locale,
      zoneId: zone.id,
      currency: pending.currency,
      customer: {
        name: pending.customerName ?? '',
        phone: pending.customerPhone,
        email: pending.customerEmail,
      },
      deliveryMethod: pending.deliveryMethod,
      address:
        pending.deliveryMethod === 'shipping'
          ? {
              country: pending.addressCountry ?? '',
              city: pending.addressCity ?? '',
              line1: pending.addressLine1 ?? '',
              line2: pending.addressLine2,
              postalCode: pending.addressPostalCode,
            }
          : null,
      note: pending.note,
      paymentMethod: 'offline',
      paid: null,
      subtotalMinor: repriced.priced.subtotalMinor,
      deliveryFeeMinor: repriced.priced.deliveryFeeMinor,
      totalMinor: repriced.priced.totalMinor,
      termsAcceptedAt: pending.termsAcceptedAt,
      termsVersion: pending.termsVersion,
      privacyVersion: pending.privacyVersion,
      marketingOptIn: pending.marketingOptIn,
      marketingOptInAt: pending.marketingOptInAt,
      lines: repriced.snapshots,
      token,
      now,
    });
    await tx
      .update(pendingCheckout)
      .set({
        state: 'switched_offline',
        orderId: created.orderId,
        customerName: null,
        customerPhone: null,
        customerEmail: null,
        addressCountry: null,
        addressCity: null,
        addressLine1: null,
        addressLine2: null,
        addressPostalCode: null,
        note: null,
        lines: null,
      })
      .where(eq(pendingCheckout.id, pending.id));
    return { created, redirect: `/${pending.locale}/order/${token}` };
  });
  if ('ok' in outcome) return outcome;
  await copyOrderImages(outcome.created.orderId, outcome.created.photos, database);
  kickOutbox();
  return { ok: true, redirect: outcome.redirect };
}
