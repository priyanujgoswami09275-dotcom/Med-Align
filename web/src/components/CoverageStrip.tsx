import { useId } from 'react';
import { ClipboardList, FileCheck2, GitCompareArrows, TriangleAlert } from 'lucide-react';

import { computeCoverage } from '@/lib/coverage';
import type { Medicine, Result, SourceKey, SourceState } from '@/lib/types';

const LABELS = {
  doctorRecords: 'Doctor-source records',
  labelRecords: 'Pharmacy-source records',
  pairsCompared: 'Medicine pairs compared',
  fieldsCompared: 'Fields compared',
  fieldsUnresolved: 'Fields missing or unresolved',
} as const;

export function CoverageStrip({
  sources,
  results,
  waitingReviewCount = 0,
}: {
  sources: Record<SourceKey, SourceState>;
  results: Result[];
  waitingReviewCount?: number;
}) {
  const detailsId = useId();
  const coverage = computeCoverage(
    sources.doctor.medicines as Medicine[],
    sources.label.medicines as Medicine[],
    results,
  );
  const items = [
    { key: 'doctorRecords', icon: ClipboardList, value: coverage.doctorRecords },
    { key: 'labelRecords', icon: ClipboardList, value: coverage.labelRecords },
    { key: 'pairsCompared', icon: GitCompareArrows, value: coverage.pairsCompared },
    { key: 'fieldsCompared', icon: FileCheck2, value: coverage.fieldsCompared },
    { key: 'fieldsUnresolved', icon: TriangleAlert, value: coverage.fieldsUnresolved },
  ] as const;

  return (
    <section aria-labelledby="coverage-title" className="flex flex-col gap-3">
      <h2 id="coverage-title" className="text-lg font-semibold text-foreground">
        Source coverage
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map(({ key, icon: Icon, value }) => (
          <li key={key} className="flat-surface flex min-h-[76px] items-center gap-2 rounded-md px-3 py-2.5">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 text-[12px] leading-4 text-muted-foreground">
              {LABELS[key]}
              <strong className="block text-base tabular-nums text-foreground">{value}</strong>
            </span>
          </li>
        ))}
      </ul>

      <details className="rounded-lg border border-border/70 bg-card/40 px-3 py-2">
        <summary
          aria-controls={detailsId}
          className="min-h-11 cursor-pointer py-2 text-[13px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Coverage details
        </summary>
        <div id={detailsId} className="grid gap-3 pb-2 text-[13px] text-foreground sm:grid-cols-2">
          <p>
            Fields with values available: {coverage.fieldsAvailable}
          </p>
          <p>Fields waiting for your review: {waitingReviewCount}</p>
          <p>Fields that could not be compared: {coverage.fieldsUnresolved}</p>
          <p>
            Medicines not found in the other provided source: doctor {coverage.doctorOnly}; pharmacy {coverage.labelOnly}
          </p>
          <p className="sm:col-span-2">
            Coverage describes the information available in the two sources provided. It does not establish that the entire medication regimen has been reviewed.
          </p>
          <p className="sm:col-span-2">Counts update when you edit or confirm extracted information.</p>
          <p className="sm:col-span-2">The comparison covers medication name, strength, and frequency only.</p>
        </div>
      </details>
    </section>
  );
}
