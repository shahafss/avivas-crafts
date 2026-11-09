import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export interface EmptyStateProps {
  icon: IconName;
  title: ReactNode;
  text: string;
  /** A `LinkButton` or `Button`. */
  action?: ReactNode;
}

export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-panel px-5 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-sun-soft text-ink">
        <Icon name={icon} size={26} />
      </span>
      <h2 className="text-xl leading-tight font-extrabold tracking-tight text-balance lg:text-[22px]">
        {title}
      </h2>
      <p className="max-w-[45ch] text-ink-2">{text}</p>
      {action === undefined ? null : <div className="mt-2">{action}</div>}
    </div>
  );
}
