import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

export interface ChipLinkProps extends Omit<ComponentPropsWithoutRef<typeof Link>, 'href'> {
  href: string;
  /** The page the chip points at is the current one. */
  current?: boolean;
}

/** Category or sort chip. The border is `field` (3:1 against the ground), not `line`. */
export function ChipLink({ href, current = false, className, children, ...rest }: ChipLinkProps) {
  return (
    <Link
      href={href}
      {...rest}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 snap-start items-center whitespace-nowrap rounded-chip border-[1.5px] px-4 text-[15px] font-medium text-ink transition-colors duration-150 ease-out',
        current
          ? 'border-ink bg-sun-soft ring-1 ring-inset ring-ink'
          : 'border-field bg-panel hover:bg-sun-soft',
        className,
      )}
    >
      {children}
    </Link>
  );
}
