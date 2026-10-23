// public/app.js — screens, state, DOM. All document/model-derived text is set
// with textContent (never innerHTML). State is one in-memory object; a page
// refresh clears it. No cookies, no localStorage, no analytics.
import { compare, pharmacistQuestion } from '/src/compare.js';
import {
  DEMO_DOCTOR_TEXT, DEMO_LABEL_TEXT, DEMO_DOCTOR_MEDICINES, DEMO_LABEL_MEDICINES,
} from '/src/demo.js';

// ---------- state ----------

const state = {
  step: 'home',
  doctor: freshSource(),
  label: freshSource(),
  results: [],
};

function freshSource() {
  return { kind: 'empty', text: null, image: null, fromImage: false, medicines: [], note: null };
}

function cloneRows(rows) {
  return rows.map((m) => ({
    name: m.name ?? null,
    strength_value: m.strength_value ?? null,
    strength_unit: m.strength_unit ?? null,
    frequency_text: m.frequency_text ?? null,
    evidence: typeof m.evidence === 'string' ? m.evidence : '',
    uncertain: m.uncertain === true,
  }));
}

const KIND_LABEL = { doctor: 'the doctor list', label: 'the pharmacy label' };

// ---------- tiny DOM helpers ----------

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

const SCREEN_IDS = ['screen-home', 'screen-add', 'screen-review', 'screen-report'];

function setScreen(step) {
  state.step = step;
  for (const id of SCREEN_IDS) {
    $(id).hidden = id !== 'screen-' + step;
  }
  document.body.dataset.step = step;
  const onHome = step === 'home';
  $('wordmark-static').hidden = !onHome;
  $('wordmark-link').hidden = onHome;
  window.scrollTo(0, 0);
}

function showMessage(node, text) {
  node.textContent = text;
  node.hidden = false;
}

function hideMessage(node) {
  node.hidden = true;
  node.replaceChildren();
}

function addDemoButtons(messageNode, onDemo, onRetry) {
  const demo = el('button', 'btn btn-secondary btn-inline', 'Load demo case');
  demo.type = 'button';
  demo.addEventListener('click', onDemo);
  messageNode.append(' ', demo);
  if (onRetry) {
    const retry = el('button', 'btn btn-secondary btn-inline', 'Try reading again');
    retry.type = 'button';
    retry.addEventListener('click', onRetry);
    messageNode.append(' ', retry);
  }
}

// ---------- Add screen ----------

function fileSelected(inputId, kindKey) {
  const input = $(inputId);
  const file = input.files && input.files[0];
  const statusNode = $(kindKey + '-file-name');
  const src = state[kindKey];
  if (!file) {
    statusNode.textContent = '';
    return;
  }
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    statusNode.textContent = 'That file type cannot be read here. Please use a PNG, JPEG, or WebP photo.';
    input.value = '';
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    statusNode.textContent = 'That image is larger than the 4 MB limit. Please pick a smaller photo.';
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    src.image = { base64: String(reader.result).split(',')[1] || '', mime: file.type };
    src.kind = 'image';
    src.text = null;
    src.fromImage = true;
    src.medicines = [];
    src.note = null;
    statusNode.textContent = 'Photo ready: ' + file.name + ' (' + Math.max(1, Math.round(file.size / 1024)) + ' KB)';
    hideMessage($('add-message'));
  };
  reader.onerror = () => {
    statusNode.textContent = 'The photo could not be opened. Please try another one.';
    input.value = '';
  };
  reader.readAsDataURL(file);
}

function capturePanelText(kindKey) {
  const src = state[kindKey];
  if (src.kind === 'image' && src.image) return; // an image wins once it is loaded
  const text = $(kindKey === 'doctor' ? 'doctor-text' : 'label-text').value.trim();
  if (text === '') {
    src.kind = 'empty';
    src.text = null;
    return;
  }
  if (text.length > 8000) {
    showMessage($('add-message'), 'That pasted text is longer than the 8,000-character limit. Please paste a shorter part of it.');
    return;
  }
  src.kind = 'text';
  src.text = text;
  src.fromImage = false;
  src.note = null;
}

