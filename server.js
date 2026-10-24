// MedAlign — zero-dependency HTTP server (Node.js built-ins only).
// Routes:
//   GET  /api/health  -> { ok: true, keyConfigured: boolean }  (never the key)
//   POST /api/extract -> validated medicines[] | { error, offerDemo: true }
//   GET  /src/compare.js, /src/demo.js -> shared modules read-only, public/ mode
//      only (browser + unit tests import the same files)
//   GET /*            -> static files: web/dist/index.html when the React build
//      exists, else public/ (vanilla fallback). Never both.
// Security: CSP + nosniff on every response. Nothing is stored; request bodies
// are never logged.
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractMedicines, ExtractError } from './src/extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const SRC_DIR = path.join(__dirname, 'src');
const WEB_DIST_DIR = path.join(__dirname, 'web', 'dist');

// Static root decided per request: the built React app when it exists, else the
// vanilla front end. Only the files inside the chosen root are served.
async function staticRoot() {
  try {
    await fs.access(path.join(WEB_DIST_DIR, 'index.html'));
    return WEB_DIST_DIR;
  } catch {
    return PUBLIC_DIR;
  }
}

/** True when the React front end has been built (web/dist/index.html exists). */
async function webDistBuilt() {
  try {
    await fs.access(path.join(WEB_DIST_DIR, 'index.html'));
    return true;
  } catch {
    return false;
  }
}
// Only these src files are served — the pure modules the browser shares with tests.
const SHARED_SRC = new Set(['compare.js', 'demo.js']);
const TEXT_MAX_CHARS = 8000;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024; // 4 MB decoded
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const BODY_MAX_BYTES = 6 * 1024 * 1024; // covers 4 MB base64 (4/3 inflation) + text
const RATE_LIMIT_DEFAULT = 20;
const RATE_WINDOW_DEFAULT_MS = 60_000;
const CONCURRENT_DEFAULT = 2;
const MAX_TRACKED_CLIENTS = 10_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// inline styles: only the built React front end sets style attributes (React
// style props, reduced-motion safe transforms). Public mode keeps the byte-for-
// byte original CSP.
function setSecurityHeaders(res, opts) {
  const csp =
    opts && opts.inlineStyles
      ? "default-src 'self'; style-src 'self' 'unsafe-inline'"
      : "default-src 'self'";
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function sendJson(res, status, obj) {
  setSecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function sendText(res, status, text) {
  setSecurityHeaders(res);
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function sendApiError(res, status, error, message, offerDemo = false, extra = {}) {
  sendJson(res, status, { error, message, offerDemo, ...extra });
}

/** Read at most limit bytes; oversize bodies are drained so the 413 can be sent. */
function readBody(req, limit) {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > limit) {
    req.resume();
    return Promise.resolve({ tooLarge: true });
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        finish(resolve, { tooLarge: true });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(resolve, { tooLarge: false, body: Buffer.concat(chunks) }));
    req.on('aborted', () => finish(reject, new Error('Request aborted')));
    req.on('error', (error) => finish(reject, error));
  });
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isBase64(value) {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const dataLength = value.length - padding;
  for (let i = 0; i < dataLength; i += 1) {
    const code = value.charCodeAt(i);
    const alphaNumeric = (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57);
    if (!alphaNumeric && code !== 43 && code !== 47) return false;
  }
  return true;
}

function createUsageGuard(env, now) {
  const maxRequests = positiveInteger(env.EXTRACT_RATE_LIMIT_MAX, RATE_LIMIT_DEFAULT);
  const windowMs = positiveInteger(env.EXTRACT_RATE_LIMIT_WINDOW_MS, RATE_WINDOW_DEFAULT_MS);
  const maxConcurrent = positiveInteger(env.EXTRACT_MAX_CONCURRENT, CONCURRENT_DEFAULT);
  const clients = new Map();
  let active = 0;

  function checkRate(req) {
    // Use only the direct socket peer; forwarding headers are caller-controlled.
    const key = req.socket?.remoteAddress || 'unknown';
    const currentTime = now();
    let bucket = clients.get(key);
    if (!bucket || bucket.resetAt <= currentTime) {
      if (bucket) clients.delete(key);
      if (clients.size >= MAX_TRACKED_CLIENTS) {
        clients.delete(clients.keys().next().value);
      }
      bucket = { count: 0, resetAt: currentTime + windowMs };
      clients.set(key, bucket);
    }
    if (bucket.count >= maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000)),
      };
    }
    bucket.count += 1;
    return { allowed: true };
  }

  function acquire() {
    if (active >= maxConcurrent) return null;
    active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active -= 1;
    };
  }

  return { checkRate, acquire };
}

