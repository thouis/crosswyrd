export type LetterMask = Readonly<{ lo: number; hi: number }>;
export type MutableLetterMask = { lo: number; hi: number };

export class Alphabet {
  private readonly letterToIdx: Map<string, number>;
  private readonly letterMasksArr: readonly LetterMask[];
  readonly letters: readonly string[];
  readonly size: number;
  readonly ALL: LetterMask;
  readonly EMPTY: LetterMask = { lo: 0, hi: 0 };

  constructor(letters: string[]) {
    if (letters.length > 64) throw new Error('Alphabet max 64 letters');
    this.letters = letters;
    this.size = letters.length;
    this.letterToIdx = new Map(letters.map((ch, i) => [ch, i]));

    const loCount = Math.min(letters.length, 32);
    const hiCount = Math.max(0, letters.length - 32);
    const loAll = loCount === 32 ? -1 : (1 << loCount) - 1;
    const hiAll = hiCount === 0 ? 0 : hiCount === 32 ? -1 : (1 << hiCount) - 1;
    this.ALL = { lo: loAll, hi: hiAll };

    this.letterMasksArr = letters.map((_, i) =>
      Object.freeze(i < 32 ? { lo: 1 << i, hi: 0 } : { lo: 0, hi: 1 << (i - 32) })
    );
  }

  letterIndex(ch: string): number {
    const i = this.letterToIdx.get(ch);
    if (i === undefined) throw new Error(`Letter '${ch}' not in alphabet`);
    return i;
  }

  letterAt(i: number): string {
    return this.letters[i];
  }

  hasLetter(ch: string): boolean {
    return this.letterToIdx.has(ch);
  }

  // Single-letter mask with bit i set where i = letterIndex(ch)
  forLetter(ch: string): LetterMask {
    return this.letterMasksArr[this.letterIndex(ch)];
  }

  // All letters whose bit is set in mask, in alphabet order
  getLetters(mask: LetterMask): string[] {
    const out: string[] = [];
    let m = mask.lo | 0;
    while (m !== 0) {
      const lsb = m & -m;
      out.push(this.letters[31 - Math.clz32(lsb)]);
      m ^= lsb;
    }
    m = mask.hi | 0;
    while (m !== 0) {
      const lsb = m & -m;
      out.push(this.letters[32 + 31 - Math.clz32(lsb)]);
      m ^= lsb;
    }
    return out;
  }

  isEmpty(m: LetterMask): boolean {
    return m.lo === 0 && m.hi === 0;
  }

  // True iff exactly one letter is set
  isSingleLetter(m: LetterMask): boolean {
    return (m.lo !== 0 && (m.lo & (m.lo - 1)) === 0 && m.hi === 0) ||
           (m.lo === 0 && m.hi !== 0 && (m.hi & (m.hi - 1)) === 0);
  }

  // Index of the single set bit; undefined behavior if !isSingleLetter(m)
  getSingleLetter(m: LetterMask): string {
    if (m.lo !== 0) return this.letters[31 - Math.clz32(m.lo)];
    return this.letters[32 + 31 - Math.clz32(m.hi)];
  }

  // True iff bit i is set in m
  hasLetterAt(m: LetterMask, i: number): boolean {
    return i < 32 ? (m.lo >>> i & 1) === 1 : (m.hi >>> (i - 32) & 1) === 1;
  }

  // Mask with only bit i set
  onlyLetterAt(i: number): LetterMask {
    return i < 32 ? { lo: 1 << i, hi: 0 } : { lo: 0, hi: 1 << (i - 32) };
  }
}

export const ENGLISH = new Alphabet('abcdefghijklmnopqrstuvwxyz'.split(''));
