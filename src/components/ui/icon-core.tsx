import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The glyphs the client components use, and the SVG frame every icon shares. Client components
 * import `Icon` from `ClientIcon`, which carries only these, so the glyphs that only server
 * components draw (social, delivery, mail) stay out of the first-load JavaScript (SC-004).
 */
export type CoreIconName =
  'cart' | 'close' | 'zoom' | 'chevron' | 'plus' | 'minus' | 'check' | 'alert' | 'info' | 'yarn';

export type IconDirection = 'start' | 'end' | 'down';

export interface IconProps<Name extends string = string> {
  name: Name;
  /** Pixel size; 22 by default. */
  size?: number;
  /** Only for `chevron` and `arrow`: toward inline-start or inline-end. Flips in RTL. */
  /** `down` is not directional and never flips. */
  direction?: IconDirection;
  className?: string;
}

/** Directional glyphs are drawn pointing toward inline-end in LTR; `direction="start"` mirrors them. */
export function coreGlyph(name: CoreIconName, direction: IconDirection): ReactNode {
  const flip = direction === 'start';
  switch (name) {
    case 'cart':
      return (
        <>
          <path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8z" />
          <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
        </>
      );
    case 'close':
      return <path d="M6 6l12 12M18 6L6 18" />;
    case 'zoom':
      return (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5" />
        </>
      );
    case 'chevron':
      return (
        <path
          d={direction === 'down' ? 'M6 9.5l6 6 6-6' : flip ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'}
        />
      );
    case 'plus':
      return <path d="M12 5v14M5 12h14" />;
    case 'minus':
      return <path d="M5 12h14" />;
    case 'check':
      return <path d="M5 12.5l4.5 4.5L19 7.5" />;
    case 'alert':
      return (
        <>
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4.5M12 17.5v.01" />
        </>
      );
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 11v5M12 8v.01" />
        </>
      );
    case 'yarn':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M6.5 7.5c3 1.5 8 1.5 11 0M5 12c4 1.5 10 1.5 14 0M6.5 16.5c3-1.5 8-1.5 11 0" />
        </>
      );
  }
}

/** Authored inline SVG. Decorative: the control that holds it carries the accessible name. */
export function IconFrame({
  name,
  size = 22,
  direction = 'end',
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn(
        'shrink-0',
        (name === 'chevron' || name === 'arrow') && direction !== 'down' && 'rtl:-scale-x-100',
        className,
      )}
    >
      {children}
    </svg>
  );
}
