'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField } from '@/components/ui/FormField';
import { Notice } from '@/components/ui/Notice';
import { Toast } from '@/components/ui/Toast';
import { deltaMajorToMinor, minorToMajorText } from '@/lib/money-input';
import type { SettingsInput, ZoneInput } from '@/lib/validation/settings';
import type { ActionResult } from '@/server/catalog/result';
import type { SettingsFailure, UsdBlocker } from '@/server/settings/settings';
import { useHydrated } from './useHydrated';

export interface SettingsData {
  shopNameHe: string;
  shopNameEn: string | null;
  onlinePaymentEnabled: boolean;
  offlinePaymentEnabled: boolean;
  offlineInstructionsHe: string | null;
  offlineInstructionsEn: string | null;
  pickupInstructionsHe: string | null;
  pickupInstructionsEn: string | null;
  businessNameHe: string;
  businessNameEn: string | null;
  businessRegNumber: string;
  businessEmail: string;
  businessPhone: string;
  businessAddressHe: string;
  businessAddressEn: string | null;
  notificationEmails: string[];
}

export interface ZoneData {
  id: string;
  code: string;
  nameHe: string;
  currency: 'ILS' | 'USD';
  enabled: boolean;
  shippingEnabled: boolean;
  pickupEnabled: boolean;
  shippingFeeMinor: number;
  freeShippingThresholdMinor: number | null;
  countries: string[];
}

export interface SettingsActions {
  updateSettings: (input: SettingsInput) => Promise<ActionResult | SettingsFailure>;
  updateZone: (input: ZoneInput) => Promise<ActionResult | SettingsFailure>;
}

type Failure = Extract<ActionResult, { ok: false }> & { products?: UsdBlocker[] };

interface Feedback {
  message: string;
  tone: 'success' | 'error';
}

const CARD = 'grid gap-4 rounded-card border border-line bg-panel p-4 sm:p-5';

