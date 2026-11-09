import 'server-only';
import { createTranslator } from 'use-intl/core';
import en from '@/i18n/messages/en.json';
import he from '@/i18n/messages/he.json';

const MESSAGES: Record<'he' | 'en', Record<string, unknown>> = { he, en };

/**
 * Looks up an `emails.*` (or other) message by dotted path and fills `{name}` placeholders.
 * Email templates read every string through this, never from literals (contracts/emails.md).
 * It goes through the translator next-intl itself uses (`use-intl/core`, free of React, so CLI
 * scripts can load it), so it reads messages the same way the pages do, whether or not the build
 * precompiled them (`next.config.ts`). A missing message throws.
 * Values are inserted as they are: escape them for HTML before they get here.
 */
export function emailT(
  locale: 'he' | 'en',
  path: string,
  params: Record<string, string | number> = {},
): string {
  const translate = createTranslator({
    locale,
    // The message type is the Hebrew file's; the two files have the same shape (parity test).
    messages: MESSAGES[locale] as unknown as typeof he,
    onError: (error) => {
      throw error;
    },
    getMessageFallback: ({ namespace, key }) => {
      throw new Error(
        `Missing message: ${locale}:${namespace === undefined ? '' : `${namespace}.`}${key}`,
      );
    },
  }) as unknown as (key: string, values: Record<string, string | number>) => string;
  return translate(path, params);
}
