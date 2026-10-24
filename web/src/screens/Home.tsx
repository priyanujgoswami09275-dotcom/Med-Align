import { ArrowRight, ClipboardList, FileText } from 'lucide-react';

import { RedlineEvidence } from '@/components/RedlineEvidence';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { compare } from '@/lib/compare';
import type { Medicine } from '@/lib/types';
import { DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES } from '@shared/demo.js';

const doctorMetformin: Medicine = { ...DEMO_DOCTOR_MEDICINES[0], origin: 'demo' };
const labelMetformin: Medicine = { ...DEMO_LABEL_MEDICINES[0], origin: 'demo' };
const metforminResult = compare([doctorMetformin], [labelMetformin])[0];

export function Home({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  return (
    <section aria-labelledby="home-title" className="flex flex-col gap-6">
      <header className="max-w-3xl">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          MedAlign · Synthetic example
        </p>
        <h1 id="home-title" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Two lists. Clear differences.
        </h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          See what the doctor’s note says beside the pharmacy label. Redline marks show only fields
          the comparison found to differ. They do not say which instruction is right.
        </p>
      </header>

      <section aria-labelledby="metformin-title" className="flat-surface flex flex-col gap-5 rounded-lg p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="text-[13px] font-medium text-muted-foreground">Live comparison example</p>
            <h2 id="metformin-title" className="mt-1 text-2xl font-semibold">Metformin</h2>
          </div>
          <StatusBadge status={metforminResult.status} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <article className="doctor-slip min-w-0 rounded-md p-4 sm:p-5">
            <h3 className="text-sm font-semibold">What the doctor said</h3>
            <p className="mt-2 text-base font-medium">
              {doctorMetformin.strength_value} {doctorMetformin.strength_unit} · {doctorMetformin.frequency_text}
            </p>
            <RedlineEvidence result={metforminResult} sourceKey="doctor" />
          </article>
          <article className="pharmacy-slip min-w-0 rounded-md p-4 sm:p-5">
            <h3 className="text-sm font-semibold">What the pharmacy label showed</h3>
            <p className="mt-2 text-base font-medium">
              {labelMetformin.strength_value} {labelMetformin.strength_unit} · {labelMetformin.frequency_text}
            </p>
            <RedlineEvidence result={metforminResult} sourceKey="label" />
          </article>
        </div>

        <p className="text-[13px] leading-5 text-muted-foreground">
          Underlined words come from the source text and only from fields marked different by the
          comparison.
        </p>

        <div className="flex flex-wrap gap-3">
          <Button type="button" className="min-h-11 gap-2 px-5 text-[15px]" onClick={onDemo}>
            <ArrowRight aria-hidden="true" className="size-4" />
            Try the demo case
          </Button>
          <Button type="button" variant="outline" className="min-h-11 gap-2 px-5 text-[15px]" onClick={onStart}>
            Start comparing
          </Button>
        </div>
      </section>

      <section aria-label="Review and report" className="grid gap-4 border-y border-border py-4 sm:grid-cols-2">
        <div className="flex items-start gap-3">
          <ClipboardList aria-hidden="true" className="mt-1 size-5 shrink-0" />
          <div>
            <h2 className="font-semibold">Review what was read</h2>
            <p className="mt-1 text-[14px] leading-5 text-muted-foreground">
              Check each value and resolve anything unclear before comparing.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <FileText aria-hidden="true" className="mt-1 size-5 shrink-0" />
          <div>
            <h2 className="font-semibold">Prepare a Report for your pharmacist</h2>
            <p className="mt-1 text-[14px] leading-5 text-muted-foreground">
              See the evidence, coverage, and a question you can bring to your pharmacist.
            </p>
          </div>
        </div>
      </section>

      <p className="text-[14px] leading-5 text-muted-foreground">
        No sign-up. When you choose Read both lists, your text or photo is sent to the extraction service for reading. MedAlign does not save it.
      </p>
    </section>
  );
}
