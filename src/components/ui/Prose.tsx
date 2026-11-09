import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Wrapper for Markdown output on content pages (17/1.75, 68ch). */
export function Prose({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'max-w-[68ch] text-[17px] leading-[1.75] text-ink',
        '[&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-[22px] [&_h2]:leading-tight [&_h2]:font-extrabold [&_h2]:tracking-tight [&_h2]:text-balance',
        '[&_h3]:mt-6 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:leading-snug [&_h3]:font-bold',
        '[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:ps-6 [&_li]:my-1',
        '[&_a]:text-ink [&_a]:underline [&_a]:underline-offset-[3px]',
        '[&_strong]:font-bold',
        '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[15px]',
        '[&_th]:border-b-[1.5px] [&_th]:border-field [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-bold',
        '[&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:text-start',
        className,
      )}
    >
      {children}
    </div>
  );
}
