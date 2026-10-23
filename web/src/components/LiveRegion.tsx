// Live region that stays silent for sighted users but announces its text to
// assistive tech. Polite by default; pass role for alert-style announcements.
import type { ReactNode } from 'react';

export function LiveRegion({ children, role }: { children: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div className="sr-only" aria-live="polite" role={role}>
      {children}
    </div>
  );
}
