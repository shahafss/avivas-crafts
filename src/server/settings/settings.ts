import 'server-only';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { cache } from 'react';
import {
  settingsInputSchema,
  zoneInputSchema,
  type SettingsInput,
  type ZoneInput,
} from '@/lib/validation/settings';
import { logActivity } from '@/server/activity/log';
import {
  fieldFailure,
  formFailure,
  ok,
  type ActionResult,
  type Actor,
  type Failure,
} from '@/server/catalog/result';
import { db } from '@/server/db/client';
import { getEnv } from '@/server/env';
import { effectivePaymentMethods } from '@/server/payments/availability';
import { SEED_PLACEHOLDERS } from '@/server/db/seed';
import {
  category,
  optionGroup,
  optionValue,
  product,
  shippingZone,
  shippingZoneCountry,
  shopSettings,
} from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';

export type Settings = typeof shopSettings.$inferSelect;
export type Zone = typeof shippingZone.$inferSelect;

/** The single settings row. Not cached: admin edits are visible on the next request. */
export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(shopSettings).where(eq(shopSettings.id, 1));
  if (!row) throw new Error('shop_settings row is missing: run `pnpm db:seed`');
  return row;
}

export function getZones(): Promise<Zone[]> {
  return db.select().from(shippingZone).orderBy(asc(shippingZone.code));
}

export function getEnabledZones(): Promise<Zone[]> {
  return db
    .select()
    .from(shippingZone)
    .where(eq(shippingZone.enabled, true))
    .orderBy(asc(shippingZone.code));
}

/**
 * The zone a country belongs to (enabled or not), or null. One lookup per request: the strip, the
 * cart drawer's free-shipping note and the checkout share it.
 */
export const getZoneForCountry = cache(async (countryCode: string): Promise<Zone | null> => {
  const [row] = await db
    .select({ zone: shippingZone })
    .from(shippingZoneCountry)
    .innerJoin(shippingZone, eq(shippingZone.id, shippingZoneCountry.zoneId))
    .where(eq(shippingZoneCountry.countryCode, countryCode.toUpperCase()));
  return row?.zone ?? null;
});

/** Fields the admin home may list (002 research R13). */
export type AttentionField =
  keyof typeof SEED_PLACEHOLDERS | 'pickupInstructionsHe' | 'offlineInstructionsHe';

/** Names of the settings fields that still hold a seed placeholder. */
export function placeholderFields(settings: Settings): (keyof typeof SEED_PLACEHOLDERS)[] {
  const result: (keyof typeof SEED_PLACEHOLDERS)[] = [];
  for (const field of Object.keys(SEED_PLACEHOLDERS) as (keyof typeof SEED_PLACEHOLDERS)[]) {
    const placeholder: unknown = SEED_PLACEHOLDERS[field];
    const current = (settings as unknown as Record<string, unknown>)[field];
    const same = Array.isArray(placeholder)
      ? Array.isArray(current) &&
        current.length === placeholder.length &&
        placeholder.every((value, index) => current[index] === value)
      : current === placeholder;
    if (same) result.push(field);
  }
  return result;
}

/**
 * Settings fields the admin home asks Aviva to complete (research R13): the seed placeholders,
 * plus `pickupInstructionsHe` when an enabled zone offers pickup and the Hebrew instructions are
 * empty, and `offlineInstructionsHe` while offline payment is effectively on and the Hebrew
 * instructions are empty (006 FR-010b).
 */
export async function settingsNeedingAttention(): Promise<AttentionField[]> {
  const settings = await getSettings();
  const fields: AttentionField[] = placeholderFields(settings);
  if ((settings.pickupInstructionsHe ?? '').trim() === '') {
    const [zone] = await db
      .select({ id: shippingZone.id })
      .from(shippingZone)
      .where(and(eq(shippingZone.enabled, true), eq(shippingZone.pickupEnabled, true)))
      .limit(1);
    if (zone) fields.push('pickupInstructionsHe');
  }
  if (
    (settings.offlineInstructionsHe ?? '').trim() === '' &&
    effectivePaymentMethods(settings, getEnv().PAYMENT_PROVIDER).offline
  ) {
    fields.push('offlineInstructionsHe');
  }
  return fields;
}

// ---------------------------------------------------------------- admin writes

/** Countries of every zone, as `{zoneId, countryCode}` rows (shown read-only on the settings screen). */
export function getZoneCountries(): Promise<{ zoneId: string; countryCode: string }[]> {
  return db
    .select({ zoneId: shippingZoneCountry.zoneId, countryCode: shippingZoneCountry.countryCode })
    .from(shippingZoneCountry)
    .orderBy(asc(shippingZoneCountry.countryCode));
}

export interface UsdBlocker {
  id: string;
  nameHe: string;
}

/**
 * Published products that cannot be sold in USD: no USD price, or an option adjustment that is
 * not zero in shekels and has no USD amount (FR-015, research.md R18).
 */
export async function productsMissingUsdPrice(database: DbLike = db): Promise<UsdBlocker[]> {
  const published = await database
    .select({ id: product.id, nameHe: product.nameHe, priceUsdMinor: product.priceUsdMinor })
    .from(product)
    .where(eq(product.state, 'published'))
    .orderBy(asc(product.nameHe));
  const deltas = await database
    .select({ productId: optionGroup.productId })
    .from(optionValue)
    .innerJoin(optionGroup, eq(optionValue.groupId, optionGroup.id))
    .where(and(isNull(optionValue.deltaUsdMinor), ne(optionValue.deltaIlsMinor, 0)));
  const withDelta = new Set(deltas.map((row) => row.productId));
  return published
    .filter((row) => row.priceUsdMinor === null || withDelta.has(row.id))
    .map(({ id, nameHe }) => ({ id, nameHe }));
}

