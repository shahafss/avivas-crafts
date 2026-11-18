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
        'inline-flex min-h-11 snap-start items-center whitespace-nowrap rounded-pill border px-[18px] text-[15px] text-ink transition-colors duration-150 ease-out',
        current
          ? 'border-[1.5px] border-ink bg-sage font-bold'
          : 'border-ink-2 bg-paper hover:bg-photo',
        className,
      )}
    >
      {children}
    </Link>
  );
}
