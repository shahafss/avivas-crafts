import 'server-only';
import { asc, eq, inArray } from 'drizzle-orm';
import { logActivity } from '@/server/activity/log';
import { fieldFailure, ok, type ActionResult, type Actor } from '@/server/catalog/result';
import { db } from '@/server/db/client';
import { orderLine, shopSettings } from '@/server/db/schema';
import { isoDateInIsrael } from '@/lib/format-date';
import { pick } from '@/lib/i18n-fallback';
import { customerActivity, matchOrders, QUERY_ERROR, type CustomerRef } from './customers';

/** The access-request file (003 research R9, contracts/server-actions.md › exportCustomer). */

interface OptionSnapshot {
  group_he: string;
  group_en: string | null;
  value_he: string;
  value_en: string | null;
}

function optionsOf(value: unknown): OptionSnapshot[] {
  return Array.isArray(value) ? (value as OptionSnapshot[]) : [];
}

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

export async function exportCustomer(
  actor: Actor,
  ref: CustomerRef,
  options: { now?: Date } = {},
): Promise<ActionResult<{ filename: string; content: string }>> {
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const match = await matchOrders(ref, tx);
    if (match === null) return fieldFailure('q', QUERY_ERROR);

    const [settings] = await tx.select().from(shopSettings).where(eq(shopSettings.id, 1));
    if (!settings) throw new Error('shop_settings row is missing: run `pnpm db:seed`');
    const orderIds = match.orders.map((order) => order.id);
    const lines =
      orderIds.length === 0
        ? []
        : await tx
            .select()
            .from(orderLine)
            .where(inArray(orderLine.orderId, orderIds))
            .orderBy(asc(orderLine.id));

    const file = {
      exportedAt: now.toISOString(),
      shop: {
        legalName: settings.businessNameHe,
        email: settings.businessEmail,
        phone: settings.businessPhone,
      },
      searchedBy: match.query.field,
      orders: match.orders.map((order) => ({
        orderNumber: order.orderNumber,
        createdAt: order.createdAt.toISOString(),
        language: order.locale,
        status: order.status,
        customer: {
          name: order.customerName,
          email: order.customerEmail,
          phone: order.customerPhone,
        },
        delivery: {
          method: order.deliveryMethod,
          country: order.addressCountry,
          city: order.addressCity,
          line1: order.addressLine1,
          line2: order.addressLine2,
          postalCode: order.addressPostalCode,
        },
        note: order.note,
        trackingNumber: order.trackingNumber,
        pickupNote: order.pickupNote,
        items: lines
          .filter((line) => line.orderId === order.id)
          .map((line) => ({
            name: pick(order.locale, line.productNameHe, line.productNameEn).text,
            options: optionsOf(line.options).map((option) => ({
              group: pick(order.locale, option.group_he, option.group_en).text,
              value: pick(order.locale, option.value_he, option.value_en).text,
            })),
            unitPriceMinor: line.unitPriceMinor,
            quantity: line.quantity,
            lineTotalMinor: line.lineTotalMinor,
          })),
        currency: order.currency,
        subtotalMinor: order.subtotalMinor,
        deliveryFeeMinor: order.deliveryFeeMinor,
        totalMinor: order.totalMinor,
        payment: {
          method: order.paymentMethod,
          state: order.paymentState,
          paidAt: iso(order.paidAt),
          refundedAt: iso(order.refundedAt),
        },
        terms: {
          acceptedAt: order.termsAcceptedAt.toISOString(),
          termsVersion: order.termsVersion,
          privacyVersion: order.privacyVersion,
        },
        marketing: {
          optIn: order.marketingOptIn,
          optInAt: iso(order.marketingOptInAt),
          withdrawnAt: iso(order.marketingWithdrawnAt),
        },
      })),
      pendingCheckouts: match.checkouts.map((checkout) => ({
        createdAt: checkout.createdAt.toISOString(),
        state: checkout.state,
        customer: {
          name: checkout.customerName,
          email: checkout.customerEmail,
          phone: checkout.customerPhone,
        },
        delivery: {
          method: checkout.deliveryMethod,
          country: checkout.addressCountry,
          city: checkout.addressCity,
          line1: checkout.addressLine1,
          line2: checkout.addressLine2,
          postalCode: checkout.addressPostalCode,
        },
      })),
      emails: match.emails.map((email) => ({
        kind: email.kind,
        to: email.toAddress,
        replyTo: email.replyTo,
        createdAt: email.createdAt.toISOString(),
        status: email.status,
        sentAt: iso(email.sentAt),
      })),
    };

    await logActivity(
      tx,
      customerActivity(actor, 'customer.exported', { count: match.orders.length }),
    );
    return ok({
      filename: `customer-${isoDateInIsrael(now)}.json`,
      content: JSON.stringify(file, null, 2),
    });
  });
}
