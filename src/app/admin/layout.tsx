import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import type MessageFile from '@/i18n/messages/he.json';
import { assistant } from '../fonts';
import '../globals.css';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Reading request headers makes admin pages render per request (nonce, no static output).
  await headers();
  const messages = (await getMessages()) as unknown as typeof MessageFile;
  return (
    <html lang="he" dir="rtl" className={assistant.variable}>
      <body className="min-h-dvh bg-photo">
        <NextIntlClientProvider
          locale="he"
          messages={{
            admin: messages.admin,
            // Shared dialog and toast strings (ConfirmDialog, Toast) and the busy label.
            common: {
              busy: messages.common.busy,
              dialog: messages.common.dialog,
              toast: messages.common.toast,
            },
          }}
        >
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
