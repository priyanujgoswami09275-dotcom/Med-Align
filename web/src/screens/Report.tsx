// Report screen: status cards in compare()'s triage order, a five-status
// summary, evidence side-by-side on wide screens, and the pharmacist question.
// All labels/hints/strings are verbatim from public/app.js; icons + text + color
// always travel together.
import { useRef, useState } from 'react';
import { ArrowLeft, ClipboardCopy } from 'lucide-react';

import { GlassCard } from '@/components/GlassCard';
import { CoverageStrip } from '@/components/CoverageStrip';
import { StatusBadge } from '@/components/StatusBadge';
import { WhyFlagged } from '@/components/WhyFlagged';
import { Button } from '@/components/ui/button';
import { pharmacistQuestion } from '@/lib/compare';
import { resolverItems } from '@/lib/uncertainty';
import { FIELD_TEXTS, STATUS_PRESENTATION } from '@/lib/present';
import type { Medicine, Result, SourceKey, SourceState, Status } from '@/lib/types';

const SUMMARY_ORDER: Status[] = [
  'NEEDS_CHECKING',
  'CANT_TELL',
  'MISSING_FROM_LABEL',
  'NOT_ON_DOCTOR_LIST',
  'NO_DIFFERENCES_FOUND',
];

const CARD_ACCENT: Record<string, string> = {
  good: 'border-success/40',
  diff: 'border-warning/60',
  warn: 'border-info/40',
  dim: 'border-border',
};

function EvidenceBlock({
  title,
  medicine,
}: {
  title: string;
  medicine: Medicine | null;
}) {
  if (!medicine) {
    return (
      <div className="rounded-lg border border-border/70 bg-card/50 p-3.5">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-[13px] text-muted-foreground">Not found on this list.</p>
      </div>
    );
  }

  const lines = [
    'name: ' + (medicine.name ?? 'not readable'),
    'dose: ' +
      (medicine.strength_value !== null ? medicine.strength_value : 'not readable') +
      (medicine.strength_unit ? ' ' + medicine.strength_unit : ''),
    'how often: ' + (medicine.frequency_text ?? 'not readable'),
  ];

  return (
    <div className="rounded-lg border border-border/70 bg-card/50 p-3.5">
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      <p className="mt-2 flex flex-col gap-1 text-[13px] text-foreground">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
      {medicine.origin === 'manual' ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          Entered by you; no extracted source quote is available for this row.
        </p>
      ) : medicine.evidence ? (
        <>
          <p className="mt-3 text-[12px] text-muted-foreground">exact words that were read:</p>
          <q className="mt-1 block text-[13px] text-foreground italic">{medicine.evidence}</q>
        </>
      ) : (
        <p className="mt-3 text-[12px] text-muted-foreground">no exact words were available.</p>
      )}
      {medicine.fromImage === true && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          read from image, not machine-verified
        </p>
      )}
    </div>
  );
}

