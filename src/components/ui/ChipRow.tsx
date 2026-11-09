import { Children, type ReactNode } from 'react';

export interface ChipRowProps {
  /** Translated name of the navigation (e.g. "Categories"). */
  label: string;
  children: ReactNode;
}

/** Scrolls horizontally with snap below 900 px and wraps from 900 px. */
export function ChipRow({ label, children }: ChipRowProps) {
  return (
    <nav aria-label={label}>
      <ul className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 pointer-coarse:[scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {Children.toArray(children).map((child, index) => (
          <li key={index} className="shrink-0">
            {child}
          </li>
        ))}
      </ul>
    </nav>
  );
}
