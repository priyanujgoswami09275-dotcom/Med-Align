// src/extract.js — server-side Gemini extraction. Request shape verified against
// the official docs (https://ai.google.dev/api/generate-content, structured-output
// page): POST models/{model}:generateContent, header x-goog-api-key, body with
// contents[].parts[] (text and/or inline_data), systemInstruction, and
// generationConfig { temperature, responseMimeType, responseJsonSchema }.
// The model name comes only from GEMINI_MODEL; it is never guessed or hard-coded.

import { MEDICINE_SCHEMA, SYSTEM_INSTRUCTION, cleanMedicineArray, flagTextEvidence } from './schema.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TEMPERATURE = 0.1; // spec: 0 to 0.2
const RETRY_DELAY_MS = 1500;

export class ExtractError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.code = code;
    this.detail = detail;
  }
}

function assertConfigured(apiKey, model) {
  if (!apiKey) throw new ExtractError('KEY_NOT_CONFIGURED');
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

async function callGenerateContent({ input, apiKey, model, fetchImpl, signal }) {
  const url = `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildPayload(input)),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ExtractError('NETWORK_ERROR');
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ExtractError(response.status === 429 ? 'RATE_LIMITED' : 'API_ERROR', String(response.status));
  }
  if (!response.ok) {
    // 401/403/etc. — do not surface any body detail that could echo the key.
    throw new ExtractError('API_ERROR', String(response.status));
  }
  let parsed;
  try {
    parsed = await response.json();
  } catch {
    throw new ExtractError('BAD_RESPONSE', 'invalid JSON');
  }
  return parsed;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  assertConfigured(apiKey, model);

  let payload;
  try {
    payload = await callGenerateContent({ input, apiKey, model, fetchImpl });
  } catch (err) {
    // Retry once after ~1.5 s on 429/5xx/network failures, per spec.
    const detail5xx = err instanceof ExtractError && err.code === 'API_ERROR' && String(err.detail ?? '').startsWith('5');
    const retryable = err instanceof ExtractError
      && (err.code === 'RATE_LIMITED' || err.code === 'NETWORK_ERROR' || detail5xx);
    if (!retryable) throw err;
    await delay(RETRY_DELAY_MS);
    payload = await callGenerateContent({ input, apiKey, model, fetchImpl });
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
