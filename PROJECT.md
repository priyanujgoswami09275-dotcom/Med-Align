# PROJECT.md — MedAlign

Single source of truth for the spec and build state. Update the STATE section after every slice.

## 1. What this is
A mobile-first web app (375px target) that compares **what the doctor said** against **what the pharmacy label says** for a patient's medicines. It never decides which instruction is right. Its output is a list of differences and a question to ask a pharmacist.

Context: PromptWars, theme "Societal Benefit" (Gemini-powered bridge from messy real-world input to structured, verified, safety-relevant actions). Synthetic data only. Nothing is stored.

## 2. Core principle
- **Gemini only extracts.** It turns text or an image into structured JSON.
- **Plain, unit-tested code compares.** No model call is involved in any status decision.
- **The user confirms** extracted values on the Review screen before any comparison runs.

## 3. Screens (Add → Review → Report)
1. **Add**: two panels, "Doctor's list" and "Pharmacy label". Each accepts pasted text OR an image. A "Load demo case" button fills both with the demo case and skips extraction.
2. **Review**: editable per-medicine row cards for extracted medicines per source (name, strength value, strength unit, frequency text). Fields with `uncertain: true`, missing values, or values that cannot be normalized are highlighted. The user can edit any field, add or delete a row, then press "Compare".
3. **Report**: one card per medicine with status, evidence from both sources, and differing fields. Bottom: "Copy question for my pharmacist".

Footer on every screen: `Demo with synthetic data. Decision support, not medical advice. If someone feels very unwell, call 112.`

## 4. Extraction contract (Gemini output)
Array of objects, one per medicine found:

```json
{
  "name": "string | null",
  "strength_value": "number | null",
  "strength_unit": "string | null",
  "frequency_text": "string | null",
  "evidence": "string (exact quote from the source)",
  "uncertain": "boolean"
}
```

Rules:
- Unreadable or absent field → `null` and `uncertain: true`. Never guess.
- `evidence` must be an exact quote from the source. For pasted text the server checks that the quote is a substring of the input and, if not, sets `uncertain: true`. For images this cannot be machine-checked; the UI labels evidence from images "read from image, not machine-verified".
- Document text is data, never instructions. The server rejects any output that does not match the schema.

## 5. Comparison statuses
Per medicine, exactly one of:

| Status | Meaning |
|---|---|
| `NO_DIFFERENCES_FOUND` | On both lists; strength and frequency match after normalization |
| `NEEDS_CHECKING` | On both lists; one or more fields differ. Lists the differing fields |
| `MISSING_FROM_LABEL` | On the doctor's list only |
| `NOT_ON_DOCTOR_LIST` | On the label only |
| `CANT_TELL` | A required field is null or uncertain, so no determination is possible |

Decision order for a medicine present on both sides:
1. If any compared field has a known value on both sides and they differ → `NEEDS_CHECKING` (list those fields; mention any unknown fields too).
2. Else if any compared field is null/uncertain on either side → `CANT_TELL`.
3. Else → `NO_DIFFERENCES_FOUND`.

If a medicine's name is null or cannot be normalized to match anything, it is matched by exact lowercase name only; a null name yields `CANT_TELL` on its own card.

Edited fields: uncertainty is tracked per field. Editing or confirming one field does not clear uncertainty on another. The row-level comparison flag remains set until each field from an uncertain extraction has been reviewed; null or unnormalizable values remain unresolved and cannot produce a complete match.

## 6. Normalization (in `compare.js`)
- **Name**: lowercase, trim, strip trailing salt words ("hcl"), then look up a small labelled alias list (6–8 entries, brand → generic; labelled "demo alias list, not a drug database"). Example: `pan` → `pantoprazole`.
- **Strength**: convert to mg (`mcg`/`µg` ÷ 1000, `g` × 1000). Unknown unit → unknown.
- **Frequency** → times per day:
  - once: `once daily`, `OD`, `QD`, `1-0-0`, `0-1-0`, `0-0-1`, `at night`, `HS`, `morning`
  - twice: `twice daily`, `BD`, `BID`, `1-0-1`
  - three: `three times daily`, `TDS`, `TID`, `1-1-1`
  - four: `QID`
  - Pattern `a-b-c`: sum of the digits. Anything unrecognized → unknown.
  - Only the count per day is compared. Food/route timing ("before breakfast") is ignored.

