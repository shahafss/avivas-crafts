import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/server/auth/require-admin';

export default async function DashboardPage() {
  const { admin } = await requireAdmin();
  const t = await getTranslations('admin.dashboard');
  return (
    <div className="grid gap-3">
      <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight">{t('title')}</h1>
      <p className="text-lg font-bold">{t('welcome', { name: admin.displayName })}</p>
      <p className="text-ink-2">{t('intro')}</p>
    </div>
  );
}
