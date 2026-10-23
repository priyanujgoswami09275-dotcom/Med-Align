// Typed gateway to the untouched shared modules (src/compare.js). Plain JS,
// pure functions — the React app imports the very files the unit tests import.
import {
  compare as compareJs,
  pharmacistQuestion as pharmacistQuestionJs,
} from '@shared/compare.js';

import type { Medicine, Result } from './types';

export const compare = compareJs as (doctorList: Medicine[], labelList: Medicine[]) => Result[];

export const pharmacistQuestion = pharmacistQuestionJs as (results: Result[]) => string;
