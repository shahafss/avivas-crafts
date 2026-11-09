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
 * The whole label row is the target (at least 44 px): the real input is transparent and stretched
 * over it. Links inside the label sit above the input (`[&_a]:relative [&_a]:z-10`), so they stay
 * clickable; the input itself must stay hittable, so the text span is not lifted as a whole.
 */
export function Checkbox({ id, label, hint, error, className, ...rest }: CheckboxProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className={className}>
      <label
        htmlFor={fieldId}
        className="relative flex min-h-11 cursor-pointer items-start gap-3 py-2"
      >
        <input
          {...rest}
          type="checkbox"
          id={fieldId}
          {...describe(fieldId, { hint, error })}
          className="peer absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
        />
        <span
          className={cn(
            'mt-px grid size-6 shrink-0 place-items-center rounded-md border-[1.5px] border-field bg-panel text-panel',
            'peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ink',
            'peer-aria-invalid:border-alert [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100',
          )}
        >
          <Icon name="check" size={16} />
        </span>
        <span className="min-w-0 [&_a]:relative [&_a]:z-10">
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
