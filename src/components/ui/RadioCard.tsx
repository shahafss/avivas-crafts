import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface RadioCardProps extends Omit<
  ComponentPropsWithoutRef<'input'>,
  'id' | 'type' | 'title'
> {
  id?: string;
  title: string;
  /** Shown at inline-end, e.g. a `Price`. */
  trailing?: ReactNode;
  description?: ReactNode;
}

/**
 * A full-width option card around a native radio. The radio stays focusable (visually hidden);
 * the focus ring is drawn on the card.
 */
export function RadioCard({
  id,
  title,
  trailing,
  description,
  className,
  ...rest
}: RadioCardProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <label
      htmlFor={fieldId}
      className={cn(
        'relative flex min-h-11 w-full cursor-pointer items-start justify-between gap-3 rounded-chip border-[1.5px] border-field bg-panel p-3.5 sm:p-4',
        'has-checked:border-ink has-checked:bg-sun-soft has-checked:ring-1 has-checked:ring-ink has-checked:ring-inset',
        'has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-ink',
        className,
      )}
    >
      {/* Transparent and stretched over the card: still focusable, and it is what a click lands on.
          Nothing clickable (a link, a button) may go inside the card: this input covers it.
          (Checkbox lifts only the links in its label above the input with `[&_a]:relative
          [&_a]:z-10`; do the same here before putting a link in a card.) */}
      <input
        {...rest}
        type="radio"
        id={fieldId}
        className="peer absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
      />
      <span className="min-w-0">
        <span className="block text-base leading-snug font-bold">{title}</span>
        {description === undefined ? null : (
          <span className="mt-0.5 block text-sm leading-snug text-ink-2">{description}</span>
        )}
      </span>
      {trailing === undefined ? null : <span className="shrink-0 font-bold">{trailing}</span>}
    </label>
  );
}
