// UI presentation ported verbatim from public/app.js:391-403. Labels, hints and
// field texts must match the vanilla app exactly; icons are lucide components
// (shape + text + color, never color alone).
import {
  CircleCheck,
  CircleHelp,
  CircleMinus,
  CirclePlus,
  TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { FieldName, SourceKey, Status } from './types';

export type StatusVariant = 'good' | 'diff' | 'warn' | 'dim';

export const STATUS_PRESENTATION: Record<
  Status,
  { icon: LucideIcon; label: string; hint: string; variant: StatusVariant }
> = {
  NO_DIFFERENCES_FOUND: {
    icon: CircleCheck,
    label: 'No differences found',
    hint: 'No differences found in what we read.',
    variant: 'good',
  },
  NEEDS_CHECKING: {
    icon: TriangleAlert,
    label: 'Needs checking',
    hint: 'The two lists say different things here. Ask before you take it.',
    variant: 'diff',
  },
  MISSING_FROM_LABEL: {
    icon: CircleMinus,
    label: 'Not on the pharmacy label',
    hint: 'The doctor said this, but it was not found on the pharmacy label.',
    variant: 'warn',
  },
  NOT_ON_DOCTOR_LIST: {
    icon: CirclePlus,
    label: 'Not on the doctor list',
    hint: 'The pharmacy label shows this, but it was not on the doctor list.',
    variant: 'warn',
  },
  CANT_TELL: {
    icon: CircleHelp,
    label: 'Cannot tell yet',
    hint: 'Something on this row could not be read, so no comparison was possible.',
    variant: 'dim',
  },
};

export const FIELD_TEXTS: Record<FieldName, string> = {
  strength: 'the dose strength',
  frequency: 'how often to take it',
  name: 'the medicine name',
};

export const KIND_LABEL: Record<SourceKey, string> = {
  doctor: 'the doctor list',
  label: 'the pharmacy label',
};
