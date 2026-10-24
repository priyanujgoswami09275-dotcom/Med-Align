import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExplanation } from '../src/explainer.js';
import { compare } from '../src/compare.js';
import { DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES } from '../src/demo.js';

test('NEEDS_CHECKING explanation exposes every changed value and deterministic normalization', () => {
  const result = compare(DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES)
    .find((item) => item.displayName === 'Metformin');
  const explanation = buildExplanation(result);
  assert.equal(explanation.status, 'NEEDS_CHECKING');
  assert.deepEqual(explanation.rows.filter((row) => row.outcome === 'different').map((row) => [
    row.field,
    row.doctor.display,
    row.label.display,
    row.doctor.normalizedDisplay,
    row.label.normalizedDisplay,
  ]), [
    ['strength', '500 mg', '850 mg', '500 mg', '850 mg'],
    ['frequency', 'twice daily', 'once daily', '2 times per day', '1 time per day'],
  ]);
});

test('NO_DIFFERENCES_FOUND names the fields that matched without a clinical conclusion', () => {
  const result = compare(DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES)
    .find((item) => item.displayName === 'Amlodipine');
  const explanation = buildExplanation(result);
  assert.equal(explanation.intro, 'No differences found in what we read.');
  assert.deepEqual(explanation.rows.filter((row) => row.outcome === 'match').map((row) => row.field), [
    'name', 'strength', 'frequency',
  ]);
});

test('MISSING_FROM_LABEL identifies the source gap without inferring dispensing', () => {
  const result = compare(DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES)
    .find((item) => item.displayName === 'Atorvastatin');
  const explanation = buildExplanation(result);
  assert.match(explanation.intro, /doctor-provided source/);
  assert.match(explanation.intro, /not found in the provided pharmacy source/);
  assert.doesNotMatch(explanation.intro, /was not dispensed/i);
});

test('NOT_ON_DOCTOR_LIST identifies the source gap without advising discontinuation', () => {
  const result = compare(DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES)
    .find((item) => item.displayName === 'Aspirin');
  const explanation = buildExplanation(result);
  assert.match(explanation.intro, /pharmacy-provided source/);
  assert.match(explanation.intro, /not found in the provided doctor source/);
  assert.doesNotMatch(explanation.intro, /should stop|stop taking/i);
});

test('CANT_TELL lists unresolved fields and their source-side reason', () => {
  const result = compare(
    [{ name: 'Metformin', strength_value: null, strength_unit: 'mg', frequency_text: 'twice daily', evidence: '', uncertain: false }],
    [{ name: 'Metformin', strength_value: 500, strength_unit: 'mg', frequency_text: 'twice daily', evidence: '', uncertain: false }],
  )[0];
  const explanation = buildExplanation(result);
  assert.equal(explanation.status, 'CANT_TELL');
  assert.deepEqual(explanation.rows.filter((row) => row.unresolved).map((row) => row.field), ['strength']);
  assert.match(explanation.intro, /strength/);
  assert.match(explanation.intro, /could not be compared reliably/);
});

test('a source-gap explanation does not hide unknown source fields', () => {
  const [result] = compare(
    [{
      name: 'Atorvastatin',
      strength_value: 10,
      strength_unit: 'mg',
      frequency_text: null,
      uncertain: false,
    }],
    [],
  );
  const explanation = buildExplanation(result);
  assert.equal(explanation.status, 'MISSING_FROM_LABEL');
  assert.match(explanation.intro, /not found in the provided pharmacy source/);
  assert.match(explanation.intro, /frequency also needs review/);
  assert.equal(explanation.rows.find((row) => row.field === 'frequency').unresolved, true);
});

test('confirmed fields are explained as compared while remaining uncertainty stays visible', () => {
  const [result] = compare(
    [{
      name: 'Metformin',
      strength_value: 500,
      strength_unit: 'mg',
      frequency_text: 'once daily',
      uncertain: true,
      confirmedFields: ['name', 'frequency'],
    }],
    [{
      name: 'Metformin',
      strength_value: 850,
      strength_unit: 'mg',
      frequency_text: 'once daily',
      uncertain: false,
    }],
  );
  const explanation = buildExplanation(result);
  assert.equal(explanation.status, 'CANT_TELL');
  assert.match(explanation.intro, /strength field needs review/);
  assert.equal(explanation.rows.find((row) => row.field === 'frequency').outcome, 'match');
  assert.equal(explanation.rows.find((row) => row.field === 'strength').normalizedLabel, 'Normalized value (not compared):');
});

test('missing evidence stays absent and user edits are distinct from extracted values', () => {
  const result = compare(
    [{ name: 'Metformin', strength_value: 500, strength_unit: 'mg', frequency_text: 'twice daily', evidence: '', uncertain: false,
      original: { name: 'Metformin', strength_value: 250, strength_unit: 'mg', frequency_text: 'twice daily' } }],
    [{ name: 'Metformin', strength_value: 500, strength_unit: 'mg', frequency_text: 'twice daily', evidence: '', uncertain: false }],
  )[0];
  const explanation = buildExplanation(result);
  const strength = explanation.rows.find((row) => row.field === 'strength');
  assert.equal(strength.doctor.evidence, null);
  assert.equal(strength.label.evidence, null);
  assert.equal(strength.doctor.edited, true);
  assert.equal(strength.doctor.originalDisplay, '250 mg');
  assert.equal(strength.label.edited, false);
});

test('manual rows stay labeled as user-entered rather than extracted', () => {
  const result = compare(
    [{ name: 'Metformin', strength_value: 500, strength_unit: 'mg', frequency_text: 'twice daily', evidence: '', uncertain: false, origin: 'manual' }],
    [{ name: 'Metformin', strength_value: 850, strength_unit: 'mg', frequency_text: 'once daily', evidence: '', uncertain: false, origin: 'manual' }],
  )[0];
  const explanation = buildExplanation(result);
  const doctorName = explanation.rows.find((row) => row.field === 'name').doctor;
  assert.equal(doctorName.origin, 'manual');
  assert.equal(doctorName.originalDisplay, null);
});

test('normalizable values blocked by uncertainty are not labeled as compared', () => {
  const result = compare(
    [{ name: 'Metformin', strength_value: 500, strength_unit: 'mg', frequency_text: 'twice daily', evidence: '', uncertain: true }],
    [{ name: 'Metformin', strength_value: 850, strength_unit: 'mg', frequency_text: 'once daily', evidence: '', uncertain: false }],
  )[0];
  const explanation = buildExplanation(result);
  const strength = explanation.rows.find((row) => row.field === 'strength');
  assert.equal(strength.outcome, 'not_compared');
  assert.equal(strength.doctor.normalizedDisplay, '500 mg');
  assert.equal(strength.normalizedLabel, 'Normalized value (not compared):');
});
