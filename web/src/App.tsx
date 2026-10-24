// App shell + in-app state machine. One reducer owns step, panels and results;
// screens are swapped without a router.
import { useEffect, useReducer, useState } from 'react';

import { Footer } from './components/layout/Footer';
import { StepNav } from './components/StepNav';
import { Wordmark } from './components/Wordmark';
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
    <div className="flex min-h-dvh flex-col bg-background" data-screen={state.step}>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-card px-4 py-3 text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <header data-app-header className="border-b border-border bg-card px-4 py-2 sm:px-6 print:hidden">
        <Wordmark onHome={() => go('home')} current={state.step} />
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <StepNav
          step={state.step}
          reviewReady={reviewReady}
          reportReady={reportReady}
          onNavigate={go}
        />
        <main
          id="main-content"
          className="min-w-0 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-8"
        >
          <div key={state.step}>
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
          </div>
        </main>
      </div>

      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Footer />
      </div>
    </div>
  );
}
