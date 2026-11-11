'use server';

import { z } from 'zod';
import { requireAdmin, requireRecentAuth } from '@/server/auth/require-admin';
import {
  actorOf,
  fieldFailure,
  formFailure,
  type ActionResult,
  type Failure,
} from '@/server/catalog/result';
import { anonymizePerson } from '@/server/privacy/anonymize';
import { withdrawMarketingConsent as withdrawMarketing } from '@/server/privacy/consent';
import {
  QUERY_ERROR,
  searchCustomers as search,
  type SearchResult,
} from '@/server/privacy/customers';
import { exportCustomer as exportRecord } from '@/server/privacy/export';

// Thin wrappers: the rules and the work live in src/server/privacy/* (data-access layer).
// `exportCustomer` and `anonymizeCustomer` are passkey re-check actions (FR-019a): they start with
// `requireRecentAuth()` and answer `admin.reauth_required`, writing nothing, when the passkey is
// older than 5 minutes.

const query = z.string().min(3).max(254);
const refShape = { q: query, orderIds: z.array(z.uuid()).max(500) };
const refSchema = z.object(refShape);
const confirmedSchema = z.object({ ...refShape, confirm: z.literal(true) });

function invalid(error: z.ZodError): Failure {
  // A missing confirmation is reported before anything else (contracts/server-actions.md).
  if (error.issues.some((issue) => issue.path[0] === 'confirm')) {
    return formFailure('admin.confirm_required');
  }
  if (error.issues.some((issue) => issue.path[0] === 'q')) return fieldFailure('q', QUERY_ERROR);
  return formFailure('admin.failed');
}

export async function searchCustomers(input: { q: string }): Promise<ActionResult<SearchResult>> {
  const context = await requireAdmin();
  const parsed = z.object({ q: query }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return search(actorOf(context), parsed.data.q);
}

export async function exportCustomer(input: {
  q: string;
  orderIds: string[];
}): Promise<ActionResult<{ filename: string; content: string }>> {
  const context = await requireRecentAuth();
  if (!context.ok) return context;
  const parsed = refSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return exportRecord(actorOf(context), parsed.data);
}

export async function withdrawMarketingConsent(input: {
  q: string;
  orderIds: string[];
  confirm: true;
}): Promise<ActionResult<{ count: number }>> {
  const context = await requireAdmin();
  const parsed = confirmedSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return withdrawMarketing(actorOf(context), parsed.data);
}

export async function anonymizeCustomer(input: {
  q: string;
  orderIds: string[];
  confirm: true;
}): Promise<ActionResult<{ count: number; skipped: number; keptCheckouts: number }>> {
  const context = await requireRecentAuth();
  if (!context.ok) return context;
  const parsed = confirmedSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return anonymizePerson(actorOf(context), parsed.data);
}