## 7. Demo case (synthetic)
Doctor:
- Metformin 500 mg twice daily
- Amlodipine 5 mg once daily
- Pantoprazole 40 mg once daily before breakfast
- Atorvastatin 10 mg at night

Label:
- Metformin 850 mg once daily
- Amlodipine 5 mg 1-0-0 morning
- Pan 40 (pantoprazole 40 mg) once daily
- Aspirin 75 mg once daily

Expected statuses (must be exact):
| Medicine | Status |
|---|---|
| Metformin | `NEEDS_CHECKING` (strength, frequency) |
| Amlodipine | `NO_DIFFERENCES_FOUND` |
| Pantoprazole | `NO_DIFFERENCES_FOUND` |
| Atorvastatin | `MISSING_FROM_LABEL` |
| Aspirin | `NOT_ON_DOCTOR_LIST` |

## 8. Safety rules
- Never output the words "safe" or "correct", and never say which dose is right. Report ends with a question for the pharmacist.
- API key only in a server-side env var (`GEMINI_API_KEY`). Never in client code, logs, responses, or commits.
- Never render document text as HTML. Client uses `textContent` only.
- On API error or 429: retry once with backoff, then show a friendly message and offer the demo case.
- Store nothing. No database, no accounts, no cookies, no analytics, no request-body logging.
- Free-tier Gemini inputs may be used for training. Assume yes. Synthetic data only.

## 9. Out of scope
Allergies, dates, drug interactions, dosing advice, accounts, database, other languages, route/food timing, voice, native apps.

## 10. Process rules
- This file first, then deploy one working API route before any feature.
- One vertical slice at a time. Test each. Update STATE.
- No database, no auth, no new dependencies (Node built-ins only).
- Don't touch unrelated files.
- Final report states what was actually run and what was not.

## 11. Build order (vertical slices)
1. Skeleton + `/api/health` + env var, deployed.
2. Demo case + `compare.js` + unit tests.
3. Add screen.
4. Review screen.
5. Gemini text extraction (`/api/extract`).
6. Image upload.
7. Report screen + pharmacist question.
8. Error states (retry, 429, demo fallback).
9. 375px pass, console check, README, final report.

## 12. Definition of done
- Demo statuses are exactly as in §7.
- Comparison unit tests pass.
- No console errors at 375px.
- Final report lists what was run versus not run.

---

## 13. Source Coverage, Mismatch Explainer, and Uncertainty Resolver

These features are implemented in the authorized React front end under `web/`; shared comparison, coverage, explanation, and uncertainty logic remains deterministic JavaScript under `src/`. The vanilla `public/` app remains the server fallback when `web/dist` is absent.

### Acceptance criteria
- **Source Coverage:** Report counts reviewed records per source, paired medicines, successful field comparisons, unresolved fields, and source-only medicines from current state and actual results. A field counts as compared only when both sides are known and normalized. Readable fields present in one source are listed separately from fields missing or unresolved. The coverage notice says it does not establish that the full regimen was reviewed and names the three fields in scope.
- **Mismatch Explainer:** Each Report card has a keyboard-operable disclosure for all five statuses. It shows reviewed values, deterministic normalized values/outcomes, existing evidence only (or explicitly states when the excerpt is unavailable), and user edits separately from the original extraction. It makes no clinical recommendation.
- **Uncertainty Resolver:** Review derives a queue from missing, uncertain, unreadable, ambiguous, or unnormalizable fields. Users can focus, edit, confirm, or leave a field unresolved. Original extracted values remain available for the session; one field action does not silently clear another field's uncertainty. Unresolved fields continue to block a complete match.

### Counting rules
- Source record counts are the reviewed list lengths; paired count is the number of results with both sources present.
- For paired medicines, each of name, strength, and frequency counts as compared only for `match` or `different` outcomes. `not_compared` fields count as unresolved.
- For one-source medicines, readable fields count as available in one source (not compared); missing, uncertain, or unnormalizable present-side fields count as unresolved. Source-only medicine counts describe only the provided sources.
- Synthetic demo coverage: doctor 4, pharmacy 4, pairs 3, fields compared 9 (7 matched, 2 different), unresolved 0, doctor-only 1, pharmacy-only 1.

