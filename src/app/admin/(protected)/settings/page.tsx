import { getTranslations } from 'next-intl/server';
import { SettingsManager } from '@/components/admin/SettingsManager';
import { requireAdmin } from '@/server/auth/require-admin';
import {
  getSettings,
  getZoneCountries,
  getZones,
  productsMissingUsdPrice,
} from '@/server/settings/settings';
import { updateSettings, updateZone } from './actions';

export default async function SettingsPage() {
  await requireAdmin();
  const [t, settings, zones, countries] = await Promise.all([
    getTranslations('admin.settings'),
    getSettings(),
    getZones(),
    getZoneCountries(),
  ]);
  // Only needed while a USD zone is switched off: these products block enabling it.
  const usdBlockers = zones.some((zone) => zone.currency === 'USD' && !zone.enabled)
    ? await productsMissingUsdPrice()
    : [];

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-ink-2">{t('intro')}</p>
      </div>
      <SettingsManager
        settings={{
          shopNameHe: settings.shopNameHe,
          shopNameEn: settings.shopNameEn,
          onlinePaymentEnabled: settings.onlinePaymentEnabled,
          offlinePaymentEnabled: settings.offlinePaymentEnabled,
          offlineInstructionsHe: settings.offlineInstructionsHe,
          offlineInstructionsEn: settings.offlineInstructionsEn,
          pickupInstructionsHe: settings.pickupInstructionsHe,
          pickupInstructionsEn: settings.pickupInstructionsEn,
          businessNameHe: settings.businessNameHe,
          businessNameEn: settings.businessNameEn,
          businessRegNumber: settings.businessRegNumber,
          businessEmail: settings.businessEmail,
          businessPhone: settings.businessPhone,
          businessAddressHe: settings.businessAddressHe,
          businessAddressEn: settings.businessAddressEn,
          notificationEmails: settings.notificationEmails,
        }}
        zones={[...zones]
          .sort((a, b) =>
            a.code === 'IL' ? -1 : b.code === 'IL' ? 1 : a.code.localeCompare(b.code),
          )
          .map((zone) => ({
            id: zone.id,
            code: zone.code,
            nameHe: zone.nameHe,
            currency: zone.currency,
            enabled: zone.enabled,
            shippingEnabled: zone.shippingEnabled,
            pickupEnabled: zone.pickupEnabled,
            shippingFeeMinor: zone.shippingFeeMinor,
            freeShippingThresholdMinor: zone.freeShippingThresholdMinor,
            countries: countries
              .filter((row) => row.zoneId === zone.id)
              .map((row) => row.countryCode),
          }))}
        usdBlockers={usdBlockers}
        actions={{ updateSettings, updateZone }}
      />
    </div>
  );
}
