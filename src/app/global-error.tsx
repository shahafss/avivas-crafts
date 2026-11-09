'use client';

import { usePathname } from 'next/navigation';
import { globalErrorMessages } from '@/i18n/global-error-messages';
import { heebo } from './fonts';
import './globals.css';

/** Replaces the root layout when it fails: no providers, so it reads a small message module. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const english = usePathname().startsWith('/en');
  const t = globalErrorMessages[english ? 'en' : 'he'];
  return (
    <html lang={english ? 'en' : 'he'} dir={english ? 'ltr' : 'rtl'} className={heebo.variable}>
      <body className="grid min-h-dvh place-items-center px-4">
        <div className="grid max-w-xl gap-5 text-center">
          <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance lg:text-[34px]">
            {t.title}
          </h1>
          <p className="text-ink-2">{t.text}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-[54px] items-center justify-center rounded-pill bg-sun px-7 text-[17px] font-extrabold text-ink hover:bg-sun-hover"
            >
              {t.retry}
            </button>
            <a
              href={english ? '/en' : '/he'}
              className="inline-flex h-12 items-center justify-center rounded-pill border-[1.5px] border-ink px-6 font-bold text-ink hover:bg-sun-soft"
            >
              {t.home}
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
