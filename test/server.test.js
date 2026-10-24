import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createServer } from '../server.js';
import { extractMedicines } from '../src/extract.js';

const BODY_MAX_BYTES = 6 * 1024 * 1024;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

async function startServer(t, options = {}) {
  const server = createServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function post(url, body, headers = {}) {
  return fetch(`${url}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

async function postJson(url, value, headers = {}) {
  return post(url, JSON.stringify(value), headers);
}

function postChunked(url, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: '/api/extract',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }));
    });
    request.on('error', reject);
    request.write(body.slice(0, 1024));
    request.end(body.slice(1024));
  });
}

async function errorBody(response) {
  const body = await response.json();
  assert.equal(typeof body.error, 'string');
  assert.equal(typeof body.message, 'string');
  assert.equal(typeof body.offerDemo, 'boolean');
  return body;
}

test('health exposes configuration booleans only', async (t) => {
  const url = await startServer(t, {
    env: {
      GEMINI_API_KEY: 'secret-test-key',
      GEMINI_MODEL: 'model-name',
    },
  });
  const response = await fetch(`${url}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    keyConfigured: true,
    modelConfigured: true,
  });
});

test('health does not treat whitespace-only configuration as configured', async (t) => {
  const url = await startServer(t, {
    env: { GEMINI_API_KEY: '   ', GEMINI_MODEL: '\t' },
  });
  const response = await fetch(`${url}/api/health`);
  assert.deepEqual(await response.json(), {
    ok: true,
    keyConfigured: false,
    modelConfigured: false,
  });
});

test('request methods and malformed request shapes have intentional responses', async (t) => {
  let extractionCalls = 0;
  const url = await startServer(t, {
    extractMedicines: async () => {
      extractionCalls += 1;
      return { medicines: [] };
    },
  });

  const wrongMethod = await fetch(`${url}/api/extract`);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
  await errorBody(wrongMethod);

  const cases = [
    ['malformed JSON', '{ "text": '],
    ['wrong top-level shape', '[]'],
    ['missing content', '{}'],
    ['unsupported image type', JSON.stringify({ image: { mime: 'image/gif', data: 'AAAA' } })],
    ['invalid base64 image', JSON.stringify({ image: { mime: 'image/png', data: 'not base64!' } })],
  ];
  for (const [name, body] of cases) {
    const response = await post(url, body);
    assert.equal(response.status, 400, name);
    const payload = await errorBody(response);
    assert.equal(payload.error, 'BAD_REQUEST', name);
    assert.doesNotMatch(payload.message, /secret-test-key|patient document/i);
  }
  assert.equal(extractionCalls, 0);
});

test('text, decoded image, and raw body limits return 413 without destroying the response', { timeout: 15_000 }, async (t) => {
  let extractionCalls = 0;
  const url = await startServer(t, {
    extractMedicines: async () => {
      extractionCalls += 1;
      return { medicines: [] };
    },
  });

  const textResponse = await postJson(url, { text: 'x'.repeat(8001) });
  assert.equal(textResponse.status, 413);
  assert.equal((await errorBody(textResponse)).error, 'PAYLOAD_TOO_LARGE');

  const encodedOversizeImage = Buffer.alloc(IMAGE_MAX_BYTES + 1).toString('base64');
  const imageResponse = await postJson(url, {
    image: { mime: 'image/png', data: encodedOversizeImage },
  });
  assert.equal(imageResponse.status, 413);
  assert.equal((await errorBody(imageResponse)).error, 'PAYLOAD_TOO_LARGE');

  const rawResponse = await post(url, 'x'.repeat(BODY_MAX_BYTES + 1));
  assert.equal(rawResponse.status, 413);
  assert.equal((await errorBody(rawResponse)).error, 'PAYLOAD_TOO_LARGE');

  const chunkedResponse = await postChunked(url, 'x'.repeat(BODY_MAX_BYTES + 1));
  assert.equal(chunkedResponse.status, 413);
  assert.equal(chunkedResponse.body.error, 'PAYLOAD_TOO_LARGE');
  assert.equal(extractionCalls, 0);
});

test('request-size boundaries preserve valid text and image input', { timeout: 15_000 }, async (t) => {
  const received = [];
  const url = await startServer(t, {
    extractMedicines: async (input) => {
      received.push(input);
      return { medicines: [] };
    },
  });

  const textResponse = await postJson(url, { text: 'x'.repeat(8000) });
  assert.equal(textResponse.status, 200);
  assert.deepEqual(await textResponse.json(), { medicines: [] });

  const maxImage = Buffer.alloc(IMAGE_MAX_BYTES).toString('base64');
  const imageResponse = await postJson(url, { image: { mime: 'image/webp', data: maxImage } });
  assert.equal(imageResponse.status, 200);
  assert.equal(received.length, 2);
  assert.equal(received[0].text.length, 8000);
  assert.equal(received[1].image.data, maxImage);
});

