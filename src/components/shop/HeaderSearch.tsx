import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/ui/Icon';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/cn';
import { MAX_QUERY_LENGTH } from '@/server/catalog/search';

/**
 * The search field (storefront.md 7.33, FR-043): a plain GET form, no JavaScript. `header` sits in
 * the header bar from 1024 px, `menu` at the top of the menu sheet. The colours are set explicitly,
 * because the header sets `currentColor` to white over the hero photo. The inset `forest` focus ring
 * comes from the unlayered rule for `[data-header-search]` in globals.css (a utility class would
 * lose to the header's own unlayered rule).
 */
export async function HeaderSearch({
  locale,
  variant,
}: {
  locale: Locale;
  variant: 'header' | 'menu';
}) {
  const t = await getTranslations({ locale, namespace: 'common' });
  const prefix = variant === 'header' ? 'header' : 'menu';
  return (
    <form
      action={`/${locale}/search`}
      method="get"
      role="search"
      aria-label={t(variant === 'header' ? 'headerSearch' : 'menuSearch')}
      data-header-search
      data-testid={`${prefix}-search`}
      className={cn(
        'flex h-11 items-center rounded-pill bg-paper/95 text-ink ring-1 ring-field ring-inset',
        variant === 'header' ? 'w-44 shrink-0' : 'mb-2 w-full',
      )}
    >
      <input
        type="search"
        name="q"
        maxLength={MAX_QUERY_LENGTH}
        autoComplete="off"
        enterKeyHint="search"
        aria-label={t('search')}
        placeholder={t('search')}
        data-testid={`${prefix}-search-input`}
        className="h-full min-w-0 flex-1 bg-transparent ps-4 text-base text-ink placeholder:text-ink-2"
      />
      <button
        type="submit"
        aria-label={t('search')}
        className="grid size-11 shrink-0 place-items-center rounded-pill text-ink"
      >
        <Icon name="search" />
      </button>
    </form>
  );
}
