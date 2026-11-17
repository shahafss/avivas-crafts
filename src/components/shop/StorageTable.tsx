import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { itemsFor, type StorageItem } from '@/lib/consent/registry';
import { consentConfig } from '@/server/consent/config';

const CELL =
  'px-3 py-2 text-start align-top max-sm:block max-sm:px-0 max-sm:py-0.5 ' +
  'max-sm:before:block max-sm:before:text-[13px] max-sm:before:font-bold max-sm:before:text-ink-2 ' +
  'max-sm:before:content-[attr(data-label)]';

/**
 * The Cookie Policy table (storefront.md §7.25, 003 FR-004): every item the site can store on a
 * visitor's device, from the registry. Public items first, then the admin ones, each marked.
 * From 640 px a table, below it stacked cards (labels come from `data-label`).
 */
export async function StorageTable({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'legal.storage' });
  const full = await getTranslations({ locale });
  const items = itemsFor(consentConfig());
  const ordered: StorageItem[] = [
    ...items.filter((item) => item.scope === 'public'),
    ...items.filter((item) => item.scope === 'admin'),
  ];
  return (
    <table
      data-testid="storage-table"
      className="my-4 w-full max-w-[68ch] border-collapse text-[15px] max-sm:block"
    >
      <caption className="sr-only">{t('caption')}</caption>
      <thead className="max-sm:sr-only">
        <tr className="bg-photo">
          <th scope="col" className="px-3 py-2 text-start font-bold">
            {t('name')}
          </th>
          <th scope="col" className="px-3 py-2 text-start font-bold">
            {t('purpose')}
          </th>
          <th scope="col" className="px-3 py-2 text-start font-bold">
            {t('lifetime')}
          </th>
          <th scope="col" className="px-3 py-2 text-start font-bold">
            {t('where')}
          </th>
        </tr>
      </thead>
      <tbody className="max-sm:block">
        {ordered.map((item) => (
          <tr
            key={item.name}
            data-testid="storage-row"
            className="border-b border-line max-sm:mb-3 max-sm:block max-sm:rounded-card max-sm:border max-sm:bg-paper max-sm:p-4"
          >
            <td data-label={t('name')} className={CELL}>
              <bdi dir="ltr" className="font-mono font-bold">
                {item.name}
              </bdi>
              {item.scope === 'admin' ? (
                <span className="mt-0.5 block text-[13px] text-ink-2">{t('adminOnly')}</span>
              ) : null}
            </td>
            <td data-label={t('purpose')} className={CELL}>
              {full(item.purposeKey)}
            </td>
            <td data-label={t('lifetime')} className={CELL}>
              {full(item.durationKey)}
            </td>
            <td data-label={t('where')} className={CELL}>
              {t(`kind.${item.kind}`)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
