import 'server-only';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { logActivity } from '@/server/activity/log';
import { shippingZone, shippingZoneCountry } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';

const inputSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,19}$/),
  nameHe: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().max(80).optional(),
  countries: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .min(1)
    .max(250),
});

export type ZoneAddResult =
  | { ok: true; code: string; countries: string[] }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'code_taken' }
  | { ok: false; error: 'country_taken'; countries: string[] };

/**
 * Adds a USD shipping zone for the given countries (`pnpm zone:add`, the maintainer's command;
 * research.md R18). The zone starts disabled: the owner enables it from the settings screen once
 * every published product has a USD price. A country can belong to one zone only.
 */
export async function addZone(
  database: DbLike,
  input: { code: string; nameHe: string; nameEn?: string | undefined; countries: string[] },
): Promise<ZoneAddResult> {
  const parsed = inputSchema.safeParse({
    ...input,
    countries: [...new Set(input.countries.map((country) => country.trim().toUpperCase()))],
  });
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const { code, nameHe, nameEn, countries } = parsed.data;

  return database.transaction(async (tx) => {
    const taken = await tx
      .select({ countryCode: shippingZoneCountry.countryCode })
      .from(shippingZoneCountry)
      .where(inArray(shippingZoneCountry.countryCode, countries));
    if (taken.length > 0) {
      return {
        ok: false as const,
        error: 'country_taken' as const,
        countries: taken.map((row) => row.countryCode).sort(),
      };
    }
    const inserted = await tx
      .insert(shippingZone)
      .values({
        code,
        nameHe,
        nameEn: nameEn === undefined || nameEn === '' ? null : nameEn,
        currency: 'USD',
        enabled: false,
        shippingEnabled: false,
        pickupEnabled: false,
      })
      .onConflictDoNothing({ target: shippingZone.code })
      .returning({ id: shippingZone.id });
    const zone = inserted[0];
    if (!zone) return { ok: false as const, error: 'code_taken' as const };
    await tx
      .insert(shippingZoneCountry)
      .values(countries.map((countryCode) => ({ zoneId: zone.id, countryCode })));
    await logActivity(tx, {
      adminId: null,
      actorKind: 'system',
      action: 'zone.added',
      targetType: 'zone',
      targetId: zone.id,
      details: { slug: code, count: countries.length },
    });
    return { ok: true as const, code, countries };
  });
}
