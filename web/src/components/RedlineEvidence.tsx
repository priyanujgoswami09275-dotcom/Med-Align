import type { FieldName, Result, SourceKey } from '@/lib/types';

type RedlineEvidenceProps = {
  result: Result;
  sourceKey: SourceKey;
};

const TOKEN_PATTERN = String.raw`[\p{L}\p{N}]+(?:[.,][\p{L}\p{N}]+)*`;

function tokens(value: string): string[] {
  return value.match(new RegExp(TOKEN_PATTERN, 'gu'))?.map((token) => token.normalize('NFKC').toLowerCase()) ?? [];
}

function rawFieldValue(medicine: Result['doctor'], field: FieldName): string {
  if (!medicine) return '';
  if (field === 'name') return medicine.name ?? '';
  if (field === 'frequency') return medicine.frequency_text ?? '';
  return [medicine.strength_value, medicine.strength_unit].filter((value) => value !== null && value !== '').join(' ');
}

function uniqueTokens(result: Result, sourceKey: SourceKey): Set<string> {
  const otherKey: SourceKey = sourceKey === 'doctor' ? 'label' : 'doctor';
  const source = result[sourceKey];
  const other = result[otherKey];
  const unique = new Set<string>();

  for (const field of result.differing) {
    const otherTokens = new Set(tokens(rawFieldValue(other, field)));
    for (const token of tokens(rawFieldValue(source, field))) {
      if (!otherTokens.has(token)) unique.add(token);
    }
  }

  return unique;
}

export function RedlineEvidence({ result, sourceKey }: RedlineEvidenceProps) {
  const medicine = result[sourceKey];
  const evidence = medicine?.evidence;
  if (!evidence) {
    return <p className="mt-3 text-[13px] text-muted-foreground">The original excerpt is unavailable.</p>;
  }

  const markedTokens = uniqueTokens(result, sourceKey);
  const wordPattern = new RegExp(TOKEN_PATTERN, 'gu');
  const parts: Array<{ text: string; marked: boolean }> = [];
  let lastIndex = 0;

  for (const match of evidence.matchAll(wordPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ text: evidence.slice(lastIndex, index), marked: false });
    const token = match[0];
    parts.push({
      text: token,
      marked: markedTokens.has(token.normalize('NFKC').toLowerCase()),
    });
    lastIndex = index + token.length;
  }
  if (lastIndex < evidence.length) parts.push({ text: evidence.slice(lastIndex), marked: false });

  return (
    <figure className="mt-3 min-w-0">
      <figcaption className="mb-1 text-[12px] font-medium text-muted-foreground">Words in the source</figcaption>
      <blockquote className="break-words text-[14px] leading-7 text-foreground">
        <q>
          {parts.map((part, index) =>
            part.marked ? (
              <mark key={index} className="redline-mark">{part.text}</mark>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </q>
      </blockquote>
    </figure>
  );
}
