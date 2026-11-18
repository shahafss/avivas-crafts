import { getTranslations } from 'next-intl/server';
import { CustomerSearch } from '@/components/admin/CustomerSearch';
import { requireAdmin } from '@/server/auth/require-admin';
import {
  anonymizeCustomer,
  exportCustomer,
  searchCustomers,
  withdrawMarketingConsent,
} from './actions';

export async function generateMetadata() {
  const t = await getTranslations('admin.customers');
  return { title: t('title') };
}

export default async function CustomersPage() {
  await requireAdmin();
  const t = await getTranslations('admin.customers');
  return (
    <div className="grid grid-cols-1 gap-5">
      <header className="grid gap-2">
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance">
          {t('title')}
        </h1>
        <p className="text-ink-2">{t('intro')}</p>
      </header>
      {/* The admin layout already provides the whole `admin` message namespace to islands. */}
      <CustomerSearch
        actions={{ searchCustomers, exportCustomer, withdrawMarketingConsent, anonymizeCustomer }}
      />
    </div>
  );
}
