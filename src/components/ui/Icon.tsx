import type { ReactNode } from 'react';
import {
  coreGlyph,
  IconFrame,
  type IconDirection,
  type IconProps as FrameProps,
} from './icon-core';

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
  | 'phone'
  | 'instagram'
  | 'facebook'
  | 'tiktok';

function glyph(name: IconName, direction: IconDirection): ReactNode {
  const flip = direction === 'start';
  switch (name) {
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </>
      );
    case 'menu':
      return <path d="M4 7h16M4 12h16M4 17h16" />;
    case 'arrow':
      return <path d={flip ? 'M20 12H4M10 6l-6 6 6 6' : 'M4 12h16M14 6l6 6-6 6'} />;
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
    case 'instagram':
      return (
        <>
          <rect x="4" y="4" width="16" height="16" rx="4.5" />
          <circle cx="12" cy="12" r="3.6" />
          <path d="M16.9 7.1v.01" />
        </>
      );
    case 'facebook':
      return (
        <path d="M14.5 4.5H13A3.5 3.5 0 0 0 9.5 8v2.5H7V14h2.5v6H13v-6h2.2l.6-3.5H13V8.3a.8.8 0 0 1 .8-.8h1.7z" />
      );
    case 'tiktok':
      return (
        <>
          <path d="M13.5 4v10.2a3.4 3.4 0 1 1-3.4-3.4" />
          <path d="M13.5 4c.3 2.4 2 4 4.5 4.2" />
        </>
      );
    default:
      return coreGlyph(name, direction);
  }
}

export type IconProps = FrameProps<IconName>;

/** Authored inline SVG for server components; every glyph. Client components use `ClientIcon`. */
export function Icon({ name, direction = 'end', ...props }: IconProps) {
  return (
    <IconFrame name={name} direction={direction} {...props}>
      {glyph(name, direction)}
    </IconFrame>
  );
}
