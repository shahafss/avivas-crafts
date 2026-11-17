import { getTranslations } from 'next-intl/server';
import { Disclosure } from '@/components/ui/Disclosure';
import type { Stats } from '@/server/analytics/stats';

// Visits per day (storefront.md §12.8): an SVG bar chart sized with attributes only (nonce CSP,
// no `style`), plus the same numbers as a table behind a Disclosure.

const WIDTH = 360;
const HEIGHT = 170;
const PLOT_TOP = 18;
const PLOT_BOTTOM = 146;

/** `2026-03-10` as `10.3` (the chart) or `10.3.2026` (the table). */
function shortDate(day: string, withYear = false): string {
  const [year = '', month = '', date = ''] = day.split('-');
  const base = `${String(Number(date))}.${String(Number(month))}`;
  return withYear ? `${base}.${year}` : base;
}

export async function StatsChart({ stats }: { stats: Stats }) {
  const t = await getTranslations('admin.stats');
  const { visitsPerDay } = stats;
  const total = visitsPerDay.reduce((sum, entry) => sum + entry.visits, 0);
  const today = visitsPerDay.at(-1)?.visits ?? 0;
  const top = Math.max(1, ...visitsPerDay.map((entry) => entry.visits));
  const slot = WIDTH / visitsPerDay.length;
  const barWidth = Math.max(1, slot * 0.7);
  const plotHeight = PLOT_BOTTOM - PLOT_TOP;
  const last = visitsPerDay.length - 1;

  return (
    <section aria-labelledby="stats-chart-title" className="grid gap-3">
      <h2 id="stats-chart-title" className="text-xl font-extrabold tracking-tight">
        {t('chart.title')}
      </h2>
      <svg
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={t('chart.label', { days: stats.days, total, today })}
        data-testid="stats-chart"
        // The page is right-to-left; the chart keeps time running left to right and its labels inside.
        direction="ltr"
        className="h-auto w-full max-w-[480px]"
      >
        <line
          x1={0}
          x2={WIDTH}
          y1={PLOT_BOTTOM}
          y2={PLOT_BOTTOM}
          strokeWidth={1}
          className="stroke-line"
        />
        {visitsPerDay.map((entry, index) => {
          const height = entry.visits === 0 ? 0 : Math.max(2, (entry.visits / top) * plotHeight);
          return (
            <rect
              key={entry.day}
              x={index * slot + (slot - barWidth) / 2}
              y={PLOT_BOTTOM - height}
              width={barWidth}
              height={height}
              rx={Math.min(2, barWidth / 2)}
              className={index === last ? 'fill-sage stroke-forest stroke-[1.5]' : 'fill-forest'}
            />
          );
        })}
        <text x={0} y={14} fontSize={13} textAnchor="start" className="tnum fill-ink-2">
          {top}
        </text>
        <text x={0} y={HEIGHT - 6} fontSize={13} textAnchor="start" className="tnum fill-ink-2">
          {shortDate(visitsPerDay[0]?.day ?? '')}
        </text>
        <text x={WIDTH} y={HEIGHT - 6} fontSize={13} textAnchor="end" className="tnum fill-ink-2">
          {shortDate(visitsPerDay[last]?.day ?? '')}
        </text>
      </svg>
      <Disclosure title={t('chart.showTable')}>
        <table data-testid="stats-table" className="w-full max-w-[480px] text-start">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 text-start font-bold text-ink">
                {t('chart.day')}
              </th>
              <th scope="col" className="py-2 text-start font-bold text-ink">
                {t('chart.visits')}
              </th>
            </tr>
          </thead>
          <tbody>
            {[...visitsPerDay].reverse().map((entry) => (
              <tr key={entry.day} className="border-b border-line">
                <td className="tnum py-2">{shortDate(entry.day, true)}</td>
                <td className="tnum py-2">{entry.visits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Disclosure>
    </section>
  );
}
