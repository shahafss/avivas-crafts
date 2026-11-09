import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

const STATES = ['done', 'current', 'todo'] as const;

export interface OrderProgressProps {
  /** Accessible name of the list ("Order progress"). */
  label: string;
  /** The four step labels in order: Received, Being made, Shipped / Ready for pickup, Completed. */
  steps: readonly [string, string, string, string];
  /** Index (0-3) of the current step; earlier steps are done, later ones still to come. */
  current: 0 | 1 | 2 | 3;
}

/**
 * The customer order page's four steps (storefront.md §8.8, 002 research R11). A Server Component
 * with no strings of its own. Looks come from `data-state`, never a `style` attribute; the state is
 * also carried by the check icon, the bold label and `aria-current`, not by colour alone.
 * Vertical below 640 px, horizontal from 640 px.
 */
export function OrderProgress({ label, steps, current }: OrderProgressProps) {
  return (
    <ol
      role="list"
      data-testid="order-progress"
      aria-label={label}
      className="m-0 flex list-none flex-col rounded-card bg-panel p-[18px] sm:flex-row"
    >
      {steps.map((text, index) => {
        const state = STATES[index < current ? 0 : index === current ? 1 : 2];
        return (
          <li
            key={text}
            data-testid="order-step"
            data-state={state}
            aria-current={index === current ? 'step' : undefined}
            className={cn(
              'group relative flex min-h-11 items-start gap-3 pb-5 last:pb-0',
              'sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center',
              // The 2 px connector to the next step: down the dots on a phone, across from 640 px.
              'after:absolute after:start-[13px] after:top-8 after:bottom-1 after:w-0.5 after:bg-line last:after:hidden',
              'sm:after:start-[calc(50%+22px)] sm:after:end-[calc(-50%+22px)] sm:after:top-[13px] sm:after:bottom-auto sm:after:h-0.5 sm:after:w-auto',
            )}
          >
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full',
                'group-data-[state=done]:bg-ink group-data-[state=done]:text-panel',
                'group-data-[state=current]:border-[1.5px] group-data-[state=current]:border-ink group-data-[state=current]:bg-panel group-data-[state=current]:ring-[3px] group-data-[state=current]:ring-sun',
                'group-data-[state=todo]:border-[1.5px] group-data-[state=todo]:border-field group-data-[state=todo]:bg-panel',
              )}
            >
              {state === 'done' ? <Icon name="check" size={16} /> : null}
            </span>
            <span
              className={cn(
                'pt-1 text-[15px] leading-snug text-ink sm:pt-0',
                'group-data-[state=current]:font-bold group-data-[state=todo]:text-ink-2',
              )}
            >
              {text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
