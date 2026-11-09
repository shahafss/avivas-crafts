import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { OrderStatusBadge, PaymentStateBadge } from '@/components/admin/OrderStatusBadge';
import { Button } from '@/components/ui/Button';
import { ChipLink } from '@/components/ui/ChipLink';
import { ChipRow } from '@/components/ui/ChipRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { Price } from '@/components/ui/Price';
import { TextField } from '@/components/ui/TextField';
import { formatDateTime } from '@/lib/format-date';
import { requireAdmin } from '@/server/auth/require-admin';
import { orderStatusEnum, paymentStateEnum } from '@/server/db/schema';
import {
  findOrderIdByNumber,
  listOrders,
  type AdminOrderListRow,
} from '@/server/orders/admin-orders';

// An invalid value is ignored (treated as absent), contracts/routes.md.
const Query = z.object({
  status: z.enum(orderStatusEnum.enumValues).optional().catch(undefined),
  payment: z.enum(paymentStateEnum.enumValues).optional().catch(undefined),
  open: z.literal('1').optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  number: z.string().optional().catch(undefined),
});

interface Filters {
  status?: string | undefined;
  payment?: string | undefined;
  open?: boolean | undefined;
  page?: number | undefined;
}

function href({ status, payment, open, page }: Filters): string {
  const query = new URLSearchParams();
  if (status !== undefined) query.set('status', status);
  if (payment !== undefined) query.set('payment', payment);
  if (open === true) query.set('open', '1');
  if (page !== undefined && page > 1) query.set('page', String(page));
  const text = query.toString();
  return text === '' ? '/admin/orders' : `/admin/orders?${text}`;
}

function OrderCard({ row }: { row: AdminOrderListRow }) {
  return (
    <li>
      <Link
        href={`/admin/orders/${row.id}`}
        prefetch={false}
        data-testid="order-card"
        className="grid min-h-11 gap-2 rounded-card border border-line bg-panel p-4 hover:bg-sun-soft"
      >
        <span className="flex items-baseline justify-between gap-3">
          <bdi className="tnum text-base font-bold">#{row.orderNumber}</bdi>
          <bdi className="tnum text-[13px] text-ink-2">{formatDateTime(row.createdAt, 'he')}</bdi>
        </span>
        <bdi className="text-base font-medium">{row.customerName}</bdi>
        <Price minor={row.totalMinor} currency={row.currency} locale="he" />
        <span className="flex flex-wrap gap-1.5">
          <OrderStatusBadge status={row.status} />
          <PaymentStateBadge state={row.paymentState} />
        </span>
      </Link>
    </li>
  );
}