function extractionFailure(res, err) {
  const code = err instanceof ExtractError ? err.code : 'UNEXPECTED';
  const safeCodes = new Set([
    'KEY_NOT_CONFIGURED', 'MODEL_NOT_CONFIGURED', 'AUTH_ERROR', 'RATE_LIMITED',
    'TIMEOUT', 'NETWORK_ERROR', 'API_ERROR', 'BAD_RESPONSE', 'BAD_MODEL_JSON',
    'NO_CANDIDATE',
  ]);
  console.error(`extract failure: ${safeCodes.has(code) ? code : 'UNEXPECTED'}`);

  if (code === 'KEY_NOT_CONFIGURED' || code === 'MODEL_NOT_CONFIGURED' || code === 'AUTH_ERROR') {
    const message = code === 'KEY_NOT_CONFIGURED'
      ? 'Reading needs to be set up first: GEMINI_API_KEY is not set. You can still load the demo case.'
      : code === 'MODEL_NOT_CONFIGURED'
        ? 'Reading needs to be set up first: GEMINI_MODEL is not set. You can still load the demo case.'
        : 'The reading service setup needs attention. You can still load the demo case.';
    sendApiError(res, 503, 'EXTRACTION_NOT_CONFIGURED', message, true, { reason: code });
    return;
  }
  if (code === 'BAD_RESPONSE' || code === 'BAD_MODEL_JSON' || code === 'NO_CANDIDATE') {
    sendApiError(
      res,
      502,
      'INVALID_EXTRACTION_RESPONSE',
      'The reading service did not return a usable structured result. You can try again, or load the demo case.',
      true,
      { reason: code },
    );
    return;
  }
  if (code === 'RATE_LIMITED') {
    sendApiError(
      res,
      503,
      'EXTRACTION_UNAVAILABLE',
      'The reading service is busy right now (tried twice). You can wait a moment and try again, or load the demo case.',
      true,
      { reason: code },
    );
    return;
  }
  if (code === 'TIMEOUT') {
    sendApiError(
      res,
      503,
      'EXTRACTION_UNAVAILABLE',
      'The reading step took too long this time. You can try again, or load the demo case.',
      true,
      { reason: code },
    );
    return;
  }
  if (code === 'NETWORK_ERROR') {
    sendApiError(
      res,
      503,
      'EXTRACTION_UNAVAILABLE',
      'The app could not reach the reading service. Check the connection, or load the demo case.',
      true,
      { reason: code },
    );
    return;
  }
  sendApiError(
    res,
    503,
    'EXTRACTION_UNAVAILABLE',
    'The reading step did not work this time. You can try again, or load the demo case.',
    true,
    { reason: code === 'API_ERROR' ? 'UPSTREAM_ERROR' : 'UNEXPECTED' },
  );
}

async function handleExtract(req, res, { extract, usageGuard }) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST to read document content.');
    return;
  }
  const rate = usageGuard.checkRate(req);
  if (!rate.allowed) {
    req.resume();
    res.setHeader('Retry-After', String(rate.retryAfter));
    sendApiError(
      res,
      429,
      'RATE_LIMITED',
      'Too many reading requests from this connection. Please wait before trying again, or load the demo case.',
      true,
    );
    return;
  }
  const bodyResult = await readBody(req, BODY_MAX_BYTES);
  if (bodyResult.tooLarge) {
    sendApiError(res, 413, 'PAYLOAD_TOO_LARGE', 'The request body is larger than the 6 MB limit.');
    return;
  }
  const raw = bodyResult.body;
  let body;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    sendApiError(res, 400, 'BAD_REQUEST', 'The request could not be read. Please try again.');
    return;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    sendApiError(res, 400, 'BAD_REQUEST', 'The request could not be read. Please try again.');
    return;
  }

  const input = {};
  if (typeof body.text === 'string') {
    if (body.text.length > TEXT_MAX_CHARS) {
      sendApiError(
        res,
        413,
        'PAYLOAD_TOO_LARGE',
        'The pasted text is longer than the 8,000-character limit. Please paste a shorter part of it.',
      );
      return;
    }
    if (body.text.trim() === '') {
      sendApiError(res, 400, 'BAD_REQUEST', 'There is no text to read yet. Paste the list or add an image first.');
      return;
    }
    input.text = body.text;
  } else if (body.image && typeof body.image === 'object' && !Array.isArray(body.image)) {
    const { mime, data } = body.image;
    if (!IMAGE_MIMES.has(mime) || typeof data !== 'string' || data === '') {
      sendApiError(res, 400, 'BAD_REQUEST', 'Only PNG, JPEG, or WebP images can be read.');
      return;
    }
    if (!isBase64(data)) {
      sendApiError(res, 400, 'BAD_REQUEST', 'The image data could not be read. Please choose a PNG, JPEG, or WebP image.');
      return;
    }
    const bytes = Buffer.from(data, 'base64').length;
    if (bytes > IMAGE_MAX_BYTES) {
      sendApiError(res, 413, 'PAYLOAD_TOO_LARGE', 'That image is larger than the 4 MB limit.');
      return;
    }
    input.image = { mime, data };
  } else {
    sendApiError(res, 400, 'BAD_REQUEST', 'There is nothing to read yet. Paste the list or add an image first.');
    return;
  }

  const release = usageGuard.acquire();
  if (!release) {
    res.setHeader('Retry-After', '1');
    sendApiError(
      res,
      429,
      'EXTRACTION_BUSY',
      'The reading service is handling other requests. Please try again shortly, or load the demo case.',
      true,
    );
    return;
  }
  try {
    const result = await extract(input);
    if (!Array.isArray(result?.medicines)) {
      sendApiError(
        res,
        502,
        'INVALID_EXTRACTION_RESPONSE',
        'The reading service did not return a usable structured result. You can try again, or load the demo case.',
        true,
        { reason: 'INVALID_SERVICE_RESULT' },
      );
      return;
    }
    const { medicines } = result;
    sendJson(res, 200, { medicines });
  } catch (err) {
    extractionFailure(res, err);
  } finally {
    release();
  }
}

