import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'quiet';

const BASE =
  'inline-flex items-center justify-center gap-2 text-center transition-colors duration-150 ease-out';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'h-[52px] rounded-pill bg-forest px-7 text-base font-semibold text-paper hover:bg-forest-hover motion-safe:active:scale-[0.98]',
  secondary:
    'h-12 rounded-pill border-[1.5px] border-ink bg-transparent px-6 text-base font-semibold text-ink hover:bg-photo',
  soft: 'h-12 rounded-pill bg-sage px-6 text-base font-semibold text-ink hover:bg-sage-hover',
  quiet: 'min-h-11 font-semibold text-ink underline underline-offset-[3px]',
};

export function buttonClasses(variant: ButtonVariant, busy = false, className?: string): string {
  return cn(BASE, VARIANTS[variant], busy && 'pointer-events-none', className);
}
