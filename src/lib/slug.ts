/** `[a-z0-9-]` slug of a Latin name, at most 60 characters; `null` when nothing usable is left. */
export function slugify(name: string | null | undefined): string | null {
  if (!name) return null;
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug === '' ? null : slug;
}

/** True for an address that looks like a random code (`p-` or `c-` and 8 base32 characters). */
export function isRandomSlug(slug: string, prefix: 'p' | 'c'): boolean {
  return new RegExp(`^${prefix}-[a-z2-7]{8}$`).test(slug);
}
