import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

const BASE =
  'inline-flex items-center justify-center gap-2 text-center transition-colors duration-150 ease-out';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'h-[54px] rounded-pill bg-sun px-7 text-[17px] font-extrabold text-ink hover:bg-sun-hover motion-safe:active:scale-[0.98]',
  secondary:
    'h-12 rounded-pill border-[1.5px] border-ink bg-transparent px-6 text-base font-bold text-ink hover:bg-sun-soft',
  quiet: 'min-h-11 font-bold text-ink underline underline-offset-[3px]',
};

export function buttonClasses(variant: ButtonVariant, busy = false, className?: string): string {
  return cn(BASE, VARIANTS[variant], busy && 'pointer-events-none', className);
}
