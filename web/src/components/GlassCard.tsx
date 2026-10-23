// Frosted-glass surface over the mesh background. The .glass-card class (see
// index.css) keeps ≥ AA text contrast in both themes and degrades to a solid
// card when backdrop-filter is unsupported.
import type { ReactNode } from 'react';

export function GlassCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`glass-card rounded-xl p-5 ${className ?? ''}`}>{children}</div>;
}
