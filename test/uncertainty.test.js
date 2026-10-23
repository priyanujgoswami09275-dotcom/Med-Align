import test from 'node:test';
import assert from 'node:assert/strict';

import { editedFields, resolverItems, rowUncertainAfterConfirm } from '../src/uncertainty.js';
import { DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES } from '../src/demo.js';

function medicine(overrides = {}) {
  return {
    name: 'Metformin',
    strength_value: 500,
    strength_unit: 'mg',
    frequency_text: 'twice daily',
    evidence: 'Metformin 500 mg twice daily',
    uncertain: false,
    rowId: 'row-1',
    ...overrides,
  };
}

test('null values create field-specific resolver items with their original evidence', () => {
  const row = medicine({ name: null, strength_value: null, frequency_text: null });
  const items = resolverItems('doctor', [row]);
  assert.deepEqual(items.map((item) => item.field), ['name', 'strength', 'frequency']);
  assert.ok(items.every((item) => item.reason === 'missing'));
  assert.ok(items.every((item) => item.evidence === row.evidence));
});

test('an explicitly uncertain extracted row queues each unconfirmed readable field', () => {
  const row = medicine({ uncertain: true });
  assert.deepEqual(resolverItems('label', [row]).map((item) => [item.field, item.reason]), [
    ['name', 'uncertain_extraction'],
    ['strength', 'uncertain_extraction'],
    ['frequency', 'uncertain_extraction'],
  ]);
});

test('confirming one valid field leaves the other uncertain fields in the queue', () => {
  const row = medicine({ uncertain: true, confirmedFields: ['name'] });
  assert.deepEqual(resolverItems('doctor', [row]).map((item) => item.field), ['strength', 'frequency']);
});

test('confidently read differences do not become resolver items', () => {
  assert.deepEqual(resolverItems('doctor', DEMO_DOCTOR_MEDICINES), []);
  assert.deepEqual(resolverItems('label', DEMO_LABEL_MEDICINES), []);
});

test('unrecognized frequency remains unresolved even if confirmed', () => {
  const items = resolverItems('doctor', [medicine({ frequency_text: 'whenever', confirmedFields: ['frequency'] })]);
  assert.deepEqual(items.map((item) => [item.field, item.reason]), [['frequency', 'unreadable_frequency']]);
});

test('unsupported strength unit remains unresolved even if confirmed', () => {
  const items = resolverItems('doctor', [medicine({ strength_unit: 'ml', confirmedFields: ['strength'] })]);
  assert.deepEqual(items.map((item) => [item.field, item.reason]), [['strength', 'unreadable_unit']]);
});

test('a newly added empty row has no assumed values', () => {
  const items = resolverItems('label', [medicine({
    name: null,
    strength_value: null,
    strength_unit: null,
    frequency_text: null,
    evidence: '',
    rowId: 'new-row',
  })]);
  assert.equal(items.length, 3);
  assert.ok(items.every((item) => item.extractedValue === null));
});

test('editedFields reports only values that differ from the session original', () => {
  const row = medicine({
    name: 'Metformin XR',
    original: { name: 'Metformin', strength_value: 500, strength_unit: 'mg', frequency_text: 'twice daily' },
  });
  assert.deepEqual(editedFields(row), ['name']);
});

test('row uncertainty remains until each extraction field has been confirmed', () => {
  const original = medicine({ uncertain: true });
  assert.equal(rowUncertainAfterConfirm(original, ['name']), true);
  assert.equal(rowUncertainAfterConfirm(original, ['name', 'strength']), true);
  assert.equal(rowUncertainAfterConfirm(original, ['name', 'strength', 'frequency']), false);
  assert.equal(rowUncertainAfterConfirm(medicine({ uncertain: false }), []), false);
});

test('editing one field while another remains unresolved produces CANT_TELL for the unresolved pair', async () => {
  // Simulate the reducer patchMedicine action effect: user edits frequency to match,
  // but the row remains uncertain because not every field has been confirmed.
  const editedDoctor = [
    {
      name: 'Metformin',
      strength_value: 500,
      strength_unit: 'mg',
      frequency_text: 'once daily', // Edited by user to match the pharmacy side
      evidence: 'Metformin 500 mg twice daily',
      uncertain: true, // Still uncertain: 'name' and 'strength' not confirmed
      rowId: 'row-1',
      original: { name: 'Metformin', strength_value: 500, strength_unit: 'mg', frequency_text: 'twice daily', uncertain: true },
      confirmedFields: ['frequency'],
    },
  ];
  const label = [
    { name: 'Metformin', strength_value: 850, strength_unit: 'mg', frequency_text: 'once daily', evidence: '', uncertain: false, rowId: 'row-2' },
  ];

  const { compare } = await import('../src/compare.js');
  const results = compare(editedDoctor, label);

  // The pair must be CANT_TELL because one row is still uncertain
  const metforminPair = results.find((r) => r.displayName === 'Metformin');
  assert.equal(metforminPair.status, 'CANT_TELL');

  // No field may be counted as compared while the row is uncertain
  assert.deepEqual(
    metforminPair.fields.map((f) => [f.field, f.outcome]),
    [['name', 'not_compared'], ['strength', 'not_compared'], ['frequency', 'not_compared']],
  );
  assert.ok(metforminPair.fields.every((f) => f.unresolved));

  // Normalized facts are still preserved even though the comparison is blocked
  const freqField = metforminPair.fields.find((f) => f.field === 'frequency');
  assert.equal(freqField.doctor.normalized, 1);
  assert.equal(freqField.label.normalized, 1);
});

test('reducing uncertainty on every field of a row unblocks comparison', async () => {
  const doctor = [
    { name: 'Metformin', strength_value: 500, strength_unit: 'mg', frequency_text: 'once daily', evidence: '', uncertain: false, rowId: 'row-1' },
  ];
  const label = [
    { name: 'Metformin', strength_value: 500, strength_unit: 'mg', frequency_text: 'once daily', evidence: '', uncertain: false, rowId: 'row-2' },
  ];

  const { compare } = await import('../src/compare.js');
  const results = compare(doctor, label);
  const metforminPair = results.find((r) => r.displayName === 'Metformin');
  assert.equal(metforminPair.status, 'NO_DIFFERENCES_FOUND');
  assert.deepEqual(
    metforminPair.fields.map((f) => [f.field, f.outcome]),
    [['name', 'match'], ['strength', 'match'], ['frequency', 'match']],
  );
});