export async function generateMetadata() {
  const t = await getTranslations('admin.orders');
  return { title: t('list.title') };
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = Query.parse(await searchParams);
  const t = await getTranslations('admin.orders');
  const filters: Filters = {
    status: query.status,
    payment: query.payment,
    open: query.open === '1',
  };

  // An empty number (after trimming) counts as absent.
  const typed = query.number?.trim() ?? '';
  let numberNotice: string | null = null;
  if (typed !== '') {
    const found = await findOrderIdByNumber(typed);
    if ('id' in found) redirect(`/admin/orders/${found.id}`);
    numberNotice =
      'notFound' in found
        ? t('list.numberNotFound', { number: String(found.notFound) })
        : t('list.numberInvalid');
  }

  const result = await listOrders({
    status: query.status,
    payment: query.payment,
    open: query.open === '1',
    page: query.page ?? 1,
  });
  const filtered = query.status !== undefined || query.payment !== undefined || query.open === '1';

  return (
    <div className="grid grid-cols-1 gap-5">
      <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance">
        {t('list.title')}
      </h1>

      <form method="get" action="/admin/orders" className="flex items-end gap-2">
        {query.status === undefined ? null : (
          <input type="hidden" name="status" value={query.status} />
        )}
        {query.payment === undefined ? null : (
          <input type="hidden" name="payment" value={query.payment} />
        )}
        {query.open === '1' ? <input type="hidden" name="open" value="1" /> : null}
        <TextField
          name="number"
          label={t('list.numberLabel')}
          inputMode="numeric"
          enterKeyHint="go"
          autoComplete="off"
          ltr
          defaultValue={typed}
          className="min-w-0 flex-1"
          data-testid="order-number-input"
        />
        <Button
          type="submit"
          variant="secondary"
          className="h-[52px]"
          data-testid="order-number-go"
        >
          {t('list.numberGo')}
        </Button>
      </form>

      {numberNotice === null ? null : (
        <Notice tone="info" role="status" id="order-number-notice">
          {numberNotice}
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-2">
        <ChipRow label={t('list.statusFilter')}>
          <ChipLink
            href={href({ ...filters, status: undefined })}
            current={query.status === undefined}
            prefetch={false}
          >
            {t('list.all')}
          </ChipLink>
          {orderStatusEnum.enumValues.map((value) => (
            <ChipLink
              key={value}
              href={href({ ...filters, status: value })}
              current={query.status === value}
              prefetch={false}
            >
              {t(`status.${value}`)}
            </ChipLink>
          ))}
        </ChipRow>
        <ChipRow label={t('list.paymentFilter')}>
          <ChipLink
            href={href({ ...filters, payment: undefined })}
            current={query.payment === undefined}
            prefetch={false}
          >
            {t('list.all')}
          </ChipLink>
          {paymentStateEnum.enumValues.map((value) => (
            <ChipLink
              key={value}
              href={href({ ...filters, payment: value })}
              current={query.payment === value}
              prefetch={false}
            >
              {t(`payment.${value}`)}
            </ChipLink>
          ))}
        </ChipRow>
        {query.open === '1' ? (
          <div>
            <ChipLink
              href={href({ ...filters, open: false })}
              aria-label={t('list.openChipRemove')}
              prefetch={false}
              data-testid="orders-open-chip"
            >
              {t('list.openChip')}
              <Icon name="close" size={16} className="ms-2" />
            </ChipLink>
          </div>
        ) : null}
        {filtered ? (
          <p>
            <Link
              href="/admin/orders"
              prefetch={false}
              className="inline-flex min-h-11 items-center font-bold underline underline-offset-[3px]"
              data-testid="orders-clear-filters"
            >
              {t('list.clear')}
            </Link>
          </p>
        ) : null}
      </div>

      {result.rows.length === 0 ? (
        filtered ? (
          <div data-testid="orders-empty">
            <EmptyState
              icon="search"
              title={t('list.emptyFiltered')}
              text={t('list.emptyFilteredText')}
              action={
                <LinkButton href="/admin/orders" prefetch={false}>
                  {t('list.clear')}
                </LinkButton>
              }
            />
          </div>
        ) : (
          <div data-testid="orders-empty">
            <EmptyState icon="yarn" title={t('list.emptyAll')} text={t('list.emptyAllText')} />
          </div>
        )
      ) : (
        <ul aria-label={t('list.listLabel')} className="grid gap-3" data-testid="orders-list">
          {result.rows.map((row) => (
            <OrderCard key={row.id} row={row} />
          ))}
        </ul>
      )}

      {result.pageCount > 1 ? (
        <nav
          aria-label={t('list.pagingLabel')}
          className="flex items-center justify-between gap-3"
          data-testid="orders-paging"
        >
          {result.page > 1 ? (
            <Link
              href={href({ ...filters, page: result.page - 1 })}
              prefetch={false}
              rel="prev"
              className="inline-flex min-h-11 items-center gap-1 font-bold"
            >
              <Icon name="chevron" direction="start" size={18} />
              {t('list.previous')}
            </Link>
          ) : (
            <span aria-hidden="true" className="min-w-16" />
          )}
          <span className="tnum text-[15px] text-ink-2">
            {t('list.pageOf', { page: String(result.page), count: String(result.pageCount) })}
          </span>
          {result.page < result.pageCount ? (
            <Link
              href={href({ ...filters, page: result.page + 1 })}
              prefetch={false}
              rel="next"
              className="inline-flex min-h-11 items-center gap-1 font-bold"
            >
              {t('list.next')}
              <Icon name="chevron" direction="end" size={18} />
            </Link>
          ) : (
            <span aria-hidden="true" className="min-w-16" />
          )}
        </nav>
      ) : null}
    </div>
  );
}
