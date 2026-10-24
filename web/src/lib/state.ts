// In-app state machine (no router, no storage). One reducer owns the step, the
// two panels and the compare results; every screen reads from it.
// Pure functions only — the demo case and compare() stay in the shared modules.
import {
  DEMO_DOCTOR_MEDICINES,
  DEMO_DOCTOR_TEXT,
  DEMO_LABEL_MEDICINES,
  DEMO_LABEL_TEXT,
} from '@shared/demo.js';

import type { Medicine, Result, SourceKey, SourceState, Step } from './types';
import { rowUncertainAfterConfirm } from './uncertainty';

export type AppState = {
  step: Step;
  sources: Record<SourceKey, SourceState>;
  results: Result[];
};

export type Action =
  | { type: 'go'; step: Step }
  | { type: 'setSource'; key: SourceKey; patch: Partial<SourceState> }
  | { type: 'setMedicines'; key: SourceKey; medicines: Medicine[] }
  | { type: 'setResults'; results: Result[] }
  | { type: 'patchMedicine'; key: SourceKey; rowId: string; patch: Partial<Medicine> }
  | { type: 'confirmMedicineField'; key: SourceKey; rowId: string; field: 'name' | 'strength' | 'frequency' }
  | { type: 'addRow'; key: SourceKey }
  | { type: 'deleteRow'; key: SourceKey; rowId: string }
  | { type: 'loadDemo' };

let rowSeq = 0;
function newRowId(): string {
  rowSeq += 1;
  return 'r' + rowSeq;
}

export function emptyMedicine(): Medicine {
  return {
    name: null,
    strength_value: null,
    strength_unit: null,
    frequency_text: null,
    evidence: null,
    uncertain: false,
    // A manually added row was never machine-read from a photo.
    fromImage: false,
    origin: 'manual',
    rowId: newRowId(),
  };
}

// Extraction results are stamped with the panel's reading mode at the moment
// they are stored, so provenance is a property of the ROW, not the panel: a
// hand-typed row in a photo panel is never labeled as machine-read.
function cloneRows(rows: Medicine[], fromImage = false, origin: 'extracted' | 'demo' = 'extracted'): Medicine[] {
  return rows.map((m) => ({
    name: m.name ?? null,
    strength_value: m.strength_value ?? null,
    strength_unit: m.strength_unit ?? null,
    frequency_text: m.frequency_text ?? null,
    evidence: typeof m.evidence === 'string' ? m.evidence : '',
    uncertain: m.uncertain === true,
    fromImage: fromImage === true,
    origin,
    rowId: newRowId(),
    original: {
      name: m.name ?? null,
      strength_value: m.strength_value ?? null,
      strength_unit: m.strength_unit ?? null,
      frequency_text: m.frequency_text ?? null,
      uncertain: m.uncertain === true,
    },
    confirmedFields: [],
  }));
}

export function freshSource(): SourceState {
  return {
    kind: 'empty',
    text: null,
    image: null,
    fromImage: false,
    medicines: [],
    note: null,
  };
}

export const initialState: AppState = {
  step: 'home',
  sources: { doctor: freshSource(), label: freshSource() },
  results: [],
};

function patchSource(state: AppState, key: SourceKey, patch: Partial<SourceState>): AppState {
  return {
    ...state,
    // Results describe the exact source rows that were compared. Any source
    // mutation invalidates them so navigation can never reopen a stale report.
    results: [],
    sources: {
      ...state.sources,
      [key]: { ...state.sources[key], ...patch },
    },
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'go':
      return { ...state, step: action.step };
    case 'setSource':
      return patchSource(state, action.key, action.patch);
    case 'setMedicines':
      // Stamp the rows with how this panel was read (photo vs pasted words) at
      // the moment the extraction results are stored.
      return patchSource(state, action.key, {
        medicines: cloneRows(action.medicines, state.sources[action.key].fromImage),
      });
    case 'setResults':
      return { ...state, results: action.results };
    case 'patchMedicine': {
      const src = state.sources[action.key];
      const medicines = src.medicines.map((m) => {
        if (m.rowId !== action.rowId) return m;
        // Editing a manually entered row is not confirmation of an extraction;
        // keep it manual and don't invent an extracted-original snapshot.
        if (!m.original) return { ...m, ...action.patch };
        const confirmedFields = new Set(m.confirmedFields ?? []);
        if ('name' in action.patch) confirmedFields.add('name');
        if ('strength_value' in action.patch || 'strength_unit' in action.patch) confirmedFields.add('strength');
        if ('frequency_text' in action.patch) confirmedFields.add('frequency');
        const confirmed = [...confirmedFields];
        const original = m.original;
        return {
          ...m,
          ...action.patch,
          original,
          confirmedFields: confirmed,
          uncertain: rowUncertainAfterConfirm(original, confirmed),
        };
      });
      return patchSource(state, action.key, { medicines });
    }
    case 'confirmMedicineField': {
      const src = state.sources[action.key];
      const medicines = src.medicines.map((m) => {
        if (m.rowId !== action.rowId) return m;
        if (!m.original) return m;
        const confirmedFields = [...new Set([...(m.confirmedFields ?? []), action.field])];
        const original = m.original;
        return {
          ...m,
          original,
          confirmedFields,
          uncertain: rowUncertainAfterConfirm(original, confirmedFields),
        };
      });
      return patchSource(state, action.key, { medicines });
    }
    case 'addRow': {
      const src = state.sources[action.key];
      return patchSource(state, action.key, {
        kind: src.kind === 'empty' ? 'text' : src.kind,
        medicines: [...src.medicines, emptyMedicine()],
      });
    }
    case 'deleteRow': {
      const src = state.sources[action.key];
      return patchSource(state, action.key, {
        medicines: src.medicines.filter((m) => m.rowId !== action.rowId),
      });
    }
    case 'loadDemo':
      return {
        ...state,
        step: 'review',
        results: [],
        sources: {
          doctor: {
            kind: 'demo',
            text: DEMO_DOCTOR_TEXT,
            image: null,
            fromImage: false,
            medicines: cloneRows(DEMO_DOCTOR_MEDICINES, false, 'demo'),
            note: null,
          },
          label: {
            kind: 'demo',
            text: DEMO_LABEL_TEXT,
            image: null,
            fromImage: false,
            medicines: cloneRows(DEMO_LABEL_MEDICINES, false, 'demo'),
            note: null,
          },
        },
      };
    default:
      return state;
  }
}
