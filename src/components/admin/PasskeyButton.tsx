'use client';

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { goTo } from './navigate';

export type PasskeyMode = 'sign-in' | 'register' | 'reauth';

export interface PasskeyDoneData {
  status?: string;
  recoveryCodes?: string[];
}

interface Props {
  mode: PasskeyMode;
  children: ReactNode;
  busyLabel: string;
  'data-testid'?: string;
  /** `register` mode: the name the admin gave the device. */
  deviceLabel?: string;
  /** Called after success. Sign-in mode navigates to the answered `redirect` by itself. */
  onDone?: (data: PasskeyDoneData) => void;
}

interface Reply {
  status: number;
  data: Record<string, unknown>;
}

async function post(url: string, body?: unknown): Promise<Reply> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, data };
}

type ErrorKey =
  | 'cancelled'
  | 'unsupported'
  | 'failed'
  | 'blocked'
  | 'sessionExpired'
  | 'noOtherAdmin'
  | 'alreadyRegistered'
  | 'needLabel';

function errorKeyFor(reply: Reply): ErrorKey {
  const code = reply.data.error;
  if (code === 'blocked') return 'blocked';
  if (code === 'no_other_admin') return 'noOtherAdmin';
  if (reply.status === 401 || code === 'unauthorized' || code === 'not_allowed')
    return 'sessionExpired';
  return 'failed';
}

const ENDPOINTS = {
  'sign-in': { options: '/api/auth/passkey/options', verify: '/api/auth/passkey/verify' },
  register: {
    options: '/api/auth/passkey/register/options',
    verify: '/api/auth/passkey/register/verify',
  },
  reauth: { options: '/api/auth/reauth/options', verify: '/api/auth/reauth/verify' },
} as const;

/** One WebAuthn ceremony: sign-in, registering a passkey, or the re-check before a security change. */
export function PasskeyButton({
  mode,
  children,
  busyLabel,
  'data-testid': testId,
  deviceLabel,
  onDone,
}: Props) {
  const t = useTranslations('admin.auth.passkeyButton');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);

  async function run(): Promise<void> {
    setError(null);
    if (mode === 'register' && (deviceLabel ?? '').trim() === '') {
      setError('needLabel');
      return;
    }
    if (typeof window.PublicKeyCredential === 'undefined') {
      setError('unsupported');
      return;
    }
    setBusy(true);
    try {
      const endpoints = ENDPOINTS[mode];
      const options = await post(endpoints.options);
      if (options.status !== 200) {
        setError(errorKeyFor(options));
        return;
      }
      const response =
        mode === 'register'
          ? await startRegistration({ optionsJSON: options.data as never })
          : await startAuthentication({ optionsJSON: options.data as never });
      const verified = await post(
        endpoints.verify,
        mode === 'register' ? { response, deviceLabel: (deviceLabel ?? '').trim() } : response,
      );
      if (verified.status !== 200) {
        setError(errorKeyFor(verified));
        return;
      }
      if (mode === 'sign-in' && typeof verified.data.redirect === 'string') {
        goTo(verified.data.redirect);
        return;
      }
      onDone?.(verified.data);
    } catch (caught) {
      const name = caught instanceof Error ? caught.name : '';
      setError(
        name === 'NotAllowedError' || name === 'AbortError'
          ? 'cancelled'
          : name === 'InvalidStateError'
            ? 'alreadyRegistered'
            : 'failed',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <Button
        data-testid={testId}
        busy={busy}
        busyLabel={busyLabel}
        onClick={() => {
          void run();
        }}
      >
        {children}
      </Button>
      {error === null ? null : (
        <Notice tone="alert" role="alert">
          {t(error)}
        </Notice>
      )}
    </div>
  );
}
