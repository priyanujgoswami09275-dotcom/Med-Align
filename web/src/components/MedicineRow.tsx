// One editable medicine row. Uncertain or unread fields get a warning outline,
// a triangle icon, and the exact "Please confirm" tag; the first edit clears the
// row-level flag (compare.js then compares user-confirmed values).
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Trash2, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KIND_LABEL } from '@/lib/present';
import { resolverItems } from '@/lib/uncertainty';
import type { Medicine, SourceKey } from '@/lib/types';
import type { ResolverReason } from '@/lib/uncertainty';

const UNIT_OPTIONS = ['mg', 'mcg', 'µg', 'g', 'ml'];

function Field({
  label,
  reason,
  children,
}: {
  label: string;
  reason?: ResolverReason;
  children: ReactNode;
}) {
  const warning = Boolean(reason);
  const warningLabel = reason === 'uncertain_extraction'
    ? ' (hard to read — please confirm)'
    : reason === 'missing'
      ? ' (missing — add a value)'
      : reason === 'unreadable_unit'
        ? ' (unit unreadable — choose a unit)'
        : reason === 'unreadable_frequency'
          ? ' (could not be compared — edit wording)'
          : '';

  return (
    <label
      className={[
        'flex min-w-0 flex-col gap-1 rounded-lg border p-2.5',
        warning ? 'border-warning/60 bg-warning/5' : 'border-border/70 bg-card/40',
      ].join(' ')}
    >
      <span className="text-[12px] font-medium text-foreground">
        {label + warningLabel}
      </span>
      {children}
    </label>
  );
}

export function MedicineRow({
  sourceKey,
  row,
  index,
  onPatch,
  onDelete,
}: {
  sourceKey: SourceKey;
  row: Medicine;
  index: number;
  onPatch: (patch: Partial<Medicine>) => void;
  onDelete: () => void;
}) {
  const [doseDraft, setDoseDraft] = useState(
    row.strength_value !== null ? String(row.strength_value) : '',
  );

  const unitOptions = UNIT_OPTIONS.includes(row.strength_unit ?? '')
    ? UNIT_OPTIONS
    : [row.strength_unit, ...UNIT_OPTIONS].filter((unit): unit is string => Boolean(unit));

  const pendingReasons = new Map(
    resolverItems(sourceKey, [row]).map((item) => [item.field, item.reason]),
  );
  const nameReason = pendingReasons.get('name');
  const strengthReason = pendingReasons.get('strength');
  const frequencyReason = pendingReasons.get('frequency');
  const doseReason = strengthReason === 'unreadable_unit'
    ? undefined
    : strengthReason === 'missing' && row.strength_value !== null
      ? undefined
      : strengthReason;
  const unitReason = strengthReason === 'missing' && row.strength_unit?.trim()
    ? undefined
    : strengthReason;
  const fromImage = row.fromImage === true;
  const rowId = row.rowId ?? sourceKey + '-' + index;

  function setText(field: 'name' | 'frequency_text', value: string) {
    const next = value.slice(0, 120);
    onPatch({ [field]: next === '' ? null : next });
  }

  return (
    <div
      className={[
        'flex flex-col gap-2.5 rounded-xl border bg-card/30 p-3',
        row.uncertain ? 'border-warning/70 ring-2 ring-warning/20' : 'border-border/70',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold text-muted-foreground">
          Row {index + 1}
          {fromImage && ' · read from image, not machine-verified'}
        </span>
        {row.uncertain && (
          <span className="inline-flex items-center gap-1 rounded-full border border-warning/60 bg-warning/5 px-2 py-0.5 text-[12px] font-semibold text-warning">
            <TriangleAlert aria-hidden="true" className="size-3.5" />
            Please confirm
          </span>
        )}
      </div>

      <Field label="Name" reason={nameReason}>
        <Input
          id={`med-${sourceKey}-${rowId}-name`}
          name="name"
          value={row.name ?? ''}
          className="min-h-11 bg-card/60 text-base"
          autoComplete="off"
          onChange={(event) => setText('name', event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Dose number" reason={doseReason}>
          <Input
            id={`med-${sourceKey}-${rowId}-strength`}
            name="strength_value"
            inputMode="decimal"
            value={doseDraft}
            placeholder="e.g. 500"
            className="min-h-11 bg-card/60 text-base"
            autoComplete="off"
            onChange={(event) => {
              const next = event.target.value;
              setDoseDraft(next);
              const text = next.trim();
              onPatch({
                strength_value: /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null,
              });
            }}
          />
        </Field>

        <Field label="Unit" reason={unitReason}>
          <select
            id={`med-${sourceKey}-${rowId}-strength-unit`}
            name="strength_unit"
            value={row.strength_unit ?? ''}
            className="min-h-11 w-full rounded-lg border border-input bg-card/60 px-2.5 text-base text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            onChange={(event) => {
              onPatch({ strength_unit: event.target.value === '' ? null : event.target.value });
            }}
          >
            <option value="">not readable</option>
            {unitOptions.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="How often" reason={frequencyReason}>
        <Input
          id={`med-${sourceKey}-${rowId}-frequency`}
          name="frequency_text"
          value={row.frequency_text ?? ''}
          placeholder="e.g. twice daily"
          className="min-h-11 bg-card/60 text-base"
          autoComplete="off"
          onChange={(event) => setText('frequency_text', event.target.value)}
        />
      </Field>

      {row.evidence && (
        <p className="text-[12px] text-muted-foreground">
          <span>
            {fromImage ? 'words read from image, not machine-verified: ' : 'matched words: '}
          </span>
          <q className="text-foreground italic">{row.evidence}</q>
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="destructive"
          className="min-h-11 gap-1.5 px-3 text-[13px]"
          aria-label={'Delete row ' + (row.name || index + 1) + ' from ' + KIND_LABEL[sourceKey]}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" className="size-4 text-destructive" />
          Delete row
        </Button>
      </div>
    </div>
  );
}
