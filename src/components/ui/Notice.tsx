import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './ClientIcon';
import type { CoreIconName } from './icon-core';

export type NoticeTone = 'made' | 'info' | 'attention' | 'alert';

const TONES: Record<NoticeTone, { box: string; icon: CoreIconName; iconClass: string }> = {
  made: { box: 'bg-peach text-ink', icon: 'yarn', iconClass: 'text-forest' },
  info: { box: 'border border-line bg-paper text-ink', icon: 'info', iconClass: '' },
  attention: { box: 'bg-sage text-ink', icon: 'info', iconClass: '' },
  alert: {
    box: 'border-[1.5px] border-alert bg-paper text-alert',
    icon: 'alert',
    iconClass: '',
  },
};

export interface NoticeProps {
  tone: NoticeTone;
  /** Use `alert` for errors and `status` for other messages that appear in response to an action. */
  role?: 'alert' | 'status';
  id?: string;
  className?: string;
  children: ReactNode;
}

export function Notice({ tone, role, id, className, children }: NoticeProps) {
  const { box, icon, iconClass } = TONES[tone];
  return (
    <div
      id={id}
      role={role}
      className={cn(
        'flex items-start gap-2.5 rounded-card px-3.5 py-3 text-[15px] leading-normal',
        box,
        className,
      )}
    >
      <Icon name={icon} className={cn('mt-0.5', iconClass)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