### Verification status (2026-10-24)
- `node --test`: 84/84 pass, including comparison field details, coverage rules, all five explanation statuses, uncertainty cases (row-level uncertainty → every field `not_compared` → `CANT_TELL`; fully confirmed row → `NO_DIFFERENCES_FOUND`), banned UI terminology, and HTML-sink scans.
- `npm run build`: pass (TypeScript and Vite production build).
- Current-tree browser journey (Playwright at 375×812 against `web/dist` on :3000, plus Chrome DevTools console/network): demo load; all five statuses exactly; coverage 4 / 4 / 3 / 9 / 0; Metformin explainer quotes both sources verbatim; frequency edit narrows the differences to dose strength; cleared strength recalculates coverage to 8 compared / 1 unresolved; resolved frequency + unresolved strength → `CANT_TELL`; Enter-key disclosure toggles `aria-expanded`; reduced-motion emulation yields `transform: none` at every scroll position while normal motion keeps the 4° → 0 → −4° tilt; exact footer and `scrollWidth == 375` on all four screens; zero console errors/warnings; four same-origin requests, all 200 (no Gemini or third-party traffic).
- `motion/react` migration: `web/src/components/ui/container-scroll-animation.tsx` now imports `motion`/`useScroll`/`useTransform`/`useReducedMotion`/`MotionValue` from `motion/react`; the redundant direct `framer-motion` dependency was removed from `web/package.json` and the lockfile (it remains a transitive dependency of `motion@14.6.0`). Rebuild, tests, and the browser journey above were re-run afterwards.
- Earlier evidence, kept separate from the run above: isolated headless-Chrome (CDP) journey performed before the glass/scroll changes.
- Known, not fixed: Chrome DevTools reports one a11y issue — the hidden read-only clipboard `<textarea>` on Report has no `id`/`name`; that markup is unchanged from `HEAD`.
- Live Gemini calls, deployment, and assistive-technology screen-reader walkthrough: not run.

## STATE
Update after every slice. Four buckets only.

