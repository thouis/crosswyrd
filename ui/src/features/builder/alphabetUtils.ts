import { Alphabet, ENGLISH } from './Alphabet';

export function deriveAlphabet(words: string[]): Alphabet {
  const chars = new Set<string>();
  for (const w of words) {
    for (const ch of w) {
      if (ch) chars.add(ch);
    }
  }
  const sorted = Array.from(chars).sort();
  if (sorted.length === 0) throw new Error('Empty word list: cannot derive alphabet');
  if (sorted.length > 64) throw new Error(`Derived alphabet too large: ${sorted.length} chars`);
  return new Alphabet(sorted);
}

export function deriveAlphabetSafe(words: string[]): Alphabet {
  try {
    return deriveAlphabet(words);
  } catch (e) {
    console.error('[alphabetUtils] alphabet derivation failed, falling back to ENGLISH:', e);
    return ENGLISH;
  }
}
