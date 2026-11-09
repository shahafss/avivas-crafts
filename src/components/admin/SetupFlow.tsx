'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { TextField } from '@/components/ui/TextField';
import { goToDashboard } from './navigate';
import { PasskeyButton, type PasskeyDoneData } from './PasskeyButton';

/** `XXXXXXXXXXXX` shown as `XXXX-XXXX-XXXX`. */
function grouped(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-');
}

function StartStep() {
  const t = useTranslations('admin.auth.setup');
  const token = useRef<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const match = /(?:^#|&)t=([A-Za-z0-9_-]{16,128})/.exec(window.location.hash);
    if (match?.[1] !== undefined) {
      token.current = match[1];
      // Out of the address bar and history at once: the token is never part of a URL again.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    const form = event.currentTarget;
    const field = form.elements.namedItem('t');
    if (token.current === null || !(field instanceof HTMLInputElement)) {
      event.preventDefault();
      setMissing(true);
      return;
    }
    field.value = token.current;
  }

  return (
    <>
      <p className="text-ink-2">{t('intro')}</p>
      {missing ? (
        <Notice tone="alert" role="alert">
          {t('missingToken')}
        </Notice>
      ) : null}
      <form
        method="post"
        action="/api/auth/google/start"
        onSubmit={onSubmit}
        className="grid gap-3"
      >
        <input type="hidden" name="purpose" value="setup" />
        <input type="hidden" name="t" defaultValue="" />
        <Button type="submit" data-testid="admin-setup-google">
          {t('google')}
        </Button>
      </form>
    </>
  );
}

function RegisterStep() {
  const t = useTranslations('admin.auth.setup');
  const busyText = useTranslations('admin.auth.passkey')('busy');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  if (codes !== null) {
    const text = codes.map(grouped).join('\n');
    return (
      <>
        <h2 className="text-xl font-extrabold">{t('codesTitle')}</h2>
        <p className="text-ink-2">{t('codesIntro')}</p>
        <Notice tone="attention">{t('codesWarning')}</Notice>
        <ol
          aria-label={t('codesList')}
          data-testid="admin-setup-codes"
          dir="ltr"
          className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-chip bg-photo p-4 font-mono text-[17px] tracking-wide"
        >
          {codes.map((code) => (
            <li key={code}>{grouped(code)}</li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-3 print:hidden">
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
              });
            }}
          >
            {t('copy')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              window.print();
            }}
          >
            {t('print')}
          </Button>
        </div>
        {copied ? (
          <p role="status" className="text-[14px] text-ink-2">
            {t('copied')}
          </p>
        ) : null}
        <Button data-testid="admin-setup-saved" className="print:hidden" onClick={goToDashboard}>
          {t('saved')}
        </Button>
      </>
    );
  }

  return (
    <>
      <p className="text-ink-2">{t('registerIntro')}</p>
      <TextField
        label={t('deviceLabel')}
        placeholder={t('devicePlaceholder')}
        value={deviceLabel}
        maxLength={60}
        data-testid="admin-setup-device-label"
        onChange={(event) => {
          setDeviceLabel(event.target.value);
        }}
      />
      <PasskeyButton
        mode="register"
        busyLabel={busyText}
        data-testid="admin-setup-register"
        deviceLabel={deviceLabel}
        onDone={(data: PasskeyDoneData) => {
          if (data.recoveryCodes !== undefined) setCodes(data.recoveryCodes);
          else goToDashboard();
        }}
      >
        {t('register')}
      </PasskeyButton>
    </>
  );
}

export function SetupFlow({ stage }: { stage: 'start' | 'register' }) {
  return stage === 'register' ? <RegisterStep /> : <StartStep />;
}
