import { Icon } from './Icon';

export interface ErrorSummaryItem {
  /** `id` of the invalid control. */
  fieldId: string;
  message: string;
}

export interface ErrorSummaryProps {
  id: string;
  /** Translated "Please fix a few details". */
  heading: string;
  items: ErrorSummaryItem[];
  'data-testid'?: string;
  /** Replaces the default jump to the field, e.g. to reveal a field inside a hidden tab first. */
  onSelect?: (fieldId: string) => void;
}

/**
 * Lists links to the invalid fields. Focusable (`tabIndex=-1`) so the form can move focus here
 * after a failed submit.
 */
export function ErrorSummary({
  id,
  heading,
  items,
  'data-testid': testId,
  onSelect,
}: ErrorSummaryProps) {
  if (items.length === 0) return null;
  return (
    <div
      id={id}
      data-testid={testId}
      role="alert"
      tabIndex={-1}
      aria-labelledby={`${id}-heading`}
      className="rounded-2xl border-[1.5px] border-alert bg-panel px-3.5 py-3 text-alert"
    >
      <p id={`${id}-heading`} className="flex items-center gap-2 font-bold">
        <Icon name="alert" />
        <span>{heading}</span>
      </p>
      <ul className="mt-2 grid gap-1 ps-7 text-[15px]">
        {items.map((item) => (
          <li key={item.fieldId}>
            <a
              href={`#${item.fieldId}`}
              onClick={
                onSelect === undefined
                  ? undefined
                  : (event) => {
                      event.preventDefault();
                      onSelect(item.fieldId);
                    }
              }
              className="inline-flex min-h-11 items-center underline underline-offset-[3px]"
            >
              {item.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
