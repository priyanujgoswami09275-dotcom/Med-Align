import { normalizeFrequency, normalizeName, normalizeStrength } from './compare.js';

const FIELDS = ['name', 'strength', 'frequency'];

function fieldValue(row, field) {
  if (!row) return null;
  if (field === 'name') return row.name;
  if (field === 'frequency') return row.frequency_text;
  return row.strength_value;
}

function fieldRawValue(row, field) {
  if (!row) return null;
  if (field === 'name') return typeof row.name === 'string' && row.name.trim() ? row.name : null;
  if (field === 'frequency') {
    return typeof row.frequency_text === 'string' && row.frequency_text.trim()
      ? row.frequency_text
      : null;
  }
  const value = row.strength_value;
  const unit = typeof row.strength_unit === 'string' && row.strength_unit.trim()
    ? row.strength_unit.trim()
    : null;
  if (value === null || value === undefined) return unit ? `unit ${unit}` : null;
  return unit ? `${value} ${unit}` : String(value);
}

function missingValue(row, field) {
  if (field === 'name') return normalizeName(row?.name) === null;
  if (field === 'frequency') {
    return typeof row?.frequency_text !== 'string' || row.frequency_text.trim() === '';
  }
  return row?.strength_value === null || row?.strength_value === undefined
    || typeof row?.strength_unit !== 'string' || row.strength_unit.trim() === '';
}

function unreadableReason(row, field) {
  if (field === 'strength' && normalizeStrength(row.strength_value, row.strength_unit).mg === null) {
    return 'unreadable_unit';
  }
  if (field === 'frequency' && normalizeFrequency(row.frequency_text) === null) {
    return 'unreadable_frequency';
  }
  return null;
}

function isReadable(row, field) {
  if (field === 'name') return normalizeName(row?.name) !== null;
  if (field === 'strength') return !missingValue(row, field)
    && normalizeStrength(row.strength_value, row.strength_unit).mg !== null;
  return !missingValue(row, field) && normalizeFrequency(row.frequency_text) !== null;
}

function reasonFor(row, field, confirmed) {
  if (missingValue(row, field)) return 'missing';
  const unreadable = unreadableReason(row, field);
  if (unreadable) return unreadable;
  if (row?.uncertain === true && !confirmed) return 'uncertain_extraction';
  return null;
}

function originalRow(row) {
  return row?.original && typeof row.original === 'object' ? row.original : row;
}

/** Derive unresolved fields from one reviewed source, without comparing sources. */
export function resolverItems(sourceKey, medicines) {
  if (sourceKey !== 'doctor' && sourceKey !== 'label') return [];
  const rows = Array.isArray(medicines) ? medicines : [];
  const items = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const confirmed = new Set(Array.isArray(row.confirmedFields) ? row.confirmedFields : []);
    for (const field of FIELDS) {
      const reason = reasonFor(row, field, confirmed.has(field));
      if (!reason) continue;
      const original = originalRow(row);
      items.push({
        sourceKey,
        rowId: row.rowId ?? null,
        medicineName: typeof row.name === 'string' && row.name.trim() ? row.name : null,
        field,
        reason,
        extractedValue: fieldRawValue(original, field),
        evidence: typeof row.evidence === 'string' && row.evidence.trim() ? row.evidence : null,
      });
    }
  }
  return items;
}

/** Return the field names whose current raw values differ from their original snapshot. */
export function editedFields(row) {
  if (!row?.original || typeof row.original !== 'object') return [];
  const sourceFields = {
    name: ['name'],
    strength: ['strength_value', 'strength_unit'],
    frequency: ['frequency_text'],
  };
  return FIELDS.filter((field) => sourceFields[field].some((key) => row[key] !== row.original[key]));
}

/** Keep the comparison engine's row-level uncertainty until all three fields are confirmed. */
export function rowUncertainAfterConfirm(original, confirmedFields) {
  if (original?.uncertain !== true) return false;
  const confirmed = new Set(Array.isArray(confirmedFields) ? confirmedFields : []);
  return FIELDS.some((field) => !confirmed.has(field));
}

// Exported for focused reuse in Review state transitions; confirmation alone
// cannot clear a missing or unnormalizable value.
export function fieldIsReadable(row, field) {
  return isReadable(row, field);
}

export function fieldValueForReview(row, field) {
  return fieldValue(row, field);
}
