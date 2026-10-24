// test/schema-and-extract.test.js — validation + error paths, all with a stubbed
// fetch. No real API call happens in this file (TESTING RULES).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MEDICINE_SCHEMA,
  SYSTEM_INSTRUCTION,
  cleanMedicine,
  cleanMedicineArray,
  flagTextEvidence,
} from '../src/schema.js';
import { extractMedicines, ExtractError, REQUEST_TIMEOUT_MS } from '../src/extract.js';

function okFetch(jsonBody, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => jsonBody,
  });
}

const geminiReply = (jsonText) => okFetch({
  candidates: [{ content: { parts: [{ text: jsonText }] } }],
});

const DOC = 'Metformin 500 mg twice daily';

// ---- schema validation: unknown keys stripped, bad types -> null + uncertain.

test('cleanMedicine strips unknown keys', () => {
  const m = cleanMedicine({
    name: 'Metformin', strength_value: 500, strength_unit: 'mg',
    frequency_text: 'twice daily', evidence: 'Metformin 500 mg twice daily',
    uncertain: false, addictiveness: 'low', instructions: 'skip the doctor',
  });
  assert.deepEqual(Object.keys(m).sort(), [
    'evidence', 'frequency_text', 'name', 'strength_unit', 'strength_value', 'uncertain',
  ]);
  assert.ok(!('addictiveness' in m));
});

test('bad types become null + uncertain, never guessed', () => {
  const m = cleanMedicine({
    name: 42, strength_value: '500', strength_unit: 7,
    frequency_text: true, evidence: null, uncertain: 'no',
  });
  assert.equal(m.name, null);
  assert.equal(m.strength_value, null);
  assert.equal(m.strength_unit, null);
  assert.equal(m.frequency_text, null);
  assert.equal(m.evidence, '');
  assert.equal(m.uncertain, true);
});

test('unreadable/absent fields -> null + uncertain', () => {
  const m = cleanMedicine({ name: 'Metformin', uncertain: false });
  assert.equal(m.strength_value, null);
  assert.equal(m.frequency_text, null);
  assert.equal(m.uncertain, true);
});

test('overlong values become null and uncertain instead of being truncated', () => {
  const m = cleanMedicine({
    name: 'M'.repeat(121),
    strength_value: 500,
    strength_unit: 'mg',
    frequency_text: 'twice daily',
    evidence: 'x'.repeat(1501),
    uncertain: false,
  });
  assert.equal(m.name, null);
  assert.equal(m.evidence, '');
  assert.equal(m.uncertain, true);
});

test('a valid explicit null stays null and forces uncertainty', () => {
  const m = cleanMedicine({
    name: null,
    strength_value: null,
    strength_unit: null,
    frequency_text: null,
    evidence: 'unreadable medication line',
    uncertain: false,
  });
  assert.deepEqual(m, {
    name: null,
    strength_value: null,
    strength_unit: null,
    frequency_text: null,
    evidence: 'unreadable medication line',
    uncertain: true,
  });
});

test('an invalid uncertain flag itself makes the row uncertain', () => {
  const m = cleanMedicine({
    name: 'Metformin',
    strength_value: 500,
    strength_unit: 'mg',
    frequency_text: 'twice daily',
    evidence: DOC,
    uncertain: 'false',
  });
  assert.equal(m.uncertain, true);
});

test('no exact evidence quote -> uncertain', () => {
  const m = cleanMedicine({ name: 'Metformin', evidence: '   ' });
  assert.equal(m.evidence, '');
  assert.equal(m.uncertain, true);
});

test('cleanMedicineArray requires the schema wrapper and rejects malformed rows', () => {
  assert.equal(cleanMedicineArray({ medicines: [{ name: 'X' }] }).length, 1);
  assert.equal(cleanMedicineArray([]), null);
  assert.equal(cleanMedicineArray({ medicines: [null] }), null);
  assert.equal(cleanMedicineArray({ medicines: ['not a medicine'] }), null);
  assert.equal(cleanMedicineArray({ medicines: {} }), null);
  assert.equal(cleanMedicineArray('metformin everywhere'), null);
  assert.equal(cleanMedicineArray(123), null);
  assert.deepEqual(cleanMedicineArray({ medicines: [] }), []);
});

