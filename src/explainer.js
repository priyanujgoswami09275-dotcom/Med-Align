const FIELD_LABELS = {
  name: 'medication name',
  strength: 'strength',
  frequency: 'frequency',
};

function rawValue(medicine, field) {
  if (!medicine) return null;
  if (field === 'name') return medicine.name || null;
  if (field === 'frequency') return medicine.frequency_text || null;
  const value = medicine.strength_value;
  const unit = medicine.strength_unit;
  if (value === null || value === undefined) return unit ? `unit ${unit}` : null;
  return unit ? `${value} ${unit}` : String(value);
}

function normalizedValue(value, field) {
  if (value === null || value === undefined) return null;
  if (field === 'strength') return `${value} mg`;
  if (field === 'frequency') return `${value} ${value === 1 ? 'time' : 'times'} per day`;
  return String(value);
}

function sourceValue(medicine, sideValue, field) {
  if (!medicine) return null;
  const original = medicine.original;
  const originalDisplay = original ? rawValue(original, field) : null;
  const display = rawValue(medicine, field);
  const rawField = field === 'strength'
    ? ['strength_value', 'strength_unit']
    : [field === 'frequency' ? 'frequency_text' : 'name'];
  const edited = Boolean(original) && rawField.some((key) => medicine[key] !== original[key]);
  const confirmed = Array.isArray(medicine.confirmedFields) && medicine.confirmedFields.includes(field);
  return {
    origin: medicine.origin ?? (original ? 'extracted' : 'manual'),
    display,
    normalizedDisplay: normalizedValue(sideValue?.normalized, field),
    evidence: typeof medicine.evidence === 'string' && medicine.evidence.trim() !== ''
      ? medicine.evidence
      : null,
    edited,
    originalDisplay,
    unresolvedReason: medicine.uncertain === true && !confirmed
      ? 'The extracted row is still marked uncertain.'
      : display === null || sideValue?.normalized === null
        ? 'This field is missing or could not be normalized.'
        : null,
  };
}

function unresolvedSummary(rows) {
  const fields = rows.filter((row) => row.unresolved).map((row) => FIELD_LABELS[row.field]);
  if (fields.length === 0) return '';
  const list = fields.join(', ');
  return ` ${list} ${fields.length === 1 ? 'also needs' : 'also need'} review.`;
}

function statusIntro(result, rows) {
  switch (result.status) {
    case 'NO_DIFFERENCES_FOUND':
      return 'No differences found in what we read.';
    case 'NEEDS_CHECKING':
      return 'Different wording was found in the fields listed below.'
        + (rows.some((row) => row.unresolved) ? ' Other fields could not be compared reliably.' : '');
    case 'MISSING_FROM_LABEL':
      return 'This medicine appears in the doctor-provided source. It was not found in the provided pharmacy source. This does not show whether it was dispensed.'
        + unresolvedSummary(rows);
    case 'NOT_ON_DOCTOR_LIST':
      return 'This medicine appears in the pharmacy-provided source. It was not found in the provided doctor source. This does not show whether your doctor meant to stop it.'
        + unresolvedSummary(rows);
    case 'CANT_TELL': {
      const fields = rows.filter((row) => row.unresolved).map((row) => FIELD_LABELS[row.field]);
      const list = fields.length ? fields.join(', ') : 'one or more fields';
      return `The ${list} ${fields.length === 1 ? 'field needs' : 'fields need'} review and could not be compared reliably.`;
    }
    default:
      return 'This result could not be explained from the available comparison details.';
  }
}

/** Build an explanation entirely from the reviewed values and compare() output. */
export function buildExplanation(result) {
  const rows = (Array.isArray(result?.fields) ? result.fields : []).map((detail) => ({
    field: detail.field,
    doctor: sourceValue(result.doctor, detail.doctor, detail.field),
    label: sourceValue(result.label, detail.label, detail.field),
    outcome: detail.outcome,
    normalizedLabel: detail.outcome === 'not_compared'
      ? 'Normalized value (not compared):'
      : 'Compared as:',
    unresolved: detail.unresolved,
  }));
  const matchedFields = rows.filter((row) => row.outcome === 'match').map((row) => FIELD_LABELS[row.field]);
  return {
    status: result?.status ?? 'CANT_TELL',
    intro: statusIntro(result ?? {}, rows),
    matchedFields,
    rows,
  };
}
