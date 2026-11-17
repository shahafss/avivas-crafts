import type { ReactNode } from 'react';
import { Icon } from './Icon';

export interface FieldChrome {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

export function hintId(id: string): string {
  return `${id}-hint`;
}

export function errorId(id: string): string {
  return `${id}-error`;
}

/**
 * `aria-describedby` and `aria-invalid` for a control, from its hint and error. `extra` is the
 * caller's own `aria-describedby` (another field's hint, say); it is added, never lost.
 */
export function describe(
  id: string,
  { hint, error }: Pick<FieldChrome, 'hint' | 'error'>,
  extra?: string,
) {
  const ids = [
    hint === undefined ? null : hintId(id),
    error === undefined ? null : errorId(id),
    extra === undefined || extra === '' ? null : extra,
  ].filter((value): value is string => value !== null);
  return {
    'aria-describedby': ids.length > 0 ? ids.join(' ') : undefined,
    'aria-invalid': error === undefined ? undefined : (true as const),
  };
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p
      id={errorId(id)}
      className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-alert"
    >
      <Icon name="alert" size={16} className="mt-px" />
      <span>{children}</span>
    </p>
  );
}

/** Label above, optional hint under the label, the control, and the error under the control. */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: FieldChrome & { id: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm leading-snug font-bold">
        {label}
      </label>
      {hint === undefined ? null : (
        <p id={hintId(id)} className="text-[13px] leading-snug text-ink-2">
          {hint}
        </p>
      )}
      <div className="mt-1.5">{children}</div>
      {error === undefined ? null : <FieldError id={id}>{error}</FieldError>}
    </div>
  );
}

/** Shared look of text-like controls: 52 px, white, 1.5 px `field` border, 16 px text. */
export const CONTROL =
  'w-full rounded-chip border-[1.5px] border-field bg-paper px-4 text-base text-ink placeholder:text-ink-2 focus:border-ink focus:ring-1 focus:ring-ink aria-invalid:border-alert aria-invalid:focus:ring-alert';
