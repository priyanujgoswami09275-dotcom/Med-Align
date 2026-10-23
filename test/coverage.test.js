import test from 'node:test';
import assert from 'node:assert/strict';

import { computeCoverage } from '../src/coverage.js';
import { compare } from '../src/compare.js';
import { DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES } from '../src/demo.js';

function medicine(overrides = {}) {
  return {
    name: 'Metformin',
    strength_value: 500,
    strength_unit: 'mg',
    frequency_text: 'twice daily',
    uncertain: false,
    ...overrides,
  };
}

test('demo coverage counts records, pairs, compared fields, source-only fields and gaps', () => {
  const results = compare(DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES);
  assert.deepEqual(computeCoverage(DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES, results), {
    doctorRecords: 4,
    labelRecords: 4,
    pairsCompared: 3,
    fieldsCompared: 9,
    fieldsMatched: 7,
    fieldsDifferent: 2,
    fieldsUnresolved: 0,
    doctorOnly: 1,
    labelOnly: 1,
    oneSidedFields: 6,
  });
});

test('empty input produces zero counts', () => {
  assert.deepEqual(computeCoverage([], [], []), {
    doctorRecords: 0,
    labelRecords: 0,
    pairsCompared: 0,
    fieldsCompared: 0,
    fieldsMatched: 0,
    fieldsDifferent: 0,
    fieldsUnresolved: 0,
    doctorOnly: 0,
    labelOnly: 0,
    oneSidedFields: 0,
  });
});

test('null paired strength is unresolved and not counted as compared', () => {
  const doctor = [medicine()];
  const label = [medicine({ strength_value: null })];
  const results = compare(doctor, label);
  const coverage = computeCoverage(doctor, label, results);
  assert.equal(coverage.pairsCompared, 1);
  assert.equal(coverage.fieldsCompared, 2);
  assert.equal(coverage.fieldsUnresolved, 1);
});

test('uncertain paired row contributes no successfully compared fields', () => {
  const doctor = [medicine({ uncertain: true })];
  const label = [medicine()];
  const coverage = computeCoverage(doctor, label, compare(doctor, label));
  assert.equal(coverage.fieldsCompared, 0);
  assert.equal(coverage.fieldsUnresolved, 3);
});

test('one-sided missing field is unresolved while readable fields remain source-only', () => {
  const doctor = [medicine({ name: 'Atorvastatin', frequency_text: null })];
  const coverage = computeCoverage(doctor, [], compare(doctor, []));
  assert.equal(coverage.doctorOnly, 1);
  assert.equal(coverage.fieldsCompared, 0);
  assert.equal(coverage.fieldsUnresolved, 1);
  assert.equal(coverage.oneSidedFields, 2);
});

test('coverage recalculates from current lists after edits and deletion', () => {
  const doctor = [medicine()];
  const label = [medicine()];
  const initial = computeCoverage(doctor, label, compare(doctor, label));
  assert.equal(initial.fieldsMatched, 3);

  const editedDoctor = [medicine({ frequency_text: 'once daily' })];
  const edited = computeCoverage(editedDoctor, label, compare(editedDoctor, label));
  assert.equal(edited.fieldsDifferent, 1);
  assert.equal(edited.fieldsCompared, 3);

  const deleted = computeCoverage([], label, compare([], label));
  assert.equal(deleted.doctorRecords, 0);
  assert.equal(deleted.labelRecords, 1);
  assert.equal(deleted.pairsCompared, 0);
  assert.equal(deleted.labelOnly, 1);
});