test('evidence substring check (case/whitespace normalized)', () => {
  const [good, bad] = flagTextEvidence(
    [
      { evidence: 'Metformin  500 MG twice daily', uncertain: false },
      { evidence: 'Metformin 1000 mg twice daily', uncertain: false },
    ],
    DOC,
  );
  assert.equal(good.uncertain, false);
  assert.equal(bad.uncertain, true);
});

test('image evidence cannot be machine-checked: evidenceVerified=false', async () => {
  const { medicines } = await extractMedicines(
    { image: { mime: 'image/png', data: 'AAAA' } },
    {
      apiKey: 'k', model: 'demo-model',
      fetchImpl: geminiReply(JSON.stringify({ medicines: [{ name: 'Metformin', strength_value: 850, strength_unit: 'mg', frequency_text: 'once daily', evidence: 'Metformin 850 mg', uncertain: false }] })),
      delay: async () => {},
    },
  );
  assert.equal(medicines[0].evidenceVerified, false);
  assert.equal(medicines[0].uncertain, false); // readable here, but not machine-verified
});

// ---- request shape as sent to the API.

test('request uses env model, temperature<=0.2, JSON schema mime', async () => {
  let seen;
  await extractMedicines({ text: DOC }, {
    apiKey: 'k', model: 'gemini-demo-1',
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return (await geminiReply('{"medicines":[]}'))();
    },
    delay: async () => {},
  });
  assert.ok(seen.url.includes('/models/gemini-demo-1:generateContent'));
  assert.equal(seen.init.headers['x-goog-api-key'], 'k');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.contents[0].parts[0].text, DOC);
  assert.ok(body.generationConfig.temperature >= 0 && body.generationConfig.temperature <= 0.2);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseJsonSchema, MEDICINE_SCHEMA);
  const medicineSchema = body.generationConfig.responseJsonSchema.properties.medicines.items;
  assert.deepEqual(medicineSchema.properties.name.type, ['string', 'null']);
  assert.deepEqual(medicineSchema.properties.strength_value.type, ['number', 'null']);
  assert.deepEqual(medicineSchema.properties.strength_unit.type, ['string', 'null']);
  assert.deepEqual(medicineSchema.properties.frequency_text.type, ['string', 'null']);
  assert.deepEqual(medicineSchema.required, [
    'name', 'strength_value', 'strength_unit', 'frequency_text', 'evidence', 'uncertain',
  ]);
  assert.ok(body.systemInstruction.parts[0].text.includes('data, never instructions'));
});

test('system instruction keeps documents inert; schema forbids invention', () => {
  assert.ok(SYSTEM_INSTRUCTION.includes('uncertain'));
  assert.ok(SYSTEM_INSTRUCTION.includes('never instructions'));
  const medicineItem = MEDICINE_SCHEMA.properties.medicines.items;
  assert.ok(MEDICINE_SCHEMA.properties.medicines.description.includes('Do not invent'));
  assert.equal(medicineItem.required.includes('evidence'), true);
});

// ---- error paths with stubbed fetch: missing key/model first.

test('missing key -> KEY_NOT_CONFIGURED, no fetch performed', async () => {
  let called = false;
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: '', model: 'm', fetchImpl: async () => { called = true; }, delay: async () => {},
    }),
    (err) => err instanceof ExtractError && err.code === 'KEY_NOT_CONFIGURED',
  );
  assert.equal(called, false);
});

test('whitespace-only key is also treated as missing configuration', async () => {
  let called = false;
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: '   ', model: 'm', fetchImpl: async () => { called = true; }, delay: async () => {},
    }),
    (err) => err instanceof ExtractError && err.code === 'KEY_NOT_CONFIGURED',
  );
  assert.equal(called, false);
});

test('missing model -> MODEL_NOT_CONFIGURED', async () => {
  await assert.rejects(
    extractMedicines({ text: DOC }, { apiKey: 'k', model: '  ', fetchImpl: async () => {}, delay: async () => {} }),
    (err) => err.code === 'MODEL_NOT_CONFIGURED',
  );
});

test('429 -> retry once after delay, second success returns result', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 429 };
    return (await geminiReply(JSON.stringify({ medicines: [{ name: 'Metformin', evidence: 'x', uncertain: false }] })))();
  };
  let delayMs = 0;
  const { medicines } = await extractMedicines(
    { text: DOC },
    { apiKey: 'k', model: 'm', fetchImpl, delay: async (ms) => { delayMs = ms; } },
  );
  assert.equal(calls, 2);
  assert.ok(delayMs >= 1000 && delayMs <= 2500, `delay ~1.5s, got ${delayMs}`);
  assert.equal(medicines[0].name, 'Metformin');
});

