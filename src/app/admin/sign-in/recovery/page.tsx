import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/admin/AuthCard';
import { RecoveryFlow } from '@/components/admin/RecoveryFlow';
import { recoveryCodeAccepted } from '@/server/auth/passkeys';
import { hasOtherActiveAdmin } from '@/server/auth/recovery';
import { getSession } from '@/server/auth/session';

/**
 * Recovery with a code. Needs a `pending_passkey` session. Looking never writes: the refusal
 * for a sole admin is only recorded when the admin presses the button (POST /api/auth/recovery).
 */
export default async function RecoveryPage() {
  const context = await getSession(undefined, { readOnly: true });
  if (context?.session.stage === 'full') redirect('/admin');
  if (!context) redirect('/admin/sign-in?e=expired');
  if (context.session.purpose === 'setup') redirect('/admin/setup');

  const t = await getTranslations('admin.auth.recovery');
  const needsOther = !(await hasOtherActiveAdmin(context.admin.id));
  const codeAccepted = recoveryCodeAccepted(context.session);
  return (
    <AuthCard title={needsOther ? t('needsOtherTitle') : t('title')}>
      <RecoveryFlow initial={needsOther ? 'needs_other' : codeAccepted ? 'register' : 'code'} />
    </AuthCard>
  );
}
