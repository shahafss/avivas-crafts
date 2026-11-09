import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Notice } from '@/components/ui/Notice';
import { requireAdmin } from '@/server/auth/require-admin';
import { getOrderCounts } from '@/server/orders/admin-orders';
import { settingsNeedingAttention } from '@/server/settings/settings';

const CARD =
  'grid min-h-11 gap-1 rounded-card border border-line bg-panel p-5 no-underline hover:bg-sun-soft focus-visible:outline-2 focus-visible:outline-offset-2';

export async function generateMetadata() {
  const t = await getTranslations('admin.dashboard');
  return { title: t('title') };
}

export default async function DashboardPage() {
  const { admin } = await requireAdmin();
  const t = await getTranslations('admin.dashboard');
  const [counts, attention] = await Promise.all([getOrderCounts(), settingsNeedingAttention()]);
  const nothingWaiting = counts.newOrders === 0 && counts.awaitingPayment === 0;

  return (
    <div className="grid gap-3">
      <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight">{t('title')}</h1>
      <p className="text-lg font-bold">{t('welcome', { name: admin.displayName })}</p>

      {nothingWaiting ? (
        <p className="text-ink-2" data-testid="nothing-waiting">
          {t('nothingWaiting')}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/admin/orders?status=new"
            prefetch={false}
            className={CARD}
            data-testid="count-new"
          >
            <span
              className="text-[40px] leading-none font-extrabold tabular-nums"
              data-testid="number-new"
            >
              {counts.newOrders}
            </span>
            <span className="text-[15px] font-bold">{t('newOrders')}</span>
          </Link>
          <Link
            href="/admin/orders?payment=awaiting_payment&open=1"
            prefetch={false}
            className={CARD}
            data-testid="count-awaiting"
          >
            <span
              className="text-[40px] leading-none font-extrabold tabular-nums"
              data-testid="number-awaiting"
            >
              {counts.awaitingPayment}
            </span>
            <span className="text-[15px] font-bold">{t('awaitingPayment')}</span>
          </Link>
        </div>
      )}

      {attention.length > 0 ? (
        <Notice tone="attention">
          <div data-testid="settings-attention" className="grid gap-2">
            <p className="font-bold">{t('settingsNotice')}</p>
            <ul className="list-disc ps-5">
              {attention.map((field) => (
                <li key={field}>{t(`settingsFields.${field}`)}</li>
              ))}
            </ul>
            <Link
              href="/admin/settings"
              prefetch={false}
              className="inline-flex min-h-11 w-fit items-center text-[15px] font-bold underline underline-offset-[3px]"
            >
              {t('toSettings')}
            </Link>
          </div>
        </Notice>
      ) : null}
    </div>
  );
}
