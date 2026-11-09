import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/admin/AuthCard';
import { PasskeyButton } from '@/components/admin/PasskeyButton';
import { Notice } from '@/components/ui/Notice';
import { getSession } from '@/server/auth/session';
import { isBlocked } from '@/server/auth/throttle';

/** Step two: the passkey. Needs a `pending_passkey` session; looks only, never writes. */
export default async function PasskeyPage() {
  const context = await getSession(undefined, { readOnly: true });
  if (context?.session.stage === 'full') redirect('/admin');
  if (!context) redirect('/admin/sign-in?e=expired');
  if (context.session.purpose === 'setup') redirect('/admin/setup');

  const t = await getTranslations('admin.auth.passkey');
  const blocked = isBlocked(context.admin);
  return (
    <AuthCard title={blocked ? t('blockedTitle') : t('title')}>
      {blocked ? (
        <>
          <Notice tone="alert" role="alert" id="passkey-blocked">
            <span data-testid="admin-blocked">{t('blocked')}</span>
          </Notice>
          <Link
            href="/admin/sign-in"
            prefetch={false}
            className="min-h-11 font-bold underline underline-offset-[3px]"
          >
            {t('backToSignIn')}
          </Link>
        </>
      ) : (
        <>
          <p className="text-ink-2">{t('intro')}</p>
          <p className="text-[14px] text-ink-2">{t('pinHint')}</p>
          <PasskeyButton mode="sign-in" busyLabel={t('busy')} data-testid="admin-sign-in-passkey">
            {t('button')}
          </PasskeyButton>
          {/* No prefetch of the recovery page. */}
          <Link
            href="/admin/sign-in/recovery"
            prefetch={false}
            className="min-h-11 font-bold underline underline-offset-[3px]"
          >
            {t('lostPasskey')}
          </Link>
        </>
      )}
    </AuthCard>
  );
}
