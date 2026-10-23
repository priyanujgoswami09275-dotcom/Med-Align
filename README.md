# MedAlign

Compare what the doctor said with what the pharmacy gave you. MedAlign lists the differences and gives you a question to ask your pharmacist. It never says which one is right.

> Demo with synthetic data. Decision support, not medical advice. If someone feels very unwell, call 112.

Built for PromptWars (theme: Societal Benefit).

## The problem
Medication instructions get re-typed, abbreviated, and re-labelled between the doctor's note and the pharmacy bag ("Pan 40", "1-0-1", a different strength). Patients and caregivers rarely have an easy way to compare the two.

## How it works
1. **Add**: paste text or upload a photo for the doctor's list and the pharmacy label. Or press **Load demo case**.
2. **Review**: Gemini extracts medicines into a table. Anything unclear is highlighted, never guessed. You edit and confirm.
3. **Report**: one card per medicine with a status, the quoted evidence from each source, and a copy-ready question for the pharmacist.

| Status | Meaning |
|---|---|
| `NO_DIFFERENCES_FOUND` | Strength and frequency match after normalization |
| `NEEDS_CHECKING` | Differences found (fields listed) |
| `MISSING_FROM_LABEL` | On doctor's list only |
| `NOT_ON_DOCTOR_LIST` | On label only |
| `CANT_TELL` | A field was unreadable or unknown |

## Design choices
- **Gemini only extracts** into a fixed JSON schema, with an exact-quote evidence field and an `uncertain` flag.
- **Plain code compares.** No model call decides a status. The comparison module has unit tests.
- **Human in the loop.** You confirm values before anything is compared.
- **No guessing.** Unreadable → `null` + uncertain → `CANT_TELL`.
- **No advice.** No "safe", no "correct", no dosing guidance.
- **Nothing stored.** No database, accounts, cookies, or analytics.

## Demo case
Doctor: Metformin 500 mg twice daily · Amlodipine 5 mg once daily · Pantoprazole 40 mg once daily before breakfast · Atorvastatin 10 mg at night
Label: Metformin 850 mg once daily · Amlodipine 5 mg 1-0-0 morning · Pan 40 (pantoprazole 40 mg) once daily · Aspirin 75 mg once daily

Expected: Metformin → NEEDS_CHECKING (strength, frequency) · Amlodipine → NO_DIFFERENCES_FOUND · Pantoprazole → NO_DIFFERENCES_FOUND · Atorvastatin → MISSING_FROM_LABEL · Aspirin → NOT_ON_DOCTOR_LIST

## Run locally
Node 22.9+ for all scripts (`npm run dev` uses `--env-file-if-exists`); the server itself runs on Node 20.6+.

### React front end (primary, `web/`)
```bash
npm --prefix web install
npm run dev     # Vite on :5173 + API server on :3000 (.env loaded when present)
npm run build   # builds web/dist; server.js serves it whenever it exists
npm start       # node --env-file=.env server.js -> http://localhost:3000 (needs .env)
npm test        # node --test
```

`server.js` serves `web/dist` when a build exists and falls back to the vanilla `public/` front end (byte-for-byte) when it does not. `npm start` requires a `.env` file because it loads it strictly.

### Server only / vanilla fallback
```bash
export GEMINI_API_KEY=your_key_here      # server-side only
export GEMINI_MODEL=model_name_here      # check Google's current model list
node server.js                           # http://localhost:3000 (serves public/)
node --test                              # unit tests
```

The demo case works without a key. Extraction from your own text/images needs one.

## Responsible AI
- Synthetic data only. Free-tier Gemini inputs may be used for training; don't paste real records.
- Model output is untrusted: schema-validated server-side, rendered as text only, never as HTML.
- Evidence quotes from pasted text are checked against the source. Quotes from images can't be machine-checked and are labelled that way.
- The brand→generic alias list is a small demo list, not a drug database.

## Limitations
Strength and frequency only. No allergies, dates, interactions, dosing advice, other languages, or food/route timing. English text and photos only. Not a medical device.

## Status
See the STATE section in [PROJECT.md](PROJECT.md). Architecture: [architecture.md](architecture.md).
