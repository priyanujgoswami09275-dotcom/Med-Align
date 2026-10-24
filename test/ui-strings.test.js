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
  // Utility classes are implementation details, not user-facing copy.
  const noComments = stripComments(source).replace(
    /\bclassName\s*=\s*(?:"[^"]*"|'[^']*')/g,
    'className=""',
  );
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
      // This CSS environment lookup is a style token, not UI copy.
      const copy = s.replace(/env\(safe-area-inset-bottom\)/g, '');
      assert.ok(!BANNED.test(copy), `banned word in ${path.relative(ROOT, file)}: ${JSON.stringify(s)}`);
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
    'Both panels could not be read right now. The text or photo you added was sent to the extraction service for reading. MedAlign does not save it. You can try again, or load the demo case.',
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

test('a missing React build warns instead of silently serving the older front end', async () => {
  const server = await readFile(path.join(ROOT, 'server.js'), 'utf8');
  // The actionable startup warning: which front end is served, what it lacks,
  // and the exact build command. No silent fallback on a fresh clone.
  assert.ok(
    server.includes('web/dist has not been built'),
    'server must state that the React build is missing',
  );
  assert.ok(
    server.includes('older fallback front end'),
    'server must name the fallback front end as older',
  );
  assert.ok(
    server.includes('npm run build'),
    'the warning must give the build command',
  );
  assert.ok(
    server.includes('source coverage'),
    'the warning must say the fallback lacks the newer review features',
  );
});

