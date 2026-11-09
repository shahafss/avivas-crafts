import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type IconName =
  | 'search'
  | 'cart'
  | 'menu'
  | 'close'
  | 'zoom'
  | 'chevron'
  | 'arrow'
  | 'plus'
  | 'minus'
  | 'check'
  | 'truck'
  | 'pin'
  | 'card'
  | 'yarn'
  | 'alert'
  | 'info'
  | 'mail'
  | 'phone';

const DIRECTIONAL: ReadonlySet<IconName> = new Set<IconName>(['chevron', 'arrow']);

/** Directional glyphs are drawn pointing toward inline-end in LTR; `direction="start"` mirrors them. */
function glyph(name: IconName, direction: 'start' | 'end' | 'down'): ReactNode {
  const flip = direction === 'start';
  switch (name) {
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </>
      );
    case 'cart':
      return (
        <>
          <path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8z" />
          <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
        </>
      );
    case 'menu':
      return <path d="M4 7h16M4 12h16M4 17h16" />;
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
    case 'arrow':
      return <path d={flip ? 'M20 12H4M10 6l-6 6 6 6' : 'M4 12h16M14 6l6 6-6 6'} />;
    case 'plus':
      return <path d="M12 5v14M5 12h14" />;
    case 'minus':
      return <path d="M5 12h14" />;
    case 'check':
      return <path d="M5 12.5l4.5 4.5L19 7.5" />;
    case 'truck':
      return (
        <>
          <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
          <circle cx="7" cy="17.5" r="1.6" />
          <circle cx="17" cy="17.5" r="1.6" />
        </>
      );
    case 'pin':
      return (
        <>
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" />
          <circle cx="12" cy="10" r="2.3" />
        </>
      );
    case 'card':
      return (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
        </>
      );
    case 'yarn':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M6.5 7.5c3 1.5 8 1.5 11 0M5 12c4 1.5 10 1.5 14 0M6.5 16.5c3-1.5 8-1.5 11 0" />
        </>
      );
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
    case 'mail':
      return (
        <>
          <rect x="3" y="5.5" width="18" height="13" rx="2" />
          <path d="M3.5 7l8.5 6 8.5-6" />
        </>
      );
    case 'phone':
      return (
        <path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 6a2 2 0 0 1 2-2z" />
      );
  }
}

export interface IconProps {
  name: IconName;
  /** Pixel size; 22 by default. */
  size?: number;
  /** Only for `chevron` and `arrow`: toward inline-start or inline-end. Flips in RTL. */
  /** `down` is not directional and never flips. */
  direction?: 'start' | 'end' | 'down';
  className?: string;
}

/** Authored inline SVG. Decorative: the control that holds it carries the accessible name. */
export function Icon({ name, size = 22, direction = 'end', className }: IconProps) {
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
        DIRECTIONAL.has(name) && direction !== 'down' && 'rtl:-scale-x-100',
        className,
      )}
    >
      {glyph(name, direction)}
    </svg>
  );
}