async function serveSharedSrc(res, pathname) {
  const file = pathname.slice('/src/'.length);
  if (!SHARED_SRC.has(file)) {
    sendText(res, 404, 'Not found');
    return;
  }
  let data;
  try {
    data = await fs.readFile(path.join(SRC_DIR, file));
  } catch {
    sendText(res, 404, 'Not found');
    return;
  }
  setSecurityHeaders(res);
  res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
  res.end(data);
}

async function serveStatic(res, pathname, rootDir, opts) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  try {
    rel = decodeURIComponent(rel);
  } catch {
    sendText(res, 400, 'Bad request');
    return;
  }
  const filePath = path.normalize(path.join(rootDir, rel));
  if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  let data;
  try {
    data = await fs.readFile(filePath);
  } catch {
    sendText(res, 404, 'Not found');
    return;
  }
  setSecurityHeaders(res, opts);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
  res.end(data);
}

export function createServer(options = {}) {
  const env = options.env ?? process.env;
  const extract = options.extractMedicines ?? extractMedicines;
  const usageGuard = createUsageGuard(env, options.now ?? Date.now);

  return http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;

      if (pathname === '/api/health') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.setHeader('Allow', 'GET, HEAD');
          sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Use GET to check service configuration.');
          return;
        }
        // Never expose the key itself — only whether it is configured.
        sendJson(res, 200, {
          ok: true,
          keyConfigured: typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim() !== '',
          modelConfigured: typeof env.GEMINI_MODEL === 'string' && env.GEMINI_MODEL.trim() !== '',
        });
        return;
      }

      if (pathname === '/api/extract') {
        await handleExtract(req, res, { extract, usageGuard });
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'This route only supports GET and HEAD.');
        return;
      }
      const root = await staticRoot();
      if (pathname.startsWith('/src/')) {
        // The read-only module allowlist serves the vanilla front end only; the
        // built app bundles the same modules itself.
        if (root === WEB_DIST_DIR) {
          sendText(res, 404, 'Not found');
          return;
        }
        await serveSharedSrc(res, pathname);
        return;
      }
      await serveStatic(res, pathname, root, { inlineStyles: root === WEB_DIST_DIR });
    } catch {
      if (!res.destroyed && !res.writableEnded) {
        sendApiError(res, 500, 'INTERNAL_ERROR', 'The request could not be completed.');
      }
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => {
    console.log(`MedAlign running at http://localhost:${port}`);
    // Never silently fall back: without a build, the older vanilla front end is
    // served and it does not have the newer review features. Say so, and how
    // to get the full app.
    void webDistBuilt().then((built) => {
      if (!built) {
        console.warn(
          '[MedAlign] web/dist has not been built, so the older fallback front end (public/) is being served. ' +
            'It lacks the newer review features: source coverage, mismatch explanations, and the uncertainty resolver. ' +
            'Run "npm run build" to build the full React front end, then restart the server.',
        );
      }
    });
  });
}
