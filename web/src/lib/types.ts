// Types encoded 1:1 from the real return/param shapes of src/compare.js and
// src/demo.js (read before writing this file — do not guess). The shared
// modules stay plain JS; these types only describe what crosses the app.
//
// compare(doctorList, labelList) -> Result[]
// Result: { key, displayName, status, differing:[], unknown:[], doctor, label }

export type Status =
  | 'NO_DIFFERENCES_FOUND'
  | 'NEEDS_CHECKING'
  | 'MISSING_FROM_LABEL'
  | 'NOT_ON_DOCTOR_LIST'
  | 'CANT_TELL';

/** Shape produced by src/schema.js validation and src/demo.js demo rows. */
export type Medicine = {
  name: string | null;
  strength_value: number | null;
  strength_unit: string | null;
  frequency_text: string | null;
  /** Exact quote from the source text; the server checks it as a substring. */
  evidence: string | null;
  /** Row-level extraction flag: a user edit clears it (compare.js pairResult). */
  uncertain: boolean;
  /** Client-side only: the row was read from a photo, not pasted text. */
  fromImage?: boolean;
  /** Client-side only: stable React key across add/delete (never sent/saved). */
  rowId?: string;
  /** Client-side only snapshot from this session; extraction is never overwritten. */
  original?: {
    name: string | null;
    strength_value: number | null;
    strength_unit: string | null;
    frequency_text: string | null;
    uncertain: boolean;
  };
  /** Fields explicitly reviewed by the user; this is not clinical verification. */
  confirmedFields?: FieldName[];
};

/** Differing/unknown field names used by compare.js and the pharmacist text. */
export type FieldName = 'strength' | 'frequency' | 'name';

export type FieldComparison = {
  field: FieldName;
  doctor: { normalized: string | number | null } | null;
  label: { normalized: string | number | null } | null;
  outcome: 'match' | 'different' | 'not_compared';
  unresolved: boolean;
};

export type Coverage = {
  doctorRecords: number;
  labelRecords: number;
  pairsCompared: number;
  fieldsCompared: number;
  fieldsMatched: number;
  fieldsDifferent: number;
  fieldsUnresolved: number;
  doctorOnly: number;
  labelOnly: number;
  oneSidedFields: number;
};

export type Result = {
  key: string | null;
  /** Triple-quoted, display-safe; not rendered as markup anywhere. */
  displayName: string;
  status: Status;
  differing: FieldName[];
  unknown: FieldName[];
  fields: FieldComparison[];
  doctor: Medicine | null;
  label: Medicine | null;
};

/** One of the two lists ("Doctor's list" / "Pharmacy label"). */
export type SourceKey = 'doctor' | 'label';

/** How the content of one panel was supplied. */
export type PanelKind = 'empty' | 'text' | 'image' | 'demo';

/** What one panel holds while the user works through the flow. */
export type SourceState = {
  kind: PanelKind;
  text: string | null;
  image: SourceImage | null;
  fromImage: boolean;
  medicines: Medicine[];
  /** Panel-level note carried into Review (extraction failure/empty result). */
  note: string | null;
};

export type SourceImage = {
  mime: string;
  data: string;
};

export type Step = 'home' | 'add' | 'review' | 'report';

/** GET /api/health — booleans only, never the key itself. */
export type Health = {
  ok: boolean;
  keyConfigured: boolean;
  modelConfigured: boolean;
};
