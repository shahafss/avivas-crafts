import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/routing';
import { formatMoney } from '@/lib/money';
import { getZoneForCountry } from '@/server/settings/settings';

/**
 * Marigold bar built from the Israel zone: free-shipping threshold when shipping is enabled and
 * has one, "free self-pickup" when pickup is enabled. Hidden when neither applies.
 */
export async function AnnouncementBar({ locale }: { locale: Locale }) {
  const zone = await getZoneForCountry('IL');
  if (zone?.enabled !== true) return null;
  const t = await getTranslations({ locale, namespace: 'common.announcement' });

  const parts: ReactNode[] = [];
  if (zone.shippingEnabled && zone.freeShippingThresholdMinor !== null) {
    parts.push(
      t.rich('freeShippingOver', {
        amount: formatMoney(zone.freeShippingThresholdMinor, zone.currency, locale),
        money: (chunks) => <bdi className="tnum">{chunks}</bdi>,
      }),
    );
  }
  if (zone.pickupEnabled) parts.push(t('freePickup'));
  if (parts.length === 0) return null;

  return (
    <div className="bg-sun px-4 py-2 text-center text-[13px] font-bold text-ink">
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 ? ' · ' : null}
          {part}
        </span>
      ))}
    </div>
  );
}