test('the per-client rate limit ignores forwarded headers and avoids upstream calls', async (t) => {
  let extractionCalls = 0;
  const url = await startServer(t, {
    env: { EXTRACT_RATE_LIMIT_MAX: '1', EXTRACT_RATE_LIMIT_WINDOW_MS: '60000' },
    extractMedicines: async () => {
      extractionCalls += 1;
      return { medicines: [] };
    },
  });

  assert.equal((await postJson(url, { text: 'first' })).status, 200);
  const limited = await postJson(url, { text: 'second' }, { 'X-Forwarded-For': '203.0.113.44' });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  const payload = await errorBody(limited);
  assert.equal(payload.error, 'RATE_LIMITED');
  assert.equal(payload.offerDemo, true);
  assert.equal(extractionCalls, 1);
});

test('the concurrent extraction bound rejects rather than queueing upstream work', { timeout: 5000 }, async (t) => {
  let extractionCalls = 0;
  let markStarted;
  let releaseExtraction;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const gate = new Promise((resolve) => { releaseExtraction = resolve; });
  const url = await startServer(t, {
    env: { EXTRACT_MAX_CONCURRENT: '1' },
    extractMedicines: async () => {
      extractionCalls += 1;
      markStarted();
      await gate;
      return { medicines: [] };
    },
  });

  const first = postJson(url, { text: 'first' });
  await started;
  const second = await postJson(url, { text: 'second' });
  assert.equal(second.status, 429);
  assert.equal((await errorBody(second)).error, 'EXTRACTION_BUSY');
  assert.equal(extractionCalls, 1);

  releaseExtraction();
  assert.equal((await first).status, 200);
});

test('timeout errors are friendly, typed, and never expose provider details', async (t) => {
  let geminiCalls = 0;
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  t.after(() => { console.error = originalError; });
  const url = await startServer(t, {
    extractMedicines: (input) => extractMedicines(input, {
      apiKey: 'secret-test-key',
      model: 'test-model',
      fetchImpl: async () => {
        geminiCalls += 1;
        throw new DOMException('secret-test-key patient text', 'TimeoutError');
      },
      delay: async () => {},
      timeoutMs: 5,
    }),
  });

  const response = await postJson(url, { text: 'synthetic document text' });
  assert.equal(response.status, 503);
  const payload = await errorBody(response);
  assert.equal(payload.error, 'EXTRACTION_UNAVAILABLE');
  assert.equal(payload.reason, 'TIMEOUT');
  assert.equal(payload.offerDemo, true);
  assert.doesNotMatch(JSON.stringify(payload), /secret-test-key|patient text|TimeoutError/);
  assert.equal(geminiCalls, 2);
  assert.deepEqual(logs, ['extract failure: TIMEOUT']);
});

test('configuration and invalid model output remain distinct unsuccessful API responses', async (t) => {
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args.join(' '));
  t.after(() => { console.error = originalError; });

  let fetchCalls = 0;
  const configUrl = await startServer(t, {
    extractMedicines: (input) => extractMedicines(input, {
      apiKey: '',
      model: 'test-model',
      fetchImpl: async () => { fetchCalls += 1; },
    }),
  });
  const configResponse = await postJson(configUrl, { text: 'synthetic document text' });
  assert.equal(configResponse.status, 503);
  assert.equal((await errorBody(configResponse)).error, 'EXTRACTION_NOT_CONFIGURED');
  assert.equal(fetchCalls, 0);

  const modelUrl = await startServer(t, {
    extractMedicines: (input) => extractMedicines(input, {
      apiKey: 'secret-test-key',
      model: ' ',
      fetchImpl: async () => { fetchCalls += 1; },
    }),
  });
  const modelResponse = await postJson(modelUrl, { text: 'synthetic document text' });
  assert.equal(modelResponse.status, 503);
  assert.equal((await errorBody(modelResponse)).reason, 'MODEL_NOT_CONFIGURED');
  assert.equal(fetchCalls, 0);

  const invalidUrl = await startServer(t, {
    extractMedicines: (input) => extractMedicines(input, {
      apiKey: 'secret-test-key',
      model: 'test-model',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"medicines":[null]}' }] } }],
        }),
      }),
      delay: async () => {},
    }),
  });
  const invalidResponse = await postJson(invalidUrl, { text: 'synthetic document text' });
  assert.equal(invalidResponse.status, 502);
  const payload = await errorBody(invalidResponse);
  assert.equal(payload.error, 'INVALID_EXTRACTION_RESPONSE');
  assert.equal(payload.reason, 'BAD_MODEL_JSON');
  assert.equal(payload.offerDemo, true);
  assert.ok(!Object.hasOwn(payload, 'medicines'));
  assert.deepEqual(logs, [
    'extract failure: KEY_NOT_CONFIGURED',
    'extract failure: MODEL_NOT_CONFIGURED',
    'extract failure: BAD_MODEL_JSON',
  ]);
});

test('unexpected extraction service values cannot become successful empty comparisons', async (t) => {
  const url = await startServer(t, {
    extractMedicines: async () => ({ medicines: null }),
  });
  const response = await postJson(url, { text: 'synthetic document text' });
  assert.equal(response.status, 502);
  const payload = await errorBody(response);
  assert.equal(payload.error, 'INVALID_EXTRACTION_RESPONSE');
  assert.equal(payload.reason, 'INVALID_SERVICE_RESULT');
});

