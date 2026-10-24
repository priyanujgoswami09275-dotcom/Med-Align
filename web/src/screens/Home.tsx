// Home: the landing page. The 21st ink-orbit hero (re-themed to MedAlign,
// with the 3D sculpture), an in-page anchor nav, the bento feature grid, and
// the honest demo sections. Copy stays pinned; CTAs stay wired to the
// in-app state machine. Section ids match the anchor nav pills.
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
import { InkOrbitHero } from '@/components/ui/ink-orbit-hero';
import { Feature } from '@/components/ui/feature-section-with-bento-grid';
import { DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES } from '@shared/demo.js';

const HOW_IT_WORKS = [
  { icon: ClipboardList, label: 'Add both lists' },
  { icon: CircleCheck, label: 'Check what we read' },
  { icon: ArrowLeftRight, label: 'See the differences' },
];

const COMPARED = ['Medicine name', 'Strength', 'How often'];

const SECTIONS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#example-result', label: 'Example result' },
  { href: '#what-we-compare', label: 'What we compare' },
];

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
    <section aria-labelledby="home-title" className="flex flex-col gap-10">
      <motion.div variants={riseVariants}>
        <InkOrbitHero
          headingId="home-title"
          titleTop="Spot differences between"
          titleAccent={["your doctor's note", 'your pharmacy label', 'the words we read']}
          description="We read both lists and flag differences with evidence. We never decide which one is right. You stay in charge."
          badge={
            <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-info/40 bg-info/10 px-3 py-1 text-[12px] font-semibold text-info">
              <Info aria-hidden="true" className="size-3.5" />
              Free demo • Synthetic data
            </p>
          }
          primaryCta="Start comparing"
          onPrimary={onStart}
          secondaryCta="Try the demo case"
          onSecondary={onDemo}
        />
      </motion.div>

      <motion.nav variants={riseVariants} aria-label="Sections" className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="rounded-full border border-info/40 bg-info/5 px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-info/10"
          >
            {section.label}
          </a>
        ))}
      </motion.nav>

      <motion.div variants={riseVariants} id="features" className="scroll-mt-6">
        <Feature />
      </motion.div>

      <motion.div variants={riseVariants} id="how-it-works" className="scroll-mt-6">
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

      <motion.div variants={riseVariants} id="example-result" className="scroll-mt-6">
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

      <motion.div variants={riseVariants} id="what-we-compare" className="scroll-mt-6">
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

      <motion.p variants={riseVariants} className="text-[12px] leading-5 text-muted-foreground">
        No sign-up. When you choose Read both lists, your text or photo is sent to the extraction service for reading. MedAlign does not save it.
      </motion.p>
    </section>
  );
}
