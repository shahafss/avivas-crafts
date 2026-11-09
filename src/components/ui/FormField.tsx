import { SelectField, type SelectFieldProps } from './SelectField';
import { TextArea, type TextAreaProps } from './TextArea';
import { TextField, type TextFieldProps } from './TextField';

type TextProps = { as?: 'text' } & TextFieldProps;
type AreaProps = { as: 'textarea' } & TextAreaProps;
type SelectProps = { as: 'select' } & SelectFieldProps;

export type FormFieldProps = TextProps | AreaProps | SelectProps;

function withoutAs<T extends { as?: unknown }>(props: T): Omit<T, 'as'> {
  const rest = { ...props };
  delete rest.as;
  return rest;
}

/**
 * One form field for admin and storefront forms: label, hint, the control and an inline error
 * linked with `aria-describedby`. Built on the shared `ui/` controls, so both areas look alike.
 * Extra props (such as `data-testid`) go to the control.
 */
export function FormField(props: FormFieldProps) {
  if (props.as === 'textarea') return <TextArea {...withoutAs(props)} />;
  if (props.as === 'select') return <SelectField {...withoutAs(props)} />;
  return <TextField {...withoutAs(props)} />;
}
