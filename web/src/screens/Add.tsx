// Add screen: two panels (paste text or add a photo), client-side limits, and
// the extraction path. Every message and limit is verbatim from public/app.js.
import { useState } from 'react';
import type { Dispatch } from 'react';
import { motion } from 'motion/react';
import { BookOpenCheck, ListChecks } from 'lucide-react';

import { Dropzone } from '@/components/Dropzone';
import { GlassCard } from '@/components/GlassCard';
import { riseVariants } from '@/components/motion';
import { Button } from '@/components/ui/button';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';
import { postExtract, type ExtractBody } from '@/lib/api';
import { KIND_LABEL } from '@/lib/present';
import type { Action } from '@/lib/state';
import type { SourceImage, SourceKey, SourceState } from '@/lib/types';

const TEXT_LIMIT = 8000;

export function Add({
  sources,
  busy,
  dispatch,
  onBusyChange,
}: {
  sources: Record<SourceKey, SourceState>;
  busy: boolean;
  dispatch: Dispatch<Action>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [message, setMessage] = useState('');
  const [offerDemo, setOfferDemo] = useState(false);

  function setPanelImage(key: SourceKey, image: SourceImage) {
    dispatch({
      type: 'setSource',
      key,
      patch: {
        kind: 'image',
        image,
        // Keep any pasted text in state (the image wins for reading); the
        // vanilla app leaves the textarea text visible too, and Remove photo
        // then restores it.
        fromImage: true,
        medicines: [],
        note: null,
      },
    });
    setMessage('');
  }

  function clearPanelImage(key: SourceKey) {
    dispatch({
      type: 'setSource',
      key,
      patch: {
        kind: (sources[key].text ?? '').trim() === '' ? 'empty' : 'text',
        image: null,
        fromImage: false,
        note: null,
      },
    });
  }

  async function startExtraction() {
    setMessage('');
    setOfferDemo(false);

    const active: SourceKey[] = [];
    const bodies: Partial<Record<SourceKey, ExtractBody>> = {};

    for (const key of ['doctor', 'label'] as SourceKey[]) {
      const source = sources[key];
      if (source.kind === 'image' && source.image) {
        active.push(key);
        bodies[key] = { image: source.image };
        continue;
      }
      const text = (source.text ?? '').trim();
      if (text === '') {
        dispatch({ type: 'setSource', key, patch: { kind: 'empty', text: null } });
        continue;
      }
      if (text.length > TEXT_LIMIT) {
        setMessage(
          'That pasted text is longer than the 8,000-character limit. Please paste a shorter part of it.',
        );
        return;
      }
      dispatch({
        type: 'setSource',
        key,
        patch: { kind: 'text', text, image: null, fromImage: false, note: null },
      });
      active.push(key);
      bodies[key] = { text };
    }

    if (active.length === 0) {
      setMessage('Add something first: paste the words for a panel, or choose a photo for it.');
      return;
    }

    onBusyChange(true);
    const outcomes = await Promise.all(
      active.map(async (key) => ({ key, outcome: await postExtract(bodies[key] as ExtractBody) })),
    );
    onBusyChange(false);

    if (outcomes.every((entry) => entry.outcome.failed)) {
      setMessage('Both panels could not be read right now. Nothing was sent or saved.');
      setOfferDemo(true);
      return;
    }

    for (const { key, outcome } of outcomes) {
      if (outcome.failed) {
        dispatch({
          type: 'setSource',
          key,
          patch: {
            medicines: [],
            note: 'This panel could not be read: ' + outcome.message,
          },
        });
      } else {
        dispatch({ type: 'setMedicines', key, medicines: outcome.medicines });
        dispatch({
          type: 'setSource',
          key,
          patch: {
            note:
              outcome.medicines.length === 0
                ? 'No medicine could be read from ' +
                  KIND_LABEL[key] +
                  ' yet. Use + Add a medicine below to type the rows in yourself, then press Compare.'
                : null,
          },
        });
      }
    }

    dispatch({ type: 'go', step: 'review' });
  }

  return (
    <section aria-labelledby="add-title" aria-busy={busy} className="flex flex-col gap-5">
      <motion.header variants={riseVariants} className="flex flex-col gap-2">
        <h1 id="add-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          MedAlign
        </h1>
        <p className="max-w-3xl text-[15px] leading-6 text-muted-foreground">
          Put in what your doctor said and what your pharmacy label shows. We list what we read and
          where the two differ. You stay in charge of every answer.
        </p>
      </motion.header>

      <div className="grid gap-4 md:grid-cols-2">
        <motion.div variants={riseVariants}>
          <ContainerScroll>
            <GlassCard className="flex h-full flex-col gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <ListChecks aria-hidden="true" className="size-5 text-info" />
                What the doctor said
              </h2>
              <label htmlFor="doctor-text" className="text-[13px] font-medium text-foreground">
                Paste the words your doctor said:
              </label>
              <textarea
                id="doctor-text"
                rows={5}
                value={sources.doctor.text ?? ''}
                disabled={busy}
                placeholder={'For example:\nMetformin 500 mg twice daily'}
                onChange={(event) => {
                  dispatch({
                    type: 'setSource',
                    key: 'doctor',
                    patch: { text: event.target.value },
                  });
                  setMessage('');
                }}
                className="min-h-28 w-full resize-y rounded-lg border border-input bg-card/60 px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Dropzone
                id="doctor-image"
                label="or add a photo of the doctor's note:"
                buttonLabel="Choose a photo of the doctor's note"
                image={sources.doctor.image}
                disabled={busy}
                onLoaded={(image) => setPanelImage('doctor', image)}
                onCleared={() => clearPanelImage('doctor')}
              />
            </GlassCard>
          </ContainerScroll>
        </motion.div>

        <motion.div variants={riseVariants}>
          <ContainerScroll>
            <GlassCard className="flex h-full flex-col gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <BookOpenCheck aria-hidden="true" className="size-5 text-info" />
                What the pharmacy gave
              </h2>
              <label htmlFor="label-text" className="text-[13px] font-medium text-foreground">
                Paste the words on the label:
              </label>
              <textarea
                id="label-text"
                rows={5}
                value={sources.label.text ?? ''}
                disabled={busy}
                placeholder={'For example:\nMetformin 850 mg once daily'}
                onChange={(event) => {
                  dispatch({
                    type: 'setSource',
                    key: 'label',
                    patch: { text: event.target.value },
                  });
                  setMessage('');
                }}
                className="min-h-28 w-full resize-y rounded-lg border border-input bg-card/60 px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Dropzone
                id="label-image"
                label="or add a photo of the label:"
                buttonLabel="Choose a photo of the label"
                image={sources.label.image}
                disabled={busy}
                onLoaded={(image) => setPanelImage('label', image)}
                onCleared={() => clearPanelImage('label')}
              />
            </GlassCard>
          </ContainerScroll>
        </motion.div>
      </div>

      <motion.div variants={riseVariants} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11 gap-2 px-5 text-[15px]"
            aria-busy={busy}
            disabled={busy}
            onClick={() => {
              void startExtraction();
            }}
          >
            {busy ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
                />
                Reading…
              </>
            ) : (
              'Read both lists'
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 px-5 text-[15px]"
            disabled={busy}
            onClick={() => dispatch({ type: 'loadDemo' })}
          >
            Load demo case
          </Button>
        </div>

        {message && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-[13px] text-foreground"
          >
            <p>{message}</p>
            {offerDemo && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 px-4 text-[13px]"
                  onClick={() => dispatch({ type: 'loadDemo' })}
                >
                  Load demo case
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 px-4 text-[13px]"
                  onClick={() => {
                    void startExtraction();
                  }}
                >
                  Try reading again
                </Button>
              </div>
            )}
          </div>
        )}

        <p className="text-[12px] leading-5 text-muted-foreground">
          Nothing about your lists leaves this page except the words we need to read, and nothing is
          stored anywhere.
        </p>
      </motion.div>
    </section>
  );
}