async function postExtract(body) {
  let response;
  try {
    response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { failed: true, message: 'The app could not reach the reading service. Check the connection, or load the demo case.', offerDemo: true };
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    return {
      failed: true,
      message: (data && typeof data.message === 'string' && data.message) ||
        'The reading step did not work this time. You can try again soon, or load the demo case.',
      offerDemo: Boolean(data && data.offerDemo),
    };
  }
  return { failed: false, medicines: Array.isArray(data.medicines) ? data.medicines : [] };
}

async function startExtraction() {
  const messageNode = $('add-message');
  hideMessage(messageNode);
  capturePanelText('doctor');
  capturePanelText('label');
  const sources = ['doctor', 'label'].filter((k) => state[k].kind !== 'empty');
  if (sources.length === 0) {
    messageNode.textContent = 'Add something first: paste the words for a panel, or choose a photo for it.';
    messageNode.hidden = false;
    return;
  }
  const readButton = $('btn-extract');
  readButton.disabled = true;
  readButton.textContent = 'Reading…';

  const outcomes = {};
  await Promise.all(sources.map(async (k) => {
    const src = state[k];
    const body = src.kind === 'image' ? { image: { mime: src.image.mime, data: src.image.base64 } } : { text: src.text };
    outcomes[k] = await postExtract(body);
  }));

  readButton.disabled = false;
  readButton.textContent = 'Read both lists';

  if (sources.every((k) => outcomes[k].failed)) {
    const joint = 'Both panels could not be read right now. Nothing was sent or saved.';
    showMessage(messageNode, joint);
    addDemoButtons(messageNode, loadDemo, () => { hideMessage(messageNode); startExtraction(); });
    return;
  }

  for (const k of sources) {
    const o = outcomes[k];
    if (o.failed) {
      state[k].medicines = [];
      state[k].note = 'This panel could not be read: ' + o.message;
    } else {
      state[k].medicines = cloneRows(o.medicines);
      state[k].note = o.medicines.length === 0
        ? 'No medicine could be read from ' + KIND_LABEL[k] + ' yet. Use + Add a medicine below to type the rows in yourself, then press Compare.'
        : null;
    }
  }

  renderReview();
  setScreen('review');

  const slot = $('review-message-slot');
  hideMessage(slot);
  let slotHasNotes = false;
  for (const k of sources) {
    if (state[k].note) {
      const p = el('p', state[k].note.startsWith('This panel') ? 'message warn' : 'message note', state[k].note);
      slot.append(p);
      if (outcomes[k] && outcomes[k].failed) {
        addDemoButtons(p, loadDemo, null);
      }
      slotHasNotes = true;
    }
  }
  if (!slotHasNotes) hideMessage(slot);
}

function loadDemo() {
  $('doctor-text').value = DEMO_DOCTOR_TEXT;
  $('label-text').value = DEMO_LABEL_TEXT;
  $('doctor-file-name').textContent = '';
  $('label-file-name').textContent = '';
  $('doctor-image').value = '';
  $('label-image').value = '';
  $('btn-extract').textContent = 'Read both lists';
  $('btn-extract').disabled = false;
  hideMessage($('add-message'));
  hideMessage($('review-message-slot'));
  state.doctor = freshSource();
  state.label = freshSource();
  state.doctor.kind = 'demo';
  state.doctor.text = DEMO_DOCTOR_TEXT;
  state.doctor.fromImage = false;
  state.doctor.medicines = cloneRows(DEMO_DOCTOR_MEDICINES);
  state.label.kind = 'demo';
  state.label.text = DEMO_LABEL_TEXT;
  state.label.fromImage = false;
  state.label.medicines = cloneRows(DEMO_LABEL_MEDICINES);
  renderReview();
  setScreen('review');
}

// ---------- Review screen ----------

const UNIT_OPTIONS = ['mg', 'mcg', 'µg', 'g', 'ml'];

function renderReview() {
  renderRows('doctor');
  renderRows('label');
}

function renderRows(kindKey) {
  const host = $(kindKey + '-rows');
  host.replaceChildren();
  const rows = state[kindKey].medicines;
  if (rows.length === 0) {
    host.append(el('p', 'empty-note', 'No medicine rows here yet. Use the + Add a medicine button below.'));
  }
  rows.forEach((row, index) => {
    host.append(reviewRowElement(kindKey, row, index));
  });
}

