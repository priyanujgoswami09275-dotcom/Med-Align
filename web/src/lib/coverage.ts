import { computeCoverage as computeCoverageJs } from '@shared/coverage.js';

import type { Coverage } from './types';
import type { Medicine, Result } from './types';

export type { Coverage } from './types';

export const computeCoverage = computeCoverageJs as (
  doctorList: Medicine[],
  labelList: Medicine[],
  results: Result[],
) => Coverage;
