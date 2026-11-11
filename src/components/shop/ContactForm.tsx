'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import { submitContact } from '@/app/[locale]/(shop)/contact/actions';
import { Button } from '@/components/ui/Button';
import { ErrorSummary } from '@/components/ui/ErrorSummary';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { TextArea } from '@/components/ui/TextArea';
import { TextField } from '@/components/ui/TextField';
import { EMAIL_SHAPE } from '@/lib/validation/email-shape';

const SUMMARY_ID = 'contact-errors';
const MESSAGE_MAX = 5000;
/** The counter shows only this close to the limit (storefront.md §8.10). */
const COUNTER_FROM = 4500;
const FIELD_IDS = { name: 'contact-name', email: 'contact-email', message: 'contact-message' };

interface Values {
  name: string;
  email: string;
  message: string;
  honeypot: string;
}

type Errors = Partial<Record<'name' | 'email' | 'message', string>>;

/** Light checks, the same rules as the server's: it stays the authority. */
function validate(values: Values): Errors {
  const errors: Errors = {};
  const name = values.name.trim();
  const message = values.message.trim();
  if (name.length < 2 || name.length > 100) errors.name = 'errors.name';
  if (values.email.trim().length > 254 || !EMAIL_SHAPE.test(values.email.trim())) {
    errors.email = 'errors.email';
  }
  if (message.length < 10) errors.message = 'errors.message_short';
  else if (message.length > MESSAGE_MAX) errors.message = 'errors.message_long';
  return errors;
}

/** `contact.errors.name` (from the server) and `errors.name` (from here) are the same key. */
function localKey(key: string): string {
  return key.startsWith('contact.') ? key.slice('contact.'.length) : key;
}

/**
 * The contact form (storefront.md §8.10). On success the form is replaced by a status panel that
 * takes focus; after a failed submit the error summary (or the alert) takes it.
 */
export function ContactForm({ formToken, locale }: { formToken: string; locale: 'he' | 'en' }) {
  const t = useTranslations('contact');
  const [values, setValues] = useState<Values>({ name: '', email: '', message: '', honeypot: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<{ key: string; minutes?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  /** Bumped on every failed submit so focus moves again even for the same errors. */
  const [attention, setAttention] = useState(0);
  const sentRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  const hasFieldErrors = Object.keys(errors).length > 0;
  useEffect(() => {
    if (attention === 0) return;
    if (hasFieldErrors) document.getElementById(SUMMARY_ID)?.focus();
    else noticeRef.current?.scrollIntoView({ block: 'center' });
    // Only a new failed submit moves focus, not every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attention]);

  const onText =
    (key: keyof Values) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      setValues((previous) => ({ ...previous, [key]: event.target.value }));
    };

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setNotice(null);
    const clientErrors = validate(values);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setAttention((value) => value + 1);
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitContact({
        name: values.name,
        email: values.email,
        message: values.message,
        honeypot: values.honeypot,
        formToken,
        locale,
      });
      if (result.ok) {
        setErrors({});
        setSent(true);
        return;
      }
      const serverErrors: Errors = {};
      for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
        if (field === 'name' || field === 'email' || field === 'message') {
          serverErrors[field] = localKey(key);
        }
      }
      setErrors(serverErrors);
      if (result.formError !== undefined) {
        const minutes = result.retryAfterMinutes;
        setNotice({
          key: localKey(result.formError),
          ...(minutes === undefined ? {} : { minutes }),
        });
      } else if (Object.keys(serverErrors).length === 0) {
        setNotice({ key: 'errors.generic' });
      }
      setAttention((value) => value + 1);
    } catch {
      setErrors({});
      setNotice({ key: 'errors.generic' });
      setAttention((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div
        ref={sentRef}
        tabIndex={-1}
        role="status"
        data-testid="contact-sent"
        className="flex items-start gap-2.5 rounded-2xl bg-sun-soft px-3.5 py-3.5 text-ink"
      >
        <Icon name="check" className="mt-0.5" />
        <p className="min-w-0 flex-1 font-bold">{t('sent')}</p>
      </div>
    );
  }

  const summaryItems = (Object.keys(errors) as (keyof Errors)[]).map((field) => ({
    fieldId: FIELD_IDS[field],
    message: t(errors[field] ?? 'errors.generic'),
  }));
  const rateLimited = notice?.key === 'errors.rate_limited';
  const length = values.message.length;

  return (
    <form
      data-testid="contact-form"
      method="post"
      noValidate
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      className="grid gap-4"
    >
      {notice === null ? null : (
        <div ref={noticeRef} data-testid={rateLimited ? 'contact-rate-limited' : 'contact-notice'}>
          <Notice tone="alert" role="alert">
            <p className="font-bold">
              {t(notice.key, notice.minutes === undefined ? {} : { minutes: notice.minutes })}
            </p>
          </Notice>
        </div>
      )}
      <ErrorSummary
        id={SUMMARY_ID}
        data-testid="contact-errors"
        heading={t('errorSummary')}
        items={summaryItems}
      />

      {/* Honeypot: hidden from people and assistive technology; bots fill it. */}
      <div aria-hidden="true" className="sr-only">
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={values.honeypot}
          onChange={onText('honeypot')}
        />
      </div>

      <TextField
        id={FIELD_IDS.name}
        data-testid="field-name"
        label={t('fields.name')}
        name="name"
        autoComplete="name"
        maxLength={100}
        value={values.name}
        onChange={onText('name')}
        error={errors.name === undefined ? undefined : t(errors.name)}
      />
      <TextField
        id={FIELD_IDS.email}
        data-testid="field-email"
        label={t('fields.email')}
        name="email"
        type="email"
        ltr
        autoComplete="email"
        inputMode="email"
        value={values.email}
        onChange={onText('email')}
        error={errors.email === undefined ? undefined : t(errors.email)}
      />
      <TextArea
        id={FIELD_IDS.message}
        data-testid="field-message"
        label={t('fields.message')}
        name="message"
        rows={6}
        value={values.message}
        onChange={onText('message')}
        hint={
          length >= COUNTER_FROM
            ? t('counter', {
                count: length.toLocaleString(locale),
                max: MESSAGE_MAX.toLocaleString(locale),
              })
            : undefined
        }
        error={errors.message === undefined ? undefined : t(errors.message)}
      />
      <Button type="submit" data-testid="contact-submit" busy={submitting} busyLabel={t('busy')}>
        {t('submit')}
      </Button>
    </form>
  );
}