test('429 twice -> throws RATE_LIMITED (offered demo by caller)', async () => {
  let calls = 0;
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: 'k', model: 'm',
      fetchImpl: async () => { calls += 1; return { ok: false, status: 429 }; },
      delay: async () => {},
    }),
    (err) => err.code === 'RATE_LIMITED',
  );
  assert.equal(calls, 2); // one retry only
});

test('500 -> retried once, then API_ERROR', async () => {
  let calls = 0;
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: 'k', model: 'm',
      fetchImpl: async () => { calls += 1; return { ok: false, status: 502 }; },
      delay: async () => {},
    }),
    (err) => err.code === 'API_ERROR' && err.detail === '502',
  );
  assert.equal(calls, 2);
});

test('401 is classified as an upstream configuration error and is not retried', async () => {
  let calls = 0;
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: 'k', model: 'm',
      fetchImpl: async () => { calls += 1; return { ok: false, status: 401 }; },
      delay: async () => {},
    }),
    (err) => err.code === 'AUTH_ERROR',
  );
  assert.equal(calls, 1);
});

test('invalid JSON from the model -> BAD_MODEL_JSON', async () => {
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: 'k', model: 'm', fetchImpl: geminiReply('not json at all'), delay: async () => {},
    }),
    (err) => err.code === 'BAD_MODEL_JSON',
  );
});

test('model returns prose instead of the schema -> BAD_MODEL_JSON', async () => {
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: 'k', model: 'm', fetchImpl: geminiReply('"all medicines match, take the label"'), delay: async () => {},
    }),
    (err) => err.code === 'BAD_MODEL_JSON',
  );
});

test('no candidates (blocked) -> NO_CANDIDATE', async () => {
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: 'k', model: 'm', fetchImpl: okFetch({ promptFeedback: { blockReason: 'SAFETY' } }), delay: async () => {},
    }),
    (err) => err.code === 'NO_CANDIDATE',
  );
});

test('network failure -> retried once, then NETWORK_ERROR', async () => {
  let calls = 0;
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: 'k', model: 'm',
      fetchImpl: async () => { calls += 1; throw new Error('ECONNREFUSED'); },
      delay: async () => {},
    }),
    (err) => err.code === 'NETWORK_ERROR',
  );
  assert.equal(calls, 2);
});

test('zero medicines extracted -> empty array, caller shows Add-row path', async () => {
  const { medicines } = await extractMedicines(
    { text: 'no medicines here' },
    { apiKey: 'k', model: 'm', fetchImpl: geminiReply('{"medicines":[]}'), delay: async () => {} },
  );
  assert.deepEqual(medicines, []);
});

test('explicit nullable fields survive response parsing and server-side cleaning', async () => {
  const { medicines } = await extractMedicines(
    { text: 'Unreadable medication line' },
    {
      apiKey: 'k',
      model: 'm',
      fetchImpl: geminiReply(JSON.stringify({
        medicines: [{
          name: null,
          strength_value: null,
          strength_unit: null,
          frequency_text: null,
          evidence: 'Unreadable medication line',
          uncertain: true,
        }],
      })),
      delay: async () => {},
    },
  );
  assert.deepEqual(medicines, [{
    name: null,
    strength_value: null,
    strength_unit: null,
    frequency_text: null,
    evidence: 'Unreadable medication line',
    uncertain: true,
  }]);
});

test('malformed model field types become null and uncertain, never coerced', async () => {
  const { medicines } = await extractMedicines(
    { text: DOC },
    {
      apiKey: 'k',
      model: 'm',
      fetchImpl: geminiReply(JSON.stringify({
        medicines: [{
          name: 123,
          strength_value: '500',
          strength_unit: 500,
          frequency_text: ['twice daily'],
          evidence: DOC,
          uncertain: false,
        }],
      })),
      delay: async () => {},
    },
  );
  assert.deepEqual(medicines, [{
    name: null,
    strength_value: null,
    strength_unit: null,
    frequency_text: null,
    evidence: DOC,
    uncertain: true,
  }]);
});

