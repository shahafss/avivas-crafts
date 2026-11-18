import { coreGlyph, IconFrame, type CoreIconName, type IconProps } from './icon-core';

/** `Icon` for client components: only the glyphs they draw (see `icon-core.tsx`). */
export function Icon({ name, direction = 'end', ...props }: IconProps<CoreIconName>) {
  return (
    <IconFrame name={name} direction={direction} {...props}>
      {coreGlyph(name, direction)}
    </IconFrame>
  );
}