export type SettingsFailure = Failure & { products?: UsdBlocker[] };

const SETTINGS_ERRORS = 'admin.settings.errors';

/** Zod issues -> one message key per field (the issue message is the key). */
function fieldErrorsOf(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    errors[typeof field === 'string' ? field : 'form'] ??= issue.message.startsWith('admin.')
      ? issue.message
      : `${SETTINGS_ERRORS}.invalid`;
  }
  return errors;
}

/**
 * Saves shop settings (any subset of the fields; the merged result is validated). At least one
 * payment method stays enabled and 1-3 notification emails remain (FR-017). Writes one
 * `settings.updated` activity row.
 */
export async function updateSettings(
  actor: Actor,
  input: SettingsInput,
  database: DbLike = db,
): Promise<ActionResult | SettingsFailure> {
  const parsed = settingsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error.issues) };
  // Zod leaves out the fields that were not sent.
  const changes: Partial<typeof shopSettings.$inferInsert> = { ...parsed.data };
  if (changes.notificationEmails !== undefined) {
    // The same address twice (in any case) counts once.
    const seen = new Set<string>();
    changes.notificationEmails = changes.notificationEmails.filter((address) => {
      const key = address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return database.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(shopSettings)
      .where(eq(shopSettings.id, 1))
      .for('update');
    if (!current) throw new Error('shop_settings row is missing: run `pnpm db:seed`');
    // Judged on the submitted fields only: every settings section sends just its own, so saving
    // pickup instructions or business details works whatever is stored.
    if (
      getEnv().PAYMENT_PROVIDER === 'none' &&
      (changes.onlinePaymentEnabled === true || changes.offlinePaymentEnabled === false)
    ) {
      return formFailure(`${SETTINGS_ERRORS}.card_not_set_up`);
    }
    if (changes.homeCategoryId != null) {
      const [existing] = await tx
        .select({ id: category.id })
        .from(category)
        .where(eq(category.id, changes.homeCategoryId));
      if (!existing) {
        return fieldFailure('homeCategoryId', `${SETTINGS_ERRORS}.home_category_not_found`);
      }
    }
    for (const field of ['headerCategory1Id', 'headerCategory2Id'] as const) {
      const id = changes[field];
      if (id == null) continue;
      const [existing] = await tx
        .select({ id: category.id })
        .from(category)
        .where(eq(category.id, id));
      if (!existing) return fieldFailure(field, `${SETTINGS_ERRORS}.header_category_not_found`);
    }
    const merged = { ...current, ...changes };
    if (!merged.onlinePaymentEnabled && !merged.offlinePaymentEnabled) {
      return formFailure(`${SETTINGS_ERRORS}.last_payment_method`);
    }
    const changed = Object.keys(changes).filter(
      (key) =>
        JSON.stringify((current as Record<string, unknown>)[key]) !==
        JSON.stringify((changes as Record<string, unknown>)[key]),
    );
    if (changed.length === 0) return ok(undefined);
    await tx.update(shopSettings).set(changes).where(eq(shopSettings.id, 1));
    await logActivity(tx, {
      adminId: actor.adminId,
      actorKind: 'admin',
      actorLabel: actor.label,
      action: 'settings.updated',
      targetType: 'settings',
      details: { count: changed.length },
    });
    return ok(undefined);
  });
}

/**
 * Saves one shipping zone's switches, fee and free-shipping amount. Israel stays enabled, pickup
 * exists only there, and an enabled zone keeps at least one delivery method (FR-022). Enabling a
 * USD zone is refused while published products lack a USD price; the failure lists them
 * (FR-015, research.md R18). Writes one `zone.updated` activity row.
 */
export async function updateZone(
  actor: Actor,
  input: ZoneInput,
  database: DbLike = db,
): Promise<ActionResult | SettingsFailure> {
  const parsed = zoneInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const next = parsed.data;

  return database.transaction(async (tx) => {
    const [zone] = await tx
      .select()
      .from(shippingZone)
      .where(eq(shippingZone.id, next.zoneId))
      .for('update');
    if (!zone) return formFailure(`${SETTINGS_ERRORS}.zone_not_found`);
    const israel = zone.code === 'IL';
    if (israel && !next.enabled) return formFailure(`${SETTINGS_ERRORS}.israel_stays_enabled`);
    if (next.pickupEnabled && !israel) return formFailure(`${SETTINGS_ERRORS}.pickup_israel_only`);
    if (next.enabled && !next.shippingEnabled && !next.pickupEnabled) {
      return formFailure(`${SETTINGS_ERRORS}.last_delivery_method`);
    }
    if (zone.currency === 'USD' && next.enabled && !zone.enabled) {
      const blockers = await productsMissingUsdPrice(tx);
      if (blockers.length > 0) {
        return {
          ...formFailure(`${SETTINGS_ERRORS}.usd_missing`),
          products: blockers,
          count: blockers.length,
        };
      }
    }
    await tx
      .update(shippingZone)
      .set({
        enabled: next.enabled,
        shippingEnabled: next.shippingEnabled,
        pickupEnabled: next.pickupEnabled,
        shippingFeeMinor: next.shippingFeeMinor,
        freeShippingThresholdMinor: next.freeShippingThresholdMinor,
      })
      .where(eq(shippingZone.id, zone.id));
    await logActivity(tx, {
      adminId: actor.adminId,
      actorKind: 'admin',
      actorLabel: actor.label,
      action: 'zone.updated',
      targetType: 'zone',
      targetId: zone.id,
      details: { slug: zone.code },
    });
    return ok(undefined);
  });
}
