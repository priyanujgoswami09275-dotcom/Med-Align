import { useId, useState } from 'react';
import { ChevronDown, CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { buildExplanation } from '@/lib/explainer';
import { FIELD_TEXTS, STATUS_PRESENTATION } from '@/lib/present';
import type { Result } from '@/lib/types';

function Value({
  title,
  side,
  normalizedLabel,
}: {
  title: string;
  side: ReturnType<typeof buildExplanation>['rows'][number]['doctor'];
  normalizedLabel: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 bg-card/40 p-2.5">
      <p className="text-[11px] font-semibold text-muted-foreground">{title}</p>
      <p className="mt-1 break-words text-[13px] text-foreground">
        {side ? side.display ?? 'Not readable in this source.' : 'Not found in the provided source.'}
      </p>
      {side?.normalizedDisplay && (
        <p className="mt-1 break-words text-[12px] text-muted-foreground">
          {normalizedLabel} {side.normalizedDisplay}
        </p>
      )}
      {side?.edited && (
        <p className="mt-1 text-[12px] text-info">
          Edited by you. Original extracted value: {side.originalDisplay ?? 'not available'}.
        </p>
      )}
      {side?.unresolvedReason && (
        <p className="mt-1 inline-flex items-start gap-1 text-[12px] text-warning">
          <CircleHelp aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {side.unresolvedReason}
        </p>
      )}
    </div>
  );
}

export function WhyFlagged({ result }: { result: Result }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const explanation = buildExplanation(result);
  const statusLabel = STATUS_PRESENTATION[result.status].label;

  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-controls={panelId}
        className="min-h-11 w-full justify-between gap-2 px-3 text-left text-[13px]"
        onClick={() => setOpen((value) => !value)}
      >
        Why was this flagged?
        <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <section id={panelId} aria-label="Comparison explanation" className="mt-3 flex flex-col gap-3">
          <p className="text-[13px] leading-5 text-foreground">{explanation.intro}</p>
          <p className="text-[12px] font-semibold text-muted-foreground">Final status: {statusLabel} ({result.status})</p>
          {result.status === 'NO_DIFFERENCES_FOUND' && explanation.matchedFields.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              Fields compared and matched: {explanation.matchedFields.join(', ')}.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {explanation.rows.map((row) => (
              <li key={row.field} className="rounded-lg border border-border/60 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-foreground">
                    {FIELD_TEXTS[row.field]}
                  </h3>
                  <span className={`text-[12px] font-semibold ${row.outcome === 'different' ? 'text-warning' : 'text-muted-foreground'}`}>
                    {row.outcome === 'match' ? 'Matched' : row.outcome === 'different' ? 'Different' : 'Not compared'}
                    {row.unresolved && ' · Needs review'}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Value title="Doctor-provided source" side={row.doctor} normalizedLabel={row.normalizedLabel} />
                  <Value title="Pharmacy-provided source" side={row.label} normalizedLabel={row.normalizedLabel} />
                </div>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['Doctor-provided source evidence', result.doctor?.evidence],
              ['Pharmacy-provided source evidence', result.label?.evidence],
            ] as const).map(([title, quote]) => (
              <div key={title} className="rounded-lg border border-border/60 bg-card/30 p-2.5">
                <h3 className="text-[12px] font-semibold text-muted-foreground">{title}</h3>
                {quote ? (
                  <q className="mt-1 block break-words text-[13px] italic text-foreground">{quote}</q>
                ) : (
                  <p className="mt-1 text-[12px] text-muted-foreground">The original excerpt is unavailable.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
