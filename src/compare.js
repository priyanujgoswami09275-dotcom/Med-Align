// src/compare.js — pure normalization + comparison. No DOM, no network, no clock.

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

// Frequency -> times per day. Food and route timing are deliberately ignored;
// this parser recognizes counts, not a dosing schedule.
const FREQUENCY_CONTEXT_WORDS = new Set([
  'after', 'and', 'at', 'bedtime', 'before', 'breakfast', 'by', 'dinner', 'evening',
  'food', 'in', 'lunch', 'meal', 'meals', 'midday', 'morning', 'mouth',
  'noon', 'oral', 'orally', 'the', 'with', 'without',
]);

function onlyTimingContext(text, match) {
  const remainder = (text.slice(0, match.index) + ' ' + text.slice(match.index + match[0].length))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return remainder === '' || remainder.split(' ').every((word) => FREQUENCY_CONTEXT_WORDS.has(word));
}

/**
 * Frequency text -> times per day number, or null when unrecognized.
 * A single explicit count or a-b-c schedule is recognized. Multiple claims,
 * zero schedules, and ambiguous time-of-day phrases remain unknown.
 */
export function normalizeFrequency(rawFrequency) {
  const text = cleanText(rawFrequency);
  if (text === null) return null;
  const norm = text.toLowerCase().replace(/[.,;:()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
  const claims = [];
  const addMatches = (pattern, countFor) => {
    for (const match of norm.matchAll(pattern)) {
      claims.push({ match, count: countFor(match) });
    }
  };
  const dayparts = norm.match(/\b(?:morning|afternoon|evening|night|noon|breakfast|lunch|dinner|bedtime)\b/g) || [];
  if (dayparts.length > 1) return null;

  addMatches(/(?<![\d-])(\d+)\s*-\s*(\d+)\s*-\s*(\d+)(?![\d-])/g, (match) => {
    const values = match.slice(1).map(Number);
    const count = values.reduce((sum, value) => sum + value, 0);
    return values.every(Number.isSafeInteger) && Number.isSafeInteger(count) && count > 0 ? count : null;
  });
  addMatches(/\bonce\s+(?:daily|a\s+day|per\s+day)\b/g, () => 1);
  addMatches(/\btwice\s+(?:daily|a\s+day|per\s+day)\b/g, () => 2);
  addMatches(/\bthree\s+times\s+(?:daily|a\s+day|per\s+day)\b/g, () => 3);
  addMatches(/\bfour\s+times\s+(?:daily|a\s+day|per\s+day)\b/g, () => 4);
  addMatches(/\b(\d+)\s*(?:x|times)\s*(?:(?:a|per)\s+)?(?:day|daily)\b/g, (match) => {
    const count = Number(match[1]);
    return Number.isSafeInteger(count) && count > 0 ? count : null;
  });
  const abbreviations = { od: 1, qd: 1, hs: 1, bd: 2, bid: 2, tds: 3, tid: 3, qid: 4 };
  addMatches(/\b(?:od|qd|hs|bd|bid|tds|tid|qid)\b/g, (match) => abbreviations[match[0]]);

  if (claims.length > 1) return null;
  if (claims.length === 1) {
    const [{ match, count }] = claims;
    return count !== null && onlyTimingContext(norm, match) ? count : null;
  }

  const timing = [...norm.matchAll(/\b(?:in\s+the\s+morning|morning|at\s+night)\b/g)];
  if (timing.length !== 1 || !onlyTimingContext(norm, timing[0])) return null;
  return 1;
}

/**
 * compare(doctorList, labelList) -> Result[]
 * Result: { key, displayName, status, differing:[], unknown:[], doctor, label }
 * - key: normalized name; null when the name is null/empty.
 * - doctor / label: the Medicine object on each side, or null.
 * Duplicate keys on one side: the first occurrence is paired; later duplicates
 * are reported as their own one-sided results.
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
      // A null name cannot establish identity or a source gap.
      const fields = oneSidedFields(med, 'doctor', false);
      results.push({
        key: null,
        displayName: cleanText(med && med.name) ?? 'Unnamed medicine',
        status: STATUS.CANT_TELL,
        differing: [],
        unknown: fields.filter((field) => field.unresolved).map((field) => field.field),
        fields,
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
      const identityReliable = fieldIsTrusted(med, 'name');
      const fields = oneSidedFields(med, 'doctor', identityReliable);
      results.push({
        key: dKey,
        displayName: cleanText(med && med.name) ?? 'Unnamed medicine',
        status: identityReliable ? STATUS.MISSING_FROM_LABEL : STATUS.CANT_TELL,
        differing: [],
        unknown: fields.filter((field) => field.unresolved).map((field) => field.field),
        fields,
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
    const identityReliable = fieldIsTrusted(med, 'name');
    const fields = oneSidedFields(med, 'label', identityReliable);
    results.push({
      key: lKeys[j],
      displayName: cleanText(med && med.name) ?? 'Unnamed medicine',
      status: lKeys[j] === null || !identityReliable ? STATUS.CANT_TELL : STATUS.NOT_ON_DOCTOR_LIST,
      differing: [],
      unknown: fields.filter((field) => field.unresolved).map((field) => field.field),
      fields,
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
  const dStrength = normalizeStrength(med.strength_value, med.strength_unit).mg;
  const lStrength = normalizeStrength(lMed.strength_value, lMed.strength_unit).mg;
  const dFreq = normalizeFrequency(med.frequency_text);
  const lFreq = normalizeFrequency(lMed.frequency_text);
  const identityTrusted = fieldIsTrusted(med, 'name') && fieldIsTrusted(lMed, 'name');
  const fields = [
    fieldDetail('name', normalizeName(med.name), normalizeName(lMed.name), identityTrusted),
    fieldDetail('strength', dStrength, lStrength,
      identityTrusted && fieldIsTrusted(med, 'strength') && fieldIsTrusted(lMed, 'strength')),
    fieldDetail('frequency', dFreq, lFreq,
      identityTrusted && fieldIsTrusted(med, 'frequency') && fieldIsTrusted(lMed, 'frequency')),
  ];
  const differing = fields.filter((field) => field.outcome === 'different').map((field) => field.field);
  const unknown = fields.filter((field) => field.unresolved).map((field) => field.field);
  let status;
  if (differing.length > 0) status = STATUS.NEEDS_CHECKING;
  else if (unknown.length > 0) status = STATUS.CANT_TELL;
  else status = STATUS.NO_DIFFERENCES_FOUND;

  return {
    key,
    displayName: cleanText(med && med.name) || cleanText(lMed && lMed.name) || 'Unnamed medicine',
    status,
    differing,
    unknown,
    fields,
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

function fieldIsTrusted(medicine, field) {
  return medicine?.uncertain !== true
    || (Array.isArray(medicine?.confirmedFields) && medicine.confirmedFields.includes(field));
}

// A one-sided row is a definite source gap only when its medicine identity is
// readable and reviewed; otherwise the result is unresolved, not a gap.
function oneSidedFields(medicine, presentSide, identityReliable) {
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
    unresolved: !rawAvailable[field] || !fieldIsTrusted(medicine, field)
      || (field === 'name' && !identityReliable),
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
    const unknown = Array.isArray(r.unknown) ? r.unknown : [];
    const unknownText = unknown.map((field) => FIELD_LABELS[field] ?? field).join(' and ');
    if (r.status === STATUS.NEEDS_CHECKING) {
      const differing = r.differing.map((field) => FIELD_LABELS[field] ?? field).join(' and ');
      const difference = differing
        ? 'the two lists read differently on ' + differing
        : 'the compared values need review';
      const unresolved = unknownText
        ? '; ' + unknownText + ' could not be compared reliably'
        : '';
      return '- ' + (r.displayName ?? 'Unnamed medicine') + ': ' + difference + unresolved;
    }
    if (r.status === STATUS.MISSING_FROM_LABEL) {
      const unresolved = unknownText ? '; ' + unknownText + ' still need review' : '';
      return '- ' + (r.displayName ?? 'Unnamed medicine') + ": on the doctor's list, not on the pharmacy label" + unresolved;
    }
    if (r.status === STATUS.NOT_ON_DOCTOR_LIST) {
      const unresolved = unknownText ? '; ' + unknownText + ' still need review' : '';
      return '- ' + (r.displayName ?? 'Unnamed medicine') + ": on the pharmacy label, not on the doctor's list" + unresolved;
    }
    const unresolved = unknownText
      ? unknownText + ' could not be compared reliably; please review both lists'
      : 'part of the wording could not be read, please take a look';
    return '- ' + (r.displayName ?? 'Unnamed medicine') + ': ' + unresolved;
  });
  const listBlock = lines.length > 0 ? lines.join('\n') + '\n\n' : '';
  return 'Hello pharmacist. I compared what my doctor said with what my pharmacy label shows, using a demo tool. Please check these medicines together:\n' + listBlock + 'I have both lists with me. Which wording am I meant to follow?';
}
