import { CircleCheck, ClipboardList, FileText, Home, Lock } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';
import type { Step } from '@/lib/types';

type StepItem = {
  key: Step;
  label: string;
  icon: LucideIcon;
  reason: string;
};

const STEPS: StepItem[] = [
  { key: 'home', label: 'Home', icon: Home, reason: 'Always available' },
  { key: 'add', label: 'Add', icon: ClipboardList, reason: 'Add both lists' },
  { key: 'review', label: 'Review', icon: CircleCheck, reason: 'Read or add a medicine first.' },
  { key: 'report', label: 'Report', icon: FileText, reason: 'Compare the two lists first.' },
];

export function StepNav({
  step,
  reviewReady,
  reportReady,
  onNavigate,
}: {
  step: Step;
  reviewReady: boolean;
  reportReady: boolean;
  onNavigate: (step: Step) => void;
}) {
  const ready: Record<Step, boolean> = {
    home: true,
    add: true,
    review: reviewReady,
    report: reportReady,
  };

  return (
    <nav
      data-step-nav
      aria-label="Workflow steps"
      className={[
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2',
        'pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur print:hidden',
        'lg:sticky lg:top-6 lg:h-fit lg:border-t-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-0 lg:backdrop-blur-none',
      ].join(' ')}
    >
      <ol className="grid grid-cols-4 gap-1 lg:flex lg:flex-col lg:gap-1.5">
        {STEPS.map((item) => {
          const enabled = ready[item.key];
          const current = item.key === step;
          const Icon = item.icon;
          const reasonId = `step-${item.key}-reason`;

          return (
            <li key={item.key} className="min-w-0">
              <button
                type="button"
                disabled={!enabled}
                aria-disabled={!enabled ? 'true' : undefined}
                aria-current={current ? 'step' : undefined}
                aria-describedby={!enabled ? reasonId : undefined}
                onClick={() => {
                  if (enabled) onNavigate(item.key);
                }}
                className={[
                  'flex min-h-11 w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border px-1 text-center text-[13px] font-semibold transition-colors outline-none motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  current
                    ? 'border-primary bg-primary text-primary-foreground'
                    : enabled
                      ? 'border-border bg-card text-foreground hover:border-primary/50 hover:bg-secondary'
                      : 'cursor-not-allowed border-border/70 bg-muted/40 text-muted-foreground',
                ].join(' ')}
              >
                <span className="flex items-center gap-1">
                  {!enabled ? (
                    <Lock aria-hidden="true" className="size-3.5" />
                  ) : (
                    <Icon aria-hidden="true" className="size-3.5" />
                  )}
                  <span>{item.label}</span>
                </span>
              </button>
              <p
                id={reasonId}
                className="sr-only mt-1 text-[12px] leading-4 text-muted-foreground lg:not-sr-only"
              >
                {item.reason}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
