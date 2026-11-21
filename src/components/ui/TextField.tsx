import { useId, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';
import { CONTROL, Field, describe, type FieldChrome } from './Field';

export interface TextFieldProps extends FieldChrome, Omit<ComponentPropsWithoutRef<'input'>, 'id'> {
  id?: string;
  /** Email, phone, postal code: left-to-right text that sits at the end edge in RTL pages. */
  ltr?: boolean;
}

export function TextField({
  id,
  label,
  hint,
  error,
  ltr = false,
  className,
  ...rest
}: TextFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} className={className}>
      <input
        type="text"
        {...rest}
        id={fieldId}
        dir={ltr ? 'ltr' : undefined}
        {...describe(fieldId, { hint, error }, rest['aria-describedby'])}
        aria-invalid={error === undefined ? rest['aria-invalid'] : true}
        className={cn(CONTROL, 'h-[52px]', ltr && 'rtl:text-end')}
      />
    </Field>
  );
}
