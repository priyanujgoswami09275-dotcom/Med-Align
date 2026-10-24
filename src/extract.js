// src/extract.js — server-side Gemini extraction. Request shape verified against
// the official docs (https://ai.google.dev/api/generate-content, structured-output
// page): POST models/{model}:generateContent, header x-goog-api-key, body with
// contents[].parts[] (text and/or inline_data), systemInstruction, and
// generationConfig { temperature, responseMimeType, responseJsonSchema }.
// This retains the existing REST shape; Google now recommends responseFormat.
// The model name comes only from GEMINI_MODEL; it is never guessed or hard-coded.

import { MEDICINE_SCHEMA, SYSTEM_INSTRUCTION, cleanMedicineArray, flagTextEvidence } from './schema.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TEMPERATURE = 0.1; // spec: 0 to 0.2
const RETRY_DELAY_MS = 1500;
// Per-attempt cap on the Gemini request. Worst case = two attempts + one delay.
export const REQUEST_TIMEOUT_MS = 20000;

export class ExtractError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.code = code;
    this.detail = detail;
  }
}

function assertConfigured(apiKey, model) {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new ExtractError('KEY_NOT_CONFIGURED');
  }
  if (!model || typeof model !== 'string' || model.trim() === '') {
    throw new ExtractError('MODEL_NOT_CONFIGURED');
  }
}

function buildPayload(input) {
  const parts = [];
  if (typeof input.text === 'string') {
    parts.push({ text: input.text });
  }
  if (input.image && typeof input.image === 'object') {
    // inline_data shape as in the official REST example (image recognition page).
    parts.push({
      inline_data: {
        mime_type: input.image.mime,
        data: input.image.data, // base64, no data: prefix
      },
    });
    parts.push({ text: 'Read this medicine document image. Extract only what is written in it.' });
  }
  return {
    contents: [{ role: 'user', parts }],
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: {
      temperature: TEMPERATURE,
      responseMimeType: 'application/json',
      responseJsonSchema: MEDICINE_SCHEMA,
    },
  };
}

function callerAbortReason(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('The extraction request was cancelled.', 'AbortError');
}

async function callGenerateContent({ input, apiKey, model, fetchImpl, signal, timeoutMs }) {
  const url = `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('The extraction request timed out.', 'TimeoutError'));
  }, timeout);
  const abortFromCaller = () => controller.abort(callerAbortReason(signal));

  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    if (signal?.aborted) throw callerAbortReason(signal);
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildPayload(input)),
      signal: controller.signal,
    });
    if (signal?.aborted) throw callerAbortReason(signal);
    if (controller.signal.aborted) throw controller.signal.reason;
    if (response.status === 429 || response.status >= 500) {
      throw new ExtractError(response.status === 429 ? 'RATE_LIMITED' : 'API_ERROR', String(response.status));
    }
    if (response.status === 401 || response.status === 403) {
      throw new ExtractError('AUTH_ERROR', String(response.status));
    }
    if (!response.ok) {
      // Do not surface provider response bodies, which could contain secrets.
      throw new ExtractError('API_ERROR', String(response.status));
    }
    try {
      const parsed = await response.json();
      if (signal?.aborted) throw callerAbortReason(signal);
      if (controller.signal.aborted) throw controller.signal.reason;
      return parsed;
    } catch (err) {
      if (signal?.aborted) throw callerAbortReason(signal);
      if (controller.signal.aborted) throw err;
      throw new ExtractError('BAD_RESPONSE', 'invalid JSON');
    }
  } catch (err) {
    if (err instanceof ExtractError) throw err;
    if (signal?.aborted) throw callerAbortReason(signal);
    if (timedOut || controller.signal.reason?.name === 'TimeoutError' || err?.name === 'TimeoutError') {
      throw new ExtractError('TIMEOUT');
    }
    if (err?.name === 'AbortError') throw err;
    throw new ExtractError('NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

async function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      callback(value);
    };
    const abort = () => finish(reject, callerAbortReason(signal));
    const timer = setTimeout(() => finish(resolve), ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Returns { medicines: [...] } or throws ExtractError.
 * fetchImpl defaults to global fetch; injectable for stubbed tests.
 */
export async function extractMedicines(input, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const delay = options.delay || sleep;
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  const model = options.model ?? process.env.GEMINI_MODEL;
  const signal = options.signal;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  assertConfigured(apiKey, model);

  let payload;
  try {
    payload = await callGenerateContent({ input, apiKey, model, fetchImpl, signal, timeoutMs });
  } catch (err) {
    // Retry once after ~1.5 s on 429/5xx/network failures and on a stalled
    // request (TIMEOUT), so a hang still reaches the offer-demo path.
    const detail5xx = err instanceof ExtractError && err.code === 'API_ERROR' && String(err.detail ?? '').startsWith('5');
    const retryable = err instanceof ExtractError
      && (err.code === 'RATE_LIMITED' || err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT' || detail5xx);
    if (!retryable) throw err;
    if (signal?.aborted) throw callerAbortReason(signal);
    await delay(RETRY_DELAY_MS, signal);
    if (signal?.aborted) throw callerAbortReason(signal);
    payload = await callGenerateContent({ input, apiKey, model, fetchImpl, signal, timeoutMs });
  }

  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) {
    const block = payload?.promptFeedback?.blockReason;
    throw new ExtractError('NO_CANDIDATE', block ? String(block) : '');
  }
  const text = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
  let modelOut;
  try {
    modelOut = JSON.parse(text);
  } catch {
    throw new ExtractError('BAD_MODEL_JSON');
  }

  const medicines = cleanMedicineArray(modelOut);
  if (medicines === null) {
    throw new ExtractError('BAD_MODEL_JSON');
  }
  if (typeof input.text === 'string') {
    flagTextEvidence(medicines, input.text); // substring check, marks uncertain
  } else {
    // Images: the quote cannot be machine-checked; the UI labels it instead.
    for (const m of medicines) m.evidenceVerified = false;
  }
  return { medicines };
}
