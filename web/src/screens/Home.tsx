// Home: honest demo hero + three cards. Pinned copy, example values from
// src/demo.js, and CTAs wired to the in-app state machine. The 21st catalog
// search is down (upstream), so this is the shadcn/Tailwind-native fallback.
import { motion } from 'motion/react';
import {
  ArrowLeftRight,
  CircleCheck,
  ClipboardList,
  Info,
  Stethoscope,
  Pill,
} from 'lucide-react';

import { GlassCard } from '@/components/GlassCard';
import { StatusBadge } from '@/components/StatusBadge';
import { riseVariants } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES } from '@shared/demo.js';

const HOW_IT_WORKS = [
  { icon: ClipboardList, label: 'Add both lists' },
  { icon: CircleCheck, label: 'Check what we read' },
  { icon: ArrowLeftRight, label: 'See the differences' },
];

const COMPARED = ['Medicine name', 'Strength', 'How often'];

export function Home({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  const doctorRow = DEMO_DOCTOR_MEDICINES[0];
  const labelRow = DEMO_LABEL_MEDICINES[0];

  const exampleRows = [
    [
      'Strength',
      doctorRow.strength_value + ' ' + doctorRow.strength_unit,
      labelRow.strength_value + ' ' + labelRow.strength_unit,
    ],
    ['How often', doctorRow.frequency_text, labelRow.frequency_text],
  ];

  return (
    <section aria-labelledby="home-title" className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <motion.div variants={riseVariants} className="flex flex-col gap-4">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-info/40 bg-info/10 px-3 py-1 text-[12px] font-semibold text-info">
            <Info aria-hidden="true" className="size-3.5" />
            Free demo • Synthetic data
          </p>
          <h1
            id="home-title"
            className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem]"
          >
            Spot <span className="grad-text">differences</span> between your doctor's note and your
            pharmacy label
          </h1>
          <p className="max-w-xl text-[15px] leading-7 text-muted-foreground sm:text-base">
            We read both lists and flag differences with evidence. We never decide which one is
            right. You stay in charge.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11 px-5 text-[15px]" onClick={onStart}>
              Start comparing
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 px-5 text-[15px]"
              onClick={onDemo}
            >
              Try the demo case
            </Button>
          </div>
          <p className="text-[12px] leading-5 text-muted-foreground">
            No sign-up. Nothing is stored. Only the words we need to read leave this page.
          </p>
        </motion.div>

        <div className="grid gap-4">
          <motion.div variants={riseVariants}>
            <GlassCard className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-foreground">How it works</h2>
              <ol className="flex flex-col gap-3">
                {HOW_IT_WORKS.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <li key={step.label} className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-info/40 bg-info/10 text-info">
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <span className="text-[14px] text-foreground">
                        <span className="mr-1.5 text-[12px] font-semibold text-muted-foreground">
                          {index + 1}
                        </span>
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </GlassCard>
          </motion.div>

          <motion.div variants={riseVariants}>
            <GlassCard className="flex flex-col gap-3 border-l-4 border-l-warning/70">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold text-foreground">Example result</h2>
                <p className="text-[12px] text-muted-foreground">Example, synthetic data</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[15px] font-semibold text-foreground">{doctorRow.name}</p>
                <StatusBadge status="NEEDS_CHECKING" size="sm" />
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[13px]">
                <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                  <Stethoscope aria-hidden="true" className="size-3.5" />
                  Doctor
                </span>
                <span className="inline-flex items-center justify-end gap-1 font-medium text-muted-foreground">
                  <Pill aria-hidden="true" className="size-3.5" />
                  Pharmacy
                </span>
                {exampleRows.map(([field, doctorValue, labelValue]) => (
                  <div key={field} className="col-span-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <span className="text-[12px] text-muted-foreground">{field}</span>
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="rounded bg-info/10 px-1.5 py-0.5 font-medium text-foreground">
                        {doctorValue}
                      </span>
                      <span className="text-[12px] text-muted-foreground">vs</span>
                      <span className="rounded bg-success/10 px-1.5 py-0.5 font-medium text-foreground">
                        {labelValue}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>

          <motion.div variants={riseVariants}>
            <GlassCard className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-foreground">What we compare</h2>
              <ul className="flex flex-wrap gap-2">
                {COMPARED.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-info/30 bg-info/5 px-3 py-1 text-[12px] font-medium text-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-[12px] leading-5 text-muted-foreground">
                We do not check allergies, interactions or dosing advice.
              </p>
            </GlassCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
