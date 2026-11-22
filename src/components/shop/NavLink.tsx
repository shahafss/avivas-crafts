'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';
import { isCurrentPath } from '@/lib/nav/current-path';

type NavLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string;
  /** Set `aria-current="page"` when the link points at the page being shown. */
  markCurrent?: boolean;
  /** The child already carries `nav-line` itself (the truncating category span). */
  bareChildren?: boolean;
};

/**
 * A header or menu link with the animated underline (storefront.md 3.5) that marks the current
 * page for assistive technology. It is a client island because the layout is not rendered again on
 * client-side navigation, while `usePathname()` updates on every one (010 research D7).
 */
export function NavLink({
  href,
  markCurrent = false,
  bareChildren = false,
  children,
  ...rest
}: NavLinkProps) {
  const pathname = usePathname();
  const current = markCurrent && isCurrentPath(pathname, href);
  return (
    <Link href={href} aria-current={current ? 'page' : undefined} {...rest}>
      {bareChildren ? children : <span className="nav-line">{children}</span>}
    </Link>
  );
}