**Done + tested**
- Source Coverage, Mismatch Explainer, and Uncertainty Resolver: `src/compare.js` returns structured per-field normalized outcomes; `src/coverage.js` counts reviewed records, compared/unresolved/source-only fields; `src/explainer.js` builds deterministic status/value/evidence details; `src/uncertainty.js` derives resolver items and edited-field state. React UI: `CoverageStrip`, `WhyFlagged`, `ResolverQueue`; per-field confirmation preserves other uncertainty and the original extraction for the current session. Verified 2026-10-24: `node --test` 79/79; `npm run build`; isolated Chrome demo journey (4/4 records, 3 pairs, 9 compared fields, 0 unresolved; frequency edit updates result; unresolved strength yields `CANT_TELL`; keyboard disclosure; resolver focus; 375px no horizontal scroll; reduced-motion/dark preferences; footer exact; no console errors). No Gemini request or deployment.
- React rebuild scaffold (branch `ui-react`, Task 1 of the React-rebuild plan, authorized front-end-only override of the vanilla/zero-dep rule): `web/` = Vite 8 + React 19 + TypeScript 6 + Tailwind v4 (`@tailwindcss/vite`) + shadcn (`npx shadcn@latest init -t vite -b base -p nova`; components in `web/src/components/ui`, `@` → `web/src`) + lucide-react + `motion` + `@fontsource-variable/lexend` (local woff2, no CDN). `web/src/lib/types.ts` encodes the exact shapes of `src/compare.js`/`src/demo.js`; `web/src/lib/compare.ts` re-exports them typed (`allowJs`, imported JS not retyped). `web/vite.config.ts`: `/api` proxy → :3000, `fs.allow ['..']`, aliases `@` + `@shared`. Root scripts: `dev` (server + vite; `--env-file-if-exists`), `build`, `start` (`node --env-file=.env server.js`), `test`. Verified: dev proxy returns health booleans from :5173; `vite build` succeeds (Lexend woff2 bundled); `npm run start` serves `web/dist` (`/` 200 built HTML, `/favicon.svg` 200, `/src/*` 404 in dist mode) with ZERO console messages in Chrome; `public/` fallback byte-for-byte (vanilla `/` + `/src/compare.js` + `/style.css` 200 again when dist is absent); `node --test` 47/47; key greps clean; `git ls-files .env` empty.
- `server.js` static-root branch: per-request `staticRoot()` — serves `web/dist` when `web/dist/index.html` exists, else `public/`; everything (incl. traversal guard) stays inside the chosen root; `/src/*` read-only allowlist applies in `public/` mode only (404 in dist mode — the built app bundles the shared modules itself). **CSP change (reported):** dist-mode static responses send `style-src 'self' 'unsafe-inline'` (React style attributes + transforms; scripts stay `default-src 'self'`, no change), `public/` + API responses keep the original byte-for-byte CSP.
- Design shell (Task 2, branch `ui-react`): `web/src/components/{Wordmark,StepIndicator,GlassCard,LiveRegion}.tsx` + `layout/Footer.tsx`; `index.css` mesh + glass tokens (light+dark via `prefers-color-scheme`, no stored toggle; `@supports` degrade to solid card); Lexend live. App shell: header wordmark (returns Home; inert on Home) + 4-step indicator on tool screens + footer with the exact disclaimer on all 4 stub screens + staggered ≤250 ms entrance replaying per screen change under `MotionConfig reducedMotion="user"`. Browser-verified at 375px through a 375×812 iframe (headless window clamps at 500): `scrollWidth == clientWidth == 375` on every screen (no h-scroll); footer exact text everywhere; stepper announces "Step N of 4" with `aria-current="step"`; wordmark→Home works; zero console messages; dark + light screen captures verified in the OpenCode temp dir (Chrome tool denies /tmp writes). `design-system/medalign/MASTER.md` extended with the React rebuild direction (Lexend, glass+mesh, dark tokens, CSP delta note); `node --test` 47/47.
- Slice 1: `server.js` — zero-dep ESM server, `GET /api/health` (reports `keyConfigured` + `modelConfigured` booleans only, never the key), static `public/`, read-only `/src/compare.js` + `/src/demo.js` (same files the browser and unit tests import), CSP + nosniff, traversal guard, PORT env, `start` script, `package.json` (type: module, start/test scripts). Verified live via curl: health 200, `/`, `/app.js`, `/style.css`, `/src/*` 200; `/src/schema.js` 404 (serve allowlist); POST health 405; encoded traversal denied; oversized text/image and bad mime → 400 friendly; `src/compare.js` served byte-identical to the repo file.
- Slice 2: `src/compare.js` + `src/demo.js` + `test/compare.test.js` — 19 tests pass: all five demo statuses exactly, Pan 40 alias, OD/QD/BID/BD/TDS/TID/QID/at night/HS/morning, 1-0-0 / 0-1-0 / 0-0-1 / 1-0-1 / 1-1-1, unit conversion (mg/mcg/µg-folding/g/gm), null/uncertain → CANT_TELL, known difference + unknown field → NEEDS_CHECKING, one-sided names, duplicates, banned-word scan on demo results and pharmacist question.
- Slice 3: `src/schema.js` (server-side validation: unknown keys stripped, bad types → null + uncertain, exact-quote substring check for text input) + `src/extract.js` (Gemini REST client, model/key from env only, temperature 0.1, JSON-schema response, retry once after ~1.5 s) + `POST /api/extract` with client+server limits (text ≤ 8000 chars, image ≤ 4 MB, png/jpeg/webp) + `test/schema-and-extract.test.js` — 21 tests pass, error paths (429 ×1 retry → success, 429 ×2 → offerDemo, 5xx, 401 no-retry, network, invalid JSON from model, prose-instead-of-schema, blocked candidate, missing key/model) all with stubbed fetch.
- Slice 4: full UI (`public/index.html` + `public/app.js` + `public/style.css`): Add (paste or photo per panel, "Load demo case" fills both and skips extraction) → Review (per-row edit clears its uncertain flag, add/delete row, image sourcing labelled "read from image, not machine-verified") → Report (status icon+text+color per card, both evidence quotes, differing/unknown fields, "Copy question for my pharmacist" with clipboard + fallback). Footer disclaimer on every screen. `test/ui-strings.test.js` — 6 tests pass: whole-word "safe"/"correct"/"OK" scan over every UI string, module strings, demo + edge-case results → none found; no `innerHTML`/`outerHTML`/`document.write`/`insertAdjacentHTML` in client code; footer text present.
- Headless journey smoke (throwaway DOM shim + loader hook in /tmp, not committed): demo journey renders exactly the five expected report cards (Metformin NEEDS_CHECKING → Atorvastatin MISSING_FROM_LABEL → Aspirin NOT_ON_DOCTOR_LIST → Amlodipine/Pantoprazole NO_DIFFERENCES_FOUND); extraction journey (2 fetched panels, uncertain row highlighted, 2 cards, copy text ends with a question); both-panels-fail message + "Load demo case"/retry buttons; zero-read add-row note on Review; clipboard-fallback path. No runtime errors seen.
- `node --test`: 46/46 tests pass.
- Slice 5 (authorized spec exception): Home landing screen added as the FIRST screen (4th screen total). PROJECT.md §3 still documents 3 screens — the user explicitly authorized this 4th "Home" screen for this change; listed as a CONFLICT in the final report. `public/index.html`: badge pill ("Free demo • Synthetic data"), H1 with gradient-highlighted word, intro, two CTAs (Start comparing → Add, Try the demo case → demo), three glass cards — "How it works" (3 numbered steps, inline SVG), "Example result" (empty shell `#home-example`, values built in app.js from `src/demo.js` Metformin rows + `NEEDS_CHECKING` presentation via `createElement`/`textContent`/namespace SVG — no innerHTML), "What we compare" (chips + limitation note). Removed from the 21st.dev reference: marquee, logos, fake stats, badges. `public/style.css`: pure-CSS radial-gradient backdrop, glass cards with `backdrop-filter` + `@supports` solid fallback, `--radius-pill` token (documented in design-system MASTER.md), two-column grid ≥768px, staggered entrance 300ms + delays 0–300ms (≤600ms total) gated inside `prefers-reduced-motion: no-preference` only. `public/app.js`: `state.step='home'`, 4-screen `setScreen` + `body[data-step]`, wordmark returns to Home on Add/Review/Report. `test/ui-strings.test.js` extended (Home copy presence + demo.js wiring assertions) — `node --test`: 47/47 pass.
- Browser check (Chrome DevTools MCP, this session): 375px iframe pass on Home and the whole journey — no horizontal scroll, no overflowing elements, all touch targets ≥44px, AA contrast clean, no emoji; Home → demo → Review (8 rows) → wordmark → Home → Add → demo → Review → Compare → Report gives exactly 5 cards: Needs checking / Not on the pharmacy label / Not on the doctor list / No differences found / No differences found; desktop 1000px viewport shows the 2-column grid with no h-scroll; visible focus ring (3px solid) on Home buttons via real Tab presses; entrance animation verified via computed style (`home-rise 0.3s`, delayed). Console on fresh load + journey: no NEW errors from Home — the two CSP favicon errors are pre-existing (see Known bugs).
- React screens (Tasks 3–6, branch `ui-react`): `web/src/lib/{present,state,api}.ts`, `components/{StatusBadge,Dropzone,MedicineRow,motion}`, `screens/{Home,Add,Review,Report}.tsx`, final `App.tsx` + `index.css` gradient. All user-visible copy, limits and statuses from `public/app.js` are preserved (additive strings exist only for new controls: dropzone choose-button labels, "Photo added"/"Remove photo", the "Please confirm" row tag, and stepper labels): Home hero/how-it-works/example/what-we-compare; Add two panels with 8,000-char and PNG/JPEG/WebP/4 MB limits, "Photo ready", empty/both-fail/partial-fail/zero-read messages; Review editable rows, "Please confirm", add/delete, zero-row message, sticky Back/Compare bar; Report five-status summary (NEEDS_CHECKING/CANT_TELL first), cards in `compare()` order, evidence side-by-side ≥640px and stacked below, copy with clipboard→textarea fallback, exact confirmation "Copied. Paste it to your pharmacist." in a polite live region, and the pharmacist question last. Uncertain flags clear on the first edit; image evidence is labelled "read from image, not machine-verified"; adding a photo keeps any pasted text visible (and Remove photo restores it), matching the vanilla DOM. The light amber status tint is 5% (`#B45309` on `#fbf6f3` = 4.68:1); Delete row is neutral outline + red trash icon (icon contrast 4.83:1 light / 3.95:1 dark, non-text ≥3:1).
- React verification (Task 7, Playwright MCP at exact 375×812 and 1280×900): no horizontal scroll on all four screens; Add/Review two columns at 1280; evidence two columns at 1280 / stacked at 375; every visible interactive target ≥44px; 3px focus ring; sticky Review bar clear of the footer at the bottom; footer exact on every screen; injection string `<img src=x onerror=alert(1)>` renders as literal text (0 `<img>` elements); reduced-motion emulation leaves content visible with no transform; delayed mock shows `aria-busy="true"`, disabled controls and "Reading…"; GIF/5 MB rejection, 8,000-char limit, empty-panel message, both-fail 503 + demo/retry, per-panel failure note + Load demo, empty-extraction notes, "Please confirm" clearing, and image-source labels all verified. Production `web/dist` served from :3000 in dist mode with the recorded CSP delta, same-origin scripts/styles/fonts only, zero console messages on the happy path, and `grep -rniE "GEMINI|AIza|AQ\." web/dist` clean. `npm test`: 50/50.
- React test extension (Task 3): `test/ui-strings.test.js` recursively scans `web/src/**/*.{ts,tsx}` string literals + JSX text for whole-word `safe`/`correct`/`OK`; pins the five status labels, `Please confirm`, and the copy confirmation; asserts the exact footer in `web/src`; and runs the `dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document.write` scan over both `web/src` and `public/`. No storage/cookie/analytics APIs exist in `web/src`.
- 21st MCP: catalog search still fails upstream with `catalog search failed` (transport/auth healthy); the hero and dropzone use the planned shadcn/Tailwind-native fallback. No remote images, CDN backgrounds, fake stats/logos or Unsplash assets were used. Recorded as a reference gap only.
- Whole-branch review (fresh-context subagent, base `26c7423` → head `c7ba321`): 0 critical, 3 important, no regressions in required behavior; it independently re-ran the demo journey, copy fallback, uploads, limits, injection string and both server modes. Fixed in the follow-up commit: photo upload no longer clears visible pasted text (and Remove photo restores it); the Home privacy line now mirrors the Add wording ("Only the words we need to read leave this page"); README + `engines` document the React dev/build/start paths and Node 22.9+; the document title is the descriptive vanilla one again; repeat copies re-announce via a keyed live region; the copy-pin test now also pins the extraction/limit/empty strings. The reviewer's remaining minor notes (per-row `fromImage` unused, reducer id counter impurity, fail-fast over-limit short-circuit, unused shadcn primitives kept per plan) are recorded as intentional/known.

