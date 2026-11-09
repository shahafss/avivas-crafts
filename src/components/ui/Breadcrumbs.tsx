import Link from 'next/link';
import { Icon } from './Icon';

export interface Crumb {
  label: string;
  /** Omit on the last (current) item. */
  href?: string;
  /** `he` for owner-written Hebrew text shown on an English page (FR-045). */
  lang?: 'he';
}

export interface BreadcrumbsProps {
  /** Translated name of the navigation. */
  label: string;
  items: Crumb[];
}

export function Breadcrumbs({ label, items }: BreadcrumbsProps) {
  return (
    <nav aria-label={label} className="text-[13px] text-ink-2">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${String(index)}`} className="flex items-center gap-1.5">
              {last || item.href === undefined ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  lang={item.lang}
                  dir={item.lang === undefined ? undefined : 'auto'}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  lang={item.lang}
                  dir={item.lang === undefined ? undefined : 'auto'}
                  className="hover:underline"
                >
                  {item.label}
                </Link>
              )}
              {last ? null : <Icon name="chevron" direction="end" size={14} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
