import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { FieldError, describe, hintId, type FieldChrome } from './Field';
import { Icon } from './Icon';

export interface CheckboxProps
  extends Omit<FieldChrome, 'label'>, Omit<ComponentPropsWithoutRef<'input'>, 'id' | 'type'> {
  id?: string;
  /** Text, or text with a link (the terms checkbox). */
  label: ReactNode;
}

/**
 * The real input is transparent and covers only a 44x44 px square centred on the 24 px box
 * (storefront.md section 7.10, 003 FR-028), so a tap at the box toggles it. It has `z-10` because the
 * check icon (opacity 0 until ticked) forms a stacking context that would otherwise paint above it. The label text toggles
 * the box through `<label for>` (the row is at least 44 px high). Links inside the label are
 * ordinary links: the input does not reach them, and browsers never toggle a checkbox when a link
 * in its label is activated.
 */
export function Checkbox({ id, label, hint, error, className, ...rest }: CheckboxProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className={className}>
      <label
        htmlFor={fieldId}
        className="relative flex min-h-11 cursor-pointer items-start gap-3 py-2 has-disabled:cursor-not-allowed has-disabled:text-ink-2"
      >
        <input
          {...rest}
          type="checkbox"
          id={fieldId}
          {...describe(fieldId, { hint, error })}
          className="peer absolute -start-2.5 -top-px z-10 size-11 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
        />
        <span
          className={cn(
            'mt-px grid size-6 shrink-0 place-items-center rounded-md border-[1.5px] border-field bg-paper text-paper',
            'peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ink',
            'peer-aria-invalid:border-alert [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100',
            // Disabled (storefront.md 7.10): a setting the shop cannot offer.
            'peer-disabled:border-line peer-disabled:bg-photo peer-checked:peer-disabled:border-ink-2 peer-checked:peer-disabled:bg-ink-2',
          )}
        >
          <Icon name="check" size={16} />
        </span>
        <span className="min-w-0">
          <span className="block text-base leading-snug">{label}</span>
          {hint === undefined ? null : (
            <span id={hintId(fieldId)} className="block text-[13px] leading-snug text-ink-2">
              {hint}
            </span>
          )}
        </span>
      </label>
      {error === undefined ? null : <FieldError id={fieldId}>{error}</FieldError>}
    </div>
  );
}
