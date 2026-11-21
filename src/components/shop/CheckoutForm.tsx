'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import {
  placeOrder,
  quoteCheckout,
  type QuoteCheckoutResult,
} from '@/app/[locale]/(shop)/checkout/actions';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Disclosure } from '@/components/ui/Disclosure';
import { Notice } from '@/components/ui/Notice';
import { RadioCard } from '@/components/ui/RadioCard';
import { SelectField } from '@/components/ui/SelectField';
import { Spinner } from '@/components/ui/Spinner';
import { TextArea } from '@/components/ui/TextArea';
import { TextField } from '@/components/ui/TextField';
import { lineKey } from '@/lib/cart/key';
import { whenCartDrawerClosed } from '@/lib/cart/drawer-wait';
import { clearCart, useCart, useCartReady } from '@/lib/cart/store';
import { formatMoney, type MoneyLocale } from '@/lib/money';
import { EMAIL_SHAPE } from '@/lib/validation/email-shape';
import CheckoutProblems from './CheckoutProblems';
import { OrderSummary, OrderTotals, type OrderSummaryLabels } from './OrderSummary';

export interface CheckoutConfig {
  locale: 'he' | 'en';
  /** Signed render time: bots post faster than the server allows (T075). */
  formToken: string;
  onlineEnabled: boolean;
  offlineEnabled: boolean;
  shippingAvailable: boolean;
  pickupAvailable: boolean;
  pickupInstructions: string | null;
  pickupInstructionsLang?: 'he' | undefined;
  /** Countries of the enabled zones, Israel first. */
  countries: { code: string; label: string }[];
  seller: { name: string; nameLang?: 'he' | undefined };
}

const DELIVERY_METHODS = ['shipping', 'pickup'] as const;
const PAYMENT_METHODS = ['online', 'offline'] as const;
type DeliveryMethod = (typeof DELIVERY_METHODS)[number];
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

interface Values {
  fullName: string;
  phone: string;
  email: string;
  deliveryMethod: DeliveryMethod;
  country: string;
  city: string;
  line1: string;
  line2: string;
  postalCode: string;
  paymentMethod: PaymentMethod;
  note: string;
  acceptTerms: boolean;
  marketingOptIn: boolean;
  honeypot: string;
}

/** The UI-only "Other country" choice: never sent as a real country. */
const OTHER = 'other';
const STORAGE_KEY = 'ac_checkout';

/** The control a server field error belongs to (`address.city` -> `checkout-city`). */
function fieldId(field: string): string {
  if (field === 'deliveryMethod') return 'checkout-delivery-shipping';
  if (field === 'paymentMethod') return 'checkout-payment-online';
  return `checkout-${field.split('.').pop() ?? field}`;
}

/** The free-text address fields (the country is a select of its own). */
const ADDRESS_FIELDS = [
  { key: 'city', autoComplete: 'address-level2', max: 100, numeric: false },
  { key: 'line1', autoComplete: 'address-line1', max: 200, numeric: false },
  { key: 'line2', autoComplete: 'address-line2', max: 200, numeric: false },
  { key: 'postalCode', autoComplete: 'postal-code', max: 12, numeric: true },
] as const;

function defaults(config: CheckoutConfig): Values {
  return {
    fullName: '',
    phone: '',
    email: '',
    deliveryMethod: config.shippingAvailable || !config.pickupAvailable ? 'shipping' : 'pickup',
    country: config.countries[0]?.code ?? 'IL',
    city: '',
    line1: '',
    line2: '',
    postalCode: '',
    paymentMethod: config.onlineEnabled || !config.offlineEnabled ? 'online' : 'offline',
    note: '',
    acceptTerms: false,
    marketingOptIn: false,
    honeypot: '',
  };
}

function restore(config: CheckoutConfig): Values {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Values>;
    return { ...defaults(config), ...saved };
  } catch {
    // Nothing saved, or storage unavailable: start empty.
    return defaults(config);
  }
}

/** Everything typed is kept, except the consent ticks: those are asked again every time. */
function save(values: Values): void {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...values,
        acceptTerms: undefined,
        marketingOptIn: undefined,
        honeypot: undefined,
      }),
    );
  } catch {
    // Storage unavailable: the form simply is not remembered.
  }
}

function forget(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to remove
  }
}

