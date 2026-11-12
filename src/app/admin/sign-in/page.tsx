import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/admin/AuthCard';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { safeAdminNext } from '@/server/auth/next-path';

const ERROR_CODES = ['not_allowed', 'expired', 'error', 'rate_limited'] as const;
type ErrorCode = (typeof ERROR_CODES)[number];

function isErrorCode(value: string | undefined): value is ErrorCode {
  return ERROR_CODES.some((code) => code === value);
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.auth.signIn');
  return { title: t('title') };
}

/** The admin sign-in: one Google button. Reads nothing but the URL and writes nothing. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; next?: string }>;
}) {
  const { e, next } = await searchParams;
  const t = await getTranslations('admin.auth.signIn');
  const safeNext = safeAdminNext(next);
  return (
    <AuthCard title={t('title')}>
      {isErrorCode(e) ? (
        <Notice tone="alert" role="alert" id="sign-in-error">
          {t(`errors.${e}`)}
        </Notice>
      ) : null}
      <p className="text-ink-2">{t('intro')}</p>
      <form method="post" action="/api/auth/google/start" className="grid gap-3">
        {safeNext === null ? null : <input type="hidden" name="next" value={safeNext} />}
        <Button type="submit" data-testid="admin-sign-in-google">
          {t('google')}
        </Button>
      </form>
    </AuthCard>
  );
}
