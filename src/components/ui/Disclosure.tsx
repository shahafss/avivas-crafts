import type { ReactNode } from 'react';
import { Icon } from './Icon';

export interface DisclosureProps {
  title: string;
  open?: boolean;
  children: ReactNode;
}

/** Native details/summary, no JS. Separate disclosures stack with a rule between them. */
export function Disclosure({ title, open, children }: DisclosureProps) {
  return (
    <details open={open} className="group border-t border-line last-of-type:border-b">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3.5 font-bold [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <Icon
          name="plus"
          className="transition-transform duration-200 ease-out motion-safe:group-open:rotate-45"
        />
      </summary>
      <div className="pb-4 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </details>
  );
}
