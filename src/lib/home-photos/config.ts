// The three home photos (data-model.md §2, contracts/home-photos.md). Code, not data: changed by
// the maintainer (storefront.md §6 "Changing a home photo"), never through the admin area.
// Class strings are literal so Tailwind sees them.

export type HomePhotoId = 'hero' | 'bannerChild' | 'bannerShelf';

export interface HomePhotoConfig {
  id: HomePhotoId;
  /** File in `assets/home-photos/`. */
  source: string;
  /** 0–1: the main subject's horizontal position, used to cut the phone crop. */
  focusX: number;
  /** Literal Tailwind classes for the wide crop. */
  wideObjectPosition: string;
  /** Translation key of the alt text. */
  altKey: string;
}

export const HOME_PHOTOS: Record<HomePhotoId, HomePhotoConfig> = {
  hero: {
    id: 'hero',
    source: 'hero-workshop.jpg',
    focusX: 0.3,
    wideObjectPosition: 'sm:object-[50%_50%]',
    altKey: 'shop.home.hero.alt',
  },
  bannerChild: {
    id: 'bannerChild',
    source: 'banner-child-play.jpg',
    focusX: 0.58,
    wideObjectPosition: 'sm:object-[58%_50%]',
    altKey: 'shop.home.bannerChild.alt',
  },
  bannerShelf: {
    id: 'bannerShelf',
    source: 'banner-shelf.jpg',
    focusX: 0.5,
    wideObjectPosition: 'sm:object-[50%_50%]',
    altKey: 'shop.home.bannerShelf.alt',
  },
};
