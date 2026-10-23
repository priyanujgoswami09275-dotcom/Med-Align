// src/compare.js — pure normalization + comparison. No DOM, no network, no clock.
// Spec: PROJECT.md §5 (status decision order), §6 (normalization).

export const STATUS = {
  NO_DIFFERENCES_FOUND: 'NO_DIFFERENCES_FOUND',
  NEEDS_CHECKING: 'NEEDS_CHECKING',
  MISSING_FROM_LABEL: 'MISSING_FROM_LABEL',
  NOT_ON_DOCTOR_LIST: 'NOT_ON_DOCTOR_LIST',
  CANT_TELL: 'CANT_TELL',
};

// Demo alias list, not a drug database. Brand/abbreviation -> generic spelling.
// Labels "demo alias list, not clinical" are shown wherever this affects a match.
const ALIAS = {
  'pan': 'pantoprazole',
  'pantocid': 'pantoprazole',
  'glucophage': 'metformin',
  'norvasc': 'amlodipine',
  'lipitor': 'atorvastatin',
  'disprin': 'aspirin',
  'atorva': 'atorvastatin',
  'atorlip': 'atorvastatin',
};

const FORM_WORDS = new Set(['tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules']);
const SALT_WORDS = new Set(['hcl']);

function cleanText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Normalize a medicine name into a matching key (string or null).
 * - lowercase, trim, drop parenthetical sections, drop form words (tab/tablet/cap),
 *   drop salt words ("hcl"), then the labelled demo alias list.
 * - No alias hit -> the cleaned lowercase text, so two identical spellings match
 *   exactly (matched "by exact lowercase name only").
 * - null name -> null. The caller turns that into a CANT_TELL card.
 */
export function normalizeName(rawName) {
  const text = cleanText(rawName);
  if (text === null) return null;
  const noParens = text.replace(/\([^)]*\)/g, ' ');
  const words = noParens.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const kept = [];
  for (const word of words) {
    if (/^\d/.test(word)) continue; // dose numbers ("75", "75mg") are not the name
    if (UNIT_FACTORS[Object.hasOwn(UNIT_FACTORS, word) ? word : ''] !== undefined) continue; // units join the dose, not the name
    if (FORM_WORDS.has(word)) continue;
    if (kept.length > 0 && SALT_WORDS.has(word)) continue; // salt words never lead
    kept.push(word);
  }
  if (kept[0] && SALT_WORDS.has(kept[kept.length - 1])) kept.pop(); // trailing "hcl"
  if (kept.length === 0) return null;
  let key = kept.join(' ');
  if (Object.hasOwn(ALIAS, key)) key = ALIAS[key];
  return key;
}

const UNIT_FACTORS = {
  mg: 1,
  mcg: 1 / 1000,
  ug: 1 / 1000,
  'µg': 1 / 1000, // U+00B5 MICRO SIGN
  'μg': 1 / 1000, // U+03BC GREEK MU
  g: 1000,
  gm: 1000,
};

/**
 * Strength to mg, or null when the value/unit is unknown.
 * mcg/ug (and the µ variant after Unicode folding) /1000, g/gm x1000.
 * Unknown unit -> null (unknown).
 */
export function normalizeStrength(value, unit) {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : null;
  let unitText = typeof unit === 'string' ? unit.trim().toLowerCase() : null;
  if (unitText) {
    unitText = unitText.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  } else {
    unitText = null;
  }
  if (num === null || unitText === null || unitText === '') return { mg: null };
  const factor = UNIT_FACTORS[unitText];
  if (factor === undefined) return { mg: null };
  return { mg: num * factor };
}

// Frequency -> times per day. Food/route timing ("before breakfast") is ignored:
// only the count per day is compared (PROJECT.md §6).
const FREQUENCY_ONCE = ['once daily', 'once a day', 'once per day', 'od', 'qd', 'at night', 'hs', 'morning', 'in the morning'];
const FREQUENCY_TWICE = ['twice daily', 'twice a day', 'bd', 'bid'];
const FREQUENCY_THREE = ['three times daily', 'three times a day', 'tds', 'tid'];
const FREQUENCY_FOUR = ['four times daily', 'four times a day', 'qid'];

/**
 * Frequency text -> times per day number, or null when unrecognized.
 * Pattern a-b-c → sum of the digits. Unrecognized -> null (unknown).
 */