function ReportCard({ result }: { result: Result }) {
  const presentation = STATUS_PRESENTATION[result.status] ?? STATUS_PRESENTATION.CANT_TELL;

  return (
    <article
      className={`flat-surface rounded-lg border-l-4 p-4 sm:p-5 ${CARD_ACCENT[presentation.variant] ?? ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">{result.displayName}</h2>
        <StatusBadge status={result.status} />
      </div>
      <p className="mt-1.5 text-[13px] text-muted-foreground">{presentation.hint}</p>

      {result.differing.length > 0 && (
        <p className="mt-3 text-[13px] font-medium text-warning">
          {'Differences: ' +
            result.differing.map((field) => FIELD_TEXTS[field] ?? field).join('; ')}
        </p>
      )}
      {result.unknown.length > 0 && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          {'Could not be read: ' +
            result.unknown.map((field) => FIELD_TEXTS[field] ?? field).join('; ')}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <EvidenceBlock
          title="What the doctor said"
          medicine={result.doctor}
        />
        <EvidenceBlock
          title="What the pharmacy label showed"
          medicine={result.label}
        />
      </div>
      <WhyFlagged result={result} />
    </article>
  );
}

export function Report({
  results,
  sources,
  onOpenResolver,
  onBack,
}: {
  results: Result[];
  sources: Record<SourceKey, SourceState>;
  onOpenResolver: () => void;
  onBack: () => void;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'blocked'>('idle');
  // Bumped on every copy attempt so the confirmation node remounts and screen
  // readers announce a second successful copy too.
  const [copyCount, setCopyCount] = useState(0);
  const hiddenTarget = useRef<HTMLTextAreaElement>(null);
  const visibleQuestion = useRef<HTMLParagraphElement>(null);

  const question = results.length > 0 ? pharmacistQuestion(results) : '';
  const counts = SUMMARY_ORDER.map((status) => ({
    status,
    count: results.filter((result) => result.status === status).length,
  }));
  const waitingReviewCount =
    resolverItems('doctor', sources.doctor.medicines).length
    + resolverItems('label', sources.label.medicines).length;

  async function copyQuestion() {
    if (!question) return;
    setCopyCount((count) => count + 1);
    try {
      await navigator.clipboard.writeText(question);
      setCopyState('copied');
      return;
    } catch {
      // Fall through to the hidden-textarea path, like the vanilla app.
    }

    const target = hiddenTarget.current;
    let done = false;
    if (target) {
      target.focus();
      target.select();
      try {
        done = document.execCommand('copy');
      } catch {
        done = false;
      }
      target.blur();
    }
    if (done) {
      setCopyState('copied');
      return;
    }
    setCopyState('blocked');
    const paragraph = visibleQuestion.current;
    if (paragraph) {
      paragraph.focus();
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  return (
    <section aria-labelledby="report-title" className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 id="report-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          What differs
        </h1>
        <p className="max-w-3xl text-[15px] leading-6 text-muted-foreground">
          These are only differences between the two wordings. Which instruction to follow is a
          question for your pharmacist, not for this tool.
        </p>
      </header>

      {results.length === 0 ? (
        <div>
          <GlassCard>
            <p className="text-[14px] text-muted-foreground">
              Nothing to show: no medicine rows were compared.
            </p>
          </GlassCard>
        </div>
      ) : (
        <>
          <section aria-labelledby="report-summary-title">
            <h2 id="report-summary-title" className="sr-only">
              Summary
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {counts.map(({ status, count }) => (
                <li
                  key={status}
                  className="glass-card flex flex-col items-start gap-1.5 rounded-lg px-3 py-2.5"
                >
                  <StatusBadge status={status} size="sm" />
                  <span className="text-lg font-semibold tabular-nums text-foreground">{count}</span>
                </li>
              ))}
            </ul>
          </section>

          <div>
            <CoverageStrip sources={sources} results={results} waitingReviewCount={waitingReviewCount} />
          </div>
          {waitingReviewCount > 0 && (
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 px-4 text-[13px]"
                onClick={onOpenResolver}
              >
                Review {waitingReviewCount} unresolved fields
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {results.map((result, index) => (
              <ReportCard key={(result.key ?? 'unnamed') + '-' + index} result={result} />
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="min-h-11 gap-2 px-5 text-[15px]"
                onClick={() => {
                  void copyQuestion();
                }}
              >
                <ClipboardCopy aria-hidden="true" className="size-4" />
                Copy question for my pharmacist
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2 px-5 text-[15px]"
                onClick={onBack}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back to checking
              </Button>
            </div>
            {copyState === 'copied' && (
              <p
                key={copyCount}
                role="status"
                aria-live="polite"
                className="text-[13px] font-medium text-success"
              >
                Copied. Paste it to your pharmacist.
              </p>
            )}
          </div>

          <div>
            <GlassCard className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                Question for your pharmacist
              </h2>
              {copyState === 'blocked' && (
                <p className="text-[13px] text-warning">
                  Copy was blocked by the browser. Please select the words below and copy them by
                  hand:
                </p>
              )}
              <p
                ref={visibleQuestion}
                tabIndex={-1}
                className="whitespace-pre-line rounded-lg bg-card/60 p-3 text-[13px] leading-6 text-foreground"
              >
                {question}
              </p>
            </GlassCard>
          </div>

          <textarea
            ref={hiddenTarget}
            readOnly
            value={question}
            aria-hidden="true"
            tabIndex={-1}
            className="sr-only"
          />
        </>
      )}
    </section>
  );
}
