import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/routing';
import { LanguageSwitch } from './LanguageSwitch';
import { formatMoney } from '@/lib/money';
import { getZoneForCountry } from '@/server/settings/settings';

/**
 * The forest strip above the header, always present (007 FR-041): the free-shipping or pickup text
 * built from the Israel zone, centred, and the compact language switch at the inline end. With no
 * text (no free-shipping amount and pickup off, or the zone off) it holds only the switch.
 */
export async function AnnouncementBar({ locale }: { locale: Locale }) {
  const zone = await getZoneForCountry('IL');
  const t = await getTranslations({ locale, namespace: 'common.announcement' });

  const parts: ReactNode[] = [];
  if (zone?.enabled === true) {
    if (zone.shippingEnabled && zone.freeShippingThresholdMinor !== null) {
      parts.push(
        t.rich('freeShippingOver', {
          amount: formatMoney(zone.freeShippingThresholdMinor, zone.currency, locale),
          money: (chunks) => <bdi className="tnum">{chunks}</bdi>,
        }),
      );
    }
    if (zone.pickupEnabled) parts.push(t('freePickup'));
  }

  return (
    <div
      data-testid="announcement-bar"
      className="flex min-h-11 items-center gap-2 bg-forest ps-4 pe-2 py-1 text-paper"
    >
      {parts.length === 0 ? (
        <span className="flex-1" />
      ) : (
        <p className="min-w-0 flex-1 text-center text-[13px] font-bold">
          {parts.map((part, index) => (
            <span key={index}>
              {index > 0 ? ' · ' : null}
              {part}
            </span>
          ))}
        </p>
      )}
      <LanguageSwitch variant="compact" />
    </div>
  );
}
