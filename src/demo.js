// src/demo.js — synthetic demo case. No API call, no storage. Built into the app
// as the fallback path when extraction is unavailable (memory.md -> Backups).
// All data here is synthetic.

export const DEMO_DOCTOR_TEXT =
  'Metformin 500 mg twice daily\n' +
  'Amlodipine 5 mg once daily\n' +
  'Pantoprazole 40 mg once daily before breakfast\n' +
  'Atorvastatin 10 mg at night';

export const DEMO_LABEL_TEXT =
  'Metformin 850 mg once daily\n' +
  'Amlodipine 5 mg 1-0-0 morning\n' +
  'Pan 40 (pantoprazole 40 mg) once daily\n' +
  'Aspirin 75 mg once daily';

// Same shape as the extraction output (PROJECT.md §4). `evidence` values are
// exact quotes from the texts above; the server-side substring check passes.
export const DEMO_DOCTOR_MEDICINES = [
  {
    name: 'Metformin',
    strength_value: 500,
    strength_unit: 'mg',
    frequency_text: 'twice daily',
    evidence: 'Metformin 500 mg twice daily',
    uncertain: false,
  },
  {
    name: 'Amlodipine',
    strength_value: 5,
    strength_unit: 'mg',
    frequency_text: 'once daily',
    evidence: 'Amlodipine 5 mg once daily',
    uncertain: false,
  },
  {
    name: 'Pantoprazole',
    strength_value: 40,
    strength_unit: 'mg',
    frequency_text: 'once daily before breakfast',
    evidence: 'Pantoprazole 40 mg once daily before breakfast',
    uncertain: false,
  },
  {
    name: 'Atorvastatin',
    strength_value: 10,
    strength_unit: 'mg',
    frequency_text: 'at night',
    evidence: 'Atorvastatin 10 mg at night',
    uncertain: false,
  },
];

export const DEMO_LABEL_MEDICINES = [
  {
    name: 'Metformin',
    strength_value: 850,
    strength_unit: 'mg',
    frequency_text: 'once daily',
    evidence: 'Metformin 850 mg once daily',
    uncertain: false,
  },
  {
    name: 'Amlodipine',
    strength_value: 5,
    strength_unit: 'mg',
    frequency_text: '1-0-0 morning',
    evidence: 'Amlodipine 5 mg 1-0-0 morning',
    uncertain: false,
  },
  {
    name: 'Pan 40',
    strength_value: 40,
    strength_unit: 'mg',
    frequency_text: 'once daily',
    evidence: 'Pan 40 (pantoprazole 40 mg) once daily',
    uncertain: false,
  },
  {
    name: 'Aspirin',
    strength_value: 75,
    strength_unit: 'mg',
    frequency_text: 'once daily',
    evidence: 'Aspirin 75 mg once daily',
    uncertain: false,
  },
];

// Exact statuses from PROJECT.md §7 — used as the test oracle.
export const DEMO_EXPECTED = [
  { name: 'Metformin', status: 'NEEDS_CHECKING', differing: ['strength', 'frequency'] },
  { name: 'Amlodipine', status: 'NO_DIFFERENCES_FOUND' },
  { name: 'Pantoprazole', status: 'NO_DIFFERENCES_FOUND' },
  { name: 'Atorvastatin', status: 'MISSING_FROM_LABEL' },
  { name: 'Aspirin', status: 'NOT_ON_DOCTOR_LIST' },
];