**Done + untested**
- Docs written: PROJECT.md, Gemini.md, architecture.md, memory.md (present as `memory(1).md`), README.md
- Design system persisted + human-corrected: `design-system/medalign/MASTER.md`

**In progress**
- (nothing — awaiting event-day deploy target)

**Known bugs**
- Vanilla fallback only (`public/`): `<link rel="icon" href="data:,">` is blocked by the CSP `default-src 'self'` → 2 console errors per page load. The React build ships a same-origin `/favicon.svg` and has zero console messages on the happy path.
- Vanilla fallback only (`public/app.js`): the `btn-compare` click listener is registered twice → `startCompare` runs twice per click (same result). The React app dispatches Compare once.
- Vanilla fallback only: missing autocomplete attributes on Review inputs/textareas. React inputs set `autoComplete="off"` and are programmatically labelled.

**Not run / not verified yet**
- Deployment (target undecided per memory.md; runs locally, deploy-ready via PORT/start). NOT deployed.
- Live Gemini extraction: `GEMINI_API_KEY`/`GEMINI_MODEL` are configured in the local `.env`, but one real `POST /api/extract` with synthetic text did not return within a 45 s client timeout (no response). Live text and live image round-trips remain NOT RUN; all extraction branches were verified against mocked endpoints and the no-key 503 path.
- Prompt-injection real-call check ("ignore previous instructions…"): covered by code review, schema-only output and the system instruction; a real-call verification was NOT RUN.
- Full 1280×dark screenshot matrix: computed layout/overflow checks passed at 1280 dark (Home), but Playwright screenshot capture timed out repeatedly for subsequent wide dark frames. 1280-light Add/Review/Report, 375-light all screens, and 375-dark Home/Report were captured. No horizontal scroll was measured on any screen at either width in any theme.
- Real-device/Safari/Firefox browser matrix and a VoiceOver/NVDA screen-reader walkthrough: NOT RUN. Chromium DOM snapshots, live regions, labels and focus rings were checked.
- Remaining §11 build-order items after Slice 5: live image-upload extraction round-trip (code shipped, verified only through a mock) and deployment.