function reviewRowElement(kindKey, row, index) {
  const card = el('div', 'med-row');
  if (row.uncertain) card.classList.add('row-uncertain');
  if (state[kindKey].fromImage) card.classList.add('row-from-image');

  const nameField = fieldBox('Name', row, kindKey, index, 'name', 'text', 'e.g. Metformin');
  card.append(nameField.wrap);

  const strengthLine = el('div', 'field-line');
  strengthLine.append(fieldBox('Dose number', row, kindKey, index, 'strength_value', 'decimal', 'e.g. 500').wrap);
  strengthLine.append(fieldBox('Unit', row, kindKey, index, 'strength_unit', 'select', null).wrap);
  card.append(strengthLine);

  card.append(fieldBox('How often', row, kindKey, index, 'frequency_text', 'text', 'e.g. twice daily').wrap);

  if (row.evidence) {
    const quote = el('p', 'quote');
    const label = el('span', 'quote-label',
      state[kindKey].fromImage ? 'words read from image, not machine-verified: ' : 'matched words: ');
    quote.append(label);
    quote.append(el('q', null, row.evidence));
    card.append(quote);
  }

  const del = el('button', 'btn btn-delete', 'Delete row');
  del.type = 'button';
  del.setAttribute('aria-label',
    'Delete row ' + (row.name || index + 1) + ' from ' + KIND_LABEL[kindKey]);
  del.addEventListener('click', () => {
    state[kindKey].medicines.splice(index, 1);
    renderRows(kindKey);
  });
  card.append(del);
  return card;
}

function fieldBox(labelText, row, kindKey, index, field, mode, placeholder) {
  const isUncertain = row.uncertain || row[field] === null;
  const wrap = el('label', 'field' + (isUncertain ? ' field-uncertain' : ''));
  wrap.append(el('span', 'field-label',
    isUncertain ? labelText + ' (hard to read — please confirm)' : labelText));
  let input;
  if (mode === 'select') {
    input = document.createElement('select');
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'not readable';
    input.append(blank);
    const options = UNIT_OPTIONS.includes(row[field] ?? '') ? UNIT_OPTIONS : [row[field], ...UNIT_OPTIONS].filter(Boolean);
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      input.append(o);
    }
    input.value = row[field] ?? '';
  } else {
    input = document.createElement('input');
    input.type = 'text';
    if (mode === 'decimal') input.inputMode = 'decimal';
    if (placeholder) input.placeholder = placeholder;
    input.value = row[field] ?? '';
  }
  input.name = field;
  input.id = 'f-' + (kindKey === 'doctor' ? '0' : '1') + '-' + index + '-' + field;
  input.addEventListener('input', () => {
    const current = state[kindKey].medicines[index];
    if (!current) return;
    current.uncertain = false; // editing a cell clears its uncertain flag
    if (field === 'strength_value') {
      const text = input.value.trim();
      current[field] = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
    } else {
      const text = input.value.trim();
      current[field] = text === '' ? null : text.slice(0, 120);
    }
    const fieldNode = input.closest('.field');
    if (fieldNode && fieldNode.classList.contains('field-uncertain')) {
      fieldNode.classList.remove('field-uncertain');
      const span = fieldNode.querySelector('.field-label');
      if (span) span.textContent = span.textContent.replace(' (hard to read — please confirm)', '');
    }
    if (current.uncertain) renderRows(kindKey); // first edit clears the row badge too
  });
  wrap.append(input);
  return { wrap, input };
}

function goBackToAdd() {
  setScreen('add');
}

$('btn-back-add').addEventListener('click', goBackToAdd);

function startCompare() {
  const slot = $('review-message-slot');
  if (state.doctor.medicines.length + state.label.medicines.length === 0) {
    slot.replaceChildren(el('p', 'message warn',
      'There is no medicine row to Compare yet. Use the + Add a medicine buttons to type one in.'));
    return;
  }
  // Compare runs in the browser as a pure function, with no network.
  state.results = compare(state.doctor.medicines, state.label.medicines);
  renderReport();
  setScreen('report');
}

$('btn-compare').addEventListener('click', startCompare);

// ---------- Report screen ----------

