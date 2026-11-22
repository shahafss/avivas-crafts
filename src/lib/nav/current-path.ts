function clean(path: string): string {
  const bare = path.split('#')[0]?.split('?')[0] ?? '';
  return bare.length > 1 ? bare.replace(/\/+$/, '') || '/' : bare;
}

/**
 * Whether `href` is the page at `pathname` (010 research D7): the paths are compared with the
 * query, the hash and a trailing slash removed (the root `/` is kept).
 */
export function isCurrentPath(pathname: string, href: string): boolean {
  return clean(pathname) === clean(href);
}
