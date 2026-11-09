import { useId, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';
import { CONTROL, Field, describe, type FieldChrome } from './Field';
import { Icon } from './Icon';

export interface SelectFieldProps
  extends FieldChrome, Omit<ComponentPropsWithoutRef<'select'>, 'id'> {
  id?: string;
}

export function SelectField({
  id,
  label,
  hint,
  error,
  className,
  children,
  ...rest
}: SelectFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        <select
          {...rest}
          id={fieldId}
          {...describe(fieldId, { hint, error })}
          className={cn(CONTROL, 'h-[52px] appearance-none pe-11')}
        >
          {children}
        </select>
        <Icon
          name="chevron"
          direction="down"
          size={18}
          className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2"
        />
      </div>
    </Field>
  );
}
