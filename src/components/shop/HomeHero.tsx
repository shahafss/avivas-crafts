import { fallbackAttrs, type Picked } from '@/lib/i18n-fallback';
import { HomePhoto } from './HomePhoto';

/**
 * The home page's first section (storefront.md §7.28): the hero photo with a blended dark strip
 * behind the header at the top (no text in it) and the shop name (the page's only h1) in a band at
 * the bottom. It is pulled up under the header by `[data-hero]` (globals.css). The bottom band grows
 * with its text, so a long shop name stays readable (research D4, D20).
 */
export function HomeHero({
  name,
  alt,
}: {
  /** The shop name in the page language (Hebrew fallback on `/en` gets `lang="he"`). */
  name: Picked;
  /** Translated alt text of the hero photo. */
  alt: string;
}) {
  return (
    <section
      data-hero
      data-on-photo
      data-testid="home-hero"
      aria-labelledby="home-hero-title"
      className="relative grid min-h-[clamp(560px,150vw,640px)] grid-rows-[auto_1fr_auto] bg-ink sm:min-h-[clamp(460px,48vw,720px)]"
    >
      <HomePhoto id="hero" alt={alt} priority />
      <div aria-hidden="true" className="scrim-band scrim-band-top row-start-1" />
      <div className="scrim-band scrim-band-bottom row-start-3 pt-5 pb-7 lg:pb-10">
        <div className="mx-auto w-full max-w-[1240px] px-4 lg:px-6">
          <h1
            id="home-hero-title"
            {...fallbackAttrs(name)}
            className="text-[clamp(56px,12vw,128px)] leading-[0.95] font-light tracking-[-0.02em] text-balance text-on-photo text-center [overflow-wrap:anywhere]"
          >
            {name.text}
          </h1>
        </div>
      </div>
    </section>
  );
}
