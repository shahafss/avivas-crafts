import { getTranslations } from 'next-intl/server';
import { AuthCard } from '@/components/admin/AuthCard';
import { SetupFlow } from '@/components/admin/SetupFlow';
import { getSession } from '@/server/auth/session';

/**
 * First-passkey setup. The link's token travels in the URL fragment (`#t=`), which the server
 * never sees: a small script reads it, removes it from the address bar and posts it with the
 * Google form. Looking at this page writes nothing.
 */
export default async function SetupPage() {
  const context = await getSession(undefined, { readOnly: true });
  const t = await getTranslations('admin.auth.setup');
  const registering =
    context?.session.stage === 'pending_passkey' && context.session.purpose === 'setup';
  return (
    <AuthCard title={registering ? t('registerTitle') : t('title')}>
      <SetupFlow stage={registering ? 'register' : 'start'} />
    </AuthCard>
  );
}
