// MedAlign — zero-dependency HTTP server (Node 20+ built-ins only).
// Routes (architecture.md):
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
// Only these src files are served — the pure modules the browser shares with tests.
const SHARED_SRC = new Set(['compare.js', 'demo.js']);
const PORT = process.env.PORT || 3000;

const TEXT_MAX_CHARS = 8000;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024; // 4 MB decoded
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const BODY_MAX_BYTES = 6 * 1024 * 1024; // covers 4 MB base64 (4/3 inflation) + text

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

/** Read the raw body with a hard cap. Returns null when the client overshoots. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function badRequest(res, message) {
  sendJson(res, 400, { error: 'BAD_REQUEST', message });
}

async function handleExtract(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    return;
  }
  const raw = await readBody(req, BODY_MAX_BYTES);
  if (raw === null) {
    badRequest(res, 'That file is larger than the 4 MB limit for images.');
    return;
  }
  let body;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    badRequest(res, 'The request could not be read. Please try again.');
    return;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    badRequest(res, 'The request could not be read. Please try again.');
    return;
  }

  const input = {};
  if (typeof body.text === 'string') {
    if (body.text.length > TEXT_MAX_CHARS) {
      badRequest(res, 'The pasted text is longer than the 8,000-character limit. Please paste a shorter part of it.');
      return;
    }
    if (body.text.trim() === '') {
      badRequest(res, 'There is no text to read yet. Paste the list or add an image first.');
      return;
    }
    input.text = body.text;
  } else if (body.image && typeof body.image === 'object') {
    const { mime, data } = body.image;
    if (!IMAGE_MIMES.has(mime) || typeof data !== 'string' || data === '') {
      badRequest(res, 'Only PNG, JPEG, or WebP images can be read.');
      return;
    }
    const bytes = Buffer.byteLength(data, 'base64');
    if (bytes > IMAGE_MAX_BYTES) {
      badRequest(res, 'That image is larger than the 4 MB limit.');
      return;
    }
    input.image = { mime, data };
  } else {
    badRequest(res, 'There is nothing to read yet. Paste the list or add an image first.');
    return;
  }

  try {
    const { medicines } = await extractMedicines(input);
    sendJson(res, 200, { medicines });
  } catch (err) {
    if (err === null || !(err instanceof ExtractError)) {
      sendJson(res, 503, {
        error: 'EXTRACTION_UNAVAILABLE',
        offerDemo: true,
        message: 'The reading step is not working right now. You can try again, or load the demo case.',
      });
      return;
    }
    // Error detail is logged to the server console only as a code, never the body.
    console.error(`extract failure: ${err.code}`);
    if (err.code === 'KEY_NOT_CONFIGURED' || err.code === 'MODEL_NOT_CONFIGURED') {
      sendJson(res, 503, {
        error: 'EXTRACTION_UNAVAILABLE',
        offerDemo: true,
        keyConfigured: false,
        message: 'Reading needs to be set up first: GEMINI_API_KEY and GEMINI_MODEL are not set. You can still load the demo case.',
      });
      return;
    }
    if (err.code === 'RATE_LIMITED') {
      sendJson(res, 503, {
        error: 'EXTRACTION_UNAVAILABLE',
        offerDemo: true,
        message: 'The reading service is busy right now (tried twice). You can wait a moment and try again, or load the demo case.',
      });
      return;
    }
    sendJson(res, 503, {
      error: 'EXTRACTION_UNAVAILABLE',
      offerDemo: true,
      message: 'The reading step did not work this time. You can try again, or load the demo case.',
    });
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

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || 'localhost';
    const pathname = new URL(req.url, `http://${host}`).pathname;

    if (pathname === '/api/health') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      // Never expose the key itself — only whether it is configured.
      sendJson(res, 200, {
        ok: true,
        keyConfigured: Boolean(process.env.GEMINI_API_KEY),
        modelConfigured: Boolean(process.env.GEMINI_MODEL),
      });
      return;
    }

    if (pathname === '/api/extract') {
      await handleExtract(req, res);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
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
    sendJson(res, 500, { error: 'INTERNAL_ERROR' });
  }
});

server.listen(PORT, () => {
  console.log(`MedAlign running at http://localhost:${PORT}`);
});
