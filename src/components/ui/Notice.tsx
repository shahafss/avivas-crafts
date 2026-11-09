import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon, type IconName } from './Icon';

export type NoticeTone = 'made' | 'info' | 'attention' | 'alert';

const TONES: Record<NoticeTone, { box: string; icon: IconName }> = {
  made: { box: 'bg-rose text-rose-ink', icon: 'yarn' },
  info: { box: 'border border-line bg-panel text-ink', icon: 'info' },
  attention: { box: 'bg-sun-soft text-ink', icon: 'info' },
  alert: { box: 'border-[1.5px] border-alert bg-panel text-alert', icon: 'alert' },
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
  const { box, icon } = TONES[tone];
  return (
    <div
      id={id}
      role={role}
      className={cn(
        'flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-[15px] leading-normal',
        box,
        className,
      )}
    >
      <Icon name={icon} className="mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
