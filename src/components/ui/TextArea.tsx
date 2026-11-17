import { useId, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';
import { CONTROL, Field, describe, type FieldChrome } from './Field';

export interface TextAreaProps
  extends FieldChrome, Omit<ComponentPropsWithoutRef<'textarea'>, 'id'> {
  id?: string;
}

export function TextArea({ id, label, hint, error, className, rows = 4, ...rest }: TextAreaProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} className={className}>
      <textarea
        {...rest}
        id={fieldId}
        rows={rows}
        {...describe(fieldId, { hint, error }, rest['aria-describedby'])}
        className={cn(CONTROL, 'min-h-32 py-3 leading-relaxed')}
      />
    </Field>
  );
}
