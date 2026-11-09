'use server';

import { requireAdmin } from '@/server/auth/require-admin';
import { actorOf } from '@/server/catalog/result';
import {
  updateSettings as updateSettingsRecord,
  updateZone as updateZoneRecord,
  type SettingsFailure,
} from '@/server/settings/settings';
import type { ActionResult } from '@/server/catalog/result';
import type { SettingsInput, ZoneInput } from '@/lib/validation/settings';

// The validation and the writes live in src/server/settings/settings.ts (data-access layer).

export async function updateSettings(
  input: SettingsInput,
): Promise<ActionResult | SettingsFailure> {
  const context = await requireAdmin();
  return updateSettingsRecord(actorOf(context), input);
}

export async function updateZone(input: ZoneInput): Promise<ActionResult | SettingsFailure> {
  const context = await requireAdmin();
  return updateZoneRecord(actorOf(context), input);
}