/** Light checks only: required, email shape, terms. Phone validity is the server's job. */
function validate(values: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.fullName.trim().length < 2) errors.fullName = 'errors.fullName';
  if (values.phone.trim() === '') errors.phone = 'errors.phone';
  if (!EMAIL_SHAPE.test(values.email.trim())) errors.email = 'errors.email';
  if (values.deliveryMethod === 'shipping') {
    if (values.country === '') errors['address.country'] = 'errors.country';
    if (values.city.trim() === '') errors['address.city'] = 'errors.city';
    if (values.line1.trim() === '') errors['address.line1'] = 'errors.line1';
  }
  if (!values.acceptTerms) errors.acceptTerms = 'errors.acceptTerms';
  return errors;
}

/** `checkout.errors.phone` (from the server) and `errors.phone` (from here) are the same key. */
function localKey(key: string): string {
  return key.startsWith('checkout.') ? key.slice('checkout.'.length) : key;
}

export function CheckoutForm({ config }: { config: CheckoutConfig }) {
  const ready = useCartReady();
  const { items } = useCart();
  const t = useTranslations('checkout');
  /** Set once an order is placed: clearing the cart must not send the visitor away from it. */
  const leavingRef = useRef(false);

  const empty = ready && items.length === 0;
  useEffect(() => {
    // An empty cart has nothing to check out: go to All pieces, but only once the cart drawer is
    // closed (the visitor may be looking at its empty state, FR-047).
    if (!empty) return;
    return whenCartDrawerClosed(() => {
      if (!leavingRef.current) window.location.replace(`/${config.locale}/shop`);
    });
  }, [empty, config.locale]);

  if (!ready || empty) {
    return <Pending label={t('loading')} />;
  }
  return <CheckoutBody config={config} leavingRef={leavingRef} />;
}

