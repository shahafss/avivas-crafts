import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

/**
 * The peach band between the two banners (storefront.md §7.30): one thin sentence and a "shop now"
 * text link with the arrow icon (it points to the reading end and flips in Hebrew). No heading.
 */
export function StatementBand({
  sentence,
  linkText,
  href,
}: {
  sentence: string;
  linkText: string;
  /** Full path including the locale. */
  href: string;
}) {
  return (
    <section data-testid="home-band" className="bg-peach">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-20 lg:px-6 lg:py-32">
        <p className="mx-auto max-w-[24ch] text-center text-[clamp(28px,4.4vw,52px)] leading-[1.2] font-light text-balance text-ink">
          {sentence}
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href={href}
            data-testid="home-band-link"
            className="inline-flex min-h-11 items-center gap-2 text-lg font-semibold text-ink underline underline-offset-4"
          >
            {linkText}
            <Icon name="arrow" size={20} />
          </Link>
        </div>
      </div>
    </section>
  );
}