test('image provenance is per row, so manual rows are never labeled as machine-read from a photo', async () => {
  const state = await readFile(path.join(ROOT, 'web/src/lib/state.ts'), 'utf8');
  const review = await readFile(path.join(ROOT, 'web/src/screens/Review.tsx'), 'utf8');
  const row = await readFile(path.join(ROOT, 'web/src/components/MedicineRow.tsx'), 'utf8');
  const report = await readFile(path.join(ROOT, 'web/src/screens/Report.tsx'), 'utf8');
  const explainer = await readFile(path.join(ROOT, 'src/explainer.js'), 'utf8');
  const why = await readFile(path.join(ROOT, 'web/src/components/WhyFlagged.tsx'), 'utf8');

  // Extraction results are stamped with the panel's reading mode at the moment
  // they are stored; manually added rows stay explicitly false.
  assert.ok(
    state.includes('cloneRows(action.medicines, state.sources[action.key].fromImage)'),
    'setMedicines must stamp each row with the panel reading mode',
  );
  assert.ok(
    /function emptyMedicine\(\): Medicine \{[\s\S]*?fromImage: false/.test(state),
    'manually added rows must carry an explicit false provenance',
  );

  // The row renders its own flag; no component inherits the panel's flag.
  assert.ok(!review.includes('fromImage={source.fromImage}'), 'Review must not pass the panel flag to rows');
  assert.ok(row.includes('row.fromImage === true'), 'MedicineRow reads the row-level flag');
  assert.ok(!row.includes('fromImage: boolean;'), 'MedicineRow no longer takes a panel-level flag prop');
  assert.ok(
    !report.includes('sources.doctor.fromImage') && !report.includes('sources.label.fromImage'),
    'Report evidence must not use the panel-level flag',
  );
  assert.ok(report.includes('medicine.fromImage === true'), 'Report reads the row-level flag');
  assert.ok(state.includes("origin: 'manual'"), 'manual rows have an explicit origin');
  assert.ok(state.includes('if (!m.original) return { ...m, ...action.patch }'), 'manual edits do not invent an extracted original');
  assert.ok(explainer.includes("origin: medicine.origin ?? (original ? 'extracted' : 'manual')"));
  assert.ok(why.includes('Entered by you; not extracted from a document.'));
  assert.ok(report.includes('Entered by you; no extracted source quote is available for this row.'));
});

test('Report routes unresolved fields back to the focusable resolver queue', async () => {
  const app = await readFile(path.join(ROOT, 'web/src/App.tsx'), 'utf8');
  const report = await readFile(path.join(ROOT, 'web/src/screens/Report.tsx'), 'utf8');
  const resolver = await readFile(path.join(ROOT, 'web/src/components/ResolverQueue.tsx'), 'utf8');
  assert.ok(report.includes('onClick={onOpenResolver}'));
  assert.ok(app.includes("document.getElementById('resolver')?.focus()"));
  assert.ok(resolver.includes('id="resolver" tabIndex={-1}'));
});

test('extraction-failure copy never claims nothing was sent after a read attempt', async () => {
  const add = await readFile(path.join(ROOT, 'web/src/screens/Add.tsx'), 'utf8');
  const appJs = await readFile(path.join(ROOT, 'public/app.js'), 'utf8');
  for (const [name, source] of [['web/src/screens/Add.tsx', add], ['public/app.js', appJs]]) {
    assert.ok(
      !stripComments(source).includes('Nothing was sent or saved'),
      `${name} must not claim nothing was sent after the request was submitted`,
    );
  }
  // The honest policy: reading sends the words; only storage is ruled out.
  assert.ok(add.includes('sent to the extraction service'), 'Add states that reading submits data');
});

test('resolver queue announces count changes and routes unit problems to the unit control', async () => {
  const resolver = await readFile(path.join(ROOT, 'web/src/components/ResolverQueue.tsx'), 'utf8');
  const live = await readFile(path.join(ROOT, 'web/src/components/LiveRegion.tsx'), 'utf8');
  // Screen readers hear the queue shrink as fields are edited or confirmed.
  assert.ok(resolver.includes('LiveRegion'), 'ResolverQueue announces through the shared live region');
  assert.ok(live.includes('aria-live="polite"'), 'the live region is polite');
  // An unreadable unit is a unit-select problem, not a dose-number problem.
  assert.ok(
    /unreadable_unit[\s\S]{0,200}-unit/.test(resolver) || resolver.includes("inputId(sourceKey, rowId, 'strength') + '-unit'"),
    'unreadable_unit items focus the unit select',
  );
});

test('field warnings distinguish missing input from uncertain extraction', async () => {
  const row = await readFile(path.join(ROOT, 'web/src/components/MedicineRow.tsx'), 'utf8');
  assert.ok(row.includes('resolverItems'), 'field warnings use the shared uncertainty reasons');
  assert.ok(row.includes('missing — add a value'), 'blank manual fields are described as missing');
  assert.ok(row.includes('hard to read — please confirm'), 'uncertain extracted values still request review');
  assert.ok(row.includes('unit unreadable — choose a unit'), 'an unreadable strength unit points to the unit field');
  assert.ok(!row.includes('row.uncertain || !fieldIsReadable'), 'row uncertainty does not relabel every field');
});

test('editing sources invalidates old report results before Report can be reopened', async () => {
  const state = await readFile(path.join(ROOT, 'web/src/lib/state.ts'), 'utf8');
  const app = await readFile(path.join(ROOT, 'web/src/App.tsx'), 'utf8');
  assert.ok(/function patchSource[\s\S]*?results:\s*\[\]/.test(state), 'source mutations clear stale results');
  assert.ok(/case 'loadDemo':[\s\S]*?results:\s*\[\]/.test(state), 'loading a new demo clears stale results');
  assert.ok(app.includes('reportReady = state.results.length > 0'), 'Report navigation follows current results');
});

test('privacy wording distinguishes extraction transmission from MedAlign storage', async () => {
  const home = await readFile(path.join(ROOT, 'web/src/screens/Home.tsx'), 'utf8');
  const add = await readFile(path.join(ROOT, 'web/src/screens/Add.tsx'), 'utf8');
  const bento = await readFile(path.join(ROOT, 'web/src/components/ui/feature-section-with-bento-grid.tsx'), 'utf8');
  for (const [name, source] of [['Home', home], ['Add', add], ['features', bento]]) {
    assert.ok(source.includes('sent to the extraction service'), `${name} explains transmission for reading`);
    assert.ok(source.includes('MedAlign does not save'), `${name} scopes the storage claim to MedAlign`);
    assert.ok(!source.includes('Nothing is stored anywhere'), `${name} does not make a provider-wide claim`);
  }
});

test('coverage reports raw field availability separately from actual comparisons', async () => {
  const coverage = await readFile(path.join(ROOT, 'src/coverage.js'), 'utf8');
  const types = await readFile(path.join(ROOT, 'web/src/lib/types.ts'), 'utf8');
  const strip = await readFile(path.join(ROOT, 'web/src/components/CoverageStrip.tsx'), 'utf8');
  assert.ok(coverage.includes('fieldsAvailable'), 'shared coverage computes field availability');
  assert.ok(types.includes('fieldsAvailable: number'), 'the coverage type exposes the new count');
  assert.ok(strip.includes('coverage.fieldsAvailable'), 'the UI shows availability independently of compared fields');
  assert.ok(strip.includes('Fields with values available:'), 'the UI labels the availability count');
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

  // Home CTAs keep their copy; the shared Button import moved into the hero.
  const home = await readFile(path.join(ROOT, 'web/src/screens/Home.tsx'), 'utf8');
  const wordmark = await readFile(path.join(ROOT, 'web/src/components/Wordmark.tsx'), 'utf8');
  const dropzone = await readFile(path.join(ROOT, 'web/src/components/Dropzone.tsx'), 'utf8');
  const medicineRow = await readFile(path.join(ROOT, 'web/src/components/MedicineRow.tsx'), 'utf8');
  const landingHero = await readFile(path.join(ROOT, 'web/src/components/ui/ink-orbit-hero.tsx'), 'utf8');
  assert.ok(home.includes('Start comparing'));
  assert.ok(home.includes('Try the demo case'));
  assert.ok(landingHero.includes('./button'), 'landing CTAs keep the shared glass Button');
  assert.ok(wordmark.includes('liquid-glass-btn'), 'in-app wordmark button also has the glass treatment');
  assert.ok(dropzone.includes('liquid-glass-btn'), 'photo chooser also has the glass treatment');
  assert.ok(dropzone.includes('motion-reduce:transition-none'));
  assert.ok(medicineRow.includes('variant="destructive"'), 'delete actions retain a destructive visual distinction');
});

test('workflow navigation is a responsive step rail with explained lockouts', async () => {
  const stepNav = await readFile(path.join(ROOT, 'web/src/components/StepNav.tsx'), 'utf8');
  const app = await readFile(path.join(ROOT, 'web/src/App.tsx'), 'utf8');

  // App renders the same four-step workflow on every screen.
  assert.ok(app.includes('<StepNav'), 'App must render the step navigation');
  assert.ok(!app.includes('<Breadcrumb'), 'the breadcrumb is retired');
  assert.ok(app.includes('reviewReady'), 'Review availability is derived from source data');
  assert.ok(app.includes('reportReady'), 'Report availability is derived from results');

  // Four steps, in order, with the required accessible names.
  for (const label of ['Home', 'Add', 'Review', 'Report']) {
    assert.ok(stepNav.includes(`label: '${label}'`), `step label missing: ${label}`);
  }
  assert.ok(stepNav.includes('aria-label="Workflow steps"'));
  assert.ok(stepNav.includes('aria-current={'), 'current step is exposed as aria-current="step"');
  assert.ok(stepNav.includes('aria-disabled={!enabled'), 'locked steps use aria-disabled');
  assert.ok(stepNav.includes('aria-describedby={!enabled'), 'locked steps point to their reason');

  // Locked steps explain themselves; all controls meet the 44px target rule.
  assert.ok(stepNav.includes('Read or add a medicine first.'));
  assert.ok(stepNav.includes('Compare the two lists first.'));
  assert.ok(stepNav.includes('min-h-11'));
  assert.ok(stepNav.includes('data-step-nav'));
  assert.ok(stepNav.includes('lg:sticky'), 'desktop rail is visible alongside content');
  assert.ok(stepNav.includes('fixed inset-x-0 bottom-0'), 'mobile navigation is fixed above the safe area');
  assert.ok(stepNav.includes('pb-[calc(env(safe-area-inset-bottom)+0.5rem)]'), 'mobile bar respects the device safe area');
});

test('Home is a landing page: adapted hero, anchor nav, and bento features', async () => {
  const hero = await readFile(path.join(ROOT, 'web/src/components/ui/ink-orbit-hero.tsx'), 'utf8');
  const bento = await readFile(path.join(ROOT, 'web/src/components/ui/feature-section-with-bento-grid.tsx'), 'utf8');
  const home = await readFile(path.join(ROOT, 'web/src/screens/Home.tsx'), 'utf8');
  const styles = await readFile(path.join(ROOT, 'web/src/index.css'), 'utf8');

  // The hero is present and wired to the existing state machine.
  assert.ok(home.includes('<InkOrbitHero'), 'Home renders the adapted hero');
  assert.ok(home.includes('titleTop="Spot differences between"'));
  assert.ok(home.includes("your doctor's note") && home.includes('your pharmacy label'));
  assert.ok(home.includes('primaryCta="Start comparing"') && home.includes('onPrimary={onStart}'));
  assert.ok(home.includes('secondaryCta="Try the demo case"') && home.includes('onSecondary={onDemo}'));
  assert.ok(home.includes('Free demo • Synthetic data'), 'the real proof pill stays in Home');

  // Theme adaptation: Lexend only; no foreign fonts or marketing leftovers.
  assert.ok(hero.includes("'Lexend Variable'"), 'hero uses the app font');
  for (const banned of ['Manrope', 'Newsreader', 'DemoDialog', 'needs a human', '12,400']) {
    assert.ok(!hero.includes(banned), `hero must drop: ${banned}`);
  }

  // Sculpture and motion guardrails survive the adaptation.
  assert.ok(hero.includes('InkOrbitSculpture') && hero.includes('canvas'), '3D sculpture kept');
  assert.ok(hero.includes('prefers-reduced-motion') && hero.includes('prefers-color-scheme'));
  assert.match(hero, /\.ih-word\{[^}]*background-clip:text/, 'the visible cycling word owns its gradient text clip');

  // Landing CTAs stay on the shared liquid-glass Button.
  assert.ok(hero.includes('./button') && hero.includes('<Button'));

  // Anchor nav links to real sections, with motion-safe smooth scrolling.
  for (const id of ['features', 'how-it-works', 'example-result', 'what-we-compare']) {
    assert.ok(home.includes(`'#${id}'`), `anchor target missing: ${id}`);
    assert.ok(home.includes('href={section.href}'), 'nav pills link to the anchor targets');
    assert.ok(home.includes(`id="${id}"`), `section id missing: ${id}`);
  }
  assert.ok(styles.includes('scroll-behavior: smooth'), 'smooth scroll enabled');

  // Bento features: real MedAlign copy, existing Badge, no placeholders.
  assert.ok(bento.includes("import { Badge } from './badge'"), 'reuses the existing Badge');
  for (const copy of [
    'What MedAlign does',
    'Reads both lists',
    'You check what we read',
    'How your data is handled',
    'Shows differences with evidence',
  ]) {
    assert.ok(bento.includes(copy), `bento copy missing: ${copy}`);
  }
  assert.ok(!bento.includes('Pay supplier invoices'), 'placeholder copy must be gone');
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
