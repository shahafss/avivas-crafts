import 'server-only';
import { getEnabledZones, getZoneForCountry, type Zone } from '@/server/settings/settings';

export type ZoneResult =
  { ok: true; zone: Zone } | { ok: false; formError: 'checkout.ships_israel_only' };

const UNSUPPORTED = { ok: false, formError: 'checkout.ships_israel_only' } as const;

/**
 * The enabled shipping zone of a country (`IL` when none is given). A country outside every
 * enabled zone, including the UI-only "Other country" value `other`, is refused.
 */
export async function resolveZone(countryCode?: string): Promise<ZoneResult> {
  const code = (countryCode ?? 'IL').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return UNSUPPORTED;
  const zone = await getZoneForCountry(code);
  return zone?.enabled === true ? { ok: true, zone } : UNSUPPORTED;
}

/** Zone for the cart page: Israel when it is enabled, otherwise the first enabled zone. */
export async function defaultZone(): Promise<Zone | null> {
  const israel = await resolveZone('IL');
  if (israel.ok) return israel.zone;
  return (await getEnabledZones())[0] ?? null;
}

/** An enabled zone by its code (`IL`, `WORLD`, ...); no code means the default zone. */
export async function resolveZoneByCode(zoneCode?: string): Promise<Zone | null> {
  if (zoneCode === undefined) return defaultZone();
  return (await getEnabledZones()).find((zone) => zone.code === zoneCode) ?? null;
}
