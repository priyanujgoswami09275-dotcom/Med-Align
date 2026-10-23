// Status = icon + text + color, never color alone (MASTER.md status table).
import type { StatusVariant } from '../lib/present';
import { STATUS_PRESENTATION } from '../lib/present';
import type { Status } from '../lib/types';

const BADGE_CLASSES: Record<StatusVariant, string> = {
  good: 'border-success/40 bg-success/10 text-success',
  // 5% tint keeps the amber text at ≥ 4.5:1 on the light theme (10% is 4.39).
  diff: 'border-warning/50 bg-warning/5 text-warning',
  warn: 'border-info/40 bg-info/10 text-info',
  dim: 'border-border bg-muted/60 text-muted-foreground',
};

export function StatusBadge({ status, size = 'md' }: { status: Status; size?: 'md' | 'sm' }) {
  const presentation = STATUS_PRESENTATION[status];
  const Icon = presentation.icon;
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[12px]' : 'px-2.5 py-1 text-[13px]',
        BADGE_CLASSES[presentation.variant],
      ].join(' ')}
    >
      <Icon aria-hidden="true" className={size === 'sm' ? 'size-3.5' : 'size-4'} strokeWidth={2.25} />
      <span>{presentation.label}</span>
    </span>
  );
}
