import { Icon, type IconName } from '@/components/ui/Icon';

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok';

export interface SocialLinksProps {
  /** The stored, already validated addresses (null or empty = not saved). */
  urls: Record<SocialPlatform, string | null>;
  /** Translated list name and one translated name per platform. */
  labels: { list: string } & Record<SocialPlatform, string>;
}

const ORDER: SocialPlatform[] = ['instagram', 'facebook', 'tiktok'];

/**
 * The shop's own social pages in the footer (storefront.md §7.31, contracts/social-links.md).
 * Renders nothing when no address is saved. Plain same-tab links: no script, no embed, no request
 * to the platform before a click.
 */
export function SocialLinks({ urls, labels }: SocialLinksProps) {
  const saved = ORDER.filter((platform) => (urls[platform] ?? '') !== '');
  if (saved.length === 0) return null;
  return (
    <ul
      data-testid="footer-social"
      aria-label={labels.list}
      className="mt-3.5 flex flex-wrap gap-1.5"
    >
      {saved.map((platform) => (
        <li key={platform}>
          <a
            href={urls[platform] ?? undefined}
            data-testid={`footer-social-${platform}`}
            aria-label={labels[platform]}
            className="flex size-11 items-center justify-center rounded-pill border-[1.5px] border-ink text-ink hover:bg-sage"
          >
            <Icon name={platform satisfies IconName} size={20} />
          </a>
        </li>
      ))}
    </ul>
  );
}
