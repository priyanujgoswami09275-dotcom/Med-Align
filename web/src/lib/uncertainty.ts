import {
  fieldIsReadable as fieldIsReadableJs,
  resolverItems as resolverItemsJs,
  rowUncertainAfterConfirm as rowUncertainAfterConfirmJs,
} from '@shared/uncertainty.js';

import type { FieldName, Medicine, SourceKey } from './types';

export type ResolverReason =
  | 'missing'
  | 'unreadable_unit'
  | 'unreadable_frequency'
  | 'uncertain_extraction';

export type ResolverItem = {
  sourceKey: SourceKey;
  rowId: string | null;
  medicineName: string | null;
  field: FieldName;
  reason: ResolverReason;
  extractedValue: string | null;
  evidence: string | null;
};

export const resolverItems = resolverItemsJs as (
  sourceKey: SourceKey,
  medicines: Medicine[],
) => ResolverItem[];

export const fieldIsReadable = fieldIsReadableJs as (row: Medicine, field: FieldName) => boolean;

export const rowUncertainAfterConfirm = rowUncertainAfterConfirmJs as (
  original: Medicine['original'] | Medicine,
  confirmedFields: FieldName[],
) => boolean;
