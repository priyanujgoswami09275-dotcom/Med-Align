// Animated breadcrumb (Home > Add > Review > Report) replacing the numbered
// stepper. Completed steps are clickable back-navigation; the current and
// future steps stay inert so the flow can't be jumped ahead (never straight to
// Report with no data). Motion sits under the app-wide MotionConfig
// reducedMotion="user", so springs disable themselves for reduced motion.
import { useId, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

import type { Step } from '../lib/types';

const ORDER: { key: Step; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'add', label: 'Add' },
  { key: 'review', label: 'Review' },
  { key: 'report', label: 'Report' },
];

const spring = { type: 'spring', stiffness: 500, damping: 40, mass: 0.6 } as const;

const BADGE_STATES = {
  current: 'border-ring bg-ring text-white',
  done: 'border-ring/60 bg-ring/15 text-info',
  todo: 'border-input text-muted-foreground',
} as const;

const LABEL_STATES = {
  current: 'font-semibold text-foreground',
  done: 'text-info',
  todo: 'text-muted-foreground',
} as const;

export function Breadcrumb({ step, onNavigate }: { step: Step; onNavigate: (step: Step) => void }) {
  const currentIdx = ORDER.findIndex((s) => s.key === step);
  const uid = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  return (
    <nav aria-label="Step progress" data-step={step}>
      <span className="sr-only">
        Step {currentIdx + 1} of {ORDER.length}
      </span>
      <ol
        ref={listRef}
        onMouseLeave={() => setHover(null)}
        className="flex items-center gap-0.5 text-[12px] text-muted-foreground"
      >
        {ORDER.map((s, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo';
          const body = (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={[
                  'flex size-5 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold',
                  BADGE_STATES[state],
                ].join(' ')}
              >
                {i + 1}
              </span>
              <span aria-current={state === 'current' ? 'step' : undefined} className={LABEL_STATES[state]}>
                {s.label}
              </span>
            </span>
          );

          return (
            <li key={s.key} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight aria-hidden="true" className="size-3.5 text-border" />}
              {state === 'done' ? (
                <motion.button
                  type="button"
                  layout="position"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={() => onNavigate(s.key)}
                  className="relative flex min-h-11 cursor-pointer items-center rounded-md px-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {hover === i && (
                    <motion.span
                      layoutId={`${uid}-hover`}
                      transition={spring}
                      className="absolute inset-0 rounded-md bg-muted"
                    />
                  )}
                  {body}
                </motion.button>
              ) : (
                <motion.span layout="position" className="relative flex min-h-11 items-center px-1.5">
                  {body}
                </motion.span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
