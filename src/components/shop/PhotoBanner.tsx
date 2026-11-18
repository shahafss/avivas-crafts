import type { HomePhotoId } from '@/lib/home-photos/config';
import { LinkButton } from '@/components/ui/LinkButton';
import { HomePhoto } from './HomePhoto';

/**
 * A full-width photo with one band of text and one button (storefront.md §7.29), used twice on the
 * home page. The band sits at the bottom on phones and in the reading-start half from 640 px
 * (right in Hebrew, left in English). No dark layer: the text sits on the photo with only the soft
 * text shadow (owner decision 2026-11-17, an accepted contrast exception).
 */
export function PhotoBanner({
  id,
  testId,
  heading,
  line,
  button,
  href,
  alt,
}: {
  id: HomePhotoId;
  /** `home-banner-child` or `home-banner-shelf`; the heading id derives from it. */
  testId: string;
  heading: string;
  line: string;
  button: string;
  /** Full path including the locale. */
  href: string;
  /** Translated alt text of the photo. */
  alt: string;
}) {
  const titleId = `${testId}-title`;
  return (
    <section
      data-on-photo
      data-testid={testId}
      aria-labelledby={titleId}
      className="relative flex min-h-[clamp(520px,140vw,600px)] flex-col justify-end bg-ink sm:min-h-[clamp(420px,42vw,620px)] sm:flex-row sm:justify-start"
    >
      <HomePhoto id={id} alt={alt} priority={false} />
      <div className="banner-copy relative flex flex-col justify-end px-4 py-8 sm:justify-center sm:px-8 sm:py-10 lg:px-12">
        <div className="flex max-w-[30rem] flex-col items-start gap-3.5">
          <h2
            id={titleId}
            className="text-[clamp(40px,6.4vw,76px)] leading-none font-extrabold text-balance text-on-photo"
          >
            {heading}
          </h2>
          <p className="max-w-[34ch] text-2xl leading-[1.35] text-on-photo">{line}</p>
          <LinkButton href={href} variant="soft" data-testid="home-banner-button">
            {button}
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
