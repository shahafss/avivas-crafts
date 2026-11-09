'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { goToSignIn, goToSignInExpired } from './navigate';
import { PasskeyButton } from './PasskeyButton';

type Step = 'needs_other' | 'code' | 'register' | 'waiting';

async function postRecovery(code?: string): Promise<{ status: number; error?: string }> {
  const response = await fetch('/api/auth/recovery', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(code === undefined ? {} : { code }),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return { status: response.status, ...(data.error === undefined ? {} : { error: data.error }) };
}

/** Recovery code, then a new passkey that waits for the other admin's approval. */
export function RecoveryFlow({ initial }: { initial: Step }) {
  const t = useTranslations('admin.auth.recovery');
  const busyText = useTranslations('admin.auth.passkey')('busy');
  const [step, setStep] = useState<Step>(initial);
  const [code, setCode] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'invalid' | 'blocked' | 'failed' | null>(null);

  async function submitCode(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await postRecovery(code);
      if (result.status === 200) setStep('register');
      else if (result.status === 409) goToSignIn();
      else if (result.error === 'blocked') setError('blocked');
      else if (result.error === 'code_invalid' || result.error === 'code_required')
        setError('invalid');
      else if (result.status === 401) goToSignInExpired();
      else setError('failed');
    } catch {
      setError('failed');
    } finally {
      setBusy(false);
    }
  }

  async function endSignIn(): Promise<void> {
    setBusy(true);
    try {
      // No code needed: the "no other admin" check comes first and ends the session.
      await postRecovery();
    } finally {
      goToSignIn();
    }
  }

  if (step === 'needs_other') {
    return (
      <>
        <Notice tone="attention" role="status">
          <span data-testid="admin-recovery-needs-other">{t('needsOther')}</span>
        </Notice>
        <Button
          data-testid="admin-recovery-end"
          busy={busy}
          busyLabel={busyText}
          onClick={() => {
            void endSignIn();
          }}
        >
          {t('end')}
        </Button>
      </>
    );
  }

  if (step === 'waiting') {
    return (
      <>
        <Notice tone="made" role="status">
          <span data-testid="admin-recovery-waiting">{t('waiting')}</span>
        </Notice>
        <Link
          href="/admin/sign-in"
          prefetch={false}
          className="min-h-11 font-bold underline underline-offset-[3px]"
        >
          {t('toSignIn')}
        </Link>
      </>
    );
  }

  if (step === 'register') {
    return (
      <>
        <p className="text-ink-2">{t('registerIntro')}</p>
        <TextField
          label={t('deviceLabel')}
          placeholder={t('devicePlaceholder')}
          value={deviceLabel}
          maxLength={60}
          data-testid="admin-recovery-device-label"
          onChange={(event) => {
            setDeviceLabel(event.target.value);
          }}
        />
        <PasskeyButton
          mode="register"
          busyLabel={busyText}
          data-testid="admin-recovery-register"
          deviceLabel={deviceLabel}
          onDone={() => {
            setStep('waiting');
          }}
        >
          {t('register')}
        </PasskeyButton>
      </>
    );
  }

  return (
    <>
      <p className="text-ink-2">{t('intro')}</p>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void submitCode(event);
        }}
      >
        <TextField
          label={t('codeLabel')}
          hint={t('codeHint')}
          value={code}
          ltr
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          data-testid="admin-recovery-code"
          error={error === null ? undefined : t(error)}
          onChange={(event) => {
            setCode(event.target.value);
          }}
        />
        <Button type="submit" busy={busy} busyLabel={busyText} data-testid="admin-recovery-submit">
          {t('submit')}
        </Button>
      </form>
    </>
  );
}