const STATUS_PRESENTATION = {
  NO_DIFFERENCES_FOUND: { icon: '=', label: 'No differences found', hint: 'No differences found in what we read.', variant: 'good' },
  NEEDS_CHECKING: { icon: '!', label: 'Needs checking', hint: 'The two lists say different things here. Ask before you take it.', variant: 'diff' },
  MISSING_FROM_LABEL: { icon: '▢', label: 'Not on the pharmacy label', hint: 'The doctor said this, but it was not found on the pharmacy label.', variant: 'warn' },
  NOT_ON_DOCTOR_LIST: { icon: '+', label: 'Not on the doctor list', hint: 'The pharmacy label shows this, but it was not on the doctor list.', variant: 'warn' },
  CANT_TELL: { icon: '?', label: 'Cannot tell yet', hint: 'Something on this row could not be read, so no comparison was possible.', variant: 'dim' },
};

const FIELD_TEXTS = {
  strength: 'the dose strength',
  frequency: 'how often to take it',
  name: 'the medicine name',
};

function renderReport() {
  const host = $('report-cards');
  host.replaceChildren();
  const visible = $('visible-question');
  visible.replaceChildren();
  if (state.results.length === 0) {
    host.append(el('p', 'empty-note', 'Nothing to show: no medicine rows were compared.'));
    return;
  }
  for (const result of state.results) {
    host.append(reportCardElement(result));
  }
  const question = pharmacistQuestion(state.results);
  $('copy-target').value = question;
}

function reportCardElement(result) {
  const presentation = STATUS_PRESENTATION[result.status] ?? STATUS_PRESENTATION.CANT_TELL;
  const card = el('article', 'report-card status-' + presentation.variant);
  const head = el('header', 'report-head');
  const icon = el('span', 'status-icon', presentation.icon);
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', presentation.label);
  const statusBar = el('p', 'status-line');
  statusBar.append(icon, el('span', 'status-text', presentation.label));
  head.append(statusBar, el('h2', 'med-name', result.displayName));
  card.append(head);
  card.append(el('p', 'status-hint', presentation.hint));

  if (result.differing.length > 0) {
    card.append(el('p', 'differ-line', 'Differences: ' + result.differing.map((f) => FIELD_TEXTS[f] ?? f).join('; ')));
  }
  if (result.unknown.length > 0) {
    card.append(el('p', 'unknown-line', 'Could not be read: ' + result.unknown.map((f) => FIELD_TEXTS[f] ?? f).join('; ')));
  }

  const columns = el('div', 'evidence-columns');
  columns.append(evidenceBlockElement('What the doctor said', result.doctor, state.doctor.fromImage));
  columns.append(evidenceBlockElement('What the pharmacy label showed', result.label, state.label.fromImage));
  card.append(columns);
  return card;
}

function evidenceBlockElement(title, medicine, fromImage) {
  const block = el('div', 'evidence');
  block.append(el('h3', 'evidence-title', title));
  if (!medicine) {
    block.append(el('p', 'evidence-missing', 'Not found on this list.'));
    return block;
  }
  const fieldsNode = el('p', 'evidence-fields');
  const lines = [
    'name: ' + (medicine.name ?? 'not readable'),
    'dose: ' + (medicine.strength_value !== null ? medicine.strength_value : 'not readable') +
      (medicine.strength_unit ? ' ' + medicine.strength_unit : ''),
    'how often: ' + (medicine.frequency_text ?? 'not readable'),
  ];
  for (const line of lines) {
    const span = el('span', 'evidence-field');
    span.textContent = line;
    fieldsNode.append(span);
  }
  block.append(fieldsNode);
  if (medicine.evidence) {
    block.append(el('p', 'evidence-quote-label', 'exact words that were read:'));
    block.append(el('q', null, medicine.evidence));
  } else {
    block.append(el('p', 'evidence-quote-label', 'no exact words were available.'));
  }
  if (fromImage) {
    block.append(el('p', 'evidence-image-note', 'read from image, not machine-verified'));
  }
  return block;
}

