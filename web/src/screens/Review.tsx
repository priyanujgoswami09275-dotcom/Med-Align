// Review screen: two editable panels, extraction notes, add/delete rows, and a
// sticky Back/Compare bar. Text and messages are verbatim from public/app.js.
import { useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Plus, Scale } from 'lucide-react';

import { GlassCard } from '@/components/GlassCard';
import { MedicineRow } from '@/components/MedicineRow';
import { ResolverQueue } from '@/components/ResolverQueue';
import { riseVariants } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';
import type { Action } from '@/lib/state';
import type { Medicine, SourceKey, SourceState } from '@/lib/types';

const PANEL_TITLES: Record<SourceKey, string> = {
  doctor: 'What the doctor said',
  label: 'What the pharmacy gave',
};

const ADD_LABELS: Record<SourceKey, string> = {
  doctor: '+ Add a medicine the doctor mentioned',
  label: '+ Add a medicine on the label',
};

function ReviewPanel({
  sourceKey,
  source,
  dispatch,
}: {
  sourceKey: SourceKey;
  source: SourceState;
  dispatch: Dispatch<Action>;
}) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const previousCount = useRef(source.medicines.length);

  useEffect(() => {
    if (source.medicines.length > previousCount.current) {
      const inputs = rowsRef.current?.querySelectorAll<HTMLInputElement>('input[name="name"]');
      inputs?.[inputs.length - 1]?.focus();
    }
    previousCount.current = source.medicines.length;
  }, [source.medicines.length]);

  return (
    <GlassCard className="flex h-full flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">{PANEL_TITLES[sourceKey]}</h2>

      <div ref={rowsRef} className="flex flex-col gap-3">
        {source.medicines.length === 0 && (
          <p className="rounded-lg border border-dashed border-border/70 p-3 text-[13px] text-muted-foreground">
            No medicine rows here yet. Use the + Add a medicine button below.
          </p>
        )}
        {source.medicines.map((row: Medicine, index: number) => (
          <ContainerScroll key={row.rowId ?? sourceKey + '-' + index}>
            <MedicineRow
              sourceKey={sourceKey}
              row={row}
              index={index}
              onPatch={(patch) => {
                if (!row.rowId) return;
                dispatch({ type: 'patchMedicine', key: sourceKey, rowId: row.rowId, patch });
              }}
              onDelete={() => {
                if (!row.rowId) return;
                dispatch({ type: 'deleteRow', key: sourceKey, rowId: row.rowId });
              }}
            />
          </ContainerScroll>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full gap-1.5 border-dashed px-4 text-[13px]"
        onClick={() => dispatch({ type: 'addRow', key: sourceKey })}
      >
        <Plus aria-hidden="true" className="size-4" />
        {ADD_LABELS[sourceKey]}
      </Button>
    </GlassCard>
  );
}

export function Review({
  sources,
  dispatch,
  onCompare,
}: {
  sources: Record<SourceKey, SourceState>;
  dispatch: Dispatch<Action>;
  onCompare: () => void;
}) {
  const [message, setMessage] = useState('');

  const notes = (['doctor', 'label'] as SourceKey[])
    .map((key) => ({ key, note: sources[key].note }))
    .filter((entry): entry is { key: SourceKey; note: string } => Boolean(entry.note));

  function compare() {
    if (sources.doctor.medicines.length + sources.label.medicines.length === 0) {
      setMessage(
        'There is no medicine row to Compare yet. Use the + Add a medicine buttons to type one in.',
      );
      return;
    }
    setMessage('');
    onCompare();
  }

  return (
    <section aria-labelledby="review-title" className="flex flex-col gap-5">
      <motion.header variants={riseVariants} className="flex flex-col gap-2">
        <h1 id="review-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Check what we read
        </h1>
        <p className="max-w-3xl text-[15px] leading-6 text-muted-foreground">
          Fix anything that does not look right. Yellow rows were hard to read, so please confirm
          them.
        </p>
      </motion.header>

      <motion.div variants={riseVariants}>
        <ResolverQueue sources={sources} dispatch={dispatch} />
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div variants={riseVariants}>
          <ReviewPanel sourceKey="doctor" source={sources.doctor} dispatch={dispatch} />
        </motion.div>
        <motion.div variants={riseVariants}>
          <ReviewPanel sourceKey="label" source={sources.label} dispatch={dispatch} />
        </motion.div>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {notes.map(({ key, note }) => {
          const failed = note.startsWith('This panel');
          return (
            <div
              key={key}
              className={[
                'rounded-lg border p-3 text-[13px] text-foreground',
                failed
                  ? 'border-warning/50 bg-warning/10'
                  : 'border-info/40 bg-info/5',
              ].join(' ')}
            >
              <p>{note}</p>
              {failed && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 min-h-11 px-4 text-[13px]"
                  onClick={() => dispatch({ type: 'loadDemo' })}
                >
                  Load demo case
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {message && (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-[13px] text-foreground"
        >
          {message}
        </p>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 mt-1 flex flex-wrap gap-2 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-2 px-5 text-[15px]"
          onClick={() => dispatch({ type: 'go', step: 'add' })}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          className="min-h-11 gap-2 px-5 text-[15px]"
          onClick={compare}
        >
          <Scale aria-hidden="true" className="size-4" />
          Compare
        </Button>
      </div>
    </section>
  );
}