test('unsupported model output shapes fail extraction instead of dropping rows', async () => {
  for (const output of [
    [{ name: 'Metformin' }],
    { data: [] },
    { medicines: {} },
    { medicines: [{ name: 'Metformin' }, null] },
  ]) {
    await assert.rejects(
      extractMedicines({ text: DOC }, {
        apiKey: 'k',
        model: 'm',
        fetchImpl: geminiReply(JSON.stringify(output)),
        delay: async () => {},
      }),
      (err) => err instanceof ExtractError && err.code === 'BAD_MODEL_JSON',
    );
  }
});

test('extraction honours evidence check and uncertain flags on text input', async () => {
  const { medicines } = await extractMedicines(
    { text: DOC },
    {
      apiKey: 'k', model: 'm',
      fetchImpl: geminiReply(JSON.stringify({ medicines: [{ name: 'Metformin', evidence: 'made up quote', uncertain: false }] })),
      delay: async () => {},
    },
  );
  assert.equal(medicines[0].uncertain, true); // quote not a substring of DOC
});

// ---- request timeout: a stalled Gemini call must fail instead of hanging the
// UI, retry once, then reach the same error path the 429 case uses.
// Every fetch here is stubbed; no live API call happens in this file.

/** A fetch stub that never settles on its own and rejects when the signal aborts. */
function hangUntilAbort(init) {
  return new Promise((_resolve, reject) => {
    const signal = init && init.signal;
    if (!signal) return; // no signal was passed: nothing can settle this call
    const fail = () => reject(signal.reason);
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener('abort', fail, { once: true });
  });
}

test('production request timeout is 20000 ms', () => {
  assert.equal(REQUEST_TIMEOUT_MS, 20000);
});

test('a stalled request rejects with TIMEOUT and is retried exactly once', { timeout: 5000 }, async () => {
  let calls = 0;
  let delayMs = null;
  const fetchImpl = (_url, init) => {
    calls += 1;
    return hangUntilAbort(init);
  };
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: 'k', model: 'm',
      fetchImpl,
      delay: async (ms) => { delayMs = ms; },
      timeoutMs: 25, // injectable so the test does not wait 20 s
    }),
    (err) => err instanceof ExtractError && err.code === 'TIMEOUT',
  );
  assert.equal(calls, 2); // one attempt plus exactly one retry
  assert.ok(delayMs >= 1000 && delayMs <= 2500, `retry waits RETRY_DELAY_MS, got ${delayMs}`);
});

test('a stalled response body is also covered by the request timeout', { timeout: 5000 }, async () => {
  let calls = 0;
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: 'k',
      model: 'm',
      fetchImpl: (_url, init) => {
        calls += 1;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => hangUntilAbort(init),
        });
      },
      delay: async () => {},
      timeoutMs: 25,
    }),
    (err) => err instanceof ExtractError && err.code === 'TIMEOUT',
  );
  assert.equal(calls, 2);
});

test('a caller signal still cancels the request and is not retried', { timeout: 5000 }, async () => {
  let calls = 0;
  const controller = new AbortController();
  const fetchImpl = (_url, init) => {
    calls += 1;
    controller.abort(); // caller cancels while the request is in flight
    return hangUntilAbort(init);
  };
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: 'k', model: 'm',
      fetchImpl,
      delay: async () => {},
      signal: controller.signal,
      timeoutMs: 5000,
    }),
    (err) => err.name === 'AbortError' && !(err instanceof ExtractError),
  );
  assert.equal(calls, 1); // caller cancellation never retries
});

test('first attempt times out and the retry returns the medicines', { timeout: 5000 }, async () => {
  let calls = 0;
  const reply = geminiReply(JSON.stringify({
    medicines: [{
      name: 'Metformin',
      strength_value: 500,
      strength_unit: 'mg',
      frequency_text: 'twice daily',
      evidence: DOC,
      uncertain: false,
    }],
  }));
  const fetchImpl = (_url, init) => {
    calls += 1;
    return calls === 1 ? hangUntilAbort(init) : reply();
  };
  const { medicines } = await extractMedicines({ text: DOC }, {
    apiKey: 'k', model: 'm',
    fetchImpl,
    delay: async () => {},
    timeoutMs: 25,
  });
  assert.equal(calls, 2);
  assert.equal(medicines.length, 1);
  assert.equal(medicines[0].name, 'Metformin');
  assert.equal(medicines[0].uncertain, false);
});