export function normalizeFrequency(rawFrequency) {
  const text = cleanText(rawFrequency);
  if (text === null) return null;
  const norm = ' ' + text.toLowerCase().replace(/[^a-z0-9\-\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

  const phraseGroups = [
    [FREQUENCY_ONCE, 1],
    [FREQUENCY_TWICE, 2],
    [FREQUENCY_THREE, 3],
    [FREQUENCY_FOUR, 4],
  ];
  const asTokens = norm.replace(/-/g, ' - ');
  for (const [phrases, count] of phraseGroups) {
    for (const phrase of phrases) {
      const probe = phrase.includes('-') ? phrase.replace(/-/g, ' - ') : phrase;
      if (asTokens.includes(' ' + probe + ' ')) return count;
    }
  }

  const abc = norm.match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
  if (abc) return Number(abc[1]) + Number(abc[2]) + Number(abc[3]);

  const timesPerDay = norm.match(/(\d+)\s*(?:x|times)\s*(?:a\s*)?day/);
  if (timesPerDay) {
    const n = Number(timesPerDay[1]);
    return n > 0 ? n : null;
  }
  return null;
}

/**
 * compare(doctorList, labelList) -> Result[]
 * Result: { key, displayName, status, differing:[], unknown:[], doctor, label }
 * - key: normalized name; null when the name is null/empty.
 * - doctor / label: the Medicine object on each side, or null.
 * Duplicate keys on one side: the first occurrence is paired; later duplicates
 * are reported as their own one-sided results (architecture.md).
 */
export function compare(doctorList, labelList) {
  const dRows = (Array.isArray(doctorList) ? doctorList : []).filter(Boolean);
  const lRows = (Array.isArray(labelList) ? labelList : []).filter(Boolean);

  const lKeys = lRows.map((m) => normalizeName(m && m.name));
  const pairedLabel = new Set(); // label indexes already matched
  const results = [];

  for (const med of dRows) {
    const dKey = normalizeName(med && med.name);

    if (dKey === null) {
      // A null name yields CANT_TELL on its own card (PROJECT.md §5).
      results.push({
        key: null,
        displayName: cleanText(med && med.name) ?? 'Unnamed medicine',
        status: STATUS.CANT_TELL,
        differing: [],
        unknown: ['name'],
        fields: oneSidedFields(med, 'doctor', true),
        doctor: med,
        label: null,
      });
      continue;
    }

    let lIdx = -1;
    for (let j = 0; j < lRows.length; j++) {
      if (!pairedLabel.has(j) && lKeys[j] === dKey) { lIdx = j; break; }
    }
    if (lIdx === -1) {
      results.push({
        key: dKey,
        displayName: cleanText(med && med.name) ?? 'Unnamed medicine',
        status: STATUS.MISSING_FROM_LABEL,
        differing: [],
        unknown: [],
        fields: oneSidedFields(med, 'doctor'),
        doctor: med,
        label: null,
      });
      continue;
    }
    pairedLabel.add(lIdx);
    results.push(pairResult(dKey, med, lRows[lIdx]));
  }

  // Everything left on the label side is one-sided. A row whose name could
  // not be read cannot be placed on a list at all, so it is CANT_TELL.
  lRows.forEach((med, j) => {
    if (pairedLabel.has(j)) return;
    results.push({
      key: lKeys[j],
      displayName: cleanText(med && med.name) ?? 'Unnamed medicine',
      status: lKeys[j] === null ? STATUS.CANT_TELL : STATUS.NOT_ON_DOCTOR_LIST,
      differing: [],
      unknown: lKeys[j] === null ? ['name'] : [],
      fields: oneSidedFields(med, 'label', lKeys[j] === null),
      doctor: null,
      label: med,
    });
  });

  // Group for triage: differences first, then cannot-tell, then one-sided,
  // then matched items. Stable within each group (doctor/label order).
  const GROUP_ORDER = {
    NEEDS_CHECKING: 0,
    CANT_TELL: 1,
    MISSING_FROM_LABEL: 2,
    NOT_ON_DOCTOR_LIST: 3,
    NO_DIFFERENCES_FOUND: 4,
  };
  return results.slice().sort((a, b) => GROUP_ORDER[a.status] - GROUP_ORDER[b.status]);
}

function pairResult(key, med, lMed) {
  // Extraction `uncertain` is a row-level flag: the whole row was not read
  // reliably, so no field of it can count as known. User edits clear the flag.
  const dRowU = med.uncertain === true;
  const lRowU = lMed.uncertain === true;

  const dStrength = normalizeStrength(med.strength_value, med.strength_unit).mg;
  const lStrength = normalizeStrength(lMed.strength_value, lMed.strength_unit).mg;
  const dFreq = normalizeFrequency(med.frequency_text);
  const lFreq = normalizeFrequency(lMed.frequency_text);

  const differing = [];
  const unknown = [];

  if (!dRowU && !lRowU && dStrength !== null && lStrength !== null) {
    if (dStrength !== lStrength) differing.push('strength');
  } else {
    unknown.push('strength');
  }

  if (!dRowU && !lRowU && dFreq !== null && lFreq !== null) {
    if (dFreq !== lFreq) differing.push('frequency');
  } else {
    unknown.push('frequency');
  }

  if (dRowU || lRowU) unknown.push('name');

  let status;
  if (differing.length > 0) status = STATUS.NEEDS_CHECKING;
  else if (unknown.length > 0) status = STATUS.CANT_TELL;
  else status = STATUS.NO_DIFFERENCES_FOUND;

  return {
    key,
    displayName: cleanText(med && med.name) || cleanText(lMed && lMed.name) || 'Unnamed medicine',
    status,
    differing,
    unknown: [...new Set(unknown)],
    fields: [
      fieldDetail('name', normalizeName(med.name), normalizeName(lMed.name), !dRowU && !lRowU),
      fieldDetail('strength', dStrength, lStrength, !dRowU && !lRowU),
      fieldDetail('frequency', dFreq, lFreq, !dRowU && !lRowU),
    ],
    doctor: med,
    label: lMed,
  };
}

function fieldDetail(field, doctorValue, labelValue, rowsConfirmed) {
  const bothKnown = doctorValue !== null && labelValue !== null;
  const unresolved = !rowsConfirmed || !bothKnown;
  const outcome = unresolved
    ? 'not_compared'
    : doctorValue === labelValue
      ? 'match'
      : 'different';
  return {
    field,
    doctor: { normalized: doctorValue },
    label: { normalized: labelValue },
    outcome,
    unresolved,
  };
}

// A one-sided medicine is a source-coverage gap, not a paired comparison.
// Its present-side field is unresolved only when its own value is missing,
// unnormalizable, or the extraction row remains uncertain.
function oneSidedFields(medicine, presentSide, unresolvedName = false) {
  const rowUncertain = medicine?.uncertain === true;
  const normalized = {
    name: normalizeName(medicine?.name),
    strength: normalizeStrength(medicine?.strength_value, medicine?.strength_unit).mg,
    frequency: normalizeFrequency(medicine?.frequency_text),
  };
  const rawAvailable = {
    name: normalized.name !== null,
    strength: medicine?.strength_value !== null && medicine?.strength_value !== undefined
      && medicine?.strength_unit !== null && medicine?.strength_unit !== undefined
      && normalized.strength !== null,
    frequency: medicine?.frequency_text !== null && medicine?.frequency_text !== undefined
      && String(medicine.frequency_text).trim() !== '' && normalized.frequency !== null,
  };
  return ['name', 'strength', 'frequency'].map((field) => ({
    field,
    doctor: presentSide === 'doctor' ? { normalized: normalized[field] } : null,
    label: presentSide === 'label' ? { normalized: normalized[field] } : null,
    outcome: 'not_compared',
    unresolved: unresolvedName && field === 'name' || rowUncertain || !rawAvailable[field],
  }));
}

const FIELD_LABELS = {
  strength: 'dose strength',
  frequency: 'how often to take it',
  name: 'the medicine name',
};

/**
 * Text to copy and ask the pharmacist. Never says which instruction is right.
 */
export function pharmacistQuestion(results) {
  const list = Array.isArray(results) ? results : [];
  const attention = list.filter((r) => r && typeof r === 'object' && r.status !== STATUS.NO_DIFFERENCES_FOUND);
  const lines = attention.map((r) => {
    if (r.status === STATUS.NEEDS_CHECKING) {
      const what = r.differing.length > 0
        ? r.differing.map((f) => FIELD_LABELS[f] ?? f).join(' and ')
        : r.unknown.map((f) => FIELD_LABELS[f] ?? f).join(' and ');
      return '- ' + (r.displayName ?? 'Unnamed medicine') + ': the two lists read differently on ' + what + '';
    }
    if (r.status === STATUS.MISSING_FROM_LABEL) {
      return '- ' + (r.displayName ?? 'Unnamed medicine') + ": on the doctor's list, not on the pharmacy label";
    }
    if (r.status === STATUS.NOT_ON_DOCTOR_LIST) {
      return '- ' + (r.displayName ?? 'Unnamed medicine') + ": on the pharmacy label, not on the doctor's list";
    }
    return '- ' + (r.displayName ?? 'Unnamed medicine') + ': part of the wording could not be read, please take a look';
  });
  const listBlock = lines.length > 0 ? lines.join('\n') + '\n\n' : '';
  return 'Hello pharmacist. I compared what my doctor said with what my pharmacy label shows, using a demo tool. Please check these medicines together:\n' + listBlock + 'I have both lists with me. Which wording am I meant to follow?';
}
