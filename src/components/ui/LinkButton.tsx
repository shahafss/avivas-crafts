import Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';
import { buttonClasses, type ButtonVariant } from './button-styles';

export interface LinkButtonProps extends Omit<ComponentPropsWithoutRef<typeof Link>, 'href'> {
  /** Full path including the locale, e.g. `/he/shop`. */
  href: string;
  variant?: ButtonVariant;
}

/** A link that looks like a `Button`. */
export function LinkButton({
  variant = 'primary',
  href,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link href={href} {...rest} className={buttonClasses(variant, false, className)}>
      {children}
    </Link>
  );
}
