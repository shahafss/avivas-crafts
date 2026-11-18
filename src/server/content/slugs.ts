/** The seven content pages. Dependency-free: the seed, the data layer and the routes import it. */
export const CONTENT_SLUGS = [
  'about',
  'contact',
  'privacy',
  'terms',
  'cookies',
  'shipping-returns',
  'accessibility',
] as const;

export type ContentSlug = (typeof CONTENT_SLUGS)[number];

/** The pages whose every version is kept (orders refer to a Terms and Privacy Policy version). */
export const VERSIONED_SLUGS = ['terms', 'privacy'] as const;

export type VersionedSlug = (typeof VERSIONED_SLUGS)[number];

export function isContentSlug(value: string): value is ContentSlug {
  return (CONTENT_SLUGS as readonly string[]).includes(value);
}

export function isVersionedSlug(value: string): value is VersionedSlug {
  return (VERSIONED_SLUGS as readonly string[]).includes(value);
}
