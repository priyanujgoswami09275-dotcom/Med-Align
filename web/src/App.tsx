// App shell + in-app state machine. One reducer owns step, panels and results;
// screens are swapped without a router. Every entrance sits under
// MotionConfig reducedMotion="user" and replays on each step change.
import { useEffect, useReducer, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';

import { Footer } from './components/layout/Footer';
import { Breadcrumb } from './components/Breadcrumb';
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

  return (
    <MotionConfig reducedMotion="user">
      <div className="mesh-bg flex min-h-dvh flex-col">
        <header className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Wordmark onHome={() => go('home')} current={state.step} />
          {state.step !== 'home' && <Breadcrumb step={state.step} onNavigate={go} />}
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-16 sm:px-6">
          <motion.div
            key={state.step}
            variants={screenVariants}
            initial="hidden"
            animate="show"
            data-screen={state.step}
          >
            {state.step === 'home' && (
              <Home onStart={() => go('add')} onDemo={loadDemo} />
            )}
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
                onBack={() => go('review')}
              />
            )}
          </motion.div>
        </main>

        <Footer />
      </div>
    </MotionConfig>
  );
}
