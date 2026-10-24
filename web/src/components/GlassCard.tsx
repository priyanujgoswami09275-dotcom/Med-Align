// Shared flat paper surface for source and report sections.
import type { ReactNode } from 'react';

export function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`flat-surface rounded-lg p-5 ${className ?? ''}`}>{children}</div>;
}
