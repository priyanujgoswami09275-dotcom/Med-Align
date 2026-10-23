import { STATUS } from './compare.js';

const FIELD_NAMES = ['name', 'strength', 'frequency'];

/**
 * Count only information represented by the reviewed source lists and the
 * deterministic comparison output. A field is "compared" only on a paired
 * result with outcome match/different. A source-only readable field is
 * available, but not compared; a null, uncertain, or unnormalizable field is
 * unresolved. This is an accounting summary, not a confidence estimate.
 */
export function computeCoverage(doctorList, labelList, results) {
  const doctor = Array.isArray(doctorList) ? doctorList : [];
  const label = Array.isArray(labelList) ? labelList : [];
  const resultRows = Array.isArray(results) ? results : [];
  const coverage = {
    doctorRecords: doctor.length,
    labelRecords: label.length,
    pairsCompared: 0,
    fieldsCompared: 0,
    fieldsMatched: 0,
    fieldsDifferent: 0,
    fieldsUnresolved: 0,
    doctorOnly: 0,
    labelOnly: 0,
    oneSidedFields: 0,
  };

  for (const result of resultRows) {
    if (!result) continue;
    const paired = result.doctor !== null && result.doctor !== undefined
      && result.label !== null && result.label !== undefined;
    if (paired) coverage.pairsCompared += 1;
    if (result.status === STATUS.MISSING_FROM_LABEL) coverage.doctorOnly += 1;
    if (result.status === STATUS.NOT_ON_DOCTOR_LIST) coverage.labelOnly += 1;

    const fields = Array.isArray(result.fields) ? result.fields : [];
    for (const fieldName of FIELD_NAMES) {
      const detail = fields.find((field) => field.field === fieldName);
      if (!detail) {
        coverage.fieldsUnresolved += 1;
        continue;
      }
      if (paired) {
        if (detail.outcome === 'match') {
          coverage.fieldsCompared += 1;
          coverage.fieldsMatched += 1;
        } else if (detail.outcome === 'different') {
          coverage.fieldsCompared += 1;
          coverage.fieldsDifferent += 1;
        } else {
          coverage.fieldsUnresolved += 1;
        }
      } else if (detail.unresolved) {
        coverage.fieldsUnresolved += 1;
      } else {
        coverage.oneSidedFields += 1;
      }
    }
  }

  return coverage;
}
