import type { ComponentPropsWithoutRef } from 'react';
import { buttonClasses, type ButtonVariant } from './button-styles';
import { Spinner } from './Spinner';

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  /** Submitting. The only time a button is disabled; never disable to signal a missing choice. */
  busy?: boolean;
  /** Translated "One moment…", shown with the spinner while busy. */
  busyLabel?: string;
}

export function Button({
  variant = 'primary',
  busy = false,
  busyLabel,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      aria-busy={busy ? 'true' : undefined}
      disabled={busy || undefined}
      className={buttonClasses(variant, busy, className)}
    >
      {busy ? (
        <>
          <Spinner />
          <span>{busyLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
