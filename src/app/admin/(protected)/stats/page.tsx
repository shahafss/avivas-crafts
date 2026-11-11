import { getTranslations } from 'next-intl/server';
import { StatsChart } from '@/components/admin/StatsChart';
import { ChipLink } from '@/components/ui/ChipLink';
import { ChipRow } from '@/components/ui/ChipRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { getStats, parsePeriod, type StatsPeriod } from '@/server/analytics/stats';
import { requireAdmin } from '@/server/auth/require-admin';

export async function generateMetadata() {
  const t = await getTranslations('admin.stats');
  return { title: t('title') };
}

const PERIODS: readonly StatsPeriod[] = [7, 30, 90];

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  await requireAdmin();
  const { days: raw } = await searchParams;
  const days = parsePeriod(raw);
  const [t, stats] = await Promise.all([getTranslations('admin.stats'), getStats(days)]);
  const empty =
    stats.topProducts.length === 0 &&
    stats.topReferrers.length === 0 &&
    stats.visitsPerDay.every((entry) => entry.visits === 0);

  return (
    <div className="grid grid-cols-1 gap-5">
      <header className="grid gap-2">
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance">
          {t('title')}
        </h1>
        <p className="text-ink-2">{t('intro')}</p>
      </header>

      <ChipRow label={t('period.label')}>
        {PERIODS.map((period) => (
          <ChipLink
            key={period}
            href={`/admin/stats?days=${String(period)}`}
            prefetch={false}
            current={period === days}
          >
            {t(`period.d${String(period)}` as 'period.d7')}
          </ChipLink>
        ))}
      </ChipRow>

      {empty ? (
        <EmptyState icon="search" title={t('empty.title')} text={t('empty.text')} />
      ) : (
        <>
          <StatsChart stats={stats} />

          <section
            aria-labelledby="stats-products-title"
            className="grid gap-2"
            data-testid="stats-top-products"
          >
            <h2 id="stats-products-title" className="text-xl font-extrabold tracking-tight">
              {t('products.title')}
            </h2>
            {stats.topProducts.length === 0 ? (
              <p className="text-ink-2">{t('listEmpty')}</p>
            ) : (
              <ol className="grid gap-1">
                {stats.topProducts.map((item) => (
                  <li
                    key={item.slug}
                    className="flex min-h-11 items-center justify-between gap-3 border-b border-line"
                  >
                    <bdi className="font-bold">{item.name}</bdi>
                    <span className="tnum text-ink-2">
                      {t('products.views', { count: item.views })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section
            aria-labelledby="stats-referrers-title"
            className="grid gap-2"
            data-testid="stats-top-referrers"
          >
            <h2 id="stats-referrers-title" className="text-xl font-extrabold tracking-tight">
              {t('referrers.title')}
            </h2>
            {stats.topReferrers.length === 0 ? (
              <p className="text-ink-2">{t('listEmpty')}</p>
            ) : (
              <ol className="grid gap-1">
                {stats.topReferrers.map((item) => (
                  <li
                    key={item.host}
                    className="flex min-h-11 items-center justify-between gap-3 border-b border-line"
                  >
                    {item.host === '(direct)' ? (
                      <span className="font-bold">{t('referrers.direct')}</span>
                    ) : (
                      <bdi dir="ltr" className="font-bold">
                        {item.host}
                      </bdi>
                    )}
                    <span className="tnum text-ink-2">
                      {t('referrers.visits', { count: item.visits })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