async function copyQuestion() {
  const text = $('copy-target').value;
  if (!text) return;
  const msg = $('report-message');
  try {
    await navigator.clipboard.writeText(text);
    showMessage(msg, 'Copied. Paste it to your pharmacist.');
  } catch {
    const target = $('copy-target');
    target.classList.remove('sr-only-copy');
    target.focus();
    target.select();
    let done = false;
    try {
      done = document.execCommand('copy');
    } catch {
      done = false;
    }
    target.classList.add('sr-only-copy');
    target.blur();
    if (done) {
      showMessage(msg, 'Copied. Paste it to your pharmacist.');
    } else {
      // Show the question as plain text for hand-copying.
      const visible = $('visible-question');
      visible.replaceChildren(el('p', 'copy-help', 'Copy was blocked by the browser. Please select the words below and copy them by hand:'));
      visible.append(el('p', 'copy-visible', text));
      visible.hidden = false;
    }
  }
}

$('btn-copy').addEventListener('click', copyQuestion);
$('btn-back-review').addEventListener('click', () => {
  setScreen('review');
});

// ---------- Home screen (4th screen, authorized exception) ----------

// Inline SVG markup for the NEEDS_CHECKING badge on the example card
// (lucide-style triangle-alert shape, drawn with createElementNS only).
const HOME_ALERT_SVG_PATHS = [
  'm21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
  'M12 9v4',
  'M12 17h.01',
];

function statusIconSvg() {
  const NS_SVG = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS_SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of HOME_ALERT_SVG_PATHS) {
    const path = document.createElementNS(NS_SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// Example result card: every value comes from src/demo.js, never retyped.
function renderHomeExample() {
  const host = $('home-example');
  if (!host) return;
  const doctorRow = DEMO_DOCTOR_MEDICINES[0];
  const labelRow = DEMO_LABEL_MEDICINES[0];

  const name = el('p', 'example-line example-name', doctorRow.name);
  const presentation = STATUS_PRESENTATION.NEEDS_CHECKING;
  const statusLine = el('p', 'status-line');
  const iconBox = el('span', 'status-icon');
  iconBox.setAttribute('role', 'img');
  iconBox.setAttribute('aria-label', presentation.label);
  iconBox.append(statusIconSvg());
  statusLine.append(iconBox, el('span', 'status-text', presentation.label));

  host.replaceChildren(name, statusLine);

  const fieldRows = [
    ['Strength', doctorRow.strength_value + ' ' + doctorRow.strength_unit,
      labelRow.strength_value + ' ' + labelRow.strength_unit],
    ['How often', doctorRow.frequency_text, labelRow.frequency_text],
  ];
  for (const [fieldLabel, doctorValue, labelValue] of fieldRows) {
    const row = el('p', 'example-line');
    row.append(el('span', 'ex-label', fieldLabel));
    row.append(el('span', 'ex-value', doctorValue));
    row.append(el('span', 'ex-vs', 'vs'));
    row.append(el('span', 'ex-value', labelValue));
    host.append(row);
  }
}

// ---------- wiring ----------

$('doctor-image').addEventListener('change', () => fileSelected('doctor-image', 'doctor'));
$('label-image').addEventListener('change', () => fileSelected('label-image', 'label'));
$('doctor-text').addEventListener('input', () => hideMessage($('add-message')));
$('label-text').addEventListener('input', () => hideMessage($('add-message')));
$('btn-extract').addEventListener('click', () => { startExtraction(); });
$('btn-demo').addEventListener('click', loadDemo);
$('btn-home-add').addEventListener('click', () => { setScreen('add'); });
$('btn-home-demo').addEventListener('click', loadDemo);
$('wordmark-link').addEventListener('click', () => { setScreen('home'); });
renderHomeExample();
document.querySelectorAll('.btn-add').forEach((btn) => {
  btn.addEventListener('click', () => {
    const kindKey = btn.dataset.add;
    const src = state[kindKey];
    if (src.kind === 'empty') src.kind = 'text'; // hand-entered list still counts
    src.medicines.push({
      name: null,
      strength_value: null,
      strength_unit: null,
      frequency_text: null,
      evidence: '',
      uncertain: false,
    });
    renderRows(kindKey);
    const rowCards = $(kindKey + '-rows').querySelectorAll('.med-row');
    const lastCard = rowCards[rowCards.length - 1];
    const nameInput = lastCard && lastCard.querySelector('input[name="name"]');
    if (nameInput) nameInput.focus();
  });
});
$('btn-compare').addEventListener('click', startCompare);
