// App shell + in-app state machine. One reducer owns step, panels and results;
// screens are swapped without a router.
import { useEffect, useReducer, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';

import { Footer } from './components/layout/Footer';
import { StepNav } from './components/StepNav';
import { Wordmark } from './components/Wordmark';
import { screenVariants } from './components/motion';
import { Add } from './screens/Add';
import { Home } from './screens/Home';
import { Report } from './screens/Report';
import { Review } from './screens/Review';
import { compare } from './lib/compare';
import { initialState, reducer } from './lib/state';
import type { Step } from './lib/types';

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.step]);

  const go = (step: Step) => dispatch({ type: 'go', step });

  const reviewReady =
    state.sources.doctor.medicines.length > 0 ||
    state.sources.label.medicines.length > 0 ||
    Boolean(
      (state.sources.doctor.text ?? '').trim() ||
        (state.sources.label.text ?? '').trim() ||
        state.sources.doctor.image ||
        state.sources.label.image,
    );
  const reportReady = state.results.length > 0;

  const startCompare = () => {
    dispatch({
      type: 'setResults',
      results: compare(state.sources.doctor.medicines, state.sources.label.medicines),
    });
    go('report');
  };

  const loadDemo = () => {
    setBusy(false);
    dispatch({ type: 'loadDemo' });
  };

  const openResolver = () => {
    go('review');
    window.setTimeout(() => document.getElementById('resolver')?.focus(), 0);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh flex-col bg-background">
        <header
          data-app-header
          className="border-b border-border bg-card/70 px-4 py-3 print:hidden sm:px-6"
        >
          <Wordmark onHome={() => go('home')} current={state.step} />
        </header>

        <div className="mx-auto flex w-full max-w-6xl flex-1 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
          <StepNav
            step={state.step}
            reviewReady={reviewReady}
            reportReady={reportReady}
            onNavigate={go}
          />
          <main
            className="min-w-0 flex-1 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-16"
            data-screen={state.step}
          >
            <motion.div
              key={state.step}
              variants={screenVariants}
              initial="hidden"
              animate="show"
            >
              {state.step === 'home' && <Home onStart={() => go('add')} onDemo={loadDemo} />}
              {state.step === 'add' && (
                <Add
                  sources={state.sources}
                  busy={busy}
                  dispatch={dispatch}
                  onBusyChange={setBusy}
                />
              )}
              {state.step === 'review' && (
                <Review sources={state.sources} dispatch={dispatch} onCompare={startCompare} />
              )}
              {state.step === 'report' && (
                <Report
                  results={state.results}
                  sources={state.sources}
                  onOpenResolver={openResolver}
                  onBack={() => go('review')}
                />
              )}
            </motion.div>
          </main>
        </div>

        <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <Footer />
        </div>
      </div>
    </MotionConfig>
  );
}
