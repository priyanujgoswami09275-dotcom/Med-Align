// The app wordmark. On the tool screens it returns to Home; on Home itself it
// renders inert (no nested interactive element).
import type { Step } from '../lib/types';

export function Wordmark({ onHome, current }: { onHome: () => void; current: Step }) {
  const mark = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 shrink-0" fill="none">
        <rect x="1" y="1" width="22" height="22" rx="4" fill="var(--foreground)" />
        <path d="M6 8h12M6 15h6M15 15h3" stroke="var(--background)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-lg font-semibold tracking-tight text-foreground">MedAlign</span>
    </>
  );
  if (current === 'home') {
    return <div className="flex min-h-11 items-center gap-2 px-1">{mark}</div>;
  }
  return (
    <button
      type="button"
      onClick={onHome}
      className="flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-md border border-transparent px-1 text-foreground hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label="MedAlign — back to the Home screen"
    >
      {mark}
    </button>
  );
}
