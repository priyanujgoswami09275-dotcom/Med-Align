// test/ui-strings.test.js — scans every UI string and result for whole-word
// "safe", "correct", "OK" (case-insensitive). NONE may appear. Also guards the
// text-only rendering rule (no innerHTML/outerHTML/document.write in the client).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { compare, pharmacistQuestion } from '../src/compare.js';
import { DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES } from '../src/demo.js';

const BANNED = /\b(safe|correct|ok)\b/i;
const ROOT = path.join(process.cwd());

/** Block/line comments removed, so checks target code, not prose. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** All quoted string literals in a JS source file (single/double/backtick). */
function jsStrings(source) {
  const noComments = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // line comments (skips URLs following :)
  const out = [];
  const re = /(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`)/g;
  let m;
  while ((m = re.exec(noComments)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  return out;
}

/** Text inside tags + visible attribute texts of an HTML file. */
function htmlStrings(source) {
  const out = [];
  const textOnly = source
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  for (const m of textOnly.matchAll(/>([^<>]*)</g)) {
    if (m[1].trim()) out.push(m[1]);
  }
  for (const m of textOnly.matchAll(/(?:aria-label|placeholder|title|alt)="([^"]*)"/g)) {
    if (m[1].trim()) out.push(m[1]);
  }
  return out;
}

/** Recursively list files under dir (absolute paths). */
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** UI strings in a React TS/TSX file: string literals + JSX text nodes. */
function tsxStrings(source) {
  const noComments = stripComments(source);
  const out = [...jsStrings(noComments)];
  for (const m of noComments.matchAll(/>([^<>{}]+)</g)) {
    if (m[1].trim()) out.push(m[1]);
  }
  return out;
}

test('no banned words in the Home/Add/Review/Report UI strings', async () => {
  const appJs = await readFile(path.join(ROOT, 'public/app.js'), 'utf8');
  const indexHtml = await readFile(path.join(ROOT, 'public/index.html'), 'utf8');
  const strings = [...jsStrings(stripComments(appJs)), ...htmlStrings(indexHtml)];
  assert.ok(strings.length > 50, `expected many UI strings, got ${strings.length}`);
  for (const s of strings) {
    assert.ok(!BANNED.test(s), `banned word in a UI string: ${JSON.stringify(s)}`);
  }
});

test('no banned words in server/user-facing messages and module strings', async () => {
  const files = ['server.js', 'src/extract.js', 'src/schema.js', 'src/demo.js', 'src/compare.js'];
  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), 'utf8');
    for (const s of jsStrings(source)) {
      assert.ok(!BANNED.test(s), `banned word in ${file}: ${JSON.stringify(s)}`);
    }
  }
});

test('no banned words in any comparison result for the demo case and edge fixtures', () => {
  const fixtures = [
    [DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES],
    // unknown fields, uncertain rows, one-sided rows
    [
      [{ name: 'Metformin', strength_value: null, strength_unit: null, frequency_text: 'unknown schedule', evidence: '', uncertain: true }],
      [{ name: 'Pan 40', strength_value: 40, strength_unit: 'mg', frequency_text: 'once daily', evidence: '', uncertain: false }],
    ],
    [[], DEMO_LABEL_MEDICINES],
    [DEMO_DOCTOR_MEDICINES, []],
  ];
  for (const [d, l] of fixtures) {
    const results = compare(d, l);
    const text = JSON.stringify(results);
    assert.ok(!BANNED.test(text), `banned word in comparison results: ${text}`);
    assert.ok(!BANNED.test(pharmacistQuestion(results)), 'banned word in pharmacist question');
  }
});

test('client never renders dynamic data as HTML (textContent rule)', async () => {
  const forbidden = ['dangerouslySetInnerHTML', 'innerHTML', 'outerHTML', 'document.write', 'insertAdjacentHTML'];
  const appJs = await readFile(path.join(ROOT, 'public/app.js'), 'utf8');
  for (const term of forbidden) {
    assert.ok(!stripComments(appJs).includes(term), `public/app.js must not use ${term}`);
  }
  // The React front end renders document/model text only as JSX children.
  const srcFiles = (await walk(path.join(ROOT, 'web/src'))).filter((f) => /\.(ts|tsx)$/.test(f));
  for (const file of srcFiles) {
    const source = stripComments(await readFile(file, 'utf8'));
    for (const term of forbidden) {
      assert.ok(!source.includes(term), `${path.relative(ROOT, file)} must not use ${term}`);
    }
  }
});

test('footer disclaimer present in the React front end', async () => {
  const files = (await walk(path.join(ROOT, 'web/src'))).filter((f) => /\.(ts|tsx)$/.test(f));
  const footer = 'Demo with synthetic data. Decision support, not medical advice. If someone feels very unwell, call 112.';
  let found = false;
  for (const file of files) {
    if ((await readFile(file, 'utf8')).includes(footer)) found = true;
  }
  assert.ok(found, 'footer text missing from web/src');
});

test('no banned words in the React UI strings (web/src)', async () => {
  const files = (await walk(path.join(ROOT, 'web/src'))).filter((f) => /\.(ts|tsx)$/.test(f));
  let scanned = 0;
  for (const file of files) {
    for (const s of tsxStrings(await readFile(file, 'utf8'))) {
      scanned += 1;
      assert.ok(!BANNED.test(s), `banned word in ${path.relative(ROOT, file)}: ${JSON.stringify(s)}`);
    }
  }
  assert.ok(scanned > 20, `expected many React UI strings, got ${scanned}`);
});

test('React copy pins: five status labels, confirm tag, copy confirmation', async () => {
  const files = (await walk(path.join(ROOT, 'web/src'))).filter((f) => /\.(ts|tsx)$/.test(f));
  const joined = (await Promise.all(files.map((f) => readFile(f, 'utf8')))).join('\n');
  for (const s of [
    'No differences found',
    'Needs checking',
    'Not on the pharmacy label',
    'Not on the doctor list',
    'Cannot tell yet',
    'Please confirm',
    'Copied. Paste it to your pharmacist.',
    // Extraction/limit/empty copy must match public/app.js verbatim.
    'That file type cannot be read here. Please use a PNG, JPEG, or WebP photo.',
    'That image is larger than the 4 MB limit. Please pick a smaller photo.',
    'The photo could not be opened. Please try another one.',
    'That pasted text is longer than the 8,000-character limit. Please paste a shorter part of it.',
    'Add something first: paste the words for a panel, or choose a photo for it.',
    'Both panels could not be read right now. Nothing was sent or saved.',
    'The reading step did not work this time. You can try again soon, or load the demo case.',
    'The app could not reach the reading service. Check the connection, or load the demo case.',
    'No medicine could be read from ',
    'This panel could not be read: ',
    'There is no medicine row to Compare yet. Use the + Add a medicine buttons to type one in.',
    'Nothing to show: no medicine rows were compared.',
  ]) {
    assert.ok(joined.includes(s), `React copy missing: ${s}`);
  }
});

test('React Report includes live Source Coverage and its required scope explanation', async () => {
  const coverage = await readFile(path.join(ROOT, 'web/src/components/CoverageStrip.tsx'), 'utf8');
  const report = await readFile(path.join(ROOT, 'web/src/screens/Report.tsx'), 'utf8');
  assert.ok(report.includes('<CoverageStrip sources={sources} results={results} waitingReviewCount={waitingReviewCount} />'));
  for (const copy of [
    'Source coverage',
    'Doctor-source records',
    'Pharmacy-source records',
    'Medicine pairs compared',
    'Fields compared',
    'Fields missing or unresolved',
    'Coverage describes the information available in the two sources provided. It does not establish that the entire medication regimen has been reviewed.',
    'Counts update when you edit or confirm extracted information.',
    'The comparison covers medication name, strength, and frequency only.',
  ]) {
    assert.ok(coverage.includes(copy), `coverage content missing: ${copy}`);
  }
  assert.ok(coverage.includes('<details'), 'coverage details use a native keyboard disclosure');
  assert.ok(coverage.includes('aria-controls={detailsId}'));
});

test('React Report cards expose an accessible deterministic mismatch disclosure', async () => {
  const why = await readFile(path.join(ROOT, 'web/src/components/WhyFlagged.tsx'), 'utf8');
  const report = await readFile(path.join(ROOT, 'web/src/screens/Report.tsx'), 'utf8');
  const gateway = await readFile(path.join(ROOT, 'web/src/lib/explainer.ts'), 'utf8');
  assert.ok(report.includes('<WhyFlagged result={result} />'));
  assert.ok(why.includes('aria-expanded={open}'));
  assert.ok(why.includes('aria-controls={panelId}'));
  assert.ok(why.includes('The original excerpt is unavailable.'));
  assert.ok(why.includes('Final status:'));
  assert.ok(gateway.includes("'@shared/explainer.js'"));
});

test('Review resolver is sourced from state, focuses matching fields, and preserves unresolved status', async () => {
  const resolver = await readFile(path.join(ROOT, 'web/src/components/ResolverQueue.tsx'), 'utf8');
  const review = await readFile(path.join(ROOT, 'web/src/screens/Review.tsx'), 'utf8');
  const row = await readFile(path.join(ROOT, 'web/src/components/MedicineRow.tsx'), 'utf8');
  const state = await readFile(path.join(ROOT, 'web/src/lib/state.ts'), 'utf8');
  const report = await readFile(path.join(ROOT, 'web/src/screens/Report.tsx'), 'utf8');
  assert.ok(review.includes('<ResolverQueue sources={sources} dispatch={dispatch} />'));
  assert.ok(review.indexOf('<ResolverQueue') < review.indexOf('<div className="grid gap-4 lg:grid-cols-2">'));
  for (const copy of [
    'Needs your review',
    'No extraction fields are waiting for your review right now. This does not confirm the documents themselves.',
    'The original excerpt is unavailable.',
    'Edit this field',
    'Confirm this value',
    'Leave unresolved',
  ]) assert.ok(resolver.includes(copy), `resolver copy missing: ${copy}`);
  assert.ok(row.includes('med-${sourceKey}-${rowId}-frequency'));
  assert.ok(state.includes('confirmedFields'));
  assert.ok(state.includes('rowUncertainAfterConfirm'));
  assert.ok(state.includes('original:'));
  assert.ok(report.includes('waitingReviewCount={waitingReviewCount}'));
});

test('tool screens use the reduced-motion-aware scroll container, not the Home page', async () => {
  const component = await readFile(
    path.join(ROOT, 'web/src/components/ui/container-scroll-animation.tsx'),
    'utf8',
  );
  for (const file of [
    'web/src/screens/Add.tsx',
    'web/src/screens/Review.tsx',
    'web/src/screens/Report.tsx',
  ]) {
    const source = await readFile(path.join(ROOT, file), 'utf8');
    assert.ok(source.includes('ContainerScroll'), `${file} must use the scroll container`);
    assert.ok(source.includes('<ContainerScroll'), `${file} must render the scroll container`);
  }
  const home = await readFile(path.join(ROOT, 'web/src/screens/Home.tsx'), 'utf8');
  const styles = await readFile(path.join(ROOT, 'web/src/index.css'), 'utf8');
  assert.ok(!home.includes('ContainerScroll'), 'Home must remain unchanged by the scroll effect');
  assert.ok(component.includes('useScroll({'));
  assert.ok(component.includes('target: containerRef'));
  assert.ok(component.includes('useReducedMotion'));
  assert.ok(component.includes('MotionValue'));
  assert.ok(component.includes('motion/react'), 'uses the project motion library');
  assert.ok(component.includes('[4, 0, -4]'), 'scroll tilt stays subtle');
  assert.ok(component.includes('[1.01, 1, 1.01]'), 'scroll scale does not shrink content');
  assert.ok(component.includes('rotateX: reduceMotion ? 0 : rotate'));
  assert.ok(styles.includes('[data-scroll-card] :is(button, input, select, textarea):not(.sr-only)'));
  assert.ok(styles.includes('min-height: 48px'), '3D projection must preserve 44px targets');
});

test('buttons carry the MedAlign liquid-glass treatment (white/green theme, every variant)', async () => {
  const button = await readFile(path.join(ROOT, 'web/src/components/ui/button.tsx'), 'utf8');
  const liquidButton = await readFile(path.join(ROOT, 'web/src/components/ui/liquid-glass-button.tsx'), 'utf8');
  const styles = await readFile(path.join(ROOT, 'web/src/index.css'), 'utf8');

  // The existing shared button API is preserved (no parallel Radix Slot button).
  assert.ok(button.includes('export { Button, buttonVariants }'));
  assert.ok(button.includes('ButtonPrimitive'));
  assert.ok(!button.includes('@radix-ui/react-slot'), 'keep the Base UI button primitive');
  assert.ok(liquidButton.includes('Button as LiquidButton'));

  // Every variant opts into the liquid-glass surface; the inline link variant
  // keeps its underline while sharing the frosted rim.
  assert.ok(button.includes('liquid-glass-btn'), 'variants use the liquid-glass surface');
  assert.ok(button.includes('link: "liquid-glass-link'));

  // Frosted surface: blur with a solid fallback and a luminous rim light.
  assert.ok(styles.includes('.liquid-glass-btn'));
  assert.ok(styles.includes('backdrop-filter: blur('));
  assert.ok(styles.includes('-webkit-backdrop-filter: blur('));
  assert.ok(styles.includes('@supports'));
  assert.ok(/\.liquid-glass-btn[\s\S]{0,400}inset 0 1px 0/.test(styles), 'rim-light highlight');

  // Theme-matched white/green/dark: no purple or pink anywhere.
  for (const banned of ['purple', 'pink', 'fuchsia', '#a855f7', '#ec4899', '#d946ef']) {
    assert.ok(!button.toLowerCase().includes(banned), `button picks up banned palette word: ${banned}`);
  }
  assert.ok(styles.includes('var(--primary)'), 'glass leans on the MedAlign green primary');

  // Destructive buttons keep their danger distinction.
  assert.ok(button.includes('bg-destructive'), 'destructive stays visibly destructive');
  assert.ok(button.includes('text-destructive'));

  // Accessibility and motion guardrails.
  assert.ok(button.includes('focus-visible:ring-ring/50'), 'visible focus ring survives');
  assert.ok(styles.includes('prefers-reduced-motion: reduce'), 'reduced motion is honored');

  // Home CTAs keep their copy and shared Button wiring.
  const home = await readFile(path.join(ROOT, 'web/src/screens/Home.tsx'), 'utf8');
  const wordmark = await readFile(path.join(ROOT, 'web/src/components/Wordmark.tsx'), 'utf8');
  const dropzone = await readFile(path.join(ROOT, 'web/src/components/Dropzone.tsx'), 'utf8');
  const medicineRow = await readFile(path.join(ROOT, 'web/src/components/MedicineRow.tsx'), 'utf8');
  assert.ok(home.includes('Start comparing'));
  assert.ok(home.includes('Try the demo case'));
  assert.ok(home.includes("from '@/components/ui/button'"));
  assert.ok(wordmark.includes('liquid-glass-btn'), 'in-app wordmark button also has the glass treatment');
  assert.ok(dropzone.includes('liquid-glass-btn'), 'photo chooser also has the glass treatment');
  assert.ok(dropzone.includes('motion-reduce:transition-none'));
  assert.ok(medicineRow.includes('variant="destructive"'), 'delete actions retain a destructive visual distinction');
});

test('header navigation is the animated breadcrumb with back-only navigation', async () => {
  const breadcrumb = await readFile(path.join(ROOT, 'web/src/components/Breadcrumb.tsx'), 'utf8');
  const app = await readFile(path.join(ROOT, 'web/src/App.tsx'), 'utf8');

  // The stepper is retired; App renders the breadcrumb on the tool screens.
  assert.ok(app.includes('<Breadcrumb step={state.step} onNavigate={go} />'), 'App must render the breadcrumb');
  assert.ok(!app.includes('StepIndicator'), 'App must not render the retired stepper');
  await assert.rejects(
    readFile(path.join(ROOT, 'web/src/components/StepIndicator.tsx'), 'utf8'),
    'StepIndicator.tsx must be deleted once the breadcrumb replaces it',
  );

  // Home stays minimal (no header navigation there).
  const home = await readFile(path.join(ROOT, 'web/src/screens/Home.tsx'), 'utf8');
  assert.ok(!home.includes('Breadcrumb') && !home.includes('StepIndicator'), 'Home keeps minimal navigation');

  // Project standards: motion/react under the app MotionConfig, MedAlign tokens.
  assert.ok(breadcrumb.includes("'motion/react'"), 'uses the project motion library');
  assert.ok(!breadcrumb.includes('framer-motion'), 'framer-motion is not the project import');
  assert.ok(!/neutral-\d/.test(breadcrumb), 'no neutral grays; MedAlign tokens only');

  // Same accessibility contract as the stepper it replaces.
  assert.ok(breadcrumb.includes('aria-label="Step progress"'));
  assert.ok(breadcrumb.includes('aria-current'), 'active step is announced');
  assert.ok(breadcrumb.includes('sr-only') && breadcrumb.includes('of {ORDER.length}'), 'Step N of 4 stays exposed');

  // The component's signature interactions survive the adaptation.
  assert.ok(breadcrumb.includes('ChevronRight'), 'chevron separators');
  assert.ok(breadcrumb.includes('layoutId'), 'shared hover-pill highlight');
  assert.ok(breadcrumb.includes("type: 'spring'"), 'spring transition preserved');
  assert.ok(breadcrumb.includes('min-h-11'), 'crumbs keep the 44px hit target');

  // Back-only navigation: completed steps navigate, current/future stay inert.
  assert.ok(breadcrumb.includes("state === 'done'"), 'navigation gated on completed steps');
  assert.ok(breadcrumb.includes('onNavigate(s.key)'), 'clicking a completed crumb navigates');
});

test('index.html contains the required footer disclaimer', async () => {
  const indexHtml = await readFile(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.ok(indexHtml.includes('Demo with synthetic data. Decision support, not medical advice. If someone feels very unwell, call 112.'));
});

test('injection-style document text stays inert in the client data path', async () => {
  const appJs = await readFile(path.join(ROOT, 'public/app.js'), 'utf8');
  // The only rendering APIs used on dynamic text are textContent/append/createElement.
  assert.ok(appJs.includes('textContent'), 'client should set text via textContent');
});

test('Home screen copy present (strings above are covered by the banned-word sweep)', async () => {
  const indexHtml = await readFile(path.join(ROOT, 'public/index.html'), 'utf8');
  const appJs = await readFile(path.join(ROOT, 'public/app.js'), 'utf8');
  for (const s of [
    'Free demo &#8226; Synthetic data',
    'Spot',
    'differences',
    "doctor's note and your pharmacy label",
    'We read both lists and flag differences with evidence.',
    'We never decide which one is right. You stay in charge.',
    'Start comparing',
    'Try the demo case',
    'How it works',
    'Add both lists',
    'Check what we read',
    'See the differences',
    'Example result',
    'Example, synthetic data',
    'What we compare',
    'Medicine name',
    'We do not check allergies, interactions or dosing advice.',
    'id="screen-home"',
    'id="wordmark-link"',
    'id="btn-home-add"',
    'id="btn-home-demo"',
  ]) {
    assert.ok(indexHtml.includes(s), `Home copy or hook missing from index.html: ${s}`);
  }
  // The Add/Review/Report screens stay in the file (nothing was removed).
  for (const id of ['screen-add', 'screen-review', 'screen-report']) {
    assert.ok(indexHtml.includes(`id="${id}"`), `expected screen missing: ${id}`);
  }
  // The example card shell is empty in static HTML; values are built in
  // app.js from src/demo.js (not retyped as literals).
  assert.ok(/<div class="example-body" id="home-example"><\/div>/.test(indexHtml),
    'example card must be an empty shell in index.html');
  for (const s of [
    'DEMO_DOCTOR_MEDICINES[0]',
    'DEMO_LABEL_MEDICINES[0]',
    "'Strength'",
    "'How often'",
    'STATUS_PRESENTATION.NEEDS_CHECKING',
    "step: 'home'",
    "SCREEN_IDS = ['screen-home'",
    "'btn-home-add'",
    "'btn-home-demo'",
    "'wordmark-link'",
  ]) {
    assert.ok(appJs.includes(s), `Home wiring missing from app.js: ${s}`);
  }
});
