// The 21st bento feature grid, adapted for MedAlign: the same 2-large/2-small
// layout, but with real app copy, lucide icons, glass-card surfaces, and the
// project's existing Badge primitive (the pasted shadcn badge duplicated it).
import { ArrowLeftRight, CircleCheck, ClipboardList, ShieldCheck } from 'lucide-react';

import { Badge } from './badge';

export function Feature() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-start gap-4">
        <div>
          <Badge variant="outline">Features</Badge>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="max-w-xl text-left text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            What MedAlign does
          </h2>
          <p className="max-w-xl text-left text-[15px] leading-relaxed text-muted-foreground lg:max-w-lg">
            Every step runs on this page. We read both lists, you check what we read, and we show where the two differ.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="glass-card flex min-h-56 flex-col justify-between gap-6 rounded-xl p-6 sm:col-span-2">
          <ClipboardList aria-hidden="true" className="size-8 stroke-1 text-info" />
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xl tracking-tight text-foreground">Reads both lists</h3>
            <p className="max-w-xs text-base text-muted-foreground">
              Paste the words, or add a photo of the doctor's note and the pharmacy label. Both are read on this page.
            </p>
          </div>
        </div>
        <div className="glass-card flex min-h-56 flex-col justify-between gap-6 rounded-xl p-6">
          <CircleCheck aria-hidden="true" className="size-8 stroke-1 text-info" />
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xl tracking-tight text-foreground">You check what we read</h3>
            <p className="max-w-xs text-base text-muted-foreground">
              Yellow rows were hard to read. Confirm or fix anything before comparing.
            </p>
          </div>
        </div>
        <div className="glass-card flex min-h-56 flex-col justify-between gap-6 rounded-xl p-6">
          <ShieldCheck aria-hidden="true" className="size-8 stroke-1 text-info" />
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xl tracking-tight text-foreground">How your data is handled</h3>
            <p className="max-w-xs text-base text-muted-foreground">
              No sign-up. When you choose Read both lists, your text or photo is sent to the extraction service for reading. MedAlign does not save it.
            </p>
          </div>
        </div>
        <div className="glass-card flex min-h-56 flex-col justify-between gap-6 rounded-xl p-6 sm:col-span-2">
          <ArrowLeftRight aria-hidden="true" className="size-8 stroke-1 text-info" />
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xl tracking-tight text-foreground">Shows differences with evidence</h3>
            <p className="max-w-xs text-base text-muted-foreground">
              Each difference pairs the doctor's words with the label's words, so you can see both before deciding.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
