import { HOME_PHOTOS, type HomePhotoId } from '@/lib/home-photos/config';
import manifestJson from '@/lib/home-photos/manifest.json';

interface ManifestEntry {
  file: string;
  width: number;
  height: number;
  bytes: number;
}
const manifest = manifestJson as Record<
  HomePhotoId,
  { phone: ManifestEntry[]; wide: ManifestEntry[] }
>;

const PHONE_SRC_WIDTH = 565;

function srcSet(entries: ManifestEntry[]): string {
  return entries.map((entry) => `/site-photos/${entry.file} ${String(entry.width)}w`).join(', ');
}

/**
 * One of the three home photos as a `<picture>` (storefront.md §7.27, contracts/home-photos.md
 * "Markup"). A phone only ever sees the portrait crops; the wide `<source>` applies from 640 px.
 * It fills its section from behind, so the section carries the minimum height and the `ink`
 * background. The wide crop position is a literal class from the config (no `style`, CSP).
 */
export function HomePhoto({
  id,
  alt,
  priority,
}: {
  id: HomePhotoId;
  /** The translated alt text, passed in by the section that uses the photo. */
  alt: string;
  /** The hero: loaded at once with high priority. The banners are lazy. */
  priority: boolean;
}) {
  const { phone, wide } = manifest[id];
  const fallback =
    phone.find((entry) => entry.width === PHONE_SRC_WIDTH) ?? phone[phone.length - 1];
  if (fallback === undefined) throw new Error(`No phone variant for the home photo "${id}"`);
  const { wideObjectPosition } = HOME_PHOTOS[id];
  return (
    <picture className="absolute inset-0 block">
      <source media="(min-width: 640px)" srcSet={srcSet(wide)} sizes="100vw" />
      <img
        src={`/site-photos/${fallback.file}`}
        srcSet={srcSet(phone)}
        sizes="100vw"
        width={565}
        height={848}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={`size-full object-cover object-center ${wideObjectPosition}`}
      />
    </picture>
  );
}
