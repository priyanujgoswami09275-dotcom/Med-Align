import { buildExplanation as buildExplanationJs } from '@shared/explainer.js';

import type { FieldName, Result, Status } from './types';

export type ExplainedSide = {
  origin: 'manual' | 'extracted' | 'demo';
  display: string | null;
  normalizedDisplay: string | null;
  evidence: string | null;
  edited: boolean;
  originalDisplay: string | null;
  unresolvedReason: string | null;
};

export type ExplainedField = {
  field: FieldName;
  doctor: ExplainedSide | null;
  label: ExplainedSide | null;
  outcome: 'match' | 'different' | 'not_compared';
  normalizedLabel: string;
  unresolved: boolean;
};

export type Explanation = {
  status: Status;
  intro: string;
  matchedFields: string[];
  rows: ExplainedField[];
};

export const buildExplanation = buildExplanationJs as (result: Result) => Explanation;
