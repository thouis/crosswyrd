// Single 32-bit integer mask. Expanded to lo/hi pair in a later PR.
export type LetterMask = number;

export class Alphabet {
  private readonly letterToIdx: Map<string, number>;
  readonly letters: readonly string[];
  readonly size: number;
  readonly ALL: LetterMask;

  constructor(letters: string[]) {
    if (letters.length > 32) throw new Error('Alphabet max 32 letters (PR 1)');
    this.letters = letters;
    this.size = letters.length;
    this.letterToIdx = new Map(letters.map((ch, i) => [ch, i]));
    // For 32 letters (1 << 32) === 0 in JS, so special-case
    this.ALL = letters.length === 32 ? -1 : (1 << letters.length) - 1;
  }

  letterIndex(ch: string): number {
    const i = this.letterToIdx.get(ch);
    if (i === undefined) throw new Error(`Letter '${ch}' not in alphabet`);
    return i;
  }

  letterAt(i: number): string {
    return this.letters[i];
  }

  // Membership check: is ch in this alphabet?
  hasLetter(ch: string): boolean {
    return this.letterToIdx.has(ch);
  }

  // Single-letter mask with bit i set where i = letterIndex(ch)
  forLetter(ch: string): LetterMask {
    return 1 << this.letterIndex(ch);
  }

  // All letters whose bit is set in mask, in alphabet order
  getLetters(mask: LetterMask): string[] {
    const out: string[] = [];
    let m = mask | 0;
    while (m !== 0) {
      const lsb = m & -m;
      out.push(this.letters[31 - Math.clz32(lsb)]);
      m ^= lsb;
    }
    return out;
  }
}

export const ENGLISH = new Alphabet('abcdefghijklmnopqrstuvwxyz'.split(''));
