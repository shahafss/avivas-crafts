import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { ChipLink } from '@/components/ui/ChipLink';
import { ChipRow } from '@/components/ui/ChipRow';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { requireAdmin } from '@/server/auth/require-admin';
import {
  listAdminProducts,
  type AdminProductListRow,
  type ProductState,
} from '@/server/catalog/admin-queries';
import { listCategories } from '@/server/catalog/categories';
import { createProduct } from './actions';

const STATES: ProductState[] = ['draft', 'published', 'hidden'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function href(state: string | undefined, categoryId: string | undefined): string {
  const query = new URLSearchParams();
  if (state !== undefined) query.set('state', state);
  if (categoryId !== undefined) query.set('category', categoryId);
  const text = query.toString();
  return text === '' ? '/admin/products' : `/admin/products?${text}`;
}

const BADGE = 'rounded-pill px-2.5 py-0.5 text-[13px] font-bold';

async function ProductRow({ item }: { item: AdminProductListRow }) {
  const t = await getTranslations('admin.products');
  return (
    <li>
      <Link
        href={`/admin/products/${item.id}`}
        prefetch={false}
        data-testid="admin-product-row"
        className="flex gap-3 rounded-card border border-line bg-paper p-3 hover:bg-sage"
      >
        <span className="grid h-24 w-[77px] shrink-0 place-items-center overflow-hidden rounded-chip bg-photo text-center text-[13px] text-ink-2">
          {item.imageUrl === null ? (
            t('noPhoto')
          ) : (
            <img
              src={item.imageUrl}
              alt=""
              width={400}
              height={500}
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          )}
        </span>
        <span className="grid min-w-0 flex-1 content-center gap-1.5">
          <span className="line-clamp-2 text-base leading-snug font-bold">{item.nameHe}</span>
          <span className="text-[15px] text-ink-2">
            {item.priceIlsMinor === null ? (
              t('noPrice')
            ) : (
              <bdi className="tnum">{formatMoney(item.priceIlsMinor, 'ILS', 'he')}</bdi>
            )}
            {item.categoryNames.length === 0 ? null : ` · ${item.categoryNames.join(', ')}`}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <span
              className={cn(
                BADGE,
                item.state === 'published' && 'bg-sage text-ink',
                item.state === 'draft' && 'bg-photo text-ink',
                item.state === 'hidden' && 'border-[1.5px] border-field bg-paper text-ink',
              )}
            >
              {t(`state.${item.state}`)}
            </span>
            {item.orderable ? null : (
              <span className={cn(BADGE, 'border-[1.5px] border-alert bg-paper text-alert')}>
                {t('notOrderable')}
              </span>
            )}
            {item.missingEnglish ? (
              <span
                className={cn(
                  BADGE,
                  'border-[1.5px] border-dashed border-field bg-paper text-ink-2',
                )}
              >
                {t('noEnglish')}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

export async function generateMetadata() {
  const t = await getTranslations('admin.products');
  return { title: t('title') };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; category?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const state = STATES.find((value) => value === query.state);
  const categoryId =
    query.category !== undefined && UUID.test(query.category) ? query.category : undefined;
  const [t, categories, products] = await Promise.all([
    getTranslations('admin.products'),
    listCategories(),
    listAdminProducts({
      ...(state === undefined ? {} : { state }),
      ...(categoryId === undefined ? {} : { categoryId }),
    }),
  ]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight">{t('title')}</h1>
        <form action={createProduct}>
          <Button type="submit" data-testid="product-new">
            <Icon name="plus" />
            {t('new')}
          </Button>
        </form>
      </div>

      <div className="grid gap-2">
        <ChipRow label={t('filters.state')}>
          <ChipLink
            href={href(undefined, categoryId)}
            current={state === undefined}
            prefetch={false}
          >
            {t('filters.allStates')}
          </ChipLink>
          {STATES.map((value) => (
            <ChipLink
              key={value}
              href={href(value, categoryId)}
              current={state === value}
              prefetch={false}
            >
              {t(`state.${value}`)}
            </ChipLink>
          ))}
        </ChipRow>
        {categories.length === 0 ? null : (
          <ChipRow label={t('filters.category')}>
            <ChipLink
              href={href(state, undefined)}
              current={categoryId === undefined}
              prefetch={false}
            >
              {t('filters.allCategories')}
            </ChipLink>
            {categories.map((item) => (
              <ChipLink
                key={item.id}
                href={href(state, item.id)}
                current={categoryId === item.id}
                prefetch={false}
              >
                {item.nameHe}
              </ChipLink>
            ))}
          </ChipRow>
        )}
      </div>

      {products.length === 0 ? (
        <p className="text-ink-2">
          {state === undefined && categoryId === undefined ? t('empty') : t('emptyFiltered')}
        </p>
      ) : (
        <ul aria-label={t('listLabel')} className="grid gap-3 sm:grid-cols-2">
          {products.map((item) => (
            <ProductRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