function Section({
  title,
  hint,
  onSubmit,
  saving,
  saveLabel,
  'data-testid': testId,
  children,
}: {
  title: string;
  hint?: string;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  saving: boolean;
  saveLabel: string;
  'data-testid': string;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className={CARD} data-testid={testId}>
      <div>
        <h2 className="text-xl font-extrabold">{title}</h2>
        {hint === undefined ? null : <p className="mt-1 text-[15px] text-ink-2">{hint}</p>}
      </div>
      {children}
      <div>
        <Button type="submit" variant="secondary" busy={saving} busyLabel={saveLabel}>
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * One save at a time per section. Returns the failure (with its message) or null on success;
 * the page is refreshed after a success so every number comes from the server.
 */
function useSaver(notify: (message: string, tone: 'success' | 'error') => void) {
  const t = useTranslations();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<UsdBlocker[]>([]);

  async function save(
    run: () => Promise<ActionResult | SettingsFailure>,
    successMessage: string,
  ): Promise<boolean> {
    setSaving(true);
    setErrors({});
    setFormError(null);
    setBlockers([]);
    try {
      const result = await run();
      if (result.ok) {
        notify(successMessage, 'success');
        router.refresh();
        return true;
      }
      const failure = result as Failure;
      const fieldErrors: Record<string, string> = {};
      for (const [field, key] of Object.entries(failure.fieldErrors ?? {})) {
        fieldErrors[field] = t(key);
      }
      setErrors(fieldErrors);
      if (failure.formError !== undefined) setFormError(t(failure.formError));
      else if (Object.keys(fieldErrors).length === 0) setFormError(t('admin.failed'));
      setBlockers(failure.products ?? []);
      return false;
    } catch {
      setFormError(t('admin.failed'));
      return false;
    } finally {
      setSaving(false);
    }
  }
  return { saving, errors, formError, blockers, save };
}

function FormAlert({ message }: { message: string | null }) {
  return message === null ? null : (
    <Notice tone="alert" role="alert">
      {message}
    </Notice>
  );
}

function BlockerList({ blockers }: { blockers: UsdBlocker[] }) {
  const t = useTranslations('admin.settings.zones');
  if (blockers.length === 0) return null;
  return (
    <div data-testid="usd-blockers" className="grid gap-2">
      <p className="font-bold">{t('blockedTitle')}</p>
      <p className="text-[15px] text-ink-2">{t('blockedText')}</p>
      <ul className="grid gap-1 ps-5 text-[15px]">
        {blockers.map((blocker) => (
          <li key={blocker.id} className="list-disc">
            <Link
              href={`/admin/products/${blocker.id}`}
              prefetch={false}
              className="underline underline-offset-[3px]"
            >
              {blocker.nameHe}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- sections

function ShopNameSection({
  settings,
  actions,
  notify,
}: {
  settings: SettingsData;
  actions: SettingsActions;
  notify: (message: string, tone: 'success' | 'error') => void;
}) {
  const t = useTranslations('admin.settings');
  const [nameHe, setNameHe] = useState(settings.shopNameHe);
  const [nameEn, setNameEn] = useState(settings.shopNameEn ?? '');
  const { saving, errors, formError, save } = useSaver(notify);
  return (
    <Section
      title={t('shop.title')}
      hint={t('shop.hint')}
      saving={saving}
      saveLabel={t('save')}
      data-testid="settings-shop"
      onSubmit={(event) => {
        event.preventDefault();
        void save(
          () => actions.updateSettings({ shopNameHe: nameHe, shopNameEn: nameEn }),
          t('toast.saved'),
        );
      }}
    >
      <FormAlert message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t('shop.nameHe')}
          value={nameHe}
          maxLength={60}
          onChange={(event) => {
            setNameHe(event.target.value);
          }}
          error={errors.shopNameHe}
          data-testid="settings-shop-name-he"
        />
        <FormField
          label={t('shop.nameEn')}
          value={nameEn}
          maxLength={60}
          dir="ltr"
          onChange={(event) => {
            setNameEn(event.target.value);
          }}
          error={errors.shopNameEn}
          data-testid="settings-shop-name-en"
        />
      </div>
    </Section>
  );
}

function PaymentSection({
  settings,
  cardPaymentAvailable,
  actions,
  notify,
}: {
  settings: SettingsData;
  cardPaymentAvailable: boolean;
  actions: SettingsActions;
  notify: (message: string, tone: 'success' | 'error') => void;
}) {
  const t = useTranslations('admin.settings');
  // With no card provider the shop takes offline payment only (contracts/payment-mode.md): the
  // stored flags are not shown, and the values below are what a save submits.
  const [online, setOnline] = useState(cardPaymentAvailable && settings.onlinePaymentEnabled);
  const [offline, setOffline] = useState(!cardPaymentAvailable || settings.offlinePaymentEnabled);
  // Plain text on purpose (003 research R1): these texts are shown as plain text in the checkout,
  // on the order page and in emails, so the Markdown editor of the content screens is not used.
  const [instructionsHe, setInstructionsHe] = useState(settings.offlineInstructionsHe ?? '');
  const [instructionsEn, setInstructionsEn] = useState(settings.offlineInstructionsEn ?? '');
  const { saving, errors, formError, save } = useSaver(notify);
  return (
    <Section
      title={t('payment.title')}
      hint={t('payment.hint')}
      saving={saving}
      saveLabel={t('save')}
      data-testid="settings-payment"
      onSubmit={(event) => {
        event.preventDefault();
        void save(
          () =>
            actions.updateSettings({
              onlinePaymentEnabled: online,
              offlinePaymentEnabled: offline,
              offlineInstructionsHe: instructionsHe,
              offlineInstructionsEn: instructionsEn,
            }),
          t('toast.saved'),
        );
      }}
    >
      <FormAlert message={formError} />
      <div className="grid gap-1">
        <Checkbox
          label={t('payment.online')}
          checked={online}
          disabled={!cardPaymentAvailable}
          hint={cardPaymentAvailable ? undefined : t('payment.cardNotSetUp')}
          onChange={(event) => {
            setOnline(event.target.checked);
          }}
          data-testid="settings-online-payment"
        />
        <Checkbox
          label={t('payment.offline')}
          checked={offline}
          disabled={!cardPaymentAvailable}
          hint={cardPaymentAvailable ? undefined : t('payment.offlineMustStayOn')}
          onChange={(event) => {
            setOffline(event.target.checked);
          }}
          data-testid="settings-offline-payment"
        />
      </div>
      <FormField
        as="textarea"
        label={t('payment.instructionsHe')}
        hint={t('payment.instructionsHint')}
        value={instructionsHe}
        maxLength={5000}
        onChange={(event) => {
          setInstructionsHe(event.target.value);
        }}
        error={errors.offlineInstructionsHe}
        data-testid="settings-offline-instructions-he"
      />
      <FormField
        as="textarea"
        label={t('payment.instructionsEn')}
        value={instructionsEn}
        maxLength={5000}
        dir="ltr"
        onChange={(event) => {
          setInstructionsEn(event.target.value);
        }}
        error={errors.offlineInstructionsEn}
        data-testid="settings-offline-instructions-en"
      />
    </Section>
  );
}

function PickupSection({
  settings,
  actions,
  notify,
}: {
  settings: SettingsData;
  actions: SettingsActions;
  notify: (message: string, tone: 'success' | 'error') => void;
}) {
  const t = useTranslations('admin.settings');
  const [he, setHe] = useState(settings.pickupInstructionsHe ?? '');
  const [en, setEn] = useState(settings.pickupInstructionsEn ?? '');
  const { saving, errors, formError, save } = useSaver(notify);
  return (
    <Section
      title={t('pickup.title')}
      hint={t('pickup.hint')}
      saving={saving}
      saveLabel={t('save')}
      data-testid="settings-pickup"
      onSubmit={(event) => {
        event.preventDefault();
        void save(
          () => actions.updateSettings({ pickupInstructionsHe: he, pickupInstructionsEn: en }),
          t('toast.saved'),
        );
      }}
    >
      <FormAlert message={formError} />
      <FormField
        as="textarea"
        label={t('pickup.he')}
        value={he}
        maxLength={5000}
        onChange={(event) => {
          setHe(event.target.value);
        }}
        error={errors.pickupInstructionsHe}
        data-testid="settings-pickup-he"
      />
      <FormField
        as="textarea"
        label={t('pickup.en')}
        value={en}
        maxLength={5000}
        dir="ltr"
        onChange={(event) => {
          setEn(event.target.value);
        }}
        error={errors.pickupInstructionsEn}
        data-testid="settings-pickup-en"
      />
    </Section>
  );
}

function ZoneCard({
  zone,
  blockers,
  actions,
  notify,
}: {
  zone: ZoneData;
  blockers: UsdBlocker[];
  actions: SettingsActions;
  notify: (message: string, tone: 'success' | 'error') => void;
}) {
  const t = useTranslations('admin.settings');
  const israel = zone.code === 'IL';
  const [enabled, setEnabled] = useState(zone.enabled);
  const [shipping, setShipping] = useState(zone.shippingEnabled);
  const [pickup, setPickup] = useState(zone.pickupEnabled);
  const [fee, setFee] = useState(minorToMajorText(zone.shippingFeeMinor));
  const [threshold, setThreshold] = useState(minorToMajorText(zone.freeShippingThresholdMinor));
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const { saving, errors, formError, blockers: refused, save } = useSaver(notify);
  const symbol = zone.currency === 'ILS' ? '₪' : '$';

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const feeMinor = deltaMajorToMinor(fee);
    const thresholdMinor = threshold.trim() === '' ? null : deltaMajorToMinor(threshold);
    const bad: Record<string, string> = {};
    if (feeMinor === null || feeMinor < 0) bad.shippingFeeMinor = t('errors.fee');
    if (thresholdMinor !== null && thresholdMinor < 0)
      bad.freeShippingThresholdMinor = t('errors.threshold');
    if (threshold.trim() !== '' && thresholdMinor === null) {
      bad.freeShippingThresholdMinor = t('errors.threshold');
    }
    setLocalErrors(bad);
    if (Object.keys(bad).length > 0) return;
    void save(
      () =>
        actions.updateZone({
          zoneId: zone.id,
          enabled: israel ? true : enabled,
          shippingEnabled: shipping,
          pickupEnabled: israel ? pickup : false,
          shippingFeeMinor: feeMinor ?? 0,
          freeShippingThresholdMinor: thresholdMinor,
        }),
      t('toast.zoneSaved'),
    );
  }

  const shownBlockers = refused.length > 0 ? refused : !zone.enabled ? blockers : [];
  return (
    <form
      onSubmit={submit}
      noValidate
      className={CARD}
      data-testid="settings-zone"
      data-zone={zone.code}
    >
      <div>
        <h3 className="text-lg font-extrabold">
          {zone.nameHe}{' '}
          <span className="text-[15px] font-medium text-ink-2">({zone.currency})</span>
        </h3>
        <p className="mt-1 text-[15px] text-ink-2">
          {t('zones.countries', { countries: zone.countries.join(', ') })}
        </p>
      </div>
      <FormAlert message={formError} />
      <div className="grid gap-1">
        {israel ? (
          <p className="text-[15px] text-ink-2">{t('zones.israelEnabled')}</p>
        ) : (
          <Checkbox
            label={t('zones.enabled')}
            checked={enabled}
            onChange={(event) => {
              setEnabled(event.target.checked);
            }}
            data-testid="zone-enabled"
          />
        )}
        <Checkbox
          label={t('zones.shipping')}
          checked={shipping}
          onChange={(event) => {
            setShipping(event.target.checked);
          }}
          data-testid="zone-shipping"
        />
        {israel ? (
          <Checkbox
            label={t('zones.pickup')}
            checked={pickup}
            onChange={(event) => {
              setPickup(event.target.checked);
            }}
            data-testid="zone-pickup"
          />
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t('zones.fee', { symbol })}
          value={fee}
          inputMode="decimal"
          dir="ltr"
          onChange={(event) => {
            setFee(event.target.value);
          }}
          error={localErrors.shippingFeeMinor ?? errors.shippingFeeMinor}
          data-testid="zone-fee"
        />
        <FormField
          label={t('zones.threshold', { symbol })}
          hint={t('zones.thresholdHint')}
          value={threshold}
          inputMode="decimal"
          dir="ltr"
          onChange={(event) => {
            setThreshold(event.target.value);
          }}
          error={localErrors.freeShippingThresholdMinor ?? errors.freeShippingThresholdMinor}
          data-testid="zone-threshold"
        />
      </div>
      <BlockerList blockers={shownBlockers} />
      <div>
        <Button type="submit" variant="secondary" busy={saving} busyLabel={t('save')}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

function BusinessSection({
  settings,
  actions,
  notify,
}: {
  settings: SettingsData;
  actions: SettingsActions;
  notify: (message: string, tone: 'success' | 'error') => void;
}) {
  const t = useTranslations('admin.settings');
  const [values, setValues] = useState({
    businessNameHe: settings.businessNameHe,
    businessNameEn: settings.businessNameEn ?? '',
    businessRegNumber: settings.businessRegNumber,
    businessEmail: settings.businessEmail,
    businessPhone: settings.businessPhone,
    businessAddressHe: settings.businessAddressHe,
    businessAddressEn: settings.businessAddressEn ?? '',
  });
  const { saving, errors, formError, save } = useSaver(notify);
  const field = (key: keyof typeof values, label: string, extra: { dir?: 'ltr'; max: number }) => (
    <FormField
      label={label}
      value={values[key]}
      maxLength={extra.max}
      dir={extra.dir}
      onChange={(event) => {
        setValues((previous) => ({ ...previous, [key]: event.target.value }));
      }}
      error={errors[key]}
      data-testid={`settings-${key}`}
    />
  );
  return (
    <Section
      title={t('business.title')}
      hint={t('business.hint')}
      saving={saving}
      saveLabel={t('save')}
      data-testid="settings-business"
      onSubmit={(event) => {
        event.preventDefault();
        void save(() => actions.updateSettings(values), t('toast.saved'));
      }}
    >
      <FormAlert message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        {field('businessNameHe', t('business.nameHe'), { max: 120 })}
        {field('businessNameEn', t('business.nameEn'), { dir: 'ltr', max: 120 })}
        {field('businessRegNumber', t('business.regNumber'), { dir: 'ltr', max: 40 })}
        {field('businessPhone', t('business.phone'), { dir: 'ltr', max: 40 })}
        {field('businessEmail', t('business.email'), { dir: 'ltr', max: 254 })}
        <span className="hidden sm:block" />
        {field('businessAddressHe', t('business.addressHe'), { max: 300 })}
        {field('businessAddressEn', t('business.addressEn'), { dir: 'ltr', max: 300 })}
      </div>
    </Section>
  );
}

function NotificationsSection({
  settings,
  actions,
  notify,
}: {
  settings: SettingsData;
  actions: SettingsActions;
  notify: (message: string, tone: 'success' | 'error') => void;
}) {
  const t = useTranslations('admin.settings');
  const [emails, setEmails] = useState<string[]>(() => [
    ...settings.notificationEmails,
    ...Array.from({ length: 3 - settings.notificationEmails.length }, () => ''),
  ]);
  const { saving, errors, formError, save } = useSaver(notify);
  return (
    <Section
      title={t('notifications.title')}
      hint={t('notifications.hint')}
      saving={saving}
      saveLabel={t('save')}
      data-testid="settings-notifications"
      onSubmit={(event) => {
        event.preventDefault();
        void save(
          () =>
            actions.updateSettings({
              notificationEmails: emails
                .map((email) => email.trim())
                .filter((email) => email !== ''),
            }),
          t('toast.saved'),
        );
      }}
    >
      <FormAlert message={formError} />
      <div className="grid gap-4">
        {emails.map((email, index) => (
          <FormField
            // Fixed three slots: the position is the identity.
            key={index}
            label={t('notifications.email', { n: index + 1 })}
            type="email"
            dir="ltr"
            value={email}
            maxLength={254}
            onChange={(event) => {
              setEmails((previous) =>
                previous.map((value, position) =>
                  position === index ? event.target.value : value,
                ),
              );
            }}
            error={index === 0 ? errors.notificationEmails : undefined}
            data-testid={`settings-notification-${String(index + 1)}`}
          />
        ))}
      </div>
    </Section>
  );
}

export function SettingsManager({
  settings,
  zones,
  usdBlockers,
  cardPaymentAvailable,
  actions,
}: {
  settings: SettingsData;
  zones: ZoneData[];
  usdBlockers: UsdBlocker[];
  cardPaymentAvailable: boolean;
  actions: SettingsActions;
}) {
  const t = useTranslations('admin.settings');
  const hydrated = useHydrated();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const notify = useCallback((message: string, tone: 'success' | 'error') => {
    setFeedback({ message, tone });
  }, []);
  const dismiss = useCallback(() => {
    setFeedback(null);
  }, []);

  // A field that can be seen is a field that works: nothing renders before hydration.
  if (!hydrated) return null;
  return (
    <div className="grid gap-5" data-testid="settings-ready">
      <ShopNameSection settings={settings} actions={actions} notify={notify} />
      <PaymentSection
        settings={settings}
        cardPaymentAvailable={cardPaymentAvailable}
        actions={actions}
        notify={notify}
      />
      <PickupSection settings={settings} actions={actions} notify={notify} />
      <section className="grid gap-4">
        <div>
          <h2 className="text-xl font-extrabold">{t('zones.title')}</h2>
          <p className="mt-1 text-[15px] text-ink-2">{t('zones.intro')}</p>
        </div>
        {zones.map((zone) => (
          <ZoneCard
            key={`${zone.id}-${String(zone.enabled)}-${String(zone.shippingEnabled)}-${String(zone.pickupEnabled)}-${String(zone.shippingFeeMinor)}-${String(zone.freeShippingThresholdMinor)}`}
            zone={zone}
            blockers={usdBlockers}
            actions={actions}
            notify={notify}
          />
        ))}
      </section>
      <BusinessSection settings={settings} actions={actions} notify={notify} />
      <NotificationsSection settings={settings} actions={actions} notify={notify} />
      <Toast
        message={feedback?.message ?? null}
        tone={feedback?.tone ?? 'success'}
        onDismiss={dismiss}
      />
    </div>
  );
}
