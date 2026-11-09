import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const CLASSES =
  'relative inline-grid size-11 shrink-0 place-items-center rounded-full text-ink transition-colors duration-150 ease-out hover:bg-ground';

interface Common {
  /** Translated accessible name. */
  label: string;
  /** Optional badge (e.g. the cart count), placed at inline-end top. */
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
}

type LinkProps = Common & { href: string } & Omit<
    ComponentPropsWithoutRef<typeof Link>,
    keyof Common | 'href'
  >;
type ButtonProps = Common & { href?: undefined } & Omit<
    ComponentPropsWithoutRef<'button'>,
    keyof Common
  >;

export type IconButtonProps = LinkProps | ButtonProps;

function LinkIconButton({ label, badge, className, children, href, ...rest }: LinkProps) {
  return (
    <Link href={href} {...rest} aria-label={label} className={cn(CLASSES, className)}>
      {children}
      {badge}
    </Link>
  );
}

function ButtonIconButton({
  label,
  badge,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} {...rest} aria-label={label} className={cn(CLASSES, className)}>
      {children}
      {badge}
    </button>
  );
}

/** A 44x44 round control holding an icon. A link when `href` is given, otherwise a button. */
export function IconButton(props: IconButtonProps) {
  return props.href === undefined ? <ButtonIconButton {...props} /> : <LinkIconButton {...props} />;
}
