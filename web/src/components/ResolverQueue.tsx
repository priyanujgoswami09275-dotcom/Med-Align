import { useId, useState } from 'react';
import type { Dispatch } from 'react';
import { ChevronDown, CircleHelp, TriangleAlert } from 'lucide-react';

import { LiveRegion } from '@/components/LiveRegion';
import { Button } from '@/components/ui/button';
import { FIELD_TEXTS, KIND_LABEL } from '@/lib/present';
import { fieldIsReadable, resolverItems } from '@/lib/uncertainty';
import type { Action } from '@/lib/state';
import type { FieldName, SourceKey, SourceState } from '@/lib/types';

const REASON_TEXT = {
  missing: 'No value was read for this field.',
  unreadable_unit: 'This strength unit could not be normalized for comparison.',
  unreadable_frequency: 'This frequency wording could not be normalized for comparison.',
  uncertain_extraction: 'This field was marked uncertain during extraction.',
} as const;

function inputId(sourceKey: SourceKey, rowId: string, field: FieldName) {
  return `med-${sourceKey}-${rowId}-${field}`;
}

export function ResolverQueue({
  sources,
  dispatch,
}: {
  sources: Record<SourceKey, SourceState>;
  dispatch: Dispatch<Action>;
}) {
  const detailsId = useId();
  const [expanded, setExpanded] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const items = (['doctor', 'label'] as SourceKey[]).flatMap((sourceKey) =>
    resolverItems(sourceKey, sources[sourceKey].medicines),
  );

  function focusField(item: (typeof items)[number]) {
    const { sourceKey, rowId, field, reason } = item;
    if (!rowId) return;
    if (reason === 'unreadable_unit') {
      document.getElementById(inputId(sourceKey, rowId, 'strength') + '-unit')?.focus();
      return;
    }
    document.getElementById(inputId(sourceKey, rowId, field))?.focus();
  }

  function confirm(item: (typeof items)[number]) {
    if (!item.rowId) return;
    dispatch({ type: 'confirmMedicineField', key: item.sourceKey, rowId: item.rowId, field: item.field });
    setAnnouncement('Field confirmation recorded for this session. This is not independent clinical verification.');
  }

  return (
    <section id="resolver" tabIndex={-1} aria-labelledby="resolver-title" className="rounded-xl border border-warning/40 bg-warning/5 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="resolver-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
          <TriangleAlert aria-hidden="true" className="size-4 text-warning" />
          Needs your review
          <span className="rounded-full border border-warning/50 px-2 py-0.5 text-[12px] tabular-nums">{items.length}</span>
        </h2>
        {items.length > 0 && (
          <Button
            type="button"
            variant="outline"
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="min-h-11 gap-2 px-3 text-[13px]"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Hide fields' : 'Show fields'}
            <ChevronDown aria-hidden="true" className={`size-4 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted-foreground">
          No extraction fields are waiting for your review right now. This does not confirm the documents themselves.
        </p>
      ) : expanded && (
        <ul id={detailsId} className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((item, index) => {
            const row = sources[item.sourceKey].medicines.find((medicine) => medicine.rowId === item.rowId);
            const canConfirm = Boolean(row && item.reason === 'uncertain_extraction' && fieldIsReadable(row, item.field));
            return (
              <li key={`${item.sourceKey}-${item.rowId ?? index}-${item.field}`} className="rounded-lg border border-warning/40 bg-card/50 p-3">
                <p className="flex items-start gap-2 text-[13px] font-semibold text-foreground">
                  <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                  {KIND_LABEL[item.sourceKey]} · {item.medicineName ?? 'Unnamed medicine row'}
                </p>
                <p className="mt-1 text-[13px] text-foreground">
                  Field: <strong>{FIELD_TEXTS[item.field]}</strong>
                </p>
                <p className="mt-1 break-words text-[12px] text-muted-foreground">
                  Original extracted value: {item.extractedValue ?? 'No extracted value is available.'}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">{REASON_TEXT[item.reason]}</p>
                {item.evidence ? (
                  <q className="mt-2 block break-words text-[12px] italic text-foreground">{item.evidence}</q>
                ) : (
                  <p className="mt-2 text-[12px] text-muted-foreground">The original excerpt is unavailable.</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 px-3 text-[12px]"
                    onClick={() => focusField(item)}
                  >
                    Edit this field
                  </Button>
                  {canConfirm && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 px-3 text-[12px]"
                      onClick={() => confirm(item)}
                    >
                      Confirm this value
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 px-3 text-[12px]"
                    onClick={() => setAnnouncement('This field remains in the review list until you edit or confirm it.')}
                  >
                    Leave unresolved
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <LiveRegion role="status">
        {items.length} fields waiting for review. {announcement}
      </LiveRegion>
    </section>
  );
}
