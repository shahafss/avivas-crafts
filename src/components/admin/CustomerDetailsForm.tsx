'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorSummary } from '@/components/ui/ErrorSummary';
import { FormField } from '@/components/ui/FormField';
import { Notice } from '@/components/ui/Notice';
import { Toast } from '@/components/ui/Toast';
import type { ActionResult } from '@/server/catalog/result';
import { useHydrated } from './useHydrated';

/** The Server Action of `orders/[id]/actions.ts`, passed in by the page. */
export interface CustomerDetailsApi {
  updateOrderCustomer: (input: {
    orderId: string;
    fullName: string;
    phone: string;
    email: string;
    address?: { city: string; line1: string; line2?: string; postalCode?: string };
  }) => Promise<
    ActionResult<{ changed: boolean; fields: ('name' | 'phone' | 'email' | 'address')[] }>
  >;
}

export interface CustomerDetailsFormProps {
  orderId: string;
  fullName: string;
  phone: string;
  email: string;
  /** The stored address of a shipping order; `null` for pickup (no address fields). */
  address: {
    country: string;
    city: string;
    line1: string;
    line2: string;
    postalCode: string;
  } | null;
  actions: CustomerDetailsApi;
}

type Values = {
  fullName: string;
  phone: string;
  email: string;
  city: string;
  line1: string;
  line2: string;
  postalCode: string;
};

/** The error paths of the action, in page order, with the control each one belongs to. */
const FIELDS = [
  ['fullName', 'fullName'],
  ['phone', 'phone'],
  ['email', 'email'],
  ['address.city', 'city'],
  ['address.line1', 'line1'],
  ['address.line2', 'line2'],
  ['address.postalCode', 'postalCode'],
] as const;

const ID_PREFIX = 'customer-field-';

export function CustomerDetailsForm({
  orderId,
  fullName,
  phone,
  email,
  address,
  actions,
}: CustomerDetailsFormProps) {
  const t = useTranslations('admin.orders.customer');
  const messages = useTranslations();
  const router = useRouter();
  const hydrated = useHydrated();
  const busyRef = useRef(false);
  const stored: Values = {
    fullName,
    phone,
    email,
    city: address?.city ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    postalCode: address?.postalCode ?? '',
  };
  const storedKey = JSON.stringify(stored);
  const [values, setValues] = useState<Values>(stored);
  // After a save the page shows the stored (normalised) values: take them over.
  const [seenKey, setSeenKey] = useState(storedKey);
  if (seenKey !== storedKey) {
    setSeenKey(storedKey);
    setValues(stored);
  }
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failures, setFailures] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  // A failed save moves focus to the summary, so the problems are read out first.
  useEffect(() => {
    if (failures > 0) document.getElementById('customer-error-summary')?.focus();
  }, [failures]);

  const shipping = address !== null;
  const visible = FIELDS.filter(([path]) => shipping || !path.startsWith('address.'));
  const errorOf = (path: string): string | undefined => {
    const key = errors[path];
    return key === undefined ? undefined : messages(key);
  };

  function setValue(name: keyof Values, value: string): void {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    setErrors({});
    try {
      const result = await actions.updateOrderCustomer({
        orderId,
        fullName: values.fullName,
        phone: values.phone,
        email: values.email,
        ...(shipping
          ? {
              address: {
                city: values.city,
                line1: values.line1,
                line2: values.line2,
                postalCode: values.postalCode,
              },
            }
          : {}),
      });
      if (result.ok) {
        setToast(t('saved'));
        router.refresh();
        return;
      }
      if (result.fieldErrors !== undefined && Object.keys(result.fieldErrors).length > 0) {
        setErrors(result.fieldErrors);
        setFailures((count) => count + 1);
        return;
      }
      const formError = result.formError ?? 'admin.failed';
      setNotice(messages(formError));
      if (formError !== 'admin.failed') router.refresh();
    } catch {
      setNotice(messages('admin.failed'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (!hydrated) return null;

  const shown = {
    fullName: errorOf('fullName'),
    phone: errorOf('phone'),
    email: errorOf('email'),
    city: errorOf('address.city'),
    line1: errorOf('address.line1'),
    line2: errorOf('address.line2'),
    postalCode: errorOf('address.postalCode'),
  };
  const summaryItems = visible
    .filter(([path]) => errors[path] !== undefined)
    .map(([path, name]) => ({ fieldId: `${ID_PREFIX}${name}`, message: errorOf(path) ?? '' }));
  const countryName =
    address === null ? '' : address.country === 'IL' ? t('countryName.IL') : address.country;

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="grid gap-3"
      noValidate
      data-testid="customer-form"
    >
      <p>{t('intro')}</p>
      <ErrorSummary
        id="customer-error-summary"
        heading={t('errorSummary')}
        items={summaryItems}
        data-testid="customer-error-summary"
      />
      {notice === null ? null : (
        <Notice tone="alert" role="alert">
          {notice}
        </Notice>
      )}
      <FormField
        id={`${ID_PREFIX}fullName`}
        label={t('fullName')}
        autoComplete="off"
        value={values.fullName}
        error={shown.fullName}
        onChange={(event) => {
          setValue('fullName', event.target.value);
        }}
        data-testid="customer-field-fullName"
      />
      <FormField
        id={`${ID_PREFIX}phone`}
        label={t('phone')}
        type="tel"
        ltr
        autoComplete="off"
        value={values.phone}
        error={shown.phone}
        onChange={(event) => {
          setValue('phone', event.target.value);
        }}
        data-testid="customer-field-phone"
      />
      <FormField
        id={`${ID_PREFIX}email`}
        label={t('email')}
        type="email"
        ltr
        autoComplete="off"
        value={values.email}
        error={shown.email}
        onChange={(event) => {
          setValue('email', event.target.value);
        }}
        data-testid="customer-field-email"
      />
      {shipping ? (
        <>
          <p className="grid gap-0.5">
            <span className="text-sm font-bold text-ink">{t('country')}</span>
            <bdi data-testid="customer-country">{countryName}</bdi>
          </p>
          <FormField
            id={`${ID_PREFIX}city`}
            label={t('city')}
            autoComplete="off"
            value={values.city}
            error={shown.city}
            onChange={(event) => {
              setValue('city', event.target.value);
            }}
            data-testid="customer-field-city"
          />
          <FormField
            id={`${ID_PREFIX}line1`}
            label={t('line1')}
            autoComplete="off"
            value={values.line1}
            error={shown.line1}
            onChange={(event) => {
              setValue('line1', event.target.value);
            }}
            data-testid="customer-field-line1"
          />
          <FormField
            id={`${ID_PREFIX}line2`}
            label={t('line2')}
            autoComplete="off"
            value={values.line2}
            error={shown.line2}
            onChange={(event) => {
              setValue('line2', event.target.value);
            }}
            data-testid="customer-field-line2"
          />
          <FormField
            id={`${ID_PREFIX}postalCode`}
            label={t('postalCode')}
            inputMode="numeric"
            ltr
            autoComplete="off"
            value={values.postalCode}
            error={shown.postalCode}
            onChange={(event) => {
              setValue('postalCode', event.target.value);
            }}
            data-testid="customer-field-postalCode"
          />
        </>
      ) : null}
      <div>
        <Button type="submit" busy={busy} busyLabel={t('save')} data-testid="customer-save">
          {t('save')}
        </Button>
      </div>
      <Toast message={toast} onDismiss={dismissToast} />
    </form>
  );
}
