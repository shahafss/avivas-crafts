import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { requireAdmin } from '@/server/auth/require-admin';

const NAV = [
  { key: 'products', href: '/admin/products' },
  { key: 'categories', href: '/admin/categories' },
  { key: 'orders', href: '/admin/orders' },
  { key: 'customers', href: '/admin/customers' },
  { key: 'settings', href: '/admin/settings' },
  { key: 'content', href: '/admin/content' },
  { key: 'stats', href: '/admin/stats' },
  { key: 'security', href: '/admin/security' },
  { key: 'activity', href: '/admin/activity' },
] as const;

// The `no-store` and `noindex` headers come from next.config.ts. This check does not re-run on
// client-side navigation, so every page and action calls requireAdmin() itself as well.
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { admin } = await requireAdmin();
  const t = await getTranslations('admin');
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-banner focus:rounded-pill focus:bg-ink focus:px-4 focus:py-2 focus:text-panel"
      >
        {t('skipToContent')}
      </a>
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" prefetch={false} className="text-lg font-extrabold">
            {t('brand')}
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-2 sm:inline" dir="auto">
              {admin.displayName}
            </span>
            <form method="post" action="/api/auth/sign-out">
              <Button
                type="submit"
                variant="secondary"
                className="h-11 px-4 text-[15px]"
                data-testid="admin-sign-out"
              >
                {t('nav.signOut')}
              </Button>
            </form>
          </div>
        </div>
        <nav aria-label={t('nav.label')} className="mx-auto max-w-5xl overflow-x-auto px-4 pb-2">
          <ul className="flex gap-1 whitespace-nowrap">
            {NAV.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center rounded-pill px-4 text-[15px] font-bold hover:bg-sun-soft"
                >
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
