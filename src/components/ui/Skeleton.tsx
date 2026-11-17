import { cn } from '@/lib/cn';

export type SkeletonVariant = 'card' | 'line' | 'row';

const PHOTO = 'bg-photo motion-safe:animate-pulse';

function Bar({ className }: { className: string }) {
  return <div className={cn('rounded-chip bg-photo motion-safe:animate-pulse', className)} />;
}

export interface SkeletonProps {
  /** Layout the placeholder stands in for. */
  variant: SkeletonVariant;
  /** Translated "Loading…", read out once as a status. */
  label: string;
  className?: string;
}

/** Placeholder blocks in the final layout. The blocks are hidden from assistive technology. */
export function Skeleton({ variant, label, className }: SkeletonProps) {
  return (
    <div aria-busy="true" className={className}>
      <span role="status" className="sr-only">
        {label}
      </span>
      <div aria-hidden="true">
        {variant === 'card' ? (
          <div className="grid gap-2.5">
            <div className={cn(PHOTO, 'aspect-[4/5]')} />
            <Bar className="h-4 w-3/4" />
            <Bar className="h-4 w-1/3" />
          </div>
        ) : null}
        {variant === 'line' ? (
          <div className="flex gap-3">
            <div className={cn(PHOTO, 'h-[90px] w-[72px] shrink-0')} />
            <div className="grid flex-1 content-start gap-2">
              <Bar className="h-4 w-2/3" />
              <Bar className="h-4 w-1/3" />
              <Bar className="h-10 w-32" />
            </div>
          </div>
        ) : null}
        {variant === 'row' ? (
          <div className="flex justify-between gap-6">
            <Bar className="h-4 w-1/3" />
            <Bar className="h-4 w-1/5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