function CheckoutBody({
  config,
  leavingRef,
}: {
  config: CheckoutConfig;
  leavingRef: RefObject<boolean>;
}) {
  const locale = useLocale() as MoneyLocale;
  const t = useTranslations('checkout');
  const { items } = useCart();
  const [values, setValues] = useState<Values>(() => restore(config));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The last good answer, and the request it belongs to (`quoting` = the answer is not current).
  const [quote, setQuote] = useState<QuoteCheckoutResult | null>(null);
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);
  /** Bumped on every failed submit so focus moves to the summary even for the same errors. */
  const [attention, setAttention] = useState(0);
  const summaryRef = useRef<HTMLDetailsElement>(null);

  // Mirror the inputs for the way back from the payment page.
  useEffect(() => {
    if (!leavingRef.current) save(values);
  }, [values, leavingRef]);

  const itemsSignature = items.map((item) => `${lineKey(item)}x${String(item.quantity)}`).join('|');
  const otherCountry = values.deliveryMethod === 'shipping' && values.country === OTHER;
  const quoteKey = `${itemsSignature}#${values.deliveryMethod}#${values.country}`;
  const quoting = !otherCountry && answeredKey !== quoteKey;

  // Live totals (and the priced lines of the summary) for the chosen delivery and country.
  useEffect(() => {
    if (otherCountry) return;
    let current = true;
    quoteCheckout({
      // The device's lines also carry `addedAt`; the server's schema ignores it.
      items,
      deliveryMethod: values.deliveryMethod,
      country: values.deliveryMethod === 'shipping' ? values.country : undefined,
      locale: config.locale,
    })
      .then((result) => {
        if (!current) return;
        setAnsweredKey(quoteKey);
        if (result.ok) setQuote(result.data);
      })
      .catch(() => {
        if (current) setAnsweredKey(quoteKey);
      });
    return () => {
      current = false;
    };
    // `items` is covered by `itemsSignature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, config.locale, otherCountry]);

  // The collapsible summary is a `<details>` below 900 px and always open from there up.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)');
    const sync = (): void => {
      if (summaryRef.current && query.matches) summaryRef.current.open = true;
    };
    sync();
    query.addEventListener('change', sync);
    return () => {
      query.removeEventListener('change', sync);
    };
  }, [quote]);

  function set<K extends keyof Values>(key: K, value: Values[K]): void {
    setValues((previous) => ({ ...previous, [key]: value }));
  }
  const onText =
    (key: keyof Values) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void => {
      set(key, event.target.value as never);
    };

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    const clientErrors = validate(values);

    // "Other country" is refused here, without asking the server.
    if (otherCountry) {
      setErrors({ ...clientErrors, 'address.country': 'ships_israel_only' });
      setAttention((value) => value + 1);
      return;
    }

    setSubmitting(true);
    try {
      // Sent even with light errors: the server is stricter and also checks the phone number,
      // so every problem is shown at once. It can never place an order the form refused.
      const result = await placeOrder({
        // The device's lines also carry `addedAt`; the server's schema ignores it.
        items,
        fullName: values.fullName,
        phone: values.phone,
        email: values.email,
        deliveryMethod: values.deliveryMethod,
        address:
          values.deliveryMethod === 'shipping'
            ? {
                country: values.country,
                city: values.city,
                line1: values.line1,
                line2: values.line2,
                postalCode: values.postalCode,
              }
            : undefined,
        paymentMethod: values.paymentMethod,
        acceptTerms: values.acceptTerms,
        marketingOptIn: values.marketingOptIn,
        note: values.note,
        honeypot: values.honeypot,
        formToken: config.formToken,
        locale: config.locale,
      });
      if (result.ok) {
        if (values.paymentMethod === 'offline') {
          // The order is placed: the cart and the saved inputs go before the order page opens.
          leavingRef.current = true;
          clearCart();
          forget();
        }
        window.location.assign(result.redirect);
        return;
      }
      const serverErrors: Record<string, string> = {};
      for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
        serverErrors[field] = localKey(key);
      }
      setErrors({ ...clientErrors, ...serverErrors });
      setFormError(
        result.formError === undefined
          ? Object.keys({ ...clientErrors, ...serverErrors }).length === 0
            ? 'errors.generic'
            : null
          : localKey(result.formError),
      );
      setAttention((value) => value + 1);
    } catch {
      setErrors({});
      setFormError('errors.generic');
      setAttention((value) => value + 1);
    }
    setSubmitting(false);
  }

  const text = (key: string): string => t(key);
  /** The message of each field that has an error. */
  const shown: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(errors).map(([field, key]) => [field, text(key)]),
  );
  const summaryItems = Object.entries(errors).map(([field, key]) => ({
    fieldId: fieldId(field),
    message: text(key),
  }));

  const labels: OrderSummaryLabels = {
    subtotal: t('summary.subtotal'),
    delivery: t('summary.delivery'),
    free: t('summary.free'),
    total: t('summary.total'),
    prepTime: (prepTime) => t('summary.prepTime', { prepTime }),
    quantity: (count) => t('summary.quantity', { count }),
    option: (group, value) => t('summary.option', { group, value }),
  };
  const currency = quote?.currency ?? 'ILS';
  const submitLabel = values.paymentMethod === 'online' ? t('submit.online') : t('submit.offline');
  const flagged = (quote?.flags.length ?? 0) > 0;
  const problemMessage =
    formError !== null ? text(formError) : flagged ? t('lines_unavailable') : null;

  const summaryBody =
    quote === null ? (
      <Pending label={t('quoting')} />
    ) : (
      <OrderSummary
        lines={quote.lines}
        currency={currency}
        locale={locale}
        subtotalMinor={quote.subtotalMinor}
        deliveryFeeMinor={quote.deliveryFeeMinor}
        totalMinor={quote.totalMinor}
        labels={labels}
        totalsBusy={quoting ? <Spinner size={16} /> : null}
      />
    );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
      <form
        data-testid="checkout-form"
        noValidate
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="grid gap-5"
      >
        {problemMessage === null && summaryItems.length === 0 ? null : (
          <CheckoutProblems
            message={problemMessage}
            cartLink={
              problemMessage !== null && (formError === 'lines_unavailable' || flagged)
                ? { label: t('backToCart') }
                : null
            }
            summaryHeading={t('errorSummary')}
            summaryItems={summaryItems}
            focusToken={attention}
          />
        )}

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

        <Section title={t('sections.contact')}>
          <TextField
            id="checkout-fullName"
            data-testid="field-fullName"
            label={t('fields.fullName')}
            name="name"
            autoComplete="name"
            maxLength={100}
            value={values.fullName}
            onChange={onText('fullName')}
            error={shown.fullName}
          />
          <TextField
            id="checkout-phone"
            data-testid="field-phone"
            label={t('fields.phone')}
            name="tel"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            ltr
            maxLength={40}
            value={values.phone}
            onChange={onText('phone')}
            error={shown.phone}
          />
          <TextField
            id="checkout-email"
            data-testid="field-email"
            label={t('fields.email')}
            hint={t('fields.emailHint')}
            name="email"
            type="email"
            autoComplete="email"
            ltr
            maxLength={254}
            value={values.email}
            onChange={onText('email')}
            error={shown.email}
          />
        </Section>

        <Section title={t('sections.delivery')}>
          <fieldset className="grid gap-2.5">
            <legend className="sr-only">{t('sections.delivery')}</legend>
            {DELIVERY_METHODS.map((method) =>
              (method === 'shipping' ? config.shippingAvailable : config.pickupAvailable) ? (
                <RadioCard
                  key={method}
                  id={`checkout-delivery-${method}`}
                  data-testid={`delivery-${method}`}
                  name="deliveryMethod"
                  value={method}
                  checked={values.deliveryMethod === method}
                  onChange={() => {
                    set('deliveryMethod', method);
                  }}
                  title={t(`delivery.${method}`)}
                  trailing={
                    method === 'pickup' ? (
                      t('summary.free')
                    ) : quote !== null && values.deliveryMethod === 'shipping' ? (
                      <DeliveryFee quote={quote} locale={locale} free={t('summary.free')} />
                    ) : null
                  }
                  description={
                    method === 'pickup' && config.pickupInstructions !== null ? (
                      <span
                        data-testid="pickup-instructions"
                        lang={config.pickupInstructionsLang}
                        dir={config.pickupInstructionsLang === undefined ? undefined : 'auto'}
                        className="whitespace-pre-line"
                      >
                        {config.pickupInstructions}
                      </span>
                    ) : undefined
                  }
                />
              ) : null,
            )}
            {errors.deliveryMethod === undefined ? null : (
              <p className="text-[13px] text-alert">{text(errors.deliveryMethod)}</p>
            )}
          </fieldset>

          {values.deliveryMethod === 'shipping' ? (
            <div className="grid gap-4">
              <SelectField
                id="checkout-country"
                data-testid="field-country"
                label={t('fields.country')}
                name="country"
                autoComplete="country"
                value={values.country}
                onChange={onText('country')}
                error={shown['address.country']}
              >
                {config.countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.label}
                  </option>
                ))}
                <option value={OTHER}>{t('fields.otherCountry')}</option>
              </SelectField>
              {otherCountry ? (
                <div data-testid="country-other-message">
                  <Notice tone="info" role="status">
                    {t.rich('otherCountryMessage', {
                      contact: (chunks) => (
                        <Link
                          href={`/${config.locale}/contact`}
                          className="font-bold underline underline-offset-[3px]"
                        >
                          {chunks}
                        </Link>
                      ),
                    })}
                  </Notice>
                </div>
              ) : null}
              {ADDRESS_FIELDS.map((field) => (
                <TextField
                  key={field.key}
                  id={`checkout-${field.key}`}
                  data-testid={`field-${field.key}`}
                  label={t(`fields.${field.key}`)}
                  name={field.autoComplete}
                  autoComplete={field.autoComplete}
                  inputMode={field.numeric ? 'numeric' : undefined}
                  ltr={field.numeric}
                  maxLength={field.max}
                  value={values[field.key]}
                  onChange={onText(field.key)}
                  error={shown[`address.${field.key}`]}
                />
              ))}
            </div>
          ) : null}
        </Section>

        <Section title={t('sections.payment')}>
          <fieldset className="grid gap-2.5">
            <legend className="sr-only">{t('sections.payment')}</legend>
            {PAYMENT_METHODS.map((method) =>
              (method === 'online' ? config.onlineEnabled : config.offlineEnabled) ? (
                <RadioCard
                  key={method}
                  id={`checkout-payment-${method}`}
                  data-testid={`payment-${method}`}
                  name="paymentMethod"
                  value={method}
                  checked={values.paymentMethod === method}
                  onChange={() => {
                    set('paymentMethod', method);
                  }}
                  title={t(`payment.${method}`)}
                  description={t(`payment.${method}Hint`)}
                />
              ) : null,
            )}
            {errors.paymentMethod === undefined ? null : (
              <p className="text-[13px] text-alert">{text(errors.paymentMethod)}</p>
            )}
          </fieldset>
        </Section>

        <Section title={t('sections.note')} bare>
          <Disclosure title={t('note.toggle')}>
            <TextArea
              id="checkout-note"
              data-testid="field-note"
              label={t('note.label')}
              name="note"
              maxLength={1000}
              value={values.note}
              onChange={onText('note')}
              error={shown.note}
            />
          </Disclosure>
        </Section>

        <Section title={t('sections.consent')}>
          <Checkbox
            id="checkout-acceptTerms"
            data-testid="accept-terms"
            name="acceptTerms"
            checked={values.acceptTerms}
            onChange={(event) => {
              set('acceptTerms', event.target.checked);
            }}
            label={t.rich('terms.label', {
              terms: (chunks) => (
                <Link
                  href={`/${config.locale}/pages/terms`}
                  target="_blank"
                  rel="noopener"
                  className="font-bold underline underline-offset-[3px]"
                >
                  {chunks}
                  <span className="sr-only"> {t('terms.newTab')}</span>
                </Link>
              ),
            })}
            error={shown.acceptTerms}
          />
          <Checkbox
            id="checkout-marketingOptIn"
            data-testid="marketing-opt-in"
            name="marketingOptIn"
            checked={values.marketingOptIn}
            onChange={(event) => {
              set('marketingOptIn', event.target.checked);
            }}
            label={t('marketing.label')}
            hint={t('marketing.hint')}
          />
        </Section>

        <div className="grid gap-4 rounded-card border border-line bg-paper p-[18px]">
          <p className="text-[13px] leading-relaxed text-ink-2">
            {t.rich('collection', {
              privacy: (chunks) => (
                <Link
                  href={`/${config.locale}/pages/privacy`}
                  className="underline underline-offset-[3px]"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
          <p className="text-[13px] text-ink-2">
            {t('seller', { name: config.seller.name })}
          </p>
          <div className="lg:hidden" aria-live="polite">
            {quote === null ? null : (
              <OrderTotals
                currency={currency}
                locale={locale}
                subtotalMinor={quote.subtotalMinor}
                deliveryFeeMinor={quote.deliveryFeeMinor}
                totalMinor={quote.totalMinor}
                labels={labels}
                totalsBusy={quoting ? <Spinner size={16} /> : null}
              />
            )}
          </div>
          <Button type="submit" data-testid="place-order" busy={submitting} busyLabel={t('busy')}>
            {submitLabel}
          </Button>
        </div>
      </form>
      <aside
        aria-label={t('summary.label')}
        className="order-first rounded-card border border-line bg-paper p-[18px] lg:sticky lg:top-[calc(var(--header-h)+var(--logo-overhang)+16px)] lg:order-none"
      >
        <details ref={summaryRef} className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-bold lg:hidden [&::-webkit-details-marker]:hidden">
            <span>
              {t('summary.toggle')}
              {quote === null ? null : (
                <>
                  {' · '}
                  <bdi className="tnum">{formatMoney(quote.totalMinor, currency, locale)}</bdi>
                </>
              )}
            </span>
          </summary>
          <h2 className="mb-3 hidden text-lg font-extrabold lg:block">{t('summary.label')}</h2>
          <div className="mt-3 lg:mt-0">{summaryBody}</div>
        </details>
      </aside>
    </div>
  );
}

/** A placeholder while the cart is read or the totals are worked out. */
function Pending({ label }: { label: string }) {
  return (
    <p
      role="status"
      aria-busy="true"
      className="rounded-card bg-photo p-6 motion-safe:animate-pulse"
    >
      {label}
    </p>
  );
}

function Section({
  title,
  bare = false,
  children,
}: {
  title: string;
  /** No inner gap (a lone disclosure). */
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-paper p-[18px]">
      <h2 className="mb-3 text-lg font-extrabold">{title}</h2>
      <div className={bare ? undefined : 'grid gap-4'}>{children}</div>
    </section>
  );
}

function DeliveryFee({
  quote,
  locale,
  free,
}: {
  quote: QuoteCheckoutResult;
  locale: MoneyLocale;
  free: string;
}) {
  return quote.deliveryFeeMinor === 0 ? (
    <span>{free}</span>
  ) : (
    <bdi className="tnum">{formatMoney(quote.deliveryFeeMinor, quote.currency, locale)}</bdi>
  );
}
