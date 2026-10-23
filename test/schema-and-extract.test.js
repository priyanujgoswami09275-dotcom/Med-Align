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
import { extractMedicines, ExtractError } from '../src/extract.js';

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

test('no exact evidence quote -> uncertain', () => {
  const m = cleanMedicine({ name: 'Metformin', evidence: '   ' });
  assert.equal(m.evidence, '');
  assert.equal(m.uncertain, true);
});

test('cleanMedicineArray accepts array or wrapper, rejects junk', () => {
  assert.equal(cleanMedicineArray({ medicines: [{ name: 'X' }] }).length, 1);
  assert.equal(cleanMedicineArray([{ name: 'X' }]).length, 1);
  assert.equal(cleanMedicineArray('metformin everywhere'), null);
  assert.equal(cleanMedicineArray(123), null);
  assert.equal(cleanMedicineArray([]).length, 0);
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

test('401 is not retried', async () => {
  let calls = 0;
  await assert.rejects(
    extractMedicines({ text: DOC }, {
      apiKey: 'k', model: 'm',
      fetchImpl: async () => { calls += 1; return { ok: false, status: 401 }; },
      delay: async () => {},
    }),
    (err) => err.code === 'API_ERROR',
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
