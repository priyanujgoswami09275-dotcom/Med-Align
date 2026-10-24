// Client for POST /api/extract. Error copy is ported verbatim from
// public/app.js:142-168 — the server can override it with its own friendly
// message (e.g. the 503 setup message), which we pass through untouched.
import type { Medicine } from './types';

export type ExtractBody =
  | { text: string }
  | { image: { mime: string; data: string } };

export type ExtractOutcome =
  | { failed: false; medicines: Medicine[] }
  | { failed: true; message: string; offerDemo: boolean };

const DEFAULT_FAILURE =
  'The reading step did not work this time. You can try again soon, or load the demo case.';

export async function postExtract(body: ExtractBody): Promise<ExtractOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      failed: true,
      message:
        'The app could not reach the reading service. Check the connection, or load the demo case.',
      offerDemo: true,
    };
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  const payload =
    data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : null;

  if (!response.ok) {
    return {
      failed: true,
      message:
        payload && typeof payload.message === 'string' && payload.message
          ? payload.message
          : DEFAULT_FAILURE,
      offerDemo: Boolean(payload && payload.offerDemo),
    };
  }

  if (!Array.isArray(payload?.medicines)) {
    return { failed: true, message: DEFAULT_FAILURE, offerDemo: true };
  }

  return { failed: false, medicines: payload.medicines as Medicine[] };
}
